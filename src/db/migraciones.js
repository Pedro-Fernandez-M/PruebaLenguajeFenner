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
