// Carga inicial de la base: cuenta docente, plantilla oficial del DIA y una
// prueba de demostración lista para rendir.
//   npm run seed     → agrega lo que falte
//   npm run reset    → borra la base y la vuelve a crear desde cero
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as db from '../src/db/index.js';
import { hashPassword, generarCodigo } from '../src/lib/seguridad.js';
import { TEXTOS_DIA, PREGUNTAS_DIA, RUBRICA_DIA_27 } from './datos-dia.mjs';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const TABLAS = ['respuestas', 'intentos', 'rubricas', 'opciones', 'preguntas', 'textos', 'pruebas', 'alumnos', 'profesores'];

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

async function crearAlumno(nombre, curso, matricula) {
  const existente = await db.get('SELECT * FROM alumnos WHERE nombre = ? AND curso = ?', [nombre, curso]);
  if (existente) return existente;
  const { id } = await db.run(
    'INSERT INTO alumnos (matricula, nombre, curso, codigo) VALUES (?, ?, ?, ?)',
    [matricula, nombre, curso, generarCodigo(8)]
  );
  return db.get('SELECT * FROM alumnos WHERE id = ?', [id]);
}

/* ------------------------------- 1. Plantilla oficial del DIA (II medio) --- */

const TITULO_DIA = 'DIA Lectura II medio — Monitoreo Intermedio 2026';
let pruebaDia = await db.get('SELECT * FROM pruebas WHERE titulo = ?', [TITULO_DIA]);

if (!pruebaDia) {
  const { id } = await db.run(
    'INSERT INTO pruebas (titulo, asignatura, nivel, descripcion, instrucciones, duracion_min, estado, nivel2_min, nivel3_min, profesor_id) ' +
      "VALUES (?, 'Lectura', 'II medio', ?, ?, 90, 'borrador', 40, 70, ?)",
    [
      TITULO_DIA,
      'Estructura oficial de la Agencia de Calidad: 7 textos, 38 preguntas con su OA, eje de habilidad, indicador y clave. Falta pegar los enunciados y las alternativas.',
      'Lee cada texto con atención y responde todas las preguntas. Puedes volver atrás y cambiar tus respuestas antes de enviar.',
      profesor.id,
    ]
  );
  pruebaDia = await db.get('SELECT * FROM pruebas WHERE id = ?', [id]);

  const mapaTextos = new Map();
  for (const t of TEXTOS_DIA) {
    const { id: textoId } = await db.run(
      'INSERT INTO textos (prueba_id, orden, titulo, tipo_texto, contenido) VALUES (?, ?, ?, ?, ?)',
      [pruebaDia.id, t.orden, t.titulo, t.tipo_texto,
        '[Pega aquí el texto del cuadernillo impreso. La ficha técnica de la Agencia no incluye los textos.]']
    );
    for (const numero of t.preguntas) mapaTextos.set(numero, { id: textoId, tipo: t.tipo_texto });
  }

  for (const [numero, oa, eje, indicador, clave] of PREGUNTAS_DIA) {
    const asociado = mapaTextos.get(numero);
    const esDesarrollo = clave === 'DESARROLLO';
    const { id: preguntaId } = await db.run(
      'INSERT INTO preguntas (prueba_id, texto_id, numero, tipo, enunciado, oa, eje, indicador, tipo_texto, clave, puntaje) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        pruebaDia.id, asociado.id, numero,
        esDesarrollo ? 'desarrollo' : 'alternativas',
        '', oa, eje, indicador, asociado.tipo,
        esDesarrollo ? null : clave,
        esDesarrollo ? 2 : 1,
      ]
    );

    if (esDesarrollo) {
      for (const r of RUBRICA_DIA_27) {
        await db.run('INSERT INTO rubricas (pregunta_id, codigo, descripcion, ejemplos) VALUES (?, ?, ?, ?)',
          [preguntaId, r.codigo, r.descripcion, r.ejemplos]);
      }
    } else {
      for (const letra of ['A', 'B', 'C', 'D']) {
        await db.run("INSERT INTO opciones (pregunta_id, letra, contenido) VALUES (?, ?, '')", [preguntaId, letra]);
      }
    }
  }
  console.log('Plantilla oficial del DIA cargada: 7 textos, 38 preguntas con clave.');
}

