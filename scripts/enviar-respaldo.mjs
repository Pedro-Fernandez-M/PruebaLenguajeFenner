// Manda por correo el respaldo mas reciente de la carpeta respaldos/.
//
//   npm run enviar-respaldo
//
// Pensado para correr detras de `npm run respaldo` en la tarea semanal de
// GitHub Actions, pero sirve igual a mano.
//
// Toda la configuracion viene del entorno, nunca del codigo: este repositorio
// es publico y aqui no puede quedar escrita ni una direccion ni una clave.
//
//   CORREO_DESTINO   a quien se le manda
//   SMTP_HOST        p. ej. smtp.gmail.com
//   SMTP_PORT        465 con SSL, 587 con STARTTLS
//   SMTP_USUARIO     la cuenta que envia
//   SMTP_CLAVE       su contraseña de aplicacion
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import nodemailer from 'nodemailer';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const carpeta = path.join(raiz, 'respaldos');

/* ---------------------------------------------------- revisar lo que falta */

const FALTANTES = ['CORREO_DESTINO', 'SMTP_HOST', 'SMTP_USUARIO', 'SMTP_CLAVE']
  .filter((v) => !process.env[v]);

if (FALTANTES.length) {
  console.error('\nFalta configurar: ' + FALTANTES.join(', '));
  console.error('En GitHub van en Settings → Secrets and variables → Actions.');
  console.error('Para probarlo aquí, agrégalas a tu archivo .env.\n');
  process.exit(1);
}

if (!fs.existsSync(carpeta)) {
  console.error('\nNo existe la carpeta respaldos/. Corre primero: npm run respaldo\n');
  process.exit(1);
}

/* ------------------------------------------- juntar el respaldo mas nuevo */

const archivos = fs.readdirSync(carpeta)
  .filter((f) => f.endsWith('.json') || f.endsWith('.csv'))
  .map((f) => ({ nombre: f, ruta: path.join(carpeta, f), stat: fs.statSync(path.join(carpeta, f)) }))
  .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);

const json = archivos.find((f) => f.nombre.endsWith('.json'));
if (!json) {
  console.error('\nNo hay ningún .json en respaldos/. Corre primero: npm run respaldo\n');
  process.exit(1);
}

// El sello del dia viene en el nombre: respaldo-AAAA-MM-DD.json
const sello = (json.nombre.match(/\d{4}-\d{2}-\d{2}/) || [])[0] || 'sin fecha';
const csvs = archivos.filter((f) => f.nombre.endsWith('.csv') && f.nombre.includes(sello));

// El volcado comprime muchisimo (es JSON), y asi el correo no se acerca al
// limite de adjuntos aunque la base siga creciendo.
const comprimido = zlib.gzipSync(fs.readFileSync(json.ruta), { level: 9 });

const adjuntos = [
  { filename: json.nombre + '.gz', content: comprimido },
  ...csvs.map((c) => ({ filename: c.nombre, path: c.ruta })),
];

const kb = (n) => (n / 1024).toFixed(0) + ' KB';
const pesoTotal = comprimido.length + csvs.reduce((s, c) => s + c.stat.size, 0);

/* ------------------------------------------------------ resumen de lo que va */

const volcado = JSON.parse(fs.readFileSync(json.ruta, 'utf8'));
const conteos = Object.entries(volcado.tablas).map(([t, f]) => [t, f.length]);
const entregadas = (volcado.tablas.intentos || []).filter((i) => i.estado === 'enviado').length;

const cuerpo = [
  'Respaldo de la plataforma de evaluación diagnóstica — ' + sello,
  'Liceo Bicentenario Industrial "Ingeniero Ricardo Fenner Ruedi" · RBD 22140',
  '',
  'CONTENIDO DE LA BASE',
  ...conteos.map(([t, n]) => '  ' + t.padEnd(12) + String(n).padStart(6) + ' filas'),
  '',
  '  pruebas entregadas: ' + entregadas,
  '',
  'ADJUNTOS',
  '  ' + json.nombre + '.gz   (' + kb(comprimido.length) + ') — la base completa, para reconstruirla',
  ...csvs.map((c) => '  ' + c.nombre + '   (' + kb(c.stat.size) + ') — notas, se abre en Excel'),
  '',
  'Este archivo contiene nombres, RUT y notas de estudiantes.',
  'Guárdalo donde corresponda y no lo reenvíes.',
  '',
  'Enviado automáticamente por la tarea semanal.',
].join('\n');

/* ----------------------------------------------------------------- enviar */

const puerto = Number(process.env.SMTP_PORT || 465);
const transporte = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: puerto,
  secure: puerto === 465,
  auth: { user: process.env.SMTP_USUARIO, pass: process.env.SMTP_CLAVE },
});

console.log('\nEnviando respaldo ' + sello);
console.log('  adjuntos: ' + adjuntos.length + '   peso: ' + kb(pesoTotal));
console.log('  servidor: ' + process.env.SMTP_HOST + ':' + puerto);

// Se verifica la conexion antes de armar el envio: si la clave esta mala, el
// error sale aqui y dice que es, en vez de perderse dentro del envio.
try {
  await transporte.verify();
} catch (error) {
  console.error('\nNo se pudo conectar al servidor de correo: ' + error.message);
  console.error('Revisa SMTP_HOST, SMTP_PORT, SMTP_USUARIO y SMTP_CLAVE.');
  console.error('Con Gmail hace falta una "contraseña de aplicación", no la del correo.\n');
  process.exit(1);
}

const info = await transporte.sendMail({
  from: process.env.SMTP_REMITENTE || process.env.SMTP_USUARIO,
  to: process.env.CORREO_DESTINO,
  subject: 'Respaldo plataforma DIA — ' + sello + ' (' + entregadas + ' pruebas entregadas)',
  text: cuerpo,
  attachments: adjuntos,
});

console.log('  enviado a ' + process.env.CORREO_DESTINO);
console.log('  id del mensaje: ' + info.messageId + '\n');
