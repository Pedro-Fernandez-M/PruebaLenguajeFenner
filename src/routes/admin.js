import express from 'express';
import * as db from '../db/index.js';
import { exigirProfesor } from '../lib/sesion.js';
import { generarCodigo } from '../lib/seguridad.js';
import { LETRAS, TIPOS_PREGUNTA, recalcularIntento } from '../lib/evaluacion.js';
import { validarEscala } from '../../public/js/notas.js';

const router = express.Router();
router.use(exigirProfesor);

const texto = (v, porDefecto = '') => (v === undefined || v === null ? porDefecto : String(v));
const entero = (v, porDefecto = null) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : porDefecto;
};

/**
 * Anclaje de la escala de notas. Vacio significa "automatico", que se guarda
 * como NULL: es distinto de un cero, que seria un puntaje de verdad.
 * Si el campo no viene en la peticion, se conserva lo que ya estaba.
 */
function anclaje(cuerpo, campo, actual = null) {
  if (!cuerpo || !(campo in cuerpo)) return actual;
  const v = cuerpo[campo];
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Los tres anclajes ya normalizados, listos para validar y guardar. */
const leerEscala = (cuerpo, prueba = null) => ({
  puntaje_7: anclaje(cuerpo, 'nota_puntaje_7', prueba ? prueba.nota_puntaje_7 : null),
  puntaje_4: anclaje(cuerpo, 'nota_puntaje_4', prueba ? prueba.nota_puntaje_4 : null),
  puntaje_1: anclaje(cuerpo, 'nota_puntaje_1', prueba ? prueba.nota_puntaje_1 : null),
});

router.get('/catalogos', (_req, res) => {
  res.json({ letras: LETRAS, tipos: TIPOS_PREGUNTA });
});

/* ---------------------------------------------------------------- criterios */

/**
 * Forma con que se comparan dos criterios: sin mayusculas y sin tildes.
 *
 * normalize('NFD') separa cada letra de su acento y \p{Diacritic} borra los
 * acentos que quedaron sueltos, asi que "información" e "informacion" terminan
 * siendo el mismo texto. Es lo que hace falta para que una tilde olvidada no
 * cree un criterio gemelo que parta el informe en dos.
 */
const comparable = (nombre) => String(nombre)
  .normalize('NFD')
  .replace(/\p{Diacritic}/gu, '')
  .toLowerCase()
  .trim();

/**
 * Los criterios que puede asignar la duena de una prueba, con cuantas preguntas
 * suyas usa cada uno.
 *
 * Son de cada docente, no del sistema: las pruebas cambian de un ano a otro. Y
 * van colgados de la prueba y no de "quien esta mirando" porque la
 * administradora puede abrir la prueba de una colega, y ahi los criterios que
 * corresponden son los de la colega, no los suyos.
 */
async function criteriosDe(profesorId) {
  return db.all(
    'SELECT c.id, c.nombre, ' +
      '(SELECT COUNT(*) FROM preguntas q JOIN pruebas p ON p.id = q.prueba_id ' +
      '  WHERE p.profesor_id = c.profesor_id AND q.eje = c.nombre) AS preguntas ' +
      'FROM criterios c WHERE c.profesor_id = ? ORDER BY c.id',
    [profesorId]
  );
}

router.get('/pruebas/:id/criterios', async (req, res) => {
  const prueba = await pruebaPropia(req, res);
  if (!prueba) return;
  res.json({ criterios: await criteriosDe(prueba.profesor_id) });
});

/**
 * Revisa el nombre que llega del formulario y lo normaliza.
 * `exceptoId` deja fuera de la comparacion al criterio que se esta renombrando,
 * para que no choque consigo mismo al corregirle una tilde.
 */
async function revisarNombre(profesorId, valor, exceptoId = null) {
  const nombre = texto(valor).trim().replace(/\s+/g, ' ');
  if (!nombre) return { error: 'Escribe el nombre del criterio.' };
  if (nombre.length > 80) return { error: 'El nombre es demasiado largo (máximo 80 caracteres).' };

  // La comparacion ignora mayusculas Y tildes: "Interpretar", "interpretar" e
  // "Interpretación" / "Interpretacion" tienen que chocar entre si. Si no, un
  // acento olvidado crea un criterio gemelo y el informe reparte las preguntas
  // entre los dos sin que nada lo advierta. Se guarda el texto tal como se
  // escribio; lo que se normaliza es solo la comparacion.
  const existentes = await criteriosDe(profesorId);
  const repetido = existentes.find(
    (c) => c.id !== Number(exceptoId) && comparable(c.nombre) === comparable(nombre)
  );
  if (repetido) return { error: 'Ya existe el criterio «' + repetido.nombre + '».' };

  return { nombre };
}

router.post('/pruebas/:id/criterios', async (req, res) => {
  const prueba = await pruebaPropia(req, res);
  if (!prueba) return;

  const revision = await revisarNombre(prueba.profesor_id, req.body?.nombre);
  if (revision.error) {
    return res.status(revision.error.startsWith('Ya existe') ? 409 : 400).json({ error: revision.error });
  }

  const { id } = await db.run(
    'INSERT INTO criterios (profesor_id, nombre) VALUES (?, ?)',
    [prueba.profesor_id, revision.nombre]
  );
  res.status(201).json({ id, nombre: revision.nombre });
});

/**
 * Renombra un criterio y arrastra el cambio a las preguntas que lo usan.
 *
 * Las preguntas guardan el NOMBRE, asi que renombrar solo la fila de `criterios`
 * dejaria a las preguntas clasificadas con el nombre viejo: en el informe
 * aparecerian los dos, el nuevo vacio y el viejo con todo. Por eso ambas cosas
 * van juntas y dentro de una transaccion.
 */
router.put('/pruebas/:id/criterios/:criterioId', async (req, res) => {
  const prueba = await pruebaPropia(req, res);
  if (!prueba) return;

  const criterio = await db.get(
    'SELECT * FROM criterios WHERE id = ? AND profesor_id = ?',
    [req.params.criterioId, prueba.profesor_id]
  );
  if (!criterio) return res.status(404).json({ error: 'Criterio no encontrado.' });

  const revision = await revisarNombre(prueba.profesor_id, req.body?.nombre, criterio.id);
  if (revision.error) {
    return res.status(revision.error.startsWith('Ya existe') ? 409 : 400).json({ error: revision.error });
  }
  if (revision.nombre === criterio.nombre) return res.json({ ok: true, nombre: criterio.nombre, preguntas: 0 });

  const reclasificadas = await db.tx(async () => {
    await db.run('UPDATE criterios SET nombre = ? WHERE id = ?', [revision.nombre, criterio.id]);
    // Solo las preguntas de ESTA docente: otra colega puede tener un criterio
    // que se llama igual, y no es el mismo criterio.
    const r = await db.run(
      'UPDATE preguntas SET eje = ? WHERE eje = ? ' +
        'AND prueba_id IN (SELECT id FROM pruebas WHERE profesor_id = ?)',
      [revision.nombre, criterio.nombre, prueba.profesor_id]
    );
    return r.cambios;
  });

  res.json({ ok: true, nombre: revision.nombre, preguntas: reclasificadas });
});

router.delete('/pruebas/:id/criterios/:criterioId', async (req, res) => {
  const prueba = await pruebaPropia(req, res);
  if (!prueba) return;

  const criterio = await db.get(
    'SELECT * FROM criterios WHERE id = ? AND profesor_id = ?',
    [req.params.criterioId, prueba.profesor_id]
  );
  if (!criterio) return res.status(404).json({ error: 'Criterio no encontrado.' });

  // Solo se saca de la lista de opciones. Las preguntas que ya lo tenian
  // conservan su clasificacion y siguen apareciendo en el informe: borrar un
  // rotulo no deberia borrar el trabajo hecho con el.
  await db.run('DELETE FROM criterios WHERE id = ?', [criterio.id]);
  res.json({ ok: true });
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

  const escala = leerEscala(req.body);
  const revision = validarEscala(escala);
  if (!revision.ok) return res.status(400).json({ error: revision.error });

  const { id } = await db.run(
    'INSERT INTO pruebas (titulo, asignatura, nivel, descripcion, instrucciones, duracion_min, cursos, ' +
      'nivel2_min, nivel3_min, nota_activa, nota_puntaje_7, nota_puntaje_4, nota_puntaje_1, profesor_id) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
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
      req.body?.nota_activa === undefined ? 1 : (req.body.nota_activa ? 1 : 0),
      escala.puntaje_7,
      escala.puntaje_4,
      escala.puntaje_1,
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
    // Los criterios viajan con la prueba: el editor los necesita para pintar las
    // opciones de cada pregunta, y pedirlos aparte solo agregaria un viaje.
    criterios: await criteriosDe(prueba.profesor_id),
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

  const escala = leerEscala(req.body, prueba);
  const revision = validarEscala(escala);
  if (!revision.ok) return res.status(400).json({ error: revision.error });

  await db.run(
    'UPDATE pruebas SET titulo = ?, asignatura = ?, nivel = ?, descripcion = ?, instrucciones = ?, ' +
      'duracion_min = ?, estado = ?, cursos = ?, nivel2_min = ?, nivel3_min = ?, ' +
      'nota_activa = ?, nota_puntaje_7 = ?, nota_puntaje_4 = ?, nota_puntaje_1 = ? WHERE id = ?',
    [
      texto(req.body?.titulo, prueba.titulo).trim() || prueba.titulo,
      texto(req.body?.asignatura, prueba.asignatura),
      texto(req.body?.nivel, prueba.nivel),
      texto(req.body?.descripcion, prueba.descripcion),
      texto(req.body?.instrucciones, prueba.instrucciones),
      req.body?.duracion_min === '' || req.body?.duracion_min === null ? null : entero(req.body?.duracion_min, prueba.duracion_min),
      estado,
      texto(req.body?.cursos, prueba.cursos),
      Number(req.body?.nivel2_min ?? prueba.nivel2_min),
      Number(req.body?.nivel3_min ?? prueba.nivel3_min),
      req.body?.nota_activa === undefined ? prueba.nota_activa : (req.body.nota_activa ? 1 : 0),
      escala.puntaje_7,
      escala.puntaje_4,
      escala.puntaje_1,
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
      'INSERT INTO pruebas (titulo, asignatura, nivel, descripcion, instrucciones, duracion_min, cursos, ' +
        'nivel2_min, nivel3_min, nota_activa, nota_puntaje_7, nota_puntaje_4, nota_puntaje_1, profesor_id) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [prueba.titulo + ' (copia)', prueba.asignatura, prueba.nivel, prueba.descripcion, prueba.instrucciones,
        prueba.duracion_min, prueba.cursos, prueba.nivel2_min, prueba.nivel3_min,
        prueba.nota_activa, prueba.nota_puntaje_7, prueba.nota_puntaje_4, prueba.nota_puntaje_1,
        req.profesor.id]
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

/** El tipo que llega del formulario, con 'alternativas' como respaldo. */
const tipoPregunta = (v, porDefecto = 'alternativas') =>
  (TIPOS_PREGUNTA.includes(v) ? v : porDefecto);

/**
 * La pregunta, solo si pertenece a una prueba de quien la pide.
 * Sin esto basta con cambiar el numero de la direccion para editar o borrar una
 * pregunta de otra docente.
 */
async function preguntaPropia(req, res) {
  const pregunta = await db.get('SELECT * FROM preguntas WHERE id = ?', [req.params.id]);
  if (!pregunta) {
    res.status(404).json({ error: 'Pregunta no encontrada.' });
    return null;
  }
  const prueba = await db.get('SELECT profesor_id FROM pruebas WHERE id = ?', [pregunta.prueba_id]);
  if (req.profesor.rol !== 'admin' && prueba && prueba.profesor_id !== req.profesor.id) {
    res.status(403).json({ error: 'Esa pregunta es de una prueba de otra docente.' });
    return null;
  }
  return pregunta;
}

router.post('/pruebas/:id/preguntas', async (req, res) => {
  const prueba = await pruebaPropia(req, res);
  if (!prueba) return;

  const ultimo = await db.get('SELECT COALESCE(MAX(numero), 0) AS n FROM preguntas WHERE prueba_id = ?', [prueba.id]);

  const { id } = await db.run(
    'INSERT INTO preguntas (prueba_id, numero, tipo, enunciado, cita, oa, eje, indicador, clave, puntaje) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [
      prueba.id, entero(req.body?.numero, ultimo.n + 1),
      tipoPregunta(req.body?.tipo),
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
  const p = await preguntaPropia(req, res);
  if (!p) return;

  const tipo = tipoPregunta(req.body?.tipo, p.tipo);
  // Una pregunta en papel no tiene alternativa correcta: dejarle la clave del
  // tipo anterior la haria aparecer como "clave B" en la vista previa.
  const clave = tipo === 'papel'
    ? null
    : (LETRAS.includes(req.body?.clave) ? req.body.clave : p.clave);

  await db.run(
    'UPDATE preguntas SET numero = ?, tipo = ?, enunciado = ?, cita = ?, oa = ?, eje = ?, ' +
      'indicador = ?, clave = ?, puntaje = ? WHERE id = ?',
    [
      entero(req.body?.numero, p.numero),
      tipo,
      texto(req.body?.enunciado, p.enunciado), texto(req.body?.cita, p.cita),
      texto(req.body?.oa, p.oa), texto(req.body?.eje, p.eje),
      texto(req.body?.indicador, p.indicador),
      clave,
      entero(req.body?.puntaje, p.puntaje),
      p.id,
    ]
  );

  if (tipo !== 'papel' && req.body?.opciones) await guardarOpciones(p.id, req.body);

  // Cambiarle el tipo a una pregunta ya respondida invalida lo que habia
  // registrado: una respuesta marcada en pantalla no es una correccion hecha a
  // mano, y al reves tampoco. Sin esto, pasar una pregunta a papel dejaria sus
  // respuestas viejas marcadas como "ya corregidas" y el informe diria que no
  // falta nada por revisar.
  if (tipo !== p.tipo) {
    const afectados = await db.all(
      'SELECT DISTINCT intento_id FROM respuestas WHERE pregunta_id = ?', [p.id]
    );
    if (afectados.length) {
      await db.run(
        'UPDATE respuestas SET alternativa = NULL, puntaje = NULL, corregida = 0 WHERE pregunta_id = ?',
        [p.id]
      );
      for (const { intento_id } of afectados) await recalcularIntento(intento_id);
    }
    return res.json({ ok: true, respuestas_reiniciadas: afectados.length });
  }

  res.json({ ok: true });
});

router.delete('/preguntas/:id', async (req, res) => {
  const p = await preguntaPropia(req, res);
  if (!p) return;
  await db.run('DELETE FROM preguntas WHERE id = ?', [p.id]);
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
