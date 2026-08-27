// Capa de datos. Elige el motor según el entorno:
//   * sin DATABASE_URL  → SQLite, para trabajar en el liceo sin internet
//   * con DATABASE_URL  → Postgres (Supabase), para el despliegue en Vercel
//
// Ambos drivers cumplen el mismo contrato (all/get/run/exec/tx/cerrar) y todas
// las consultas se escriben con marcadores "?" y SQL portable a propósito.
import { SQLITE, POSTGRES } from './esquemas.js';

const usarPostgres = !!process.env.DATABASE_URL;
const motor = usarPostgres ? await import('./postgres.js') : await import('./sqlite.js');

export const { all, get, run, exec, tx, cerrar, driver } = motor;

/**
 * Expresión SQL para "ahora", en UTC y con formato 'YYYY-MM-DD HH:MM:SS'.
 * Cambia entre motores, así que se interpola en las consultas que la necesitan
 * en vez de escribirla a mano.
 */
export const AHORA = usarPostgres ? 'ahora_utc()' : "datetime('now')";

let inicializada = false;

// Columnas agregadas después de que ya había bases creadas. CREATE TABLE IF NOT
// EXISTS no toca una tabla existente, así que hay que añadirlas aparte.
const MIGRACIONES = [
  "ALTER TABLE alumnos ADD COLUMN regimen TEXT NOT NULL DEFAULT ''",
];

async function migrar() {
  for (const sentencia of MIGRACIONES) {
    try {
      await exec(sentencia);
    } catch (error) {
      // Que la columna ya exista es lo esperado en una base al día; cualquier
      // otro error sí hay que verlo.
      const mensaje = String(error.message || '').toLowerCase();
      const yaExiste = mensaje.includes('duplicate column') || mensaje.includes('already exists');
      if (!yaExiste) throw error;
    }
  }
}

export async function inicializar() {
  if (inicializada) return;
  await exec(usarPostgres ? POSTGRES : SQLITE);
  await migrar();
  inicializada = true;
}
