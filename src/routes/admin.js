import express from 'express';
import * as db from '../db/index.js';
import { exigirProfesor } from '../lib/sesion.js';
import { generarCodigo } from '../lib/seguridad.js';
import { EJES, LETRAS } from '../lib/evaluacion.js';

const router = express.Router();
router.use(exigirProfesor);

const texto = (v, porDefecto = '') => (v === undefined || v === null ? porDefecto : String(v));
const entero = (v, porDefecto = null) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : porDefecto;
};

router.get('/catalogos', (_req, res) => {
  res.json({ ejes: EJES, letras: LETRAS });
});

/* ------------------------------------------------------------------ pruebas */

// Cada docente trabaja con sus propias pruebas; el administrador las ve todas.
const soloSuyas = (req) => req.profesor.rol === 'admin' ? '' : ' WHERE p.profesor_id = ?';
const paramsSuyas = (req) => req.profesor.rol === 'admin' ? [] : [req.profesor.id];

router.get('/pruebas', async (req, res) => {
  const pruebas = await db.all(
    'SELECT p.*, pr.nombre AS docente, ' +
      '(SELECT COUNT(*) FROM preguntas q WHERE q.prueba_id = p.id) AS total_preguntas, ' +
      "(SELECT COUNT(*) FROM intentos i WHERE i.prueba_id = p.id AND i.estado = 'enviado') AS total_enviados, " +
      "(SELECT COUNT(*) FROM intentos i WHERE i.prueba_id = p.id AND i.estado = 'en_curso') AS total_en_curso " +
      'FROM pruebas p LEFT JOIN profesores pr ON pr.id = p.profesor_id' +
      soloSuyas(req) + ' ORDER BY p.creado_en DESC',
    paramsSuyas(req)
  );
  res.json({ pruebas });
});

/**
 * Devuelve la prueba solo si le pertenece a quien la pide.
 * Sin esto, cambiar el numero en la direccion bastaria para abrir la prueba de
 * otra colega, con sus claves incluidas.
 */
async function pruebaPropia(req, res) {
  const prueba = await db.get('SELECT * FROM pruebas WHERE id = ?', [req.params.id]);
  if (!prueba) {
    res.status(404).json({ error: 'Prueba no encontrada.' });
    return null;
  }
  if (req.profesor.rol !== 'admin' && prueba.profesor_id !== req.profesor.id) {
    res.status(403).json({ error: 'Esa prueba es de otra docente.' });
    return null;
  }
  return prueba;
}

router.post('/pruebas', async (req, res) => {
  const titulo = texto(req.body?.titulo).trim();
  if (!titulo) return res.status(400).json({ error: 'La prueba necesita un título.' });

  const { id } = await db.run(
    'INSERT INTO pruebas (titulo, asignatura, nivel, descripcion, instrucciones, duracion_min, cursos, nivel2_min, nivel3_min, profesor_id) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [
      titulo,
      texto(req.body?.asignatura, 'Lectura'),
      texto(req.body?.nivel, 'II medio'),
      texto(req.body?.descripcion),
      texto(req.body?.instrucciones),
      entero(req.body?.duracion_min),
      texto(req.body?.cursos),
      Number(req.body?.nivel2_min ?? 40),
      Number(req.body?.nivel3_min ?? 70),
      req.profesor.id,
    ]
  );
  res.status(201).json({ id });
});

router.get('/pruebas/:id', async (req, res) => {
  const prueba = await pruebaPropia(req, res);
  if (!prueba) return;

  const preguntas = await db.all('SELECT * FROM preguntas WHERE prueba_id = ? ORDER BY numero', [prueba.id]);
  const opciones = await db.all(
    'SELECT o.* FROM opciones o JOIN preguntas p ON p.id = o.pregunta_id WHERE p.prueba_id = ? ORDER BY o.letra',
    [prueba.id]
  );

  res.json({
    prueba,
    preguntas: preguntas.map((p) => ({
      ...p,
      opciones: opciones.filter((o) => o.pregunta_id === p.id),
    })),
  });
});

