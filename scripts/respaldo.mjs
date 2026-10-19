// Baja TODA la base a archivos locales.
//
//   npm run respaldo
//
// Deja dos cosas en la carpeta respaldos/:
//   * un .json con la base completa, para poder reconstruirla
//   * un .csv por prueba con las notas, para abrirlo en Excel sin programa alguno
//
// Corre contra lo que diga DATABASE_URL, asi que apunta a Supabase. De paso
// cumple una segunda funcion: el plan gratuito de Supabase pausa los proyectos
// que pasan una semana sin consultas, y correr esto cada semana los mantiene
// despiertos.
//
// El archivo lleva nombres y RUT de estudiantes: la carpeta esta en .gitignore
// y NO debe subirse al repositorio, que es publico.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as db from '../src/db/index.js';
import { informeDePrueba } from '../src/lib/evaluacion.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Sin DATABASE_URL la capa de datos cae a SQLite local, que es lo correcto en el
// liceo sin internet pero NO en la tarea automatica: ahi significaria respaldar
// una base vacia —o peor, una vieja— y mandarla por correo como si fuera la
// buena. Un respaldo equivocado es peor que ninguno, porque nadie lo revisa
// hasta el dia que hace falta.
if (!process.env.DATABASE_URL && process.env.CI) {
  console.error('\nFalta el secreto DATABASE_URL.');
  console.error('Sin el, esto respaldaria una base local vacia en vez de Supabase.');
  console.error('');
  console.error('Revisa en GitHub → Settings → Secrets and variables → Actions:');
  console.error('  · que exista en la pestaña "Secrets", no en "Variables"');
  console.error('  · que sea un "Repository secret", no de un Environment');
  console.error('  · que se llame exactamente DATABASE_URL\n');
  process.exit(1);
}

const carpeta = path.join(raiz, 'respaldos');
fs.mkdirSync(carpeta, { recursive: true });

// Orden de dependencias: primero lo que no referencia a nada. Asi el archivo
// sirve tal cual para volver a cargarlo en una base vacia.
const TABLAS = ['profesores', 'criterios', 'alumnos', 'pruebas', 'preguntas', 'opciones', 'intentos', 'respuestas'];

const sello = new Date().toISOString().slice(0, 10);
const csvEscapar = (v) => {
  const s = v === null || v === undefined ? '' : String(v);
  if (/^-?\d+,\d+$/.test(s)) return s;
  return /[",;\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
const nota = (n) => (n === null || n === undefined ? '' : Number(n).toFixed(1).replace('.', ','));
const limpio = (t) => String(t).replace(/[^\w\s-]+/g, '').trim().replace(/\s+/g, '_').slice(0, 40);

console.log('\nRespaldo de la plataforma — ' + sello);
console.log('Motor: ' + db.driver + (db.driver === 'postgres' ? '  (Supabase)' : '  (base local)'));
console.log('');

/* ------------------------------------------------------- 1. la base entera */

const volcado = { generado_en: new Date().toISOString(), motor: db.driver, tablas: {} };
let filas = 0;

for (const tabla of TABLAS) {
  const datos = await db.all('SELECT * FROM ' + tabla + ' ORDER BY id');
  volcado.tablas[tabla] = datos;
  filas += datos.length;
  console.log('  ' + tabla.padEnd(12) + String(datos.length).padStart(6) + ' filas');
}

const archivoJson = path.join(carpeta, 'respaldo-' + sello + '.json');
fs.writeFileSync(archivoJson, JSON.stringify(volcado, null, 1), 'utf8');

/* --------------------------------------------- 2. las notas, listas de leer */

const pruebas = await db.all(
  "SELECT p.id, p.titulo, pr.nombre AS docente FROM pruebas p " +
  'LEFT JOIN profesores pr ON pr.id = p.profesor_id ORDER BY p.id'
);

console.log('');
const csvs = [];

for (const p of pruebas) {
  const informe = await informeDePrueba(p.id);
  if (!informe || !informe.total_alumnos) continue;

  const lineas = [];
  lineas.push(['Prueba', p.titulo].map(csvEscapar).join(';'));
  lineas.push(['Docente', p.docente || ''].map(csvEscapar).join(';'));
  lineas.push(['Respaldo', sello].map(csvEscapar).join(';'));
  if (informe.pendientes_correccion) {
    lineas.push(['ATENCION', informe.pendientes_correccion + ' respuestas sin corregir: las notas no estan cerradas'].map(csvEscapar).join(';'));
  }
  lineas.push([]);
  lineas.push(['Matricula', 'Alumno', 'Curso', 'Puntaje', 'Puntaje maximo', '% logro', 'Nota', 'Nivel'].join(';'));

  for (const a of informe.alumnos) {
    lineas.push([
      a.matricula, a.nombre, a.curso, a.puntaje, a.puntaje_max, a.porcentaje,
      nota(a.nota), 'Nivel ' + ['', 'I', 'II', 'III'][a.nivel_logro || 1],
    ].map(csvEscapar).join(';'));
  }

  const nombre = 'notas-' + sello + '-' + limpio(p.docente || 'sin_docente') + '-' + limpio(p.titulo) + '.csv';
  fs.writeFileSync(path.join(carpeta, nombre), '﻿' + lineas.join('\n'), 'utf8');
  csvs.push(nombre);
  console.log('  ' + String(informe.total_alumnos).padStart(4) + ' notas   ' + nombre);
}

/* ------------------------------------------------- 3. comprobar lo escrito */

// Releer el archivo en vez de dar por bueno lo que se acaba de escribir: un
// respaldo que nadie verifica es exactamente igual que no tener respaldo.
const releido = JSON.parse(fs.readFileSync(archivoJson, 'utf8'));
const problemas = [];
for (const tabla of TABLAS) {
  const esperado = volcado.tablas[tabla].length;
  const real = (releido.tablas[tabla] || []).length;
  if (real !== esperado) problemas.push(tabla + ': se escribieron ' + real + ' de ' + esperado);
}

const tamano = fs.statSync(archivoJson).size;
console.log('');
console.log('  ' + path.relative(raiz, archivoJson) + '   ' + (tamano / 1024).toFixed(0) + ' KB');
console.log('  ' + filas + ' filas en total, ' + csvs.length + ' planillas de notas');

if (problemas.length) {
  console.error('\n  EL RESPALDO QUEDO INCOMPLETO:');
  for (const p of problemas) console.error('    ' + p);
  await db.cerrar();
  process.exit(1);
}

console.log('  comprobado: el archivo se relee entero y cuadra.\n');
await db.cerrar();
