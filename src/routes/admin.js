import express from 'express';
import * as db from '../db/index.js';
import { exigirProfesor } from '../lib/sesion.js';
import { generarCodigo } from '../lib/seguridad.js';
import { EJES, TIPOS_TEXTO, LETRAS } from '../lib/evaluacion.js';
import { leerXlsx } from '../lib/xlsx.js';
import { convertirEnsayo } from '../lib/ensayo.js';

const router = express.Router();
router.use(exigirProfesor);

const texto = (v, porDefecto = '') => (v === undefined || v === null ? porDefecto : String(v));
const entero = (v, porDefecto = null) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : porDefecto;
};

router.get('/catalogos', (_req, res) => {
  res.json({ ejes: EJES, tipos_texto: TIPOS_TEXTO, letras: LETRAS });
});

/* ------------------------------------------------------------------ pruebas */

router.get('/pruebas', async (_req, res) => {
  const pruebas = await db.all(
    'SELECT p.*, ' +
      '(SELECT COUNT(*) FROM preguntas q WHERE q.prueba_id = p.id) AS total_preguntas, ' +
      '(SELECT COUNT(*) FROM textos t WHERE t.prueba_id = p.id) AS total_textos, ' +
      "(SELECT COUNT(*) FROM intentos i WHERE i.prueba_id = p.id AND i.estado = 'enviado') AS total_enviados, " +
      "(SELECT COUNT(*) FROM intentos i WHERE i.prueba_id = p.id AND i.estado = 'en_curso') AS total_en_curso " +
      'FROM pruebas p ORDER BY p.creado_en DESC'
  );
  res.json({ pruebas });
});

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
  const prueba = await db.get('SELECT * FROM pruebas WHERE id = ?', [req.params.id]);
  if (!prueba) return res.status(404).json({ error: 'Prueba no encontrada.' });

  const textos = await db.all('SELECT * FROM textos WHERE prueba_id = ? ORDER BY orden, id', [prueba.id]);
  const preguntas = await db.all('SELECT * FROM preguntas WHERE prueba_id = ? ORDER BY numero', [prueba.id]);
  const opciones = await db.all(
    'SELECT o.* FROM opciones o JOIN preguntas p ON p.id = o.pregunta_id WHERE p.prueba_id = ? ORDER BY o.letra',
    [prueba.id]
  );
  const rubricas = await db.all(
    'SELECT r.* FROM rubricas r JOIN preguntas p ON p.id = r.pregunta_id WHERE p.prueba_id = ? ORDER BY r.codigo DESC',
    [prueba.id]
  );

  res.json({
    prueba,
    textos,
    preguntas: preguntas.map((p) => ({
      ...p,
      opciones: opciones.filter((o) => o.pregunta_id === p.id),
      rubricas: rubricas.filter((r) => r.pregunta_id === p.id),
    })),
  });
});