/* --------------------------------------- 2. Prueba de demostración jugable -- */

const TITULO_DEMO = 'Prueba de demostración — Comprensión lectora';
let demo = await db.get('SELECT * FROM pruebas WHERE titulo = ?', [TITULO_DEMO]);

if (!demo) {
  const { id } = await db.run(
    'INSERT INTO pruebas (titulo, asignatura, nivel, descripcion, instrucciones, duracion_min, estado, mostrar_resultado_alumno, profesor_id) ' +
      "VALUES (?, 'Lectura', 'II medio', ?, ?, 30, 'publicada', 1, ?)",
    [
      TITULO_DEMO,
      'Prueba corta para probar la plataforma de punta a punta: ingreso con código, lectura, respuesta, corrección e informe.',
      'Lee el texto con atención y responde las 6 preguntas. Las cinco primeras son de alternativas y la última es de desarrollo: ' +
        'fundamenta tu respuesta usando información del texto.',
      profesor.id,
    ]
  );
  demo = await db.get('SELECT * FROM pruebas WHERE id = ?', [id]);

  const { id: textoId } = await db.run(
    'INSERT INTO textos (prueba_id, orden, titulo, autor, fuente, tipo_texto, contenido) VALUES (?, 1, ?, ?, ?, ?, ?)',
    [
      demo.id, 'El turno de la noche', 'Texto de demostración', 'Elaborado para probar la plataforma', 'Narración',
      'Mateo llevaba tres semanas en el turno de noche de la panadería y todavía no se acostumbraba al silencio.\n' +
      'A esa hora el barrio entero parecía haberse ido a otra parte, y solo quedaban él, el zumbido del horno y la radio ' +
      'que don Elías dejaba encendida sin escucharla nunca.\n\n' +
      '—El pan sabe distinto de noche —le dijo el viejo la primera semana, mientras enharinaba el mesón.\n' +
      'Mateo se rio. Le pareció una de esas frases que los viejos dicen para llenar el rato.\n\n' +
      'Pero la tercera noche entendió algo. A las cuatro y media apareció una mujer en la puerta, todavía con el uniforme ' +
      'del hospital puesto, y pidió medio kilo de marraqueta. No dijo nada más. Se quedó ahí, apoyada en el mostrador, ' +
      'esperando que Mateo terminara de envolver, y él notó que le temblaban un poco las manos.\n\n' +
      'Después vino un taxista, y más tarde dos muchachos que volvían de alguna fiesta y hablaban en voz demasiado alta ' +
      'para la hora. Todos compraban lo mismo. Todos se iban rápido.\n\n' +
      '—¿Viste? —dijo don Elías al amanecer, cuando ya entraba la primera luz por la ventana—. De día uno vende pan. ' +
      'De noche uno le da a la gente algo caliente para aguantar hasta que salga el sol.\n\n' +
      'Mateo miró el mesón enharinado y no contestó. Pero esa mañana, al sacar la última bandeja del horno, ' +
      'la sostuvo un segundo más de lo necesario.',
    ]
  );

  const preguntas = [
    {
      numero: 1, eje: 'Localizar', oa: '3',
      indicador: 'Localizan información explícita relevante en un texto narrativo.',
      enunciado: '¿Cuánto tiempo llevaba Mateo trabajando en el turno de noche?',
      opciones: ['Tres noches.', 'Una semana.', 'Tres semanas.', 'Tres meses.'], clave: 'C',
    },
    {
      numero: 2, eje: 'Interpretar y relacionar', oa: '3',
      indicador: 'Infieren información relevante sobre personajes en un texto narrativo.',
      enunciado: '¿Qué se puede inferir sobre la mujer que llega a las cuatro y media de la madrugada?',
      opciones: [
        'Que viene saliendo de un turno agotador en el hospital.',
        'Que es una clienta habitual que conoce a don Elías.',
        'Que está molesta por la demora en la atención.',
        'Que trabaja en la panadería del turno siguiente.',
      ], clave: 'A',
    },
    {
      numero: 3, eje: 'Interpretar y relacionar', oa: '3',
      indicador: 'Infieren el tema central de un texto narrativo.',
      enunciado: '¿Cuál es el tema central del relato?',
      opciones: [
        'La dificultad de acostumbrarse a un horario nocturno.',
        'El descubrimiento del sentido que tiene el propio trabajo.',
        'La relación conflictiva entre un aprendiz y su maestro.',
        'La soledad de un barrio durante la madrugada.',
      ], clave: 'B',
    },
    {
      numero: 4, eje: 'Interpretar y relacionar', oa: '3',
      indicador: 'Interpretan el sentido de elementos simbólicos presentes en un texto narrativo.',
      enunciado: 'Al final del relato, ¿qué sugiere que Mateo sostenga la bandeja "un segundo más de lo necesario"?',
      opciones: [
        'Que la bandeja estaba demasiado caliente para soltarla.',
        'Que dudaba de si el pan había quedado bien horneado.',
        'Que estaba cansado después de una noche larga.',
        'Que ha comprendido el valor de lo que está haciendo.',
      ], clave: 'D',
    },
    {
      numero: 5, eje: 'Reflexionar', oa: '3',
      indicador: 'Evalúan el efecto o visión del uso de un determinado narrador en un texto narrativo.',
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
      'INSERT INTO preguntas (prueba_id, texto_id, numero, tipo, enunciado, oa, eje, indicador, tipo_texto, clave, puntaje) ' +
        "VALUES (?, ?, ?, 'alternativas', ?, ?, ?, ?, 'Narración', ?, 1)",
      [demo.id, textoId, p.numero, p.enunciado, p.oa, p.eje, p.indicador, p.clave]
    );
    for (let i = 0; i < 4; i++) {
      await db.run('INSERT INTO opciones (pregunta_id, letra, contenido) VALUES (?, ?, ?)',
        [preguntaId, ['A', 'B', 'C', 'D'][i], p.opciones[i]]);
    }
  }

  const { id: preguntaAbierta } = await db.run(
    'INSERT INTO preguntas (prueba_id, texto_id, numero, tipo, enunciado, oa, eje, indicador, tipo_texto, puntaje) ' +
      "VALUES (?, ?, 6, 'desarrollo', ?, '3', 'Reflexionar', ?, 'Narración', 2)",
    [
      demo.id, textoId,
      '¿Estás de acuerdo con lo que dice don Elías sobre el pan de noche? Fundamenta tu respuesta con información del texto ' +
        'y con tu propia experiencia.',
      'Formulan una postura personal sobre algún aspecto del texto, fundamentada en información textual.',
    ]
  );

  const rubricaDemo = [
    [2, 'Formula una postura personal clara y la fundamenta integrando información del texto (el gesto de la mujer del hospital, ' +
        'la frase de don Elías, el cambio de Mateo) y/o conocimientos propios, evidenciando comprensión del sentido del relato.',
        'Sí, porque el texto muestra que la gente que llega de noche viene cansada o preocupada, como la enfermera que temblaba, ' +
        'y para ellos el pan caliente es más que comida.'],
    [1, 'Formula una opinión y la relaciona con el texto, pero de manera general o sin profundizar en el sentido de la frase ' +
        'de don Elías ni en el cambio del personaje.',
        'Sí, porque de noche la gente tiene más hambre.'],
    [0, 'No formula una postura, o la respuesta evidencia una comprensión errónea del texto (incoherente, vaga o tautológica). ' +
        'También son incorrectas las respuestas en blanco.',
        'Sí, porque el pan es rico.'],
  ];
  for (const [codigo, descripcion, ejemplos] of rubricaDemo) {
    await db.run('INSERT INTO rubricas (pregunta_id, codigo, descripcion, ejemplos) VALUES (?, ?, ?, ?)',
      [preguntaAbierta, codigo, descripcion, ejemplos]);
  }
  console.log('Prueba de demostración creada y publicada.');
}

/* ------------------------------------------------------- 3. Alumnos de prueba */

const hayAlumnos = await db.get('SELECT COUNT(*) AS n FROM alumnos');
if (hayAlumnos.n === 0) {
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
  console.log('\nImporta la nómina real desde el panel: Alumnos y códigos → Importar planilla.');
}

console.log('\nListo. Levanta el servidor con: npm start');
