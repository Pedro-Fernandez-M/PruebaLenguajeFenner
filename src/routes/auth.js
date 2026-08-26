import express from 'express';
import * as db from '../db/index.js';
import { verificarPassword, hashPassword } from '../lib/seguridad.js';
import {
  iniciarSesionProfesor, cerrarSesion, exigirProfesor,
  COOKIE_PROFESOR, COOKIE_ALUMNO,
} from '../lib/sesion.js';

const router = express.Router();

router.post('/profesor/ingresar', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  if (!email || !password) return res.status(400).json({ error: 'Ingresa correo y contraseña.' });

  const profesor = await db.get('SELECT * FROM profesores WHERE lower(email) = ?', [email]);
  if (!profesor || !profesor.activo || !verificarPassword(password, profesor.password_hash)) {
    return res.status(401).json({ error: 'Correo o contraseña incorrectos.' });
  }

  iniciarSesionProfesor(res, profesor);
  res.json({ profesor: { id: profesor.id, nombre: profesor.nombre, email: profesor.email, rol: profesor.rol } });
});

router.post('/salir', (req, res) => {
  cerrarSesion(res, COOKIE_PROFESOR);
  cerrarSesion(res, COOKIE_ALUMNO);
  res.json({ ok: true });
});

router.get('/sesion', (req, res) => {
  res.json({ profesor: req.profesor || null, alumno: req.alumno || null });
});

router.post('/profesor/cambiar-password', exigirProfesor, async (req, res) => {
  const actual = String(req.body?.actual || '');
  const nueva = String(req.body?.nueva || '');
  if (nueva.length < 8) return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 8 caracteres.' });

  const profesor = await db.get('SELECT * FROM profesores WHERE id = ?', [req.profesor.id]);
  if (!verificarPassword(actual, profesor.password_hash)) {
    return res.status(401).json({ error: 'La contraseña actual no es correcta.' });
  }
  await db.run('UPDATE profesores SET password_hash = ? WHERE id = ?', [hashPassword(nueva), profesor.id]);
  res.json({ ok: true });
});

// Alta de otros docentes. Solo el rol admin puede hacerlo.
router.get('/profesores', exigirProfesor, async (req, res) => {
  const filas = await db.all('SELECT id, nombre, email, rol, activo, creado_en FROM profesores ORDER BY nombre');
  res.json({ profesores: filas });
});

router.post('/profesores', exigirProfesor, async (req, res) => {
  if (req.profesor.rol !== 'admin') return res.status(403).json({ error: 'Solo un administrador puede crear docentes.' });
  const nombre = String(req.body?.nombre || '').trim();
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const rol = req.body?.rol === 'admin' ? 'admin' : 'profesor';
  if (!nombre || !email || password.length < 8) {
    return res.status(400).json({ error: 'Nombre, correo y una contraseña de al menos 8 caracteres son obligatorios.' });
  }
  const existente = await db.get('SELECT id FROM profesores WHERE lower(email) = ?', [email]);
  if (existente) return res.status(409).json({ error: 'Ya existe un docente con ese correo.' });

  const { id } = await db.run(
    'INSERT INTO profesores (nombre, email, password_hash, rol) VALUES (?, ?, ?, ?)',
    [nombre, email, hashPassword(password), rol]
  );
  res.status(201).json({ id });
});

export default router;
