import express from 'express';
import * as db from '../db/index.js';
import { exigirProfesor } from '../lib/sesion.js';
import { informeDePrueba, informeDeAlumno, recalcularIntento, puntajeValido,
  seCorrigeAMano, NOMBRE_NIVEL } from '../lib/evaluacion.js';

const router = express.Router();
router.use(exigirProfesor);

/** Datos del establecimiento que encabezan el informe, desde el entorno. */
router.get('/establecimiento', (_req, res) => {
  res.json({
    nombre: process.env.ESTABLECIMIENTO || '',
    rbd: process.env.RBD || '',
    comuna: process.env.COMUNA || '',
  });
});

/** Quiénes están rindiendo ahora y cuánto llevan avanzado. */
router.get('/pruebas/:id/monitor', async (req, res) => {
  const prueba = await db.get('SELECT * FROM pruebas WHERE id = ?', [req.params.id]);
  if (!prueba) return res.status(404).json({ error: 'Prueba no encontrada.' });

  const total = await db.get('SELECT COUNT(*) AS n FROM preguntas WHERE prueba_id = ?', [prueba.id]);
  const filas = await db.all(
    'SELECT i.id, i.estado, i.iniciado_en, i.enviado_en, i.porcentaje, i.nivel_logro, ' +
      'a.nombre, a.curso, a.codigo, ' +
      "(SELECT COUNT(*) FROM respuestas r WHERE r.intento_id = i.id AND (r.alternativa IS NOT NULL OR trim(r.respuesta_texto) <> '')) AS respondidas " +
      'FROM intentos i JOIN alumnos a ON a.id = i.alumno_id WHERE i.prueba_id = ? ORDER BY i.estado, a.nombre',
    [prueba.id]
  );

  res.json({
    prueba: { id: prueba.id, titulo: prueba.titulo, estado: prueba.estado, duracion_min: prueba.duracion_min },
    total_preguntas: total.n,
    intentos: filas,
  });
});

/**
 * Cierra la prueba de un estudiante que se fue sin enviarla.
 *
 * Pasa exactamente lo mismo que si la hubiera enviado él: se conservan todas las
 * respuestas que alcanzó a guardar y se corrige al momento. Es la contraparte de
 * «Reabrir», y existe porque el caso corriente es que alguien cierre el
 * navegador al terminar y su prueba quede en el aire sin aparecer en el informe.
 */
router.post('/intentos/:id/cerrar', async (req, res) => {
  const intento = await db.get('SELECT * FROM intentos WHERE id = ?', [req.params.id]);
  if (!intento) return res.status(404).json({ error: 'Intento no encontrado.' });
  if (intento.estado === 'enviado') {
    return res.status(409).json({ error: 'Esa prueba ya estaba entregada.' });
  }

  await db.run(
    "UPDATE intentos SET estado = 'enviado', enviado_en = " + db.AHORA + ' WHERE id = ?',
    [intento.id]
  );
  const totales = await recalcularIntento(intento.id);
  res.json({ ok: true, intento: totales });
});

/** Reabre un intento ya enviado (por ejemplo, si al alumno se le cortó la conexión). */
router.post('/intentos/:id/reabrir', async (req, res) => {
  const r = await db.run(
    "UPDATE intentos SET estado = 'en_curso', enviado_en = NULL WHERE id = ?",
    [req.params.id]
  );
  if (!r.cambios) return res.status(404).json({ error: 'Intento no encontrado.' });
  res.json({ ok: true });
});

