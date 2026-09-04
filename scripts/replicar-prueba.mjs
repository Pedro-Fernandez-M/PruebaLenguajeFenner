// Copia una prueba a otras docentes, tal cual: mismas preguntas, mismas
// alternativas y las mismas claves.
//
//   npm run replicar -- <id de la prueba> <correo1> <correo2> ...
//
// Las copias quedan en borrador y sin cursos: cada docente elige los suyos y
// publica. Copiarlas ya publicadas y abiertas a todos los cursos haria que un
// mismo estudiante viera cinco veces la misma prueba.
import * as db from '../src/db/index.js';

const [idOrigen, ...correos] = process.argv.slice(2);

if (!idOrigen || !correos.length) {
  console.error('\nUso: npm run replicar -- <id de la prueba> <correo> [correo...]\n');
  process.exit(1);
}

await db.inicializar();

const origen = await db.get('SELECT * FROM pruebas WHERE id = ?', [idOrigen]);
if (!origen) {
  console.error('No existe la prueba ' + idOrigen);
  process.exit(1);
}

const preguntas = await db.all('SELECT * FROM preguntas WHERE prueba_id = ? ORDER BY numero', [origen.id]);
const opciones = await db.all(
  'SELECT o.* FROM opciones o JOIN preguntas p ON p.id = o.pregunta_id WHERE p.prueba_id = ?',
  [origen.id]
);

const duena = await db.get('SELECT nombre FROM profesores WHERE id = ?', [origen.profesor_id]);

console.log('');
console.log('  Origen: "' + origen.titulo + '" de ' + (duena ? duena.nombre : 'sin docente'));
console.log('          ' + preguntas.length + ' preguntas, ' +
  preguntas.filter((p) => p.clave).length + ' con clave, ' +
  preguntas.filter((p) => p.eje).length + ' con habilidad');
console.log('');

for (const correo of correos) {
  const docente = await db.get('SELECT * FROM profesores WHERE lower(email) = ?', [correo.toLowerCase()]);
  if (!docente) {
    console.log('  ' + correo.padEnd(24) + 'no existe esa cuenta, se omite');
    continue;
  }
  if (docente.id === origen.profesor_id) {
    console.log('  ' + correo.padEnd(24) + 'es la dueña del original, se omite');
    continue;
  }

  const yaLaTiene = await db.get(
    'SELECT id FROM pruebas WHERE profesor_id = ? AND titulo = ?',
    [docente.id, origen.titulo]
  );
  if (yaLaTiene) {
    console.log('  ' + correo.padEnd(24) + 'ya tiene una prueba con ese título (id ' + yaLaTiene.id + '), se omite');
    continue;
  }

  const nueva = await db.tx(async () => {
    const { id } = await db.run(
      'INSERT INTO pruebas (titulo, asignatura, nivel, descripcion, instrucciones, duracion_min, ' +
        'estado, cursos, mostrar_resultado_alumno, nivel2_min, nivel3_min, profesor_id) ' +
        "VALUES (?, ?, ?, ?, ?, ?, 'borrador', '', ?, ?, ?, ?)",
      [
        origen.titulo, origen.asignatura, origen.nivel, origen.descripcion, origen.instrucciones,
        origen.duracion_min, origen.mostrar_resultado_alumno, origen.nivel2_min, origen.nivel3_min,
        docente.id,
      ]
    );

    for (const p of preguntas) {
      const copia = await db.run(
        'INSERT INTO preguntas (prueba_id, numero, tipo, enunciado, cita, oa, eje, indicador, clave, puntaje) ' +
          'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [id, p.numero, p.tipo, p.enunciado, p.cita, p.oa, p.eje, p.indicador, p.clave, p.puntaje]
      );
      for (const o of opciones.filter((x) => x.pregunta_id === p.id)) {
        await db.run('INSERT INTO opciones (pregunta_id, letra, contenido) VALUES (?, ?, ?)',
          [copia.id, o.letra, o.contenido]);
      }
    }
    return id;
  });

  // Se comprueba la copia en vez de darla por buena.
  const nq = await db.get('SELECT COUNT(*) AS n FROM preguntas WHERE prueba_id = ?', [nueva]);
  const nc = await db.get('SELECT COUNT(*) AS n FROM preguntas WHERE prueba_id = ? AND clave IS NOT NULL', [nueva]);
  const no = await db.get(
    'SELECT COUNT(*) AS n FROM opciones o JOIN preguntas p ON p.id = o.pregunta_id WHERE p.prueba_id = ?',
    [nueva]
  );

  const igual = nq.n === preguntas.length && nc.n === preguntas.filter((p) => p.clave).length && no.n === opciones.length;
  console.log('  ' + docente.nombre.padEnd(24) + 'copia id=' + String(nueva).padEnd(5) +
    nq.n + ' preguntas, ' + nc.n + ' claves, ' + no.n + ' alternativas   ' + (igual ? 'idéntica' : 'DIFIERE'));
}

console.log('');
console.log('  Las copias quedan en BORRADOR y sin cursos asignados.');
console.log('  Cada docente marca sus cursos en el editor y las publica.');
console.log('');

await db.cerrar();
