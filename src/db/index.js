// Capa de datos. Hoy resuelve a SQLite (local); cuando exista DATABASE_URL
// el mismo contrato lo cumplira el driver de Postgres para desplegar en Vercel.
// Todas las consultas usan marcadores "?" y SQL portable a proposito.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

if (process.env.DATABASE_URL) {
  throw new Error(
    'DATABASE_URL esta definida pero el driver de Postgres aun no esta habilitado.\n' +
    'Para el despliegue en Vercel hay que crear src/db/postgres.js con el mismo\n' +
    'contrato que src/db/sqlite.js (all/get/run/exec/tx) y traducir "?" a "$n".\n' +
    'Por ahora deja DATABASE_URL sin definir para trabajar en modo local.'
  );
}

const sqlite = await import('./sqlite.js');

export const { all, get, run, exec, tx, cerrar, driver } = sqlite;

let inicializada = false;

export async function inicializar() {
  if (inicializada) return;
  const esquema = fs.readFileSync(path.join(raiz, 'src/db/schema.sql'), 'utf8');
  await exec(esquema);
  inicializada = true;
}
