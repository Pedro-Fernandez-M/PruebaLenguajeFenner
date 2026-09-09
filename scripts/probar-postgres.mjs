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
import { MIGRACIONES, yaAplicada } from '../src/db/migraciones.js';

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
const esperadas = ['alumnos', 'intentos', 'opciones', 'preguntas', 'profesores', 'pruebas', 'respuestas'];
afirmar(
  esperadas.every((t) => tablas.some((f) => f.tablename === t)),
  'están las 7 tablas',
  tablas.map((t) => t.tablename).join(', ')
);
afirmar(
  !tablas.some((f) => f.tablename === 'textos') && !tablas.some((f) => f.tablename === 'rubricas'),
  'ya no existen textos ni rubricas: los textos se entregan impresos'
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
const pregunta = await run(
  'INSERT INTO preguntas (prueba_id, numero, tipo, enunciado, eje, clave, puntaje) VALUES (?, ?, ?, ?, ?, ?, ?)',
  [prueba.id, 1, 'alternativas', '¿Cuál es el tema?', 'Reflexionar', 'B', 1]
);
afirmar(prueba.id > 0 && pregunta.id > 0, 'las claves foráneas encadenan bien');

// Se guardan A–E; en una prueba de cuatro opciones la E queda vacía y no se muestra.
for (const letra of ['A', 'B', 'C', 'D', 'E']) {
  await run('INSERT INTO opciones (pregunta_id, letra, contenido) VALUES (?, ?, ?)',
    [pregunta.id, letra, letra === 'E' ? '' : 'Alternativa ' + letra]);
}
const conTexto = await all(
  "SELECT letra FROM opciones WHERE pregunta_id = ? AND trim(contenido) <> '' ORDER BY letra",
  [pregunta.id]
);
afirmar(conTexto.length === 4, 'se guardan A–E y solo cuatro llevan contenido', conTexto.map((o) => o.letra).join(''));

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

// Cada docente ve solo sus propias pruebas; la nomina es comun.
const otra = await run("INSERT INTO profesores (nombre, email, password_hash) VALUES (?, ?, 'x')", ['Otra', 'o@liceo.cl']);
const suyas = await all('SELECT id FROM pruebas WHERE profesor_id = ?', [otra.id]);
afirmar(suyas.length === 0, 'una docente nueva no ve pruebas ajenas');

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

/* ------------------------------------------------------------- migraciones */

// La base de Supabase ya tiene pruebas cargadas, asi que sus tablas nunca se
// vuelven a crear: lo unico que la pone al dia son las sentencias de
// MIGRACIONES. Ese es el camino que hay que probar, y es el unico que puede
// perder datos si esta mal.
//
// Se reproduce la secuencia exacta de inicializar(): esquema completo primero
// (CREATE TABLE IF NOT EXISTS, que no toca lo que existe pero SI crea las tablas
// nuevas) y migraciones despues. Si se probara solo con las migraciones, una que
// dependa de una tabla nueva fallaria con "does not exist" y yaAplicada() se
// tragaria el error sin que nadie se enterara.
console.log('\nMigración sobre una base que ya tiene datos');

const vieja = new PGlite();
const esquemaActual = fs.readFileSync(path.join(raiz, 'src/db/schema.postgres.sql'), 'utf8');

// Base "de antes": sin las columnas de nota, sin la tabla de criterios y CON
// mostrar_resultado_alumno, que es la columna que la migracion tiene que
// eliminar. Reconstruirla asi es lo que hace que el DROP COLUMN se pruebe de
// verdad: contra el esquema actual la sentencia fallaria con "does not exist" y
// yaAplicada() se la tragaria sin ejercitar nada.
const esquemaViejo = esquemaActual
  .replace(/CREATE TABLE IF NOT EXISTS criterios \([^;]*\);/s, '')
  .replace(
    /^(\s*cursos\s+TEXT\s+NOT NULL DEFAULT '',)$/m,
    "$1\n  mostrar_resultado_alumno INTEGER NOT NULL DEFAULT 0,"
  )
  .split(/\r?\n/)
  .filter((linea) => !/^\s*nota_(activa|puntaje_[741])\s/.test(linea))
  .join('\n');

afirmar(!/nota_activa/.test(esquemaViejo), 'la base de partida no tiene las columnas de nota');
afirmar(!/CREATE TABLE IF NOT EXISTS criterios/.test(esquemaViejo), 'ni la tabla de criterios');
afirmar(/mostrar_resultado_alumno/.test(esquemaViejo), 'y sí tiene la columna que hay que eliminar');
await vieja.exec(esquemaViejo);

await vieja.query(
  "INSERT INTO profesores (nombre, email, password_hash) VALUES ('Daniela', 'daniela@liceo.cl', 'x')"
);
await vieja.query(
  "INSERT INTO pruebas (titulo, duracion_min, estado, cursos, mostrar_resultado_alumno, " +
    "nivel2_min, nivel3_min, profesor_id) " +
    "VALUES ('Ensayo SIMCE 1', 90, 'publicada', '', 1, 40, 70, 1)"
);
for (let n = 1; n <= 47; n++) {
  await vieja.query(
    "INSERT INTO preguntas (prueba_id, numero, enunciado, eje, clave) VALUES (1, $1, $2, 'Localizar', 'B')",
    [n, 'Pregunta ' + n]
  );
}

/** Lo mismo que hace inicializar(): esquema y despues migraciones. */
async function ponerAlDia() {
  await vieja.exec(esquemaActual);
  let error = null;
  for (const sentencia of MIGRACIONES) {
    try {
      await vieja.exec(sentencia);
    } catch (e) {
      if (!yaAplicada(e)) error = sentencia.slice(0, 60) + '… → ' + e.message;
    }
  }
  return error;
}

const errorMigracion = await ponerAlDia();
afirmar(!errorMigracion, 'las migraciones corren sin errores inesperados', errorMigracion || '');

const despues = (await vieja.query('SELECT * FROM pruebas WHERE id = 1')).rows[0];
const cuantas = (await vieja.query('SELECT COUNT(*) AS n FROM preguntas WHERE prueba_id = 1')).rows[0];

afirmar(despues && despues.titulo === 'Ensayo SIMCE 1', 'la prueba que ya estaba sigue ahí', despues && despues.titulo);
afirmar(Number(cuantas.n) === 47, 'conserva sus 47 preguntas', 'n=' + cuantas.n);
afirmar(despues.duracion_min === 90 && despues.estado === 'publicada', 'conserva duración y estado');
afirmar(Number(despues.nivel2_min) === 40 && Number(despues.nivel3_min) === 70, 'conserva los umbrales de nivel');
afirmar(Number(despues.nota_activa) === 1, 'queda con la calificación activada', 'nota_activa=' + despues.nota_activa);
afirmar(
  despues.nota_puntaje_7 === null && despues.nota_puntaje_4 === null && despues.nota_puntaje_1 === null,
  'los tres anclajes quedan en automático (NULL), no en cero'
);

// El estudiante no ve su nota, asi que la casilla que permitia mostrarsela ya
// no existe: se elimina en vez de quedar dormida en la base.
afirmar(
  !('mostrar_resultado_alumno' in despues),
  'la columna de mostrarle el resultado al alumno queda eliminada',
  Object.keys(despues).filter((k) => k.startsWith('mostrar')).join(', ') || 'ninguna'
);

// Los criterios que antes venian fijos en el codigo pasan a ser filas: sin esta
// siembra, las 47 preguntas ya clasificadas como "Localizar" se quedarian sin
// esa opcion en el editor.
const criterios = (await vieja.query('SELECT nombre FROM criterios WHERE profesor_id = 1 ORDER BY id')).rows;
afirmar(criterios.length === 3, 'la docente queda con sus tres criterios', criterios.map((c) => c.nombre).join(', '));
afirmar(
  criterios.some((c) => c.nombre === 'Localizar'),
  'incluye el que ya usaban las preguntas cargadas'
);

// Las preguntas guardan el NOMBRE del criterio, no un id: por eso una prueba
// vieja sigue clasificada aunque la tabla de criterios acabe de nacer.
const clasificadas = (await vieja.query(
  "SELECT COUNT(*) AS n FROM preguntas WHERE prueba_id = 1 AND eje = 'Localizar'"
)).rows[0];
afirmar(Number(clasificadas.n) === 47, 'las preguntas conservan su criterio', 'n=' + clasificadas.n);

// Correr la migracion dos veces es lo normal: cada arranque la ejecuta.
const errorSegundaVez = await ponerAlDia();
const otraVez = (await vieja.query('SELECT * FROM pruebas WHERE id = 1')).rows[0];
afirmar(!errorSegundaVez, 'volver a migrar no rompe nada: cada arranque la ejecuta', errorSegundaVez || '');
afirmar(otraVez.titulo === 'Ensayo SIMCE 1' && Number(otraVez.nota_activa) === 1, 'y los datos siguen intactos');

// Un criterio borrado a proposito NO puede reaparecer solo. Por eso la siembra
// se guarda con "la tabla criterios esta vacia" y no con "falta este criterio".
await vieja.query("DELETE FROM criterios WHERE nombre = 'Reflexionar'");
await ponerAlDia();
const trasBorrar = (await vieja.query('SELECT nombre FROM criterios WHERE profesor_id = 1')).rows;
afirmar(
  !trasBorrar.some((c) => c.nombre === 'Reflexionar'),
  'un criterio borrado no vuelve en el siguiente arranque',
  trasBorrar.map((c) => c.nombre).join(', ')
);

/* --------------------------------------------- preguntas en papel */

console.log('\nPreguntas que se responden en papel');

await vieja.query(
  "INSERT INTO preguntas (prueba_id, numero, tipo, enunciado, eje, puntaje) " +
    "VALUES (1, 48, 'papel', 'Fundamenta tu respuesta', 'Localizar', 4)"
);
await vieja.query('INSERT INTO alumnos (nombre, curso, codigo) VALUES ($1, $2, $3)', ['Alumna', '2° D', 'ABCD-1234']);
await vieja.query("INSERT INTO intentos (prueba_id, alumno_id, estado) VALUES (1, 1, 'enviado')");

const enPantalla = (await vieja.query(
  "SELECT COUNT(*) AS n FROM preguntas WHERE prueba_id = 1 AND tipo <> 'papel'"
)).rows[0];
afirmar(Number(enPantalla.n) === 47, 'la consulta del alumno deja fuera la de papel', 'n=' + enPantalla.n);

// La correccion se guarda como puntaje en la respuesta, sin alternativa.
await vieja.query(
  'INSERT INTO respuestas (intento_id, pregunta_id, puntaje, corregida) VALUES (1, 48, $1, 1)', [2.5]
);
const anotada = (await vieja.query('SELECT * FROM respuestas WHERE pregunta_id = 48')).rows[0];
afirmar(Number(anotada.puntaje) === 2.5, 'se guarda el puntaje parcial que anotó la docente', 'puntaje=' + anotada.puntaje);
afirmar(anotada.alternativa === null, 'y sin alternativa, porque no la marcó el alumno');
afirmar(Number(anotada.corregida) === 1, 'queda marcada como corregida');

await vieja.close();

console.log('\n' + (fallos === 0 ? 'Todo en orden: el esquema y las consultas corren en Postgres.' : fallos + ' comprobación(es) fallaron.') + '\n');
process.exit(fallos === 0 ? 0 : 1);
