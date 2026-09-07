// Muestra qué hay cargado en la base, sin escribir ni migrar nada.
//
//   npm run estado
//
// A proposito NO llama a inicializar(): sirve para mirar la base tal como esta
// antes de que un arranque le aplique las migraciones.
import * as db from '../src/db/index.js';

const cuenta = async (tabla) => {
  try {
    const r = await db.get('SELECT COUNT(*) AS n FROM ' + tabla);
    return Number(r.n);
  } catch {
    return null; // la tabla todavia no existe
  }
};

console.log('\nMotor: ' + db.driver);

console.log('\nTABLAS');
for (const tabla of ['profesores', 'alumnos', 'pruebas', 'preguntas', 'opciones', 'intentos', 'respuestas']) {
  const n = await cuenta(tabla);
  console.log('  ' + tabla.padEnd(12) + (n === null ? '(no existe)' : n));
}

const pruebas = await db.all(
  'SELECT p.*, pr.nombre AS docente, ' +
    '(SELECT COUNT(*) FROM preguntas q WHERE q.prueba_id = p.id) AS preguntas, ' +
    '(SELECT COUNT(*) FROM preguntas q WHERE q.prueba_id = p.id AND q.clave IS NOT NULL) AS claves, ' +
    '(SELECT COUNT(*) FROM opciones o JOIN preguntas q ON q.id = o.pregunta_id WHERE q.prueba_id = p.id) AS alternativas, ' +
    "(SELECT COUNT(*) FROM intentos i WHERE i.prueba_id = p.id AND i.estado = 'enviado') AS entregadas " +
    'FROM pruebas p LEFT JOIN profesores pr ON pr.id = p.profesor_id ORDER BY p.id'
);

console.log('\nPRUEBAS');
if (!pruebas.length) console.log('  (ninguna)');
for (const p of pruebas) {
  console.log(
    '  id=' + String(p.id).padEnd(4) +
    String(p.docente || '—').padEnd(11) +
    (p.preguntas + ' preg').padEnd(10) +
    (p.claves + ' claves').padEnd(11) +
    (p.alternativas + ' alt').padEnd(9) +
    (p.entregadas + ' entregadas').padEnd(15) +
    String(p.estado).padEnd(11) +
    p.titulo
  );
  if ('nota_activa' in p) {
    const auto = (v) => (v === null || v === undefined ? 'automático' : v);
    console.log('        nota: ' + (p.nota_activa ? 'activada' : 'desactivada') +
      '   7,0 = ' + auto(p.nota_puntaje_7) +
      '   4,0 = ' + auto(p.nota_puntaje_4) +
      '   1,0 = ' + auto(p.nota_puntaje_1));
  }
}

if (pruebas.length && !('nota_activa' in pruebas[0])) {
  console.log('\n  Las columnas de nota todavía no existen: se crean en el próximo arranque.');
}

console.log('');
await db.cerrar();
