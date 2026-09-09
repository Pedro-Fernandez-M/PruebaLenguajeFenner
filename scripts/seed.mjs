// Carga inicial de la base: cuenta docente, sus criterios y una prueba de
// demostración lista para rendir.
//   npm run seed     → agrega lo que falte
//   npm run reset    → borra la base y la vuelve a crear desde cero
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as db from '../src/db/index.js';
import { hashPassword, generarCodigo } from '../src/lib/seguridad.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const TABLAS = ['respuestas', 'intentos', 'opciones', 'preguntas', 'criterios', 'pruebas', 'alumnos', 'profesores'];

if (process.argv.includes('--reset') && process.env.DATABASE_URL) {
  // Contra Postgres no hay archivo que borrar: hay que vaciar las tablas de la
  // base remota. Es destructivo y sobre datos que no están en este equipo, así
  // que no se hace sin que lo pidan de forma explícita.
  if (!process.argv.includes('--forzar')) {
    console.error('\n--reset apunta a la base remota definida en DATABASE_URL.');
    console.error('Eso borra alumnos, pruebas y resultados de esa base, y no se puede deshacer.');
    console.error('Si es lo que quieres, repite el comando agregando --forzar:');
    console.error('  npm run reset -- --forzar\n');
    process.exit(1);
  }
  await db.exec('DROP TABLE IF EXISTS ' + TABLAS.join(', ') + ' CASCADE');
  console.log('Tablas eliminadas en la base remota.');
} else if (process.argv.includes('--reset')) {
  const archivo = path.resolve(raiz, process.env.SQLITE_PATH || './data/dia.db');
  let borrado = false;

  for (const sufijo of ['', '-wal', '-shm']) {
    try {
      fs.unlinkSync(archivo + sufijo);
      if (sufijo === '') borrado = true;
    } catch (error) {
      // ENOENT solo significa que el archivo no existía; cualquier otra cosa
      // (típicamente el servidor encendido reteniéndolo) hay que avisarla,
      // porque si no el sembrado parece funcionar y en realidad no reinició nada.
      if (error.code !== 'ENOENT') {
        console.error('\nNo se pudo borrar ' + archivo + sufijo + ': ' + error.code);
        console.error('Lo más probable es que el servidor esté corriendo. Deténlo (Ctrl+C) y vuelve a intentar.\n');
        process.exit(1);
      }
    }
  }
  console.log(borrado ? 'Base eliminada: ' + archivo : 'No había base previa, se crea una nueva.');
}

await db.inicializar();

/* ------------------------------------------------------------------ docente */

let profesor = await db.get('SELECT * FROM profesores LIMIT 1');
if (!profesor) {
  const email = (process.env.ADMIN_EMAIL || 'profesor@liceo.cl').toLowerCase();
  const password = process.env.ADMIN_PASSWORD || 'dia2026';
  const { id } = await db.run(
    "INSERT INTO profesores (nombre, email, password_hash, rol) VALUES (?, ?, ?, 'admin')",
    [process.env.ADMIN_NOMBRE || 'Docente', email, hashPassword(password)]
  );
  profesor = await db.get('SELECT * FROM profesores WHERE id = ?', [id]);
  console.log('Cuenta docente creada →', email, '/', password);
}

/* ---------------------------------------------------------------- criterios */

// Un punto de partida, no una lista cerrada: se agregan y se quitan desde el
// editor. Son los tres ejes de habilidad con que trabaja el DIA de Lectura.
const CRITERIOS_INICIALES = ['Localizar', 'Interpretar y relacionar', 'Reflexionar'];

const cuantosCriterios = await db.get(
  'SELECT COUNT(*) AS n FROM criterios WHERE profesor_id = ?', [profesor.id]
);
if (Number(cuantosCriterios.n) === 0) {
  for (const nombre of CRITERIOS_INICIALES) {
    await db.run('INSERT INTO criterios (profesor_id, nombre) VALUES (?, ?)', [profesor.id, nombre]);
  }
  console.log('Criterios iniciales →', CRITERIOS_INICIALES.join(', '));
}

/* ------------------------------------------------ prueba de demostración --- */

const TITULO_DEMO = 'Prueba de demostración — Comprensión lectora';
let demo = await db.get('SELECT * FROM pruebas WHERE titulo = ?', [TITULO_DEMO]);

