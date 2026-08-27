import express from 'express';
import * as db from '../db/index.js';
import { normalizarCodigo } from '../lib/seguridad.js';
import { iniciarSesionAlumno, cerrarSesion, exigirAlumno, COOKIE_ALUMNO } from '../lib/sesion.js';
import { recalcularIntento, informeDeAlumno, LETRAS } from '../lib/evaluacion.js';

const { AHORA } = db;

const router = express.Router();

// Las marcas de tiempo se guardan en UTC con formato 'YYYY-MM-DD HH:MM:SS'
// en ambos motores; hay que interpretarlas como UTC.
const aMilisegundos = (fechaSql) => Date.parse(String(fechaSql).replace(' ', 'T') + 'Z');

function cursoHabilitado(prueba, curso) {
  const lista = String(prueba.cursos || '').split(',').map((c) => c.trim()).filter(Boolean);
  return lista.length === 0 || lista.includes(curso);
}

function segundosRestantes(prueba, intento) {
  if (!prueba.duracion_min) return null;
  const fin = aMilisegundos(intento.iniciado_en) + prueba.duracion_min * 60_000;
  return Math.max(0, Math.round((fin - Date.now()) / 1000));
}

router.post('/ingresar', async (req, res) => {
  const codigo = normalizarCodigo(req.body?.codigo);
  if (!codigo) return res.status(400).json({ error: 'Escribe tu código de acceso.' });

  // El codigo se guarda con guion; se compara normalizado para aceptar ambas formas.
  const alumnos = await db.all('SELECT * FROM alumnos WHERE activo = 1');
  const alumno = alumnos.find((a) => normalizarCodigo(a.codigo) === codigo);

  if (!alumno) return res.status(401).json({ error: 'Ese código no existe o está desactivado. Revísalo con tu profesor.' });

  iniciarSesionAlumno(res, alumno);
  res.json({ alumno: { id: alumno.id, nombre: alumno.nombre, curso: alumno.curso, matricula: alumno.matricula } });
});

router.post('/salir', (req, res) => {
  cerrarSesion(res, COOKIE_ALUMNO);
  res.json({ ok: true });
});

router.get('/pruebas', exigirAlumno, async (req, res) => {
  const pruebas = await db.all("SELECT * FROM pruebas WHERE estado = 'publicada' ORDER BY creado_en DESC");
  const intentos = await db.all('SELECT * FROM intentos WHERE alumno_id = ?', [req.alumno.id]);
  const porPrueba = new Map(intentos.map((i) => [i.prueba_id, i]));

  const disponibles = [];
  for (const p of pruebas) {
    if (!cursoHabilitado(p, req.alumno.curso)) continue;
    const total = await db.get('SELECT COUNT(*) AS n FROM preguntas WHERE prueba_id = ?', [p.id]);
    const intento = porPrueba.get(p.id) || null;
    disponibles.push({
      id: p.id,
      titulo: p.titulo,
      asignatura: p.asignatura,
      nivel: p.nivel,
      descripcion: p.descripcion,
      duracion_min: p.duracion_min,
      total_preguntas: total.n,
      muestra_resultado: !!p.mostrar_resultado_alumno,
      intento: intento ? { id: intento.id, estado: intento.estado } : null,
    });
  }
  res.json({ alumno: req.alumno, pruebas: disponibles });
});

router.post('/pruebas/:id/iniciar', exigirAlumno, async (req, res) => {
  const prueba = await db.get('SELECT * FROM pruebas WHERE id = ?', [req.params.id]);
  if (!prueba || prueba.estado !== 'publicada') return res.status(404).json({ error: 'La prueba no está disponible.' });
  if (!cursoHabilitado(prueba, req.alumno.curso)) return res.status(403).json({ error: 'Esta prueba no está habilitada para tu curso.' });

  let intento = await db.get('SELECT * FROM intentos WHERE prueba_id = ? AND alumno_id = ?', [prueba.id, req.alumno.id]);
  if (intento && intento.estado === 'enviado') {
    return res.status(409).json({ error: 'Ya enviaste esta prueba.', intento_id: intento.id });
  }
  if (!intento) {
    const { id } = await db.run('INSERT INTO intentos (prueba_id, alumno_id) VALUES (?, ?)', [prueba.id, req.alumno.id]);
    intento = await db.get('SELECT * FROM intentos WHERE id = ?', [id]);
  }
  res.json({ intento_id: intento.id });
});

