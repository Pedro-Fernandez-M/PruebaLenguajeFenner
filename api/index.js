// Punto de entrada para Vercel. Las funciones serverless se apagan y vuelven a
// arrancar, asi que la app se construye una sola vez por instancia y se reutiliza.
import { crearApp } from '../src/app.js';

let pendiente = null;

export default async function handler(req, res) {
  if (!pendiente) pendiente = crearApp();
  const { app } = await pendiente;
  return app(req, res);
}