router.put('/pruebas/:id', async (req, res) => {
  const prueba = await db.get('SELECT * FROM pruebas WHERE id = ?', [req.params.id]);
  if (!prueba) return res.status(404).json({ error: 'Prueba no encontrada.' });

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
  await db.run('DELETE FROM pruebas WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

/** Copia una prueba completa (textos, preguntas, opciones y rúbricas) como borrador. */
router.post('/pruebas/:id/duplicar', async (req, res) => {
  const prueba = await db.get('SELECT * FROM pruebas WHERE id = ?', [req.params.id]);
  if (!prueba) return res.status(404).json({ error: 'Prueba no encontrada.' });

  const nuevaId = await db.tx(async () => {
    const { id } = await db.run(
      'INSERT INTO pruebas (titulo, asignatura, nivel, descripcion, instrucciones, duracion_min, cursos, nivel2_min, nivel3_min, profesor_id) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [prueba.titulo + ' (copia)', prueba.asignatura, prueba.nivel, prueba.descripcion, prueba.instrucciones,
        prueba.duracion_min, prueba.cursos, prueba.nivel2_min, prueba.nivel3_min, req.profesor.id]
    );

    const mapaTextos = new Map();
    for (const t of await db.all('SELECT * FROM textos WHERE prueba_id = ? ORDER BY orden, id', [prueba.id])) {
      const nuevo = await db.run(
        'INSERT INTO textos (prueba_id, orden, titulo, autor, fuente, tipo_texto, contenido) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [id, t.orden, t.titulo, t.autor, t.fuente, t.tipo_texto, t.contenido]
      );
      mapaTextos.set(t.id, nuevo.id);
    }

    for (const p of await db.all('SELECT * FROM preguntas WHERE prueba_id = ? ORDER BY numero', [prueba.id])) {
      const nueva = await db.run(
        'INSERT INTO preguntas (prueba_id, texto_id, numero, tipo, enunciado, cita, oa, eje, indicador, tipo_texto, clave, puntaje) ' +
          'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [id, mapaTextos.get(p.texto_id) ?? null, p.numero, p.tipo, p.enunciado, p.cita, p.oa, p.eje, p.indicador, p.tipo_texto, p.clave, p.puntaje]
      );
      for (const o of await db.all('SELECT * FROM opciones WHERE pregunta_id = ?', [p.id])) {
        await db.run('INSERT INTO opciones (pregunta_id, letra, contenido) VALUES (?, ?, ?)', [nueva.id, o.letra, o.contenido]);
      }
      for (const r of await db.all('SELECT * FROM rubricas WHERE pregunta_id = ?', [p.id])) {
        await db.run('INSERT INTO rubricas (pregunta_id, codigo, descripcion, ejemplos) VALUES (?, ?, ?, ?)', [nueva.id, r.codigo, r.descripcion, r.ejemplos]);
      }
    }
    return id;
  });

  res.status(201).json({ id: nuevaId });
});

/**
 * Crea una prueba completa a partir de un ensayo en Word.
 * Queda siempre en borrador y sin claves: el .docx es la versión del estudiante,
 * así que el docente debe marcar la alternativa correcta antes de publicar.
 */
router.post('/pruebas/importar-docx', async (req, res) => {
  let convertido;
  try {
    convertido = convertirEnsayo(decodificarArchivo(req.body));
  } catch (error) {
    return res.status(400).json({ error: 'No se pudo leer el documento: ' + error.message });
  }

  const { textos, preguntas, incidencias } = convertido;
  if (!preguntas.length) {
    return res.status(400).json({
      error: 'No se reconoció ninguna pregunta. El documento debe usar encabezados "TEXTO 1" y preguntas numeradas del tipo "1.- ¿…?".',
    });
  }

  const pruebaId = await db.tx(async () => {
    const { id } = await db.run(
      'INSERT INTO pruebas (titulo, asignatura, nivel, descripcion, instrucciones, duracion_min, profesor_id) ' +
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
      [
        texto(req.body?.titulo, 'Ensayo importado desde Word').trim(),
        texto(req.body?.asignatura, 'Lectura'),
        texto(req.body?.nivel, 'II medio'),
        'Importada desde un documento Word. Falta marcar la clave de cada pregunta y clasificar los ejes de habilidad.',
        texto(req.body?.instrucciones, 'Lee cada texto con atención y responde todas las preguntas.'),
        entero(req.body?.duracion_min),
        req.profesor.id,
      ]
    );

    const idsTextos = [];
    for (const t of textos) {
      const creado = await db.run(
        'INSERT INTO textos (prueba_id, orden, titulo, autor, tipo_texto, contenido) VALUES (?, ?, ?, ?, ?, ?)',
        [id, t.orden, t.titulo, t.autor, t.tipo_texto, t.contenido]
      );
      idsTextos.push({ id: creado.id, tipo: t.tipo_texto });
    }

    for (const p of preguntas) {
      const asociado = p.texto_indice !== null ? idsTextos[p.texto_indice] : null;
      const creada = await db.run(
        'INSERT INTO preguntas (prueba_id, texto_id, numero, tipo, enunciado, tipo_texto, clave, puntaje) ' +
          'VALUES (?, ?, ?, ?, ?, ?, NULL, ?)',
        [
          id, asociado ? asociado.id : null, p.numero, p.tipo, p.enunciado,
          asociado ? asociado.tipo : '', p.tipo === 'desarrollo' ? 2 : 1,
        ]
      );
      await guardarOpcionesYRubricas(creada.id, p, p.tipo);
    }
    return id;
  });

  res.status(201).json({
    id: pruebaId,
    textos: textos.length,
    preguntas: preguntas.length,
    incidencias,
  });
});

/* ------------------------------------------------------------------- textos */

router.post('/pruebas/:id/textos', async (req, res) => {
  const prueba = await db.get('SELECT id FROM pruebas WHERE id = ?', [req.params.id]);
  if (!prueba) return res.status(404).json({ error: 'Prueba no encontrada.' });

  const ultimo = await db.get('SELECT COALESCE(MAX(orden), 0) AS n FROM textos WHERE prueba_id = ?', [prueba.id]);
  const { id } = await db.run(
    'INSERT INTO textos (prueba_id, orden, titulo, autor, fuente, tipo_texto, contenido) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [
      prueba.id,
      entero(req.body?.orden, ultimo.n + 1),
      texto(req.body?.titulo, 'Texto sin título'),
      texto(req.body?.autor),
      texto(req.body?.fuente),
      texto(req.body?.tipo_texto, 'Narración'),
      texto(req.body?.contenido),
    ]
  );
  res.status(201).json({ id });
});

router.put('/textos/:id', async (req, res) => {
  const t = await db.get('SELECT * FROM textos WHERE id = ?', [req.params.id]);
  if (!t) return res.status(404).json({ error: 'Texto no encontrado.' });

  await db.run(
    'UPDATE textos SET orden = ?, titulo = ?, autor = ?, fuente = ?, tipo_texto = ?, contenido = ? WHERE id = ?',
    [
      entero(req.body?.orden, t.orden),
      texto(req.body?.titulo, t.titulo),
      texto(req.body?.autor, t.autor),
      texto(req.body?.fuente, t.fuente),
      texto(req.body?.tipo_texto, t.tipo_texto),
      texto(req.body?.contenido, t.contenido),
      t.id,
    ]
  );
  // El tipo de texto viaja denormalizado a las preguntas porque el informe del
  // DIA lo muestra pregunta a pregunta.
  await db.run('UPDATE preguntas SET tipo_texto = ? WHERE texto_id = ?', [texto(req.body?.tipo_texto, t.tipo_texto), t.id]);
  res.json({ ok: true });
});

router.delete('/textos/:id', async (req, res) => {
  await db.run('DELETE FROM textos WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

/* ---------------------------------------------------------------- preguntas */

async function guardarOpcionesYRubricas(preguntaId, cuerpo, tipo) {
  if (tipo === 'alternativas') {
    await db.run('DELETE FROM rubricas WHERE pregunta_id = ?', [preguntaId]);
    const opciones = Array.isArray(cuerpo?.opciones) ? cuerpo.opciones : [];
    await db.run('DELETE FROM opciones WHERE pregunta_id = ?', [preguntaId]);
    for (const letra of LETRAS) {
      const encontrada = opciones.find((o) => o.letra === letra);
      await db.run('INSERT INTO opciones (pregunta_id, letra, contenido) VALUES (?, ?, ?)', [
        preguntaId, letra, texto(encontrada?.contenido),
      ]);
    }
  } else {
    await db.run('DELETE FROM opciones WHERE pregunta_id = ?', [preguntaId]);
    const rubricas = Array.isArray(cuerpo?.rubricas) ? cuerpo.rubricas : [];
    await db.run('DELETE FROM rubricas WHERE pregunta_id = ?', [preguntaId]);
    for (const codigo of [2, 1, 0]) {
      const encontrada = rubricas.find((r) => Number(r.codigo) === codigo);
      await db.run('INSERT INTO rubricas (pregunta_id, codigo, descripcion, ejemplos) VALUES (?, ?, ?, ?)', [
        preguntaId, codigo, texto(encontrada?.descripcion), texto(encontrada?.ejemplos),
      ]);
    }
  }
}

router.post('/pruebas/:id/preguntas', async (req, res) => {
  const prueba = await db.get('SELECT id FROM pruebas WHERE id = ?', [req.params.id]);
  if (!prueba) return res.status(404).json({ error: 'Prueba no encontrada.' });

  const tipo = req.body?.tipo === 'desarrollo' ? 'desarrollo' : 'alternativas';
  const ultimo = await db.get('SELECT COALESCE(MAX(numero), 0) AS n FROM preguntas WHERE prueba_id = ?', [prueba.id]);
  const textoAsociado = entero(req.body?.texto_id);
  const tipoTexto = textoAsociado
    ? (await db.get('SELECT tipo_texto FROM textos WHERE id = ?', [textoAsociado]))?.tipo_texto || ''
    : texto(req.body?.tipo_texto);

  const { id } = await db.run(
    'INSERT INTO preguntas (prueba_id, texto_id, numero, tipo, enunciado, cita, oa, eje, indicador, tipo_texto, clave, puntaje) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [
      prueba.id, textoAsociado, entero(req.body?.numero, ultimo.n + 1), tipo,
      texto(req.body?.enunciado), texto(req.body?.cita), texto(req.body?.oa),
      texto(req.body?.eje), texto(req.body?.indicador), tipoTexto,
      tipo === 'alternativas' ? (LETRAS.includes(req.body?.clave) ? req.body.clave : null) : null,
      entero(req.body?.puntaje, tipo === 'desarrollo' ? 2 : 1),
    ]
  );

  await guardarOpcionesYRubricas(id, req.body, tipo);
  res.status(201).json({ id });
});

router.put('/preguntas/:id', async (req, res) => {
  const p = await db.get('SELECT * FROM preguntas WHERE id = ?', [req.params.id]);
  if (!p) return res.status(404).json({ error: 'Pregunta no encontrada.' });

  const tipo = req.body?.tipo === 'desarrollo' ? 'desarrollo' : (req.body?.tipo === 'alternativas' ? 'alternativas' : p.tipo);
  const textoAsociado = req.body?.texto_id === undefined ? p.texto_id : entero(req.body?.texto_id);
  const tipoTexto = textoAsociado
    ? (await db.get('SELECT tipo_texto FROM textos WHERE id = ?', [textoAsociado]))?.tipo_texto || ''
    : texto(req.body?.tipo_texto, p.tipo_texto);

  await db.run(
    'UPDATE preguntas SET texto_id = ?, numero = ?, tipo = ?, enunciado = ?, cita = ?, oa = ?, eje = ?, ' +
      'indicador = ?, tipo_texto = ?, clave = ?, puntaje = ? WHERE id = ?',
    [
      textoAsociado, entero(req.body?.numero, p.numero), tipo,
      texto(req.body?.enunciado, p.enunciado), texto(req.body?.cita, p.cita),
      texto(req.body?.oa, p.oa), texto(req.body?.eje, p.eje),
      texto(req.body?.indicador, p.indicador), tipoTexto,
      tipo === 'alternativas' ? (LETRAS.includes(req.body?.clave) ? req.body.clave : p.clave) : null,
      entero(req.body?.puntaje, p.puntaje),
      p.id,
    ]
  );

  if (req.body?.opciones || req.body?.rubricas || tipo !== p.tipo) {
    await guardarOpcionesYRubricas(p.id, req.body, tipo);
  }
  res.json({ ok: true });
});

router.delete('/preguntas/:id', async (req, res) => {
  await db.run('DELETE FROM preguntas WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

/** Carga varias preguntas de una vez (pegar desde una prueba ya escrita). */
router.post('/pruebas/:id/preguntas/lote', async (req, res) => {
  const prueba = await db.get('SELECT id FROM pruebas WHERE id = ?', [req.params.id]);
  if (!prueba) return res.status(404).json({ error: 'Prueba no encontrada.' });
  const lista = Array.isArray(req.body?.preguntas) ? req.body.preguntas : [];
  if (!lista.length) return res.status(400).json({ error: 'No se recibió ninguna pregunta.' });

  const creadas = await db.tx(async () => {
    let n = (await db.get('SELECT COALESCE(MAX(numero), 0) AS n FROM preguntas WHERE prueba_id = ?', [prueba.id])).n;
    const ids = [];
    for (const item of lista) {
      n += 1;
      const tipo = item?.tipo === 'desarrollo' ? 'desarrollo' : 'alternativas';
      const textoAsociado = entero(item?.texto_id);
      const tipoTexto = textoAsociado
        ? (await db.get('SELECT tipo_texto FROM textos WHERE id = ?', [textoAsociado]))?.tipo_texto || ''
        : texto(item?.tipo_texto);
      const { id } = await db.run(
        'INSERT INTO preguntas (prueba_id, texto_id, numero, tipo, enunciado, cita, oa, eje, indicador, tipo_texto, clave, puntaje) ' +
          'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          prueba.id, textoAsociado, entero(item?.numero, n), tipo,
          texto(item?.enunciado), texto(item?.cita), texto(item?.oa),
          texto(item?.eje), texto(item?.indicador), tipoTexto,
          tipo === 'alternativas' ? (LETRAS.includes(item?.clave) ? item.clave : null) : null,
          entero(item?.puntaje, tipo === 'desarrollo' ? 2 : 1),
        ]
      );
      await guardarOpcionesYRubricas(id, item, tipo);
      ids.push(id);
    }
    return ids;
  });

  res.status(201).json({ creadas: creadas.length, ids: creadas });
});

/* ------------------------------------------------------------------ alumnos */

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

router.post('/alumnos', async (req, res) => {
  const nombre = texto(req.body?.nombre).trim();
  if (!nombre) return res.status(400).json({ error: 'El alumno necesita un nombre.' });

  const codigo = await codigoUnico();
  const { id } = await db.run(
    'INSERT INTO alumnos (matricula, rut, dv, nombre, curso, codigo) VALUES (?, ?, ?, ?, ?, ?)',
    [texto(req.body?.matricula), texto(req.body?.rut), texto(req.body?.dv), nombre, texto(req.body?.curso).trim(), codigo]
  );
  res.status(201).json({ id, codigo });
});

router.put('/alumnos/:id', async (req, res) => {
  const a = await db.get('SELECT * FROM alumnos WHERE id = ?', [req.params.id]);
  if (!a) return res.status(404).json({ error: 'Alumno no encontrado.' });

  await db.run(
    'UPDATE alumnos SET matricula = ?, rut = ?, dv = ?, nombre = ?, curso = ?, activo = ? WHERE id = ?',
    [
      texto(req.body?.matricula, a.matricula), texto(req.body?.rut, a.rut), texto(req.body?.dv, a.dv),
      texto(req.body?.nombre, a.nombre).trim() || a.nombre, texto(req.body?.curso, a.curso).trim(),
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

/* ----------------------------------------------- importacion de nomina xlsx */

// Encabezados esperados en la planilla de matricula del liceo.
const ALIAS_COLUMNAS = {
  matricula: ['n° mat.', 'n mat', 'matricula', 'matrícula', 'nº mat.', 'n° matricula'],
  nombre: ['nómina de alumnos', 'nomina de alumnos', 'nombre', 'nombre completo', 'apellidos y nombres'],
  curso: ['curso', 'nivel'],
  rut: ['cédula identidad', 'cedula identidad', 'rut', 'run'],
  dv: ['dv', 'dígito', 'digito'],
};

const limpiar = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

function detectarColumnas(filas) {
  for (let i = 0; i < Math.min(filas.length, 15); i++) {
    const fila = filas[i].map(limpiar);
    const mapa = {};
    for (const [campo, alias] of Object.entries(ALIAS_COLUMNAS)) {
      const idx = fila.findIndex((c) => alias.includes(c));
      if (idx >= 0) mapa[campo] = idx;
    }
    if (mapa.nombre !== undefined) return { filaEncabezado: i, columnas: mapa };
  }
  return null;
}

function extraerFilas(hoja) {
  const deteccion = detectarColumnas(hoja.filas);
  if (!deteccion) return { nombre: hoja.nombre, error: 'No se encontró la columna con los nombres.', alumnos: [] };

  const { filaEncabezado, columnas } = deteccion;
  const alumnos = [];
  for (let i = filaEncabezado + 1; i < hoja.filas.length; i++) {
    const fila = hoja.filas[i];
    const nombre = String(fila[columnas.nombre] || '').trim();
    if (!nombre || limpiar(nombre) === 'nómina de alumnos') continue;
    alumnos.push({
      matricula: columnas.matricula !== undefined ? String(fila[columnas.matricula] || '').trim() : '',
      nombre,
      curso: columnas.curso !== undefined ? String(fila[columnas.curso] || '').trim() : '',
      rut: columnas.rut !== undefined ? String(fila[columnas.rut] || '').trim() : '',
      dv: columnas.dv !== undefined ? String(fila[columnas.dv] || '').trim().toUpperCase() : '',
    });
  }
  return { nombre: hoja.nombre, alumnos };
}

function decodificarArchivo(cuerpo) {
  const base64 = String(cuerpo?.archivo || '').replace(/^data:[^,]*,/, '');
  if (!base64) throw new Error('No se recibió el archivo.');
  return Buffer.from(base64, 'base64');
}

router.post('/alumnos/analizar', async (req, res) => {
  try {
    const hojas = leerXlsx(decodificarArchivo(req.body));
    res.json({ hojas: hojas.map(extraerFilas) });
  } catch (error) {
    res.status(400).json({ error: 'No se pudo leer la planilla: ' + error.message });
  }
});

router.post('/alumnos/importar', async (req, res) => {
  const lista = Array.isArray(req.body?.alumnos) ? req.body.alumnos : [];
  if (!lista.length) return res.status(400).json({ error: 'No se recibió ningún alumno.' });

  const resultado = await db.tx(async () => {
    let creados = 0;
    let actualizados = 0;
    const nuevos = [];

    for (const item of lista) {
      const nombre = String(item?.nombre || '').trim();
      if (!nombre) continue;
      const rut = String(item?.rut || '').trim();
      const matricula = String(item?.matricula || '').trim();
      const curso = String(item?.curso || '').trim();

      // Se reconoce al alumno por RUT y, si no hay, por matricula; asi una
      // reimportacion actualiza en vez de duplicar y conserva el codigo.
      let existente = null;
      if (rut) existente = await db.get('SELECT * FROM alumnos WHERE rut = ? AND rut <> ?', [rut, '']);
      if (!existente && matricula) existente = await db.get('SELECT * FROM alumnos WHERE matricula = ? AND matricula <> ?', [matricula, '']);

      if (existente) {
        await db.run('UPDATE alumnos SET nombre = ?, curso = ?, matricula = ?, rut = ?, dv = ? WHERE id = ?', [
          nombre, curso || existente.curso, matricula || existente.matricula, rut || existente.rut,
          String(item?.dv || existente.dv || '').toUpperCase(), existente.id,
        ]);
        actualizados += 1;
      } else {
        const codigo = await codigoUnico();
        const { id } = await db.run(
          'INSERT INTO alumnos (matricula, rut, dv, nombre, curso, codigo) VALUES (?, ?, ?, ?, ?, ?)',
          [matricula, rut, String(item?.dv || '').toUpperCase(), nombre, curso, codigo]
        );
        nuevos.push({ id, nombre, curso, codigo });
        creados += 1;
      }
    }
    return { creados, actualizados, nuevos };
  });

  res.json(resultado);
});

export default router;
