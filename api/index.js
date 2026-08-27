// Punto de entrada para Vercel. Las funciones serverless se apagan y vuelven a
// arrancar, asi que la app se construye una sola vez por instancia y se reutiliza.
import { crearApp } from '../src/app.js';

let pendiente = null;

export default async function handler(req, res) {
  try {
    // Si el arranque anterior fallo NO se reutiliza la promesa rechazada: al
    // corregir una variable de entorno, el siguiente intento debe poder levantar
    // sin esperar a que Vercel recicle la instancia.
    if (!pendiente) pendiente = crearApp();
    const { app } = await pendiente;
    return app(req, res);
  } catch (error) {
    pendiente = null;

    // Sin esto la funcion muere con FUNCTION_INVOCATION_FAILED, que no dice nada
    // sobre la causa real. Aqui se devuelve el motivo y una pista accionable.
    console.error('[arranque] fallo al construir la app:', error);

    const mensaje = String(error?.message || error);
    let pista = 'Revisa los registros de la funcion en Vercel.';

    if (/invalid url/i.test(mensaje)) {
      // Tipico al pegar la contrasena sin codificar: un # parte la URL en dos.
      pista = 'DATABASE_URL no es una URL valida. Casi siempre es la contrasena: ' +
        'si contiene # $ @ : / o ?, hay que codificarla (# se escribe %23, @ se escribe %40).';
    } else if (/password authentication|SASL|SCRAM/i.test(mensaje)) {
      pista = 'La contrasena de la base es incorrecta. Si contiene # $ @ : / o ?, ' +
        'hay que codificarla en la URL (por ejemplo # se escribe %23).';
    } else if (/ENOTFOUND|EAI_AGAIN|tenant/i.test(mensaje)) {
      pista = 'No se encontro el servidor de la base. Revisa el host de DATABASE_URL.';
    } else if (/ETIMEDOUT|timeout/i.test(mensaje)) {
      pista = 'La conexion a la base expiro. Usa el pooler de Supabase (puerto 6543).';
    } else if (/DATABASE_URL/i.test(mensaje)) {
      pista = 'Falta definir DATABASE_URL en las variables de entorno del proyecto.';
    }

    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: 'No se pudo iniciar la plataforma.', detalle: mensaje, pista }, null, 2));
  }
}
