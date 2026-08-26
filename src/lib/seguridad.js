// Hash de contrasenas y firma de sesiones. Sin dependencias externas: node:crypto
// alcanza y esto funciona igual en el servidor local que en una funcion de Vercel.
import crypto from 'node:crypto';

const SECRETO = process.env.SESSION_SECRET || 'dia-secreto-local-cambiar';

export function hashPassword(password) {
  const sal = crypto.randomBytes(16).toString('hex');
  const derivada = crypto.scryptSync(password, sal, 64).toString('hex');
  return `scrypt:${sal}:${derivada}`;
}

export function verificarPassword(password, almacenado) {
  if (typeof almacenado !== 'string') return false;
  const [algoritmo, sal, esperado] = almacenado.split(':');
  if (algoritmo !== 'scrypt' || !sal || !esperado) return false;
  const derivada = crypto.scryptSync(password, sal, 64);
  const bufEsperado = Buffer.from(esperado, 'hex');
  if (bufEsperado.length !== derivada.length) return false;
  return crypto.timingSafeEqual(derivada, bufEsperado);
}

function firmar(texto) {
  return crypto.createHmac('sha256', SECRETO).update(texto).digest('base64url');
}

// Cookie autofirmada: <payload base64url>.<hmac>. No requiere almacen de sesiones,
// asi que sobrevive tal cual al paso a funciones serverless.
export function crearToken(datos, horasValidez = 12) {
  const carga = { ...datos, exp: Date.now() + horasValidez * 3600_000 };
  const cuerpo = Buffer.from(JSON.stringify(carga)).toString('base64url');
  return `${cuerpo}.${firmar(cuerpo)}`;
}

export function leerToken(token) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [cuerpo, firma] = token.split('.');
  const esperada = firmar(cuerpo);
  if (firma.length !== esperada.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(firma), Buffer.from(esperada))) return null;
  try {
    const datos = JSON.parse(Buffer.from(cuerpo, 'base64url').toString('utf8'));
    if (!datos.exp || datos.exp < Date.now()) return null;
    return datos;
  } catch {
    return null;
  }
}

// Alfabeto sin caracteres ambiguos (0/O, 1/I/L) para que el codigo se pueda
// dictar en voz alta y copiar desde papel sin errores.
const ALFABETO = 'ACDEFGHJKMNPQRTUVWXY2346789';

export function generarCodigo(largo = 8) {
  const bytes = crypto.randomBytes(largo);
  let salida = '';
  for (let i = 0; i < largo; i++) {
    salida += ALFABETO[bytes[i] % ALFABETO.length];
    if (i === 3 && largo === 8) salida += '-';
  }
  return salida;
}

export function normalizarCodigo(codigo) {
  return String(codigo || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}
