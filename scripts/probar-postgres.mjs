// Prueba el esquema y el traductor de consultas de Postgres contra un motor
// Postgres real (PGlite, el mismo Postgres compilado a WebAssembly), sin
// necesidad de levantar un servidor ni tocar Supabase.
//
//   npm run probar-postgres
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { traducir } from '../src/db/postgres.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let fallos = 0;
const afirmar = (condicion, titulo, detalle = '') => {
  console.log((condicion ? '  ok   ' : '  FALLA') + '  ' + titulo + (detalle ? '  → ' + detalle : ''));
  if (!condicion) fallos += 1;
};

const bd = new PGlite();

// Emula el run() del driver: agrega RETURNING id a los INSERT.
async function run(sql, params = []) {
  const esInsert = /^\s*INSERT\s/i.test(sql) && !/\bRETURNING\b/i.test(sql);
  const consulta = esInsert ? sql.replace(/;?\s*$/, '') + ' RETURNING id' : sql;
  const r = await bd.query(traducir(consulta), params);
  return { id: esInsert && r.rows[0] ? Number(r.rows[0].id) : 0, cambios: r.affectedRows ?? 0 };
}
const all = async (sql, params = []) => (await bd.query(traducir(sql), params)).rows;
const get = async (sql, params = []) => (await bd.query(traducir(sql), params)).rows[0] ?? null;

console.log('\nTraductor de marcadores');
afirmar(traducir('SELECT * FROM a WHERE x = ? AND y = ?') === 'SELECT * FROM a WHERE x = $1 AND y = $2', 'convierte ? a $n');
afirmar(traducir("SELECT '¿?' WHERE x = ?") === "SELECT '¿?' WHERE x = $1", 'ignora los ? dentro de comillas');
afirmar(traducir('SELECT 1') === 'SELECT 1', 'deja intactas las consultas sin marcadores');

console.log('\nEsquema');
try {
  await bd.exec(fs.readFileSync(path.join(raiz, 'src/db/schema.postgres.sql'), 'utf8'));
  afirmar(true, 'schema.postgres.sql se aplica sin errores');
} catch (error) {
  afirmar(false, 'schema.postgres.sql se aplica sin errores', error.message);
  process.exit(1);
}

const tablas = await all(
  "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename"
);
const esperadas = ['alumnos', 'intentos', 'opciones', 'preguntas', 'profesores', 'pruebas', 'respuestas', 'rubricas', 'textos'];
afirmar(
  esperadas.every((t) => tablas.some((f) => f.tablename === t)),
  'están las 9 tablas',
  tablas.map((t) => t.tablename).join(', ')
);

console.log('\nFormato de fecha compatible con SQLite');
const { ahora } = await get('SELECT ahora_utc() AS ahora');
afirmar(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(ahora), "ahora_utc() da 'YYYY-MM-DD HH:MM:SS'", ahora);
afirmar(
  Math.abs(Date.parse(ahora.replace(' ', 'T') + 'Z') - Date.now()) < 120_000,
  'el navegador la interpreta como UTC y coincide con la hora real'
);

console.log('\nINSERT devuelve el id (equivalente a lastInsertRowid)');
const profesor = await run(
  "INSERT INTO profesores (nombre, email, password_hash, rol) VALUES (?, ?, ?, 'admin')",
  ['Docente', 'd@liceo.cl', 'scrypt:x:y']
);
afirmar(profesor.id > 0, 'INSERT en profesores devuelve id', 'id=' + profesor.id);

const prueba = await run(
  'INSERT INTO pruebas (titulo, profesor_id) VALUES (?, ?)',
  ['Prueba de humo', profesor.id]
);
const texto = await run(
  'INSERT INTO textos (prueba_id, orden, titulo, tipo_texto, contenido) VALUES (?, ?, ?, ?, ?)',
  [prueba.id, 1, 'Un texto', 'Poema', 'Verso uno\nVerso dos']
);
const pregunta = await run(
  'INSERT INTO preguntas (prueba_id, texto_id, numero, tipo, enunciado, eje, clave, puntaje) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  [prueba.id, texto.id, 1, 'alternativas', '¿Cuál es el tema?', 'Reflexionar', 'B', 1]
);
afirmar(prueba.id > 0 && texto.id > 0 && pregunta.id > 0, 'las claves foráneas encadenan bien');

