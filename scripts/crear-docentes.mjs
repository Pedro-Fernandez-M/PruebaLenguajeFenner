// Crea las cuentas de las docentes de Lengua y Literatura.
// Se ejecuta una vez:  npm run crear-docentes
import crypto from 'node:crypto';
import * as db from '../src/db/index.js';
import { hashPassword } from '../src/lib/seguridad.js';

const DOCENTES = ['Lissette', 'Miroslava', 'Daniela', 'Karina', 'Andrea'];

// Contrasena inicial legible pero no adivinable; cada una la cambia al entrar.
const clave = () => {
  const bytes = crypto.randomBytes(6);
  const alfabeto = 'abcdefghijkmnpqrstuvwxyz23456789';
  return 'len-' + [...bytes].map((b) => alfabeto[b % alfabeto.length]).join('');
};

await db.inicializar();

console.log('');
console.log('  DOCENTE       CORREO                      CONTRASENA INICIAL');
console.log('  ' + '-'.repeat(66));

for (const nombre of DOCENTES) {
  const email = nombre.toLowerCase() + '@liceo.cl';
  const existente = await db.get('SELECT id FROM profesores WHERE lower(email) = ?', [email]);

  if (existente) {
    console.log('  ' + nombre.padEnd(14) + email.padEnd(28) + '(ya existía, sin cambios)');
    continue;
  }

  const password = clave();
  await db.run(
    "INSERT INTO profesores (nombre, email, password_hash, rol, cursos) VALUES (?, ?, ?, 'profesor', '')",
    [nombre, email, hashPassword(password)]
  );
  console.log('  ' + nombre.padEnd(14) + email.padEnd(28) + password);
}

console.log('');
console.log('  Sin cursos asignados: por ahora cada una ve los seis cursos.');
console.log('  Para repartirlos: panel -> Mi cuenta -> Docentes.');
console.log('');

await db.cerrar();
