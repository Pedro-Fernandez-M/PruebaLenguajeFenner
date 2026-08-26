import express from 'express';
import * as db from '../db/index.js';
import { exigirProfesor } from '../lib/sesion.js';
import { informeDePrueba, informeDeAlumno, recalcularIntento, NOMBRE_NIVEL } from '../lib/evaluacion.js';

const router = express.Router();
router.use(exigirProfesor);

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

/* -------------------------------------------- correccion de las de desarrollo */

router.get('/pruebas/:id/correccion', async (req, res) => {
  const prueba = await db.get('SELECT * FROM pruebas WHERE id = ?', [req.params.id]);
  if (!prueba) return res.status(404).json({ error: 'Prueba no encontrada.' });

  const preguntas = await db.all(
    "SELECT * FROM preguntas WHERE prueba_id = ? AND tipo = 'desarrollo' ORDER BY numero",
    [prueba.id]
  );
  const rubricas = await db.all(
    'SELECT r.* FROM rubricas r JOIN preguntas p ON p.id = r.pregunta_id ' +
      "WHERE p.prueba_id = ? AND p.tipo = 'desarrollo' ORDER BY r.codigo DESC",
    [prueba.id]
  );

  const bloques = [];
  for (const pregunta of preguntas) {
    const respuestas = await db.all(
      'SELECT r.id, r.respuesta_texto, r.codigo_rubrica, r.intento_id, a.nombre, a.curso ' +
        'FROM respuestas r JOIN intentos i ON i.id = r.intento_id JOIN alumnos a ON a.id = i.alumno_id ' +
        "WHERE r.pregunta_id = ? AND i.estado = 'enviado' ORDER BY a.curso, a.nombre",
      [pregunta.id]
    );
    bloques.push({
      pregunta: {
        id: pregunta.id, numero: pregunta.numero, enunciado: pregunta.enunciado,
        eje: pregunta.eje, oa: pregunta.oa, indicador: pregunta.indicador, puntaje: pregunta.puntaje,
      },
      rubricas: rubricas.filter((r) => r.pregunta_id === pregunta.id),
      respuestas,
    });
  }

  res.json({ prueba: { id: prueba.id, titulo: prueba.titulo }, bloques });
});

router.post('/respuestas/:id/codigo', async (req, res) => {
  const codigo = Number(req.body?.codigo);
  if (![0, 1, 2].includes(codigo)) return res.status(400).json({ error: 'El código debe ser 2, 1 o 0.' });

  const respuesta = await db.get('SELECT * FROM respuestas WHERE id = ?', [req.params.id]);
  if (!respuesta) return res.status(404).json({ error: 'Respuesta no encontrada.' });

  await db.run('UPDATE respuestas SET codigo_rubrica = ?, corregida = 1 WHERE id = ?', [codigo, respuesta.id]);
  const totales = await recalcularIntento(respuesta.intento_id);
  res.json({ ok: true, intento: totales });
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

/** Recorrige todos los intentos enviados (útil tras corregir una clave mal cargada). */
router.post('/pruebas/:id/recalcular', async (req, res) => {
  const intentos = await db.all("SELECT id FROM intentos WHERE prueba_id = ? AND estado = 'enviado'", [req.params.id]);
  for (const i of intentos) await recalcularIntento(i.id);
  res.json({ ok: true, recalculados: intentos.length });
});

const csvEscapar = (v) => {
  const s = v === null || v === undefined ? '' : String(v);
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
  lineas.push([]);

  const encabezado = ['Matricula', 'Alumno', 'Curso', 'Puntaje', 'Puntaje maximo', '% logro', 'Nivel de logro'];
  for (const p of preguntas) encabezado.push('P' + p.numero);
  lineas.push(encabezado.map(csvEscapar).join(';'));

  for (const alumno of informe.alumnos) {
    const respuestas = await db.all('SELECT * FROM respuestas WHERE intento_id = ?', [alumno.intento_id]);
    const mapa = new Map(respuestas.map((r) => [r.pregunta_id, r]));
    const fila = [
      alumno.matricula, alumno.nombre, alumno.curso, alumno.puntaje,
      alumno.puntaje_max, alumno.porcentaje, 'Nivel ' + ['', 'I', 'II', 'III'][alumno.nivel_logro || 1],
    ];
    for (const p of preguntas) {
      const r = mapa.get(p.id);
      if (!r) { fila.push('N'); continue; }
      if (p.tipo === 'alternativas') fila.push(r.alternativa || 'N');
      else fila.push(r.codigo_rubrica === null || r.codigo_rubrica === undefined ? 'N' : 'C' + r.codigo_rubrica);
    }
    lineas.push(fila.map(csvEscapar).join(';'));
  }

  lineas.push([]);
  lineas.push('Clave de respuestas');
  lineas.push(['Pregunta', 'OA', 'Tipo de texto', 'Eje de habilidad', 'Indicador', 'Clave', '% logro curso'].map(csvEscapar).join(';'));
  for (const f of informe.preguntas) {
    lineas.push([f.numero, f.oa, f.tipo_texto, f.eje, f.indicador, f.clave || 'Desarrollo', f.logro].map(csvEscapar).join(';'));
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