router.put('/pruebas/:id', async (req, res) => {
  const prueba = await pruebaPropia(req, res);
  if (!prueba) return;

  const estado = ['borrador', 'publicada', 'cerrada'].includes(req.body?.estado) ? req.body.estado : prueba.estado;

  await db.run(
    'UPDATE pruebas SET titulo = ?, asignatura = ?, nivel = ?, descripcion = ?, instrucciones = ?, ' +
      'duracion_min = ?, estado = ?, cursos = ?, mostrar_resultado_alumno = ?, nivel2_min = ?, nivel3_min = ? WHERE id = ?',
    [
      texto(req.body?.titulo, prueba.titulo).trim() || prueba.titulo,
      texto(req.body?.asignatura, prueba.asignatura),
      texto(req.body?.nivel, prueba.nivel),
      texto(req.body?.descripcion, prueba.descripcion),
      texto(req.body?.instrucciones, prueba.instrucciones),
      req.body?.duracion_min === '' || req.body?.duracion_min === null ? null : entero(req.body?.duracion_min, prueba.duracion_min),
      estado,
      texto(req.body?.cursos, prueba.cursos),
      req.body?.mostrar_resultado_alumno ? 1 : 0,
      Number(req.body?.nivel2_min ?? prueba.nivel2_min),
      Number(req.body?.nivel3_min ?? prueba.nivel3_min),
      prueba.id,
    ]
  );
  res.json({ ok: true });
});

router.delete('/pruebas/:id', async (req, res) => {
  const prueba = await pruebaPropia(req, res);
  if (!prueba) return;
  await db.run('DELETE FROM pruebas WHERE id = ?', [prueba.id]);
  res.json({ ok: true });
});

/** Copia una prueba completa (preguntas y alternativas) como borrador. */
router.post('/pruebas/:id/duplicar', async (req, res) => {
  const prueba = await pruebaPropia(req, res);
  if (!prueba) return;

  const nuevaId = await db.tx(async () => {
    const { id } = await db.run(
      'INSERT INTO pruebas (titulo, asignatura, nivel, descripcion, instrucciones, duracion_min, cursos, nivel2_min, nivel3_min, profesor_id) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [prueba.titulo + ' (copia)', prueba.asignatura, prueba.nivel, prueba.descripcion, prueba.instrucciones,
        prueba.duracion_min, prueba.cursos, prueba.nivel2_min, prueba.nivel3_min, req.profesor.id]
    );


    for (const p of await db.all('SELECT * FROM preguntas WHERE prueba_id = ? ORDER BY numero', [prueba.id])) {
      const nueva = await db.run(
        'INSERT INTO preguntas (prueba_id, numero, tipo, enunciado, cita, oa, eje, indicador, clave, puntaje) ' +
          'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [id, p.numero, p.tipo, p.enunciado, p.cita, p.oa, p.eje, p.indicador, p.clave, p.puntaje]
      );
      for (const o of await db.all('SELECT * FROM opciones WHERE pregunta_id = ?', [p.id])) {
        await db.run('INSERT INTO opciones (pregunta_id, letra, contenido) VALUES (?, ?, ?)', [nueva.id, o.letra, o.contenido]);
      }
    }
    return id;
  });

  res.status(201).json({ id: nuevaId });
});

/**
 * La prueba tal como la vera el estudiante. Sirve para revisarla antes de
 * publicarla sin tener que ocupar el codigo de un alumno ni crear un intento.
 * A diferencia de la vista del alumno, aqui SI viaja la clave: quien mira es
 * quien la definio.
 */
router.get('/pruebas/:id/vista-previa', async (req, res) => {
  const prueba = await pruebaPropia(req, res);
  if (!prueba) return;

  const preguntas = await db.all(
    'SELECT id, numero, tipo, enunciado, cita, eje, clave, puntaje FROM preguntas WHERE prueba_id = ? ORDER BY numero',
    [prueba.id]
  );
  const opciones = await db.all(
    'SELECT o.id, o.pregunta_id, o.letra, o.contenido FROM opciones o ' +
      'JOIN preguntas p ON p.id = o.pregunta_id WHERE p.prueba_id = ? ORDER BY o.letra',
    [prueba.id]
  );

  res.json({
    prueba,
    preguntas: preguntas.map((p) => ({
      ...p,
      opciones: opciones.filter((o) => o.pregunta_id === p.id && String(o.contenido || '').trim()),
    })),
  });
});

/* ---------------------------------------------------------------- preguntas */

/** Reescribe las cinco alternativas de una pregunta; las vacias no se muestran. */
async function guardarOpciones(preguntaId, cuerpo) {
  const opciones = Array.isArray(cuerpo?.opciones) ? cuerpo.opciones : [];
  await db.run('DELETE FROM opciones WHERE pregunta_id = ?', [preguntaId]);
  for (const letra of LETRAS) {
    const encontrada = opciones.find((o) => o.letra === letra);
    await db.run('INSERT INTO opciones (pregunta_id, letra, contenido) VALUES (?, ?, ?)', [
      preguntaId, letra, texto(encontrada?.contenido),
    ]);
  }
}

