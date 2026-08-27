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

  // En serverless el disco es de solo lectura y efimero: SQLite no solo falla al
  // crear el archivo, sino que aunque funcionara perderia los datos entre
  // invocaciones. La comprobacion va aqui y no en el nivel superior del modulo
  // porque alli reventaria durante el import, fuera del try que reporta el error.
  if (!usarPostgres && (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME)) {
    throw new Error(
      'Falta DATABASE_URL. En Vercel la plataforma necesita una base Postgres ' +
      '(Supabase): el disco de la funcion es de solo lectura, asi que SQLite no sirve. ' +
      'Definela en Settings > Environment Variables y vuelve a desplegar.'
    );
  }

  await exec(usarPostgres ? POSTGRES : SQLITE);
  await migrar();
  inicializada = true;
}
