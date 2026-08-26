// Driver Postgres, pensado para Supabase + Vercel.
//
// Cumple el mismo contrato que sqlite.js (all/get/run/exec/tx) para que las
// rutas no cambien. Se encarga de tres diferencias del motor:
//
//  1. Marcadores: las consultas se escriben con "?" y aquí se traducen a $1…$n.
//  2. INSERT: SQLite devuelve lastInsertRowid; Postgres necesita RETURNING id.
//  3. Transacciones: con un pool, BEGIN y COMMIT deben viajar por la MISMA
//     conexión. Se usa AsyncLocalStorage para que las llamadas hechas dentro
//     del callback de tx() reutilicen el cliente de esa transacción.
import { AsyncLocalStorage } from 'node:async_hooks';
import pg from 'pg';

export const driver = 'postgres';

// Supabase entrega marcas de tiempo que preferimos leer como texto plano, igual
// que SQLite, para que el resto del código no tenga que distinguir el motor.
pg.types.setTypeParser(1114, (v) => v); // timestamp
pg.types.setTypeParser(1184, (v) => v); // timestamptz
pg.types.setTypeParser(1700, (v) => parseFloat(v)); // numeric
pg.types.setTypeParser(20, (v) => parseInt(v, 10)); // bigint (COUNT)

const almacen = new AsyncLocalStorage();
let pool = null;

function obtenerPool() {
  if (pool) return pool;

  const cadena = process.env.DATABASE_URL;
  if (!cadena) throw new Error('Falta DATABASE_URL.');

  // El pooler de Supabase (puerto 6543, modo transacción) no admite sentencias
  // preparadas con nombre. node-postgres usa sentencias sin nombre salvo que se
  // pida lo contrario, así que es compatible tal cual.
  pool = new pg.Pool({
    connectionString: cadena,
    max: Number(process.env.PG_MAX_CLIENTES || 3),
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 15_000,
    ssl: cadena.includes('localhost') ? false : { rejectUnauthorized: false },
  });

  pool.on('error', (error) => console.error('[postgres] error en cliente inactivo:', error.message));
  return pool;
}

/** Traduce los "?" posicionales a $1…$n, respetando los que van dentro de comillas. */
export function traducir(sql) {
  let salida = '';
  let n = 0;
  let enComillaSimple = false;
  let enComillaDoble = false;

  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    if (c === "'" && !enComillaDoble) enComillaSimple = !enComillaSimple;
    else if (c === '"' && !enComillaSimple) enComillaDoble = !enComillaDoble;

    if (c === '?' && !enComillaSimple && !enComillaDoble) {
      n += 1;
      salida += '$' + n;
    } else {
      salida += c;
    }
  }
  return salida;
}

async function ejecutar(sql, params) {
  const enTransaccion = almacen.getStore();
  if (enTransaccion) return enTransaccion.query(traducir(sql), params);

  const cliente = await obtenerPool().connect();
  try {
    return await cliente.query(traducir(sql), params);
  } finally {
    cliente.release();
  }
}

export async function all(sql, params = []) {
  const r = await ejecutar(sql, params);
  return r.rows;
}

export async function get(sql, params = []) {
  const r = await ejecutar(sql, params);
  return r.rows[0] ?? null;
}

export async function run(sql, params = []) {
  // Se agrega RETURNING id para emular el lastInsertRowid de SQLite.
  const esInsert = /^\s*INSERT\s/i.test(sql) && !/\bRETURNING\b/i.test(sql);
  const consulta = esInsert ? sql.replace(/;?\s*$/, '') + ' RETURNING id' : sql;
  const r = await ejecutar(consulta, params);
  return {
    id: esInsert && r.rows[0] ? Number(r.rows[0].id) : 0,
    cambios: r.rowCount ?? 0,
  };
}

export async function exec(sql) {
  // Sentencias sueltas (el esquema): van sin parámetros y sin traducir.
  const enTransaccion = almacen.getStore();
  if (enTransaccion) return void (await enTransaccion.query(sql));

  const cliente = await obtenerPool().connect();
  try {
    await cliente.query(sql);
  } finally {
    cliente.release();
  }
}

export async function tx(fn) {
  // Si ya hay una transacción abierta se reutiliza: Postgres no anida BEGIN.
  if (almacen.getStore()) return fn();

  const cliente = await obtenerPool().connect();
  try {
    await cliente.query('BEGIN');
    const resultado = await almacen.run(cliente, fn);
    await cliente.query('COMMIT');
    return resultado;
  } catch (error) {
    try { await cliente.query('ROLLBACK'); } catch { /* la transacción ya se deshizo */ }
    throw error;
  } finally {
    cliente.release();
  }
}

export async function cerrar() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
