// Genera src/db/esquemas.js a partir de los dos .sql.
//
// El esquema se inlinea en un .js porque el empaquetador de Vercel no rastrea
// un fs.readFileSync con ruta calculada: el .sql podria no viajar dentro de la
// funcion. Antes esa copia se mantenia a mano, y mantener a mano dos versiones
// del mismo esquema es exactamente como se desincronizan.
//
//   npm run generar-esquemas
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const raiz = new URL('../', import.meta.url);
const destino = new URL('src/db/esquemas.js', raiz);

const leer = async (nombre) =>
  (await readFile(new URL('src/db/' + nombre, raiz), 'utf8')).replace(/\r\n/g, '\n');

const sqlite = await leer('schema.sql');
const postgres = await leer('schema.postgres.sql');

const salida =
  '// Generado desde los .sql para que el esquema viaje SIEMPRE dentro del\n' +
  '// paquete de la funcion. En Vercel, un fs.readFileSync con ruta calculada\n' +
  '// no garantiza que el archivo este presente: al inlinearlo, desaparece\n' +
  '// esa clase de fallo.\n' +
  '//\n' +
  '// NO editar a mano: se regenera con `npm run generar-esquemas`.\n' +
  '\n' +
  'export const SQLITE = ' + JSON.stringify(sqlite) + ';\n' +
  '\n' +
  'export const POSTGRES = ' + JSON.stringify(postgres) + ';\n';

await writeFile(fileURLToPath(destino), salida, 'utf8');

console.log('esquemas.js regenerado');
console.log('  SQLITE    ' + sqlite.length + ' caracteres');
console.log('  POSTGRES  ' + postgres.length + ' caracteres');