/** Entrega la prueba completa SIN claves ni rubricas. */
router.get('/intentos/:id', exigirAlumno, async (req, res) => {
  const intento = await db.get('SELECT * FROM intentos WHERE id = ? AND alumno_id = ?', [req.params.id, req.alumno.id]);
  if (!intento) return res.status(404).json({ error: 'Intento no encontrado.' });

  const prueba = await db.get('SELECT * FROM pruebas WHERE id = ?', [intento.prueba_id]);
  const restante = segundosRestantes(prueba, intento);

  // Si el tiempo se agoto mientras el alumno estaba fuera, se envia automaticamente.
  if (intento.estado === 'en_curso' && restante === 0) {
    await db.run("UPDATE intentos SET estado = 'enviado', enviado_en = " + AHORA + " WHERE id = ?", [intento.id]);
    await recalcularIntento(intento.id);
    return res.status(409).json({ error: 'Se acabó el tiempo. La prueba se envió automáticamente.', intento_id: intento.id });
  }
  if (intento.estado === 'enviado') {
    return res.status(409).json({ error: 'Ya enviaste esta prueba.', intento_id: intento.id });
  }

  const textos = await db.all(
    'SELECT id, orden, titulo, autor, fuente, tipo_texto, contenido FROM textos WHERE prueba_id = ? ORDER BY orden, id',
    [prueba.id]
  );
  const preguntas = await db.all(
    'SELECT id, texto_id, numero, tipo, enunciado, cita, puntaje FROM preguntas WHERE prueba_id = ? ORDER BY numero',
    [prueba.id]
  );
  const opciones = await db.all(
    'SELECT o.id, o.pregunta_id, o.letra, o.contenido FROM opciones o ' +
      'JOIN preguntas p ON p.id = o.pregunta_id WHERE p.prueba_id = ? ORDER BY o.letra',
    [prueba.id]
  );
  const respuestas = await db.all(
    'SELECT pregunta_id, alternativa, respuesta_texto FROM respuestas WHERE intento_id = ?',
    [intento.id]
  );

  res.json({
    intento: { id: intento.id, estado: intento.estado, segundos_restantes: restante },
    prueba: {
      id: prueba.id, titulo: prueba.titulo, asignatura: prueba.asignatura,
      nivel: prueba.nivel, instrucciones: prueba.instrucciones, duracion_min: prueba.duracion_min,
    },
    textos,
    // Solo viajan las alternativas con contenido: asi una prueba de cuatro
    // opciones no muestra una E vacia.
    preguntas: preguntas.map((p) => ({
      ...p,
      opciones: opciones.filter((o) => o.pregunta_id === p.id && String(o.contenido || '').trim()),
    })),
    respuestas,
  });
});

/** Autoguardado de una respuesta. */
router.post('/intentos/:id/respuesta', exigirAlumno, async (req, res) => {
  const intento = await db.get('SELECT * FROM intentos WHERE id = ? AND alumno_id = ?', [req.params.id, req.alumno.id]);
  if (!intento) return res.status(404).json({ error: 'Intento no encontrado.' });
  if (intento.estado !== 'en_curso') return res.status(409).json({ error: 'La prueba ya fue enviada.' });

  const preguntaId = Number(req.body?.pregunta_id);
  const pregunta = await db.get('SELECT * FROM preguntas WHERE id = ? AND prueba_id = ?', [preguntaId, intento.prueba_id]);
  if (!pregunta) return res.status(400).json({ error: 'Pregunta inválida.' });

  const alternativa = LETRAS.includes(req.body?.alternativa) ? req.body.alternativa : null;
  const texto = String(req.body?.respuesta_texto ?? '').slice(0, 8000);

  const existente = await db.get('SELECT id FROM respuestas WHERE intento_id = ? AND pregunta_id = ?', [intento.id, preguntaId]);
  if (existente) {
    await db.run(
      'UPDATE respuestas SET alternativa = ?, respuesta_texto = ?, actualizado_en = ' + AHORA + ' WHERE id = ?',
      [alternativa, texto, existente.id]
    );
  } else {
    await db.run(
      'INSERT INTO respuestas (intento_id, pregunta_id, alternativa, respuesta_texto) VALUES (?, ?, ?, ?)',
      [intento.id, preguntaId, alternativa, texto]
    );
  }

  const respondidas = await db.get(
    "SELECT COUNT(*) AS n FROM respuestas WHERE intento_id = ? AND (alternativa IS NOT NULL OR trim(respuesta_texto) <> '')",
    [intento.id]
  );
  res.json({ ok: true, respondidas: respondidas.n });
});

router.post('/intentos/:id/enviar', exigirAlumno, async (req, res) => {
  const intento = await db.get('SELECT * FROM intentos WHERE id = ? AND alumno_id = ?', [req.params.id, req.alumno.id]);
  if (!intento) return res.status(404).json({ error: 'Intento no encontrado.' });
  if (intento.estado === 'enviado') return res.json({ ok: true, intento_id: intento.id });

  await db.run("UPDATE intentos SET estado = 'enviado', enviado_en = " + AHORA + " WHERE id = ?", [intento.id]);
  await recalcularIntento(intento.id);

  const prueba = await db.get('SELECT mostrar_resultado_alumno FROM pruebas WHERE id = ?', [intento.prueba_id]);
  res.json({ ok: true, intento_id: intento.id, muestra_resultado: !!prueba.mostrar_resultado_alumno });
});

router.get('/intentos/:id/resultado', exigirAlumno, async (req, res) => {
  const intento = await db.get('SELECT * FROM intentos WHERE id = ? AND alumno_id = ?', [req.params.id, req.alumno.id]);
  if (!intento) return res.status(404).json({ error: 'Intento no encontrado.' });

  const prueba = await db.get('SELECT * FROM pruebas WHERE id = ?', [intento.prueba_id]);
  if (!prueba.mostrar_resultado_alumno) {
    return res.status(403).json({ error: 'Tu profesor revisará los resultados y los comentará en clases.' });
  }

  const informe = await informeDeAlumno(intento.id);
  // El alumno ve su desempeno por eje, no la clave de cada pregunta.
  res.json({
    prueba: { titulo: prueba.titulo, nivel: prueba.nivel },
    puntaje: informe.intento.puntaje,
    puntaje_max: informe.intento.puntaje_max,
    porcentaje: informe.intento.porcentaje,
    nivel_logro: informe.intento.nivel_logro,
    por_eje: informe.por_eje,
  });
});

export default router;
