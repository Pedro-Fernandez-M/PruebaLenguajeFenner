// Columnas y tablas que cambiaron despues de que ya habia bases creadas.
//
// CREATE TABLE IF NOT EXISTS no toca una tabla que ya existe, asi que el
// esquema por si solo nunca alcanza a una base en produccion: estas sentencias
// son las que la ponen al dia, sin borrar ni reescribir una sola fila.
//
// Va en su propio archivo, sin dependencias, para que la prueba de migracion
// (scripts/probar-postgres.mjs) ejecute EXACTAMENTE esta lista y no una copia
// que podria quedar desfasada.
export const MIGRACIONES = [
  "ALTER TABLE alumnos ADD COLUMN regimen TEXT NOT NULL DEFAULT ''",
  // La columna se agrego para repartir cursos entre docentes; se descarto
  // porque cualquiera evalua a cualquier curso.
  'ALTER TABLE profesores DROP COLUMN cursos',
  // Los textos se entregan impresos: la plataforma solo guarda preguntas.
  'ALTER TABLE preguntas DROP COLUMN texto_id',
  'ALTER TABLE preguntas DROP COLUMN tipo_texto',
  'DROP TABLE IF EXISTS textos',
  // Las rubricas solo servian a las preguntas de desarrollo.
  'DROP TABLE IF EXISTS rubricas',
  // Calificacion en la escala de 1,0 a 7,0. Se agregan sin tocar ninguna fila:
  // las pruebas que ya existen quedan con la escala automatica (7,0 al puntaje
  // total y 4,0 al 60 %), que es la que se usa por costumbre.
  'ALTER TABLE pruebas ADD COLUMN nota_activa INTEGER NOT NULL DEFAULT 1',
  'ALTER TABLE pruebas ADD COLUMN nota_puntaje_7 REAL',
  'ALTER TABLE pruebas ADD COLUMN nota_puntaje_4 REAL',
  'ALTER TABLE pruebas ADD COLUMN nota_puntaje_1 REAL',
  // La tabla criterios la crea el esquema (CREATE TABLE IF NOT EXISTS). Lo que
  // hace falta es dejar a cada docente con los tres criterios que ya venian
  // fijos, para que las 235 preguntas ya clasificadas sigan teniendo su opcion
  // disponible en el editor.
  //
  // El guardia es "criterios esta vacia", no "esta docente no tiene el criterio
  // X": asi la siembra ocurre UNA vez. Con el guardia por criterio, borrar uno
  // lo haria reaparecer en el siguiente arranque.
  "INSERT INTO criterios (profesor_id, nombre) " +
    "SELECT p.id, c.nombre FROM profesores p " +
    "CROSS JOIN (SELECT 'Localizar' AS nombre " +
    "            UNION ALL SELECT 'Interpretar y relacionar' " +
    "            UNION ALL SELECT 'Reflexionar') c " +
    "WHERE NOT EXISTS (SELECT 1 FROM criterios)",
  // La nota es del docente: el estudiante no la ve nunca. La casilla que
  // permitia mostrarsela al terminar dejo de tener sentido, y dejarla dormida
  // en la base seria una trampa: bastaria que alguien la pusiera en 1 para que
  // volviera a aparecer una pantalla que ya no existe.
  'ALTER TABLE pruebas DROP COLUMN mostrar_resultado_alumno',
];

/**
 * ¿El error dice que la migracion ya estaba aplicada?
 * Que la columna ya exista, o que ya se haya eliminado, es lo esperado en una
 * base al dia; cualquier otro error si hay que verlo.
 */
export function yaAplicada(error) {
  const mensaje = String(error?.message || '').toLowerCase();
  return mensaje.includes('duplicate column')
    || mensaje.includes('already exists')
    || mensaje.includes('no such column')
    || mensaje.includes('does not exist');
}