router.post('/pruebas/:id/preguntas', async (req, res) => {
  const prueba = await db.get('SELECT id FROM pruebas WHERE id = ?', [req.params.id]);
  if (!prueba) return res.status(404).json({ error: 'Prueba no encontrada.' });

  const ultimo = await db.get('SELECT COALESCE(MAX(numero), 0) AS n FROM preguntas WHERE prueba_id = ?', [prueba.id]);

  const { id } = await db.run(
    'INSERT INTO preguntas (prueba_id, numero, tipo, enunciado, cita, oa, eje, indicador, clave, puntaje) ' +
      "VALUES (?, ?, 'alternativas', ?, ?, ?, ?, ?, ?, ?)",
    [
      prueba.id, entero(req.body?.numero, ultimo.n + 1),
      texto(req.body?.enunciado), texto(req.body?.cita), texto(req.body?.oa),
      texto(req.body?.eje), texto(req.body?.indicador),
      LETRAS.includes(req.body?.clave) ? req.body.clave : null,
      entero(req.body?.puntaje, 1),
    ]
  );

  await guardarOpciones(id, req.body);
  res.status(201).json({ id });
});

router.put('/preguntas/:id', async (req, res) => {
  const p = await db.get('SELECT * FROM preguntas WHERE id = ?', [req.params.id]);
  if (!p) return res.status(404).json({ error: 'Pregunta no encontrada.' });

  await db.run(
    'UPDATE preguntas SET numero = ?, enunciado = ?, cita = ?, oa = ?, eje = ?, ' +
      'indicador = ?, clave = ?, puntaje = ? WHERE id = ?',
    [
      entero(req.body?.numero, p.numero),
      texto(req.body?.enunciado, p.enunciado), texto(req.body?.cita, p.cita),
      texto(req.body?.oa, p.oa), texto(req.body?.eje, p.eje),
      texto(req.body?.indicador, p.indicador),
      LETRAS.includes(req.body?.clave) ? req.body.clave : p.clave,
      entero(req.body?.puntaje, p.puntaje),
      p.id,
    ]
  );

  if (req.body?.opciones) await guardarOpciones(p.id, req.body);
  res.json({ ok: true });
});

router.delete('/preguntas/:id', async (req, res) => {
  await db.run('DELETE FROM preguntas WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

/* ------------------------------------------------------------------ alumnos */

// La nomina es comun: cualquier docente puede evaluar a cualquier curso. Lo que
// no se comparte son las pruebas, que son de quien las escribio.
router.get('/alumnos', async (req, res) => {
  const curso = texto(req.query?.curso).trim();
  const filas = curso
    ? await db.all('SELECT * FROM alumnos WHERE curso = ? ORDER BY nombre', [curso])
    : await db.all('SELECT * FROM alumnos ORDER BY curso, nombre');
  const cursos = await db.all("SELECT curso, COUNT(*) AS n FROM alumnos WHERE curso <> '' GROUP BY curso ORDER BY curso");
  res.json({ alumnos: filas, cursos });
});

async function codigoUnico() {
  for (let intento = 0; intento < 40; intento++) {
    const codigo = generarCodigo(8);
    const existe = await db.get('SELECT id FROM alumnos WHERE codigo = ?', [codigo]);
    if (!existe) return codigo;
  }
  throw new Error('No fue posible generar un código único.');
}

router.put('/alumnos/:id', async (req, res) => {
  const a = await db.get('SELECT * FROM alumnos WHERE id = ?', [req.params.id]);
  if (!a) return res.status(404).json({ error: 'Alumno no encontrado.' });

  await db.run(
    'UPDATE alumnos SET matricula = ?, rut = ?, dv = ?, nombre = ?, curso = ?, regimen = ?, activo = ? WHERE id = ?',
    [
      texto(req.body?.matricula, a.matricula), texto(req.body?.rut, a.rut), texto(req.body?.dv, a.dv),
      texto(req.body?.nombre, a.nombre).trim() || a.nombre, texto(req.body?.curso, a.curso).trim(),
      texto(req.body?.regimen, a.regimen),
      req.body?.activo === undefined ? a.activo : (req.body.activo ? 1 : 0),
      a.id,
    ]
  );
  res.json({ ok: true });
});

router.delete('/alumnos/:id', async (req, res) => {
  await db.run('DELETE FROM alumnos WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

router.post('/alumnos/:id/regenerar-codigo', async (req, res) => {
  const codigo = await codigoUnico();
  const r = await db.run('UPDATE alumnos SET codigo = ? WHERE id = ?', [codigo, req.params.id]);
  if (!r.cambios) return res.status(404).json({ error: 'Alumno no encontrado.' });
  res.json({ codigo });
});

export default router;