router.delete('/intentos/:id', async (req, res) => {
  await db.run('DELETE FROM intentos WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

/* ---------------------------------------------------------------- correccion */

/**
 * Todo lo necesario para corregir a mano: las preguntas que no tienen clave
 * —las escritas en pantalla y las respondidas en papel— y, por cada estudiante
 * que entrego, lo que escribio y el puntaje ya anotado.
 *
 * Va todo en una peticion a proposito. Con 200 estudiantes y tres preguntas por
 * corregir, pedir celda por celda serian 600 viajes.
 */
router.get('/pruebas/:id/correccion', async (req, res) => {
  const prueba = await db.get('SELECT * FROM pruebas WHERE id = ?', [req.params.id]);
  if (!prueba) return res.status(404).json({ error: 'Prueba no encontrada.' });

  const preguntas = await db.all(
    'SELECT id, numero, tipo, enunciado, puntaje, eje FROM preguntas ' +
      "WHERE prueba_id = ? AND tipo IN ('papel', 'escrita') ORDER BY numero",
    [prueba.id]
  );

  const params = [prueba.id];
  let sqlCurso = '';
  if (req.query?.curso) { sqlCurso = ' AND a.curso = ?'; params.push(String(req.query.curso)); }

  const intentos = await db.all(
    'SELECT i.id, i.alumno_id, i.estado, a.nombre, a.curso FROM intentos i ' +
      'JOIN alumnos a ON a.id = i.alumno_id ' +
      "WHERE i.prueba_id = ? AND i.estado = 'enviado'" + sqlCurso +
      ' ORDER BY a.curso, a.nombre',
    params
  );

  const idsPreguntas = preguntas.map((p) => p.id);
  let anotadas = [];
  if (intentos.length && idsPreguntas.length) {
    const marcadores = idsPreguntas.map(() => '?').join(',');
    // Aqui NO se filtra por corregida: hace falta traer tambien lo que el
    // estudiante escribio y todavia no se revisa, que es justamente lo que la
    // docente tiene que leer para ponerle puntaje.
    anotadas = await db.all(
      'SELECT r.intento_id, r.pregunta_id, r.puntaje, r.corregida, r.respuesta_texto ' +
        'FROM respuestas r WHERE r.pregunta_id IN (' + marcadores + ')',
      idsPreguntas
    );
  }

  const cursos = await db.all(
    'SELECT DISTINCT a.curso FROM intentos i JOIN alumnos a ON a.id = i.alumno_id ' +
      "WHERE i.prueba_id = ? AND i.estado = 'enviado' AND a.curso <> '' ORDER BY a.curso",
    [prueba.id]
  );

  const porIntento = new Map();
  for (const r of anotadas) {
    if (!porIntento.has(r.intento_id)) porIntento.set(r.intento_id, {});
    porIntento.get(r.intento_id)[r.pregunta_id] = {
      // Solo cuenta como puntaje anotado si la docente la corrigio: un puntaje
      // guardado con corregida = 0 es un resto de cuando la pregunta era de otro
      // tipo, y darlo por bueno diria que ya esta revisada.
      puntaje: r.corregida ? r.puntaje : null,
      texto: r.respuesta_texto || '',
    };
  }

  res.json({
    prueba: { id: prueba.id, titulo: prueba.titulo },
    filtro_curso: String(req.query?.curso || ''),
    cursos_disponibles: cursos.map((c) => c.curso),
    preguntas,
    alumnos: intentos.map((i) => ({
      intento_id: i.id,
      nombre: i.nombre,
      curso: i.curso,
      respuestas: porIntento.get(i.id) || {},
    })),
  });
});

/**
 * Anota (o borra) el puntaje de una pregunta en papel para un estudiante.
 * `puntaje: null` deja la pregunta como pendiente otra vez, que es lo que hace
 * falta cuando se corrigio a la persona equivocada.
 */
router.put('/intentos/:id/correccion', async (req, res) => {
  const intento = await db.get('SELECT * FROM intentos WHERE id = ?', [req.params.id]);
  if (!intento) return res.status(404).json({ error: 'Intento no encontrado.' });

  const pregunta = await db.get(
    'SELECT * FROM preguntas WHERE id = ? AND prueba_id = ?',
    [req.body?.pregunta_id, intento.prueba_id]
  );
  if (!pregunta) return res.status(404).json({ error: 'Pregunta no encontrada en esta prueba.' });
  if (!seCorrigeAMano(pregunta)) {
    return res.status(400).json({ error: 'Esa pregunta se corrige sola contra su clave.' });
  }

  const borrar = req.body?.puntaje === null || req.body?.puntaje === '';
  const puntaje = borrar ? null : puntajeValido(req.body?.puntaje, pregunta.puntaje);
  if (!borrar && puntaje === null) {
    return res.status(400).json({ error: 'El puntaje tiene que ser un número entre 0 y ' + pregunta.puntaje + '.' });
  }

  const existente = await db.get(
    'SELECT id FROM respuestas WHERE intento_id = ? AND pregunta_id = ?',
    [intento.id, pregunta.id]
  );

  if (existente) {
    await db.run(
      'UPDATE respuestas SET puntaje = ?, corregida = ?, actualizado_en = ' + db.AHORA + ' WHERE id = ?',
      [puntaje, borrar ? 0 : 1, existente.id]
    );
  } else if (!borrar) {
    await db.run(
      'INSERT INTO respuestas (intento_id, pregunta_id, puntaje, corregida) VALUES (?, ?, ?, 1)',
      [intento.id, pregunta.id, puntaje]
    );
  }

  // Se recalcula al momento: la nota del estudiante tiene que reflejar lo que
  // la docente acaba de anotar, sin pedirle que apriete nada mas.
  const totales = await recalcularIntento(intento.id);
  res.json({ ok: true, puntaje, intento: totales });
});

/* ------------------------------------------------------------------ informes */

router.get('/pruebas/:id/informe', async (req, res) => {
  const informe = await informeDePrueba(req.params.id, String(req.query?.curso || ''));
  if (!informe) return res.status(404).json({ error: 'Prueba no encontrada.' });
  res.json(informe);
});

router.get('/intentos/:id/informe', async (req, res) => {
  const informe = await informeDeAlumno(req.params.id);
  if (!informe) return res.status(404).json({ error: 'Intento no encontrado.' });
  res.json(informe);
});

/**
 * Los informes individuales de toda la prueba, en un solo viaje.
 * La profesora necesita entregarle su hoja a cada estudiante: pedirlos de a uno
 * significaria 200 peticiones.
 */
router.get('/pruebas/:id/informes-alumnos', async (req, res) => {
  const params = [req.params.id];
  let sqlCurso = '';
  if (req.query?.curso) { sqlCurso = ' AND a.curso = ?'; params.push(String(req.query.curso)); }

  const intentos = await db.all(
    'SELECT i.id FROM intentos i JOIN alumnos a ON a.id = i.alumno_id ' +
      "WHERE i.prueba_id = ? AND i.estado = 'enviado'" + sqlCurso + ' ORDER BY a.curso, a.nombre',
    params
  );

  const informes = [];
  for (const i of intentos) informes.push(await informeDeAlumno(i.id));
  res.json({ total: informes.length, informes });
});

/** Recorrige todos los intentos enviados (útil tras corregir una clave mal cargada). */
router.post('/pruebas/:id/recalcular', async (req, res) => {
  const intentos = await db.all("SELECT id FROM intentos WHERE prueba_id = ? AND estado = 'enviado'", [req.params.id]);
  for (const i of intentos) await recalcularIntento(i.id);
  res.json({ ok: true, recalculados: intentos.length });
});

// Coma decimal: es lo que espera Excel en español, y el separador de columnas
// del archivo es ";" justamente para que la coma quede libre para los decimales.
const formatoNota = (n) => (n === null || n === undefined ? '' : Number(n).toFixed(1).replace('.', ','));

/** Puntaje legible: sin decimales cuando es redondo, con coma cuando no. */
const formatoPuntos = (n) => String(Math.round(Number(n) * 10) / 10).replace('.', ',');

const csvEscapar = (v) => {
  const s = v === null || v === undefined ? '' : String(v);
  // Un decimal con coma ("4,2") NO se entrecomilla: entre comillas Excel lo
  // importa como texto y la columna de notas deja de poder sumarse o promediarse.
  if (/^-?\d+,\d+$/.test(s)) return s;
  return /[",;\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

/** Exportacion para Excel: una fila por alumno, una columna por pregunta. */
router.get('/pruebas/:id/informe.csv', async (req, res) => {
  const informe = await informeDePrueba(req.params.id, String(req.query?.curso || ''));
  if (!informe) return res.status(404).json({ error: 'Prueba no encontrada.' });

  const preguntas = await db.all('SELECT * FROM preguntas WHERE prueba_id = ? ORDER BY numero', [req.params.id]);
  const lineas = [];
  lineas.push(['Prueba', informe.prueba.titulo].map(csvEscapar).join(';'));
  lineas.push(['Nivel', informe.prueba.nivel].map(csvEscapar).join(';'));

  const conNota = !!informe.escala_notas.activa;
  if (conNota) {
    const e = informe.escala_notas;
    lineas.push(['Escala de notas',
      '1,0 con ' + formatoPuntos(e.puntaje_1) + ' pts · ' +
      '4,0 con ' + formatoPuntos(e.puntaje_4) + ' pts · ' +
      '7,0 con ' + formatoPuntos(e.puntaje_7) + ' pts',
    ].map(csvEscapar).join(';'));
    lineas.push(['Promedio', formatoNota(informe.promedio_nota),
      'Aprobados', informe.aprobados + ' de ' + informe.total_alumnos +
        ' (' + formatoPuntos(informe.porcentaje_aprobacion) + '%)'].map(csvEscapar).join(';'));
  }
  lineas.push([]);

  const encabezado = ['Matricula', 'Alumno', 'Curso', 'Puntaje', 'Puntaje maximo', '% logro', 'Nivel de logro'];
  // La nota va antes del detalle pregunta a pregunta: es la columna que se
  // traspasa al libro de clases, y buscarla despues de 47 columnas es un suplicio.
  if (conNota) encabezado.push('Nota');
  for (const p of preguntas) encabezado.push('P' + p.numero);
  lineas.push(encabezado.map(csvEscapar).join(';'));

  for (const alumno of informe.alumnos) {
    const respuestas = await db.all('SELECT * FROM respuestas WHERE intento_id = ?', [alumno.intento_id]);
    const mapa = new Map(respuestas.map((r) => [r.pregunta_id, r]));
    const fila = [
      alumno.matricula, alumno.nombre, alumno.curso, alumno.puntaje,
      alumno.puntaje_max, alumno.porcentaje, 'Nivel ' + ['', 'I', 'II', 'III'][alumno.nivel_logro || 1],
    ];
    if (conNota) fila.push(formatoNota(alumno.nota));
    for (const p of preguntas) {
      const r = mapa.get(p.id);
      if (!r) { fila.push('N'); continue; }
      // En las de alternativas va la letra marcada; en las que corrige la
      // docente va el puntaje que le puso, que es el dato equivalente. El texto
      // completo de una respuesta escrita no cabe en una celda: eso se lee en
      // la pestaña Corregir.
      if (!seCorrigeAMano(p)) fila.push(r.alternativa || 'N');
      else if (r.corregida && r.puntaje !== null && r.puntaje !== undefined) fila.push(formatoPuntos(r.puntaje));
      else fila.push('N');
    }
    lineas.push(fila.map(csvEscapar).join(';'));
  }

  lineas.push([]);
  lineas.push('Clave de respuestas');
  lineas.push(['Pregunta', 'Criterio', 'Clave', '% logro curso'].map(csvEscapar).join(';'));
  for (const f of informe.preguntas) {
    lineas.push([f.numero, f.eje, f.clave || '', f.logro].map(csvEscapar).join(';'));
  }

  lineas.push([]);
  lineas.push('Niveles de logro');
  for (const n of informe.distribucion_niveles) {
    lineas.push([n.etiqueta, NOMBRE_NIVEL[n.nivel], n.cantidad, n.porcentaje + '%'].map(csvEscapar).join(';'));
  }

  const nombreArchivo = 'informe_' + String(informe.prueba.titulo).replace(/[^\w-]+/g, '_').slice(0, 50) + '.csv';
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="' + nombreArchivo + '"');
  // BOM para que Excel en Windows respete los acentos.
  res.send('﻿' + lineas.join('\n'));
});

export default router;
