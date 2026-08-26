// Middlewares de sesion para los dos tipos de usuario: profesor y alumno.
import { crearToken, leerToken } from './seguridad.js';

export const COOKIE_PROFESOR = 'dia_profesor';
export const COOKIE_ALUMNO = 'dia_alumno';

const opcionesCookie = {
  httpOnly: true,
  sameSite: 'lax',
  path: '/',
  // En local se sirve por http, asi que secure solo se activa en produccion.
  secure: process.env.NODE_ENV === 'production',
};

export function iniciarSesionProfesor(res, profesor) {
  const token = crearToken({ tipo: 'profesor', id: profesor.id, nombre: profesor.nombre, rol: profesor.rol }, 12);
  res.cookie(COOKIE_PROFESOR, token, { ...opcionesCookie, maxAge: 12 * 3600_000 });
}

export function iniciarSesionAlumno(res, alumno) {
  // La sesion del alumno dura lo suficiente para una jornada de prueba.
  const token = crearToken({ tipo: 'alumno', id: alumno.id, nombre: alumno.nombre, curso: alumno.curso }, 6);
  res.cookie(COOKIE_ALUMNO, token, { ...opcionesCookie, maxAge: 6 * 3600_000 });
}

export function cerrarSesion(res, cookie) {
  res.clearCookie(cookie, { ...opcionesCookie });
}

export function cargarSesion(req, _res, next) {
  const prof = leerToken(req.cookies?.[COOKIE_PROFESOR]);
  const alum = leerToken(req.cookies?.[COOKIE_ALUMNO]);
  req.profesor = prof && prof.tipo === 'profesor' ? prof : null;
  req.alumno = alum && alum.tipo === 'alumno' ? alum : null;
  next();
}

export function exigirProfesor(req, res, next) {
  if (!req.profesor) return res.status(401).json({ error: 'Debes iniciar sesión como docente.' });
  next();
}

export function exigirAlumno(req, res, next) {
  if (!req.alumno) return res.status(401).json({ error: 'Ingresa tu código para continuar.' });
  next();
}