console.log('\nConsultas reales de la aplicación');
const alumno = await run(
  'INSERT INTO alumnos (matricula, rut, dv, nombre, curso, codigo) VALUES (?, ?, ?, ?, ?, ?)',
  ['12', '23773200', '6', 'Alumna de prueba', '2° A', 'ABCD-1234']
);
const intento = await run('INSERT INTO intentos (prueba_id, alumno_id) VALUES (?, ?)', [prueba.id, alumno.id]);
await run(
  'INSERT INTO respuestas (intento_id, pregunta_id, alternativa, respuesta_texto) VALUES (?, ?, ?, ?)',
  [intento.id, pregunta.id, 'B', '']
);

// La consulta de autoguardado, con trim() y comparación contra cadena vacía.
const respondidas = await get(
  "SELECT COUNT(*) AS n FROM respuestas WHERE intento_id = ? AND (alternativa IS NOT NULL OR trim(respuesta_texto) <> '')",
  [intento.id]
);
afirmar(Number(respondidas.n) === 1, 'cuenta de respondidas (COUNT + trim)', 'n=' + respondidas.n);

// El UPDATE de envío, que interpola la expresión de fecha.
const AHORA = 'ahora_utc()';
const enviado = await run(
  "UPDATE intentos SET estado = 'enviado', enviado_en = " + AHORA + ' WHERE id = ?',
  [intento.id]
);
afirmar(enviado.cambios === 1, 'UPDATE informa las filas afectadas', 'cambios=' + enviado.cambios);

// El JOIN del informe, con filtro por estado y orden por curso.
const filas = await all(
  'SELECT i.*, a.nombre, a.curso FROM intentos i JOIN alumnos a ON a.id = i.alumno_id ' +
    "WHERE i.prueba_id = ? AND i.estado = 'enviado' ORDER BY a.curso, a.nombre",
  [prueba.id]
);
afirmar(filas.length === 1 && filas[0].nombre === 'Alumna de prueba', 'JOIN del informe de curso');

// El IN (?) construido dinámicamente en informeDePrueba.
const ids = filas.map((f) => f.id);
const marcadores = ids.map(() => '?').join(',');
const rs = await all('SELECT * FROM respuestas WHERE intento_id IN (' + marcadores + ')', ids);
afirmar(rs.length === 1, 'IN (?) con lista de marcadores generada');

// COALESCE(MAX(...)) para numerar preguntas nuevas.
const max = await get('SELECT COALESCE(MAX(numero), 0) AS n FROM preguntas WHERE prueba_id = ?', [prueba.id]);
afirmar(Number(max.n) === 1, 'COALESCE(MAX())', 'n=' + max.n);

// lower(email) del inicio de sesión docente.
const login = await get('SELECT * FROM profesores WHERE lower(email) = ?', ['d@liceo.cl']);
afirmar(!!login, 'lower(email) en el inicio de sesión');

console.log('\nRestricciones');
try {
  await run('INSERT INTO alumnos (nombre, curso, codigo) VALUES (?, ?, ?)', ['Otra', '2° A', 'ABCD-1234']);
  afirmar(false, 'el código de alumno es único');
} catch {
  afirmar(true, 'el código de alumno es único');
}
try {
  await run('INSERT INTO intentos (prueba_id, alumno_id) VALUES (?, ?)', [prueba.id, alumno.id]);
  afirmar(false, 'un alumno no puede tener dos intentos en la misma prueba');
} catch {
  afirmar(true, 'un alumno no puede tener dos intentos en la misma prueba');
}

console.log('\nBorrado en cascada');
await run('DELETE FROM pruebas WHERE id = ?', [prueba.id]);
const quedan = await get('SELECT COUNT(*) AS n FROM preguntas WHERE prueba_id = ?', [prueba.id]);
const intentosQuedan = await get('SELECT COUNT(*) AS n FROM intentos WHERE prueba_id = ?', [prueba.id]);
afirmar(Number(quedan.n) === 0 && Number(intentosQuedan.n) === 0, 'borrar la prueba arrastra preguntas e intentos');

await bd.close();

console.log('\n' + (fallos === 0 ? 'Todo en orden: el esquema y las consultas corren en Postgres.' : fallos + ' comprobación(es) fallaron.') + '\n');
process.exit(fallos === 0 ? 0 : 1);
