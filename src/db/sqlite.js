// Driver SQLite (modo local). Usa el modulo nativo node:sqlite (Node >= 22.5).
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export const driver = 'sqlite';

export function rutaArchivo() {
  return path.resolve(raiz, process.env.SQLITE_PATH || './data/dia.db');
}

// La conexion se abre a demanda, no al importar el modulo. Importa: los import
// de ESM se evaluan antes que el cuerpo del modulo que los usa, asi que abrirla
// aqui arriba dejaria el archivo tomado antes de que un script alcance a borrarlo.
let conexion = null;

function db() {
  if (conexion) return conexion;
  const archivo = rutaArchivo();
  fs.mkdirSync(path.dirname(archivo), { recursive: true });
  conexion = new DatabaseSync(archivo);
  conexion.exec('PRAGMA journal_mode = WAL');
  conexion.exec('PRAGMA foreign_keys = ON');
  conexion.exec('PRAGMA busy_timeout = 5000');
  return conexion;
}

export function cerrar() {
  if (conexion) {
    conexion.close();
    conexion = null;
  }
}

// node:sqlite devuelve objetos con prototipo nulo; los normalizamos para que
// JSON.stringify y el spread funcionen igual que con el driver de Postgres.
const normalizar = (fila) => (fila == null ? null : { ...fila });

export async function all(sql, params = []) {
  return db().prepare(sql).all(...params).map(normalizar);
}

export async function get(sql, params = []) {
  return normalizar(db().prepare(sql).get(...params) ?? null);
}

export async function run(sql, params = []) {
  const r = db().prepare(sql).run(...params);
  return { id: Number(r.lastInsertRowid), cambios: Number(r.changes) };
}

export async function exec(sql) {
  db().exec(sql);
}

// Transaccion: SQLite no admite concurrencia de escritura real, asi que basta
// con BEGIN/COMMIT alrededor del callback.
export async function tx(fn) {
  const c = db();
  c.exec('BEGIN');
  try {
    const resultado = await fn();
    c.exec('COMMIT');
    return resultado;
  } catch (error) {
    try { c.exec('ROLLBACK'); } catch { /* la transacción ya se deshizo */ }
    throw error;
  }
}