if (!demo) {
  const { id } = await db.run(
    'INSERT INTO pruebas (titulo, asignatura, nivel, descripcion, instrucciones, duracion_min, estado, ' +
      'mostrar_resultado_alumno, profesor_id) ' +
      "VALUES (?, 'Lectura', 'II medio', ?, ?, 30, 'publicada', 1, ?)",
    [
      TITULO_DEMO,
      'Prueba corta para probar la plataforma de punta a punta: ingreso con código, respuesta, ' +
        'corrección de la pregunta en papel e informe con nota.',
      'El texto «El turno de la noche» se entrega impreso. En pantalla aparecen solo las preguntas ' +
        'de alternativas: la N° 6 se responde en la hoja impresa.',
      profesor.id,
    ]
  );
  demo = await db.get('SELECT * FROM pruebas WHERE id = ?', [id]);

  // Los textos no van en la plataforma: se entregan impresos. Estas preguntas
  // se refieren a un relato breve sobre un panadero en el turno de noche.
  const preguntas = [
    {
      numero: 1, eje: 'Localizar',
      enunciado: '¿Cuánto tiempo llevaba Mateo trabajando en el turno de noche?',
      opciones: ['Tres noches.', 'Una semana.', 'Tres semanas.', 'Tres meses.'], clave: 'C',
    },
    {
      numero: 2, eje: 'Interpretar y relacionar',
      enunciado: '¿Qué se puede inferir sobre la mujer que llega a las cuatro y media de la madrugada?',
      opciones: [
        'Que viene saliendo de un turno agotador en el hospital.',
        'Que es una clienta habitual que conoce a don Elías.',
        'Que está molesta por la demora en la atención.',
        'Que trabaja en la panadería del turno siguiente.',
      ], clave: 'A',
    },
    {
      numero: 3, eje: 'Interpretar y relacionar',
      enunciado: '¿Cuál es el tema central del relato?',
      opciones: [
        'La dificultad de acostumbrarse a un horario nocturno.',
        'El descubrimiento del sentido que tiene el propio trabajo.',
        'La relación conflictiva entre un aprendiz y su maestro.',
        'La soledad de un barrio durante la madrugada.',
      ], clave: 'B',
    },
    {
      numero: 4, eje: 'Interpretar y relacionar',
      enunciado: 'Al final del relato, ¿qué sugiere que Mateo sostenga la bandeja «un segundo más de lo necesario»?',
      opciones: [
        'Que la bandeja estaba demasiado caliente para soltarla.',
        'Que dudaba de si el pan había quedado bien horneado.',
        'Que estaba cansado después de una noche larga.',
        'Que ha comprendido el valor de lo que está haciendo.',
      ], clave: 'D',
    },
    {
      numero: 5, eje: 'Reflexionar',
      enunciado: '¿Qué efecto produce que el relato se cuente desde la perspectiva de Mateo?',
      opciones: [
        'Permite conocer los pensamientos de todos los clientes que llegan.',
        'Permite acompañar el cambio interior del personaje a medida que ocurre.',
        'Genera distancia con lo narrado y da un tono objetivo al relato.',
        'Anticipa el desenlace desde el comienzo de la historia.',
      ], clave: 'B',
    },
  ];

  for (const p of preguntas) {
    const { id: preguntaId } = await db.run(
      'INSERT INTO preguntas (prueba_id, numero, tipo, enunciado, eje, clave, puntaje) ' +
        "VALUES (?, ?, 'alternativas', ?, ?, ?, 1)",
      [demo.id, p.numero, p.enunciado, p.eje, p.clave]
    );
    for (let i = 0; i < 4; i++) {
      await db.run('INSERT INTO opciones (pregunta_id, letra, contenido) VALUES (?, ?, ?)',
        [preguntaId, ['A', 'B', 'C', 'D'][i], p.opciones[i]]);
    }
  }

  // Una pregunta en papel, para tener algo que corregir a mano en la demo.
  await db.run(
    'INSERT INTO preguntas (prueba_id, numero, tipo, enunciado, eje, puntaje) ' +
      "VALUES (?, 6, 'papel', ?, 'Reflexionar', 4)",
    [
      demo.id,
      '¿Estás de acuerdo con lo que dice don Elías sobre el pan de noche? Fundamenta tu respuesta ' +
        'con información del texto y con tu propia experiencia.',
    ]
  );

  console.log('Prueba de demostración creada y publicada: 5 preguntas en pantalla + 1 en papel (4 puntos).');
}

/* ------------------------------------------------------- alumnos de prueba */

async function crearAlumno(nombre, curso, matricula) {
  const existente = await db.get('SELECT * FROM alumnos WHERE nombre = ? AND curso = ?', [nombre, curso]);
  if (existente) return existente;
  const { id } = await db.run(
    'INSERT INTO alumnos (matricula, nombre, curso, codigo) VALUES (?, ?, ?, ?)',
    [matricula, nombre, curso, generarCodigo(8)]
  );
  return db.get('SELECT * FROM alumnos WHERE id = ?', [id]);
}

const hayAlumnos = await db.get('SELECT COUNT(*) AS n FROM alumnos');
if (Number(hayAlumnos.n) === 0) {
  const demoAlumnos = [
    ['Alumno Demo Uno', '2° A', 'D-01'],
    ['Alumno Demo Dos', '2° A', 'D-02'],
    ['Alumno Demo Tres', '2° B', 'D-03'],
  ];
  console.log('\nAlumnos de demostración (usa estos códigos para probar):');
  for (const [nombre, curso, matricula] of demoAlumnos) {
    const a = await crearAlumno(nombre, curso, matricula);
    console.log('  ' + a.codigo + '  ' + a.nombre + '  (' + a.curso + ')');
  }
}

console.log('\nListo. Levanta el servidor con: npm start');
await db.cerrar();
