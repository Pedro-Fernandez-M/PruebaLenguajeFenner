import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as db from './db/index.js';
import { cargarSesion } from './lib/sesion.js';
import { hashPassword } from './lib/seguridad.js';
import rutasAuth from './routes/auth.js';
import rutasAlumno from './routes/alumno.js';
import rutasAdmin from './routes/admin.js';
import rutasInformes from './routes/informes.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Crea la cuenta docente inicial si la base está recién creada. */
async function asegurarProfesorInicial() {
  const hay = await db.get('SELECT COUNT(*) AS n FROM profesores');
  if (hay.n > 0) return null;

  const email = (process.env.ADMIN_EMAIL || 'profesor@liceo.cl').toLowerCase();
  const password = process.env.ADMIN_PASSWORD || 'dia2026';
  const nombre = process.env.ADMIN_NOMBRE || 'Docente';
  await db.run(
    "INSERT INTO profesores (nombre, email, password_hash, rol) VALUES (?, ?, ?, 'admin')",
    [nombre, email, hashPassword(password)]
  );
  return { email, password };
}

export async function crearApp() {
  await db.inicializar();
  const credenciales = await asegurarProfesorInicial();

  const app = express();
  app.disable('x-powered-by');
  // El límite alto permite subir la planilla de matrícula en base64.
  app.use(express.json({ limit: '25mb' }));
  app.use(cookieParser());
  app.use(cargarSesion);

  app.use('/api/auth', rutasAuth);
  app.use('/api/alumno', rutasAlumno);
  app.use('/api/admin', rutasAdmin);
  app.use('/api/admin', rutasInformes);

  app.get('/api/estado', (_req, res) => res.json({ ok: true, motor: db.driver }));

  const carpetaPublica = path.join(raiz, 'public');
  app.use(express.static(carpetaPublica, { extensions: ['html'] }));

  app.use('/api', (_req, res) => res.status(404).json({ error: 'Ruta no encontrada.' }));

  // Respaldo para el portal del alumno. En Vercel los estaticos los sirve la CDN,
  // pero toda ruta que no calce con un archivo termina en esta funcion; sin este
  // manejador, "/" se quedaba sin respuesta y la invocacion moria.
  app.get(/.*/, (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(carpetaPublica, 'index.html'), (error) => {
      if (error) res.status(404).type('text/plain').send('Página no encontrada.');
    });
  });

  app.use((error, _req, res, _next) => {
    console.error('[error]', error);
    res.status(500).json({ error: 'Ocurrió un error en el servidor: ' + error.message });
  });

  return { app, credenciales };
}
