// Utilidades compartidas por el portal del alumno y el panel docente.

export async function api(ruta, opciones = {}) {
  const respuesta = await fetch(ruta, {
    credentials: 'same-origin',
    headers: opciones.cuerpo ? { 'Content-Type': 'application/json' } : undefined,
    method: opciones.metodo || (opciones.cuerpo ? 'POST' : 'GET'),
    body: opciones.cuerpo ? JSON.stringify(opciones.cuerpo) : undefined,
  });

  let datos = null;
  try { datos = await respuesta.json(); } catch { datos = null; }

  if (!respuesta.ok) {
    const error = new Error((datos && datos.error) || 'Error ' + respuesta.status);
    error.estado = respuesta.status;
    error.datos = datos;
    throw error;
  }
  return datos;
}

export const $ = (selector, raiz = document) => raiz.querySelector(selector);
export const $$ = (selector, raiz = document) => [...raiz.querySelectorAll(selector)];

export function esc(valor) {
  return String(valor == null ? '' : valor)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Texto plano con saltos de línea a párrafos HTML. */
export function parrafos(texto) {
  return String(texto || '')
    .split(/\n{2,}/)
    .map((bloque) => '<p>' + esc(bloque.trim()).replace(/\n/g, '<br>') + '</p>')
    .join('');
}

export function mostrarAviso(nodo, mensaje, clase = 'error') {
  if (!nodo) return;
  nodo.className = 'aviso ' + clase;
  nodo.textContent = mensaje || '';
  if (mensaje) nodo.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

export function limpiarAviso(nodo) {
  if (nodo) { nodo.className = 'aviso'; nodo.textContent = ''; }
}

export const ROMANO = { 1: 'I', 2: 'II', 3: 'III' };

/** "1 estudiante" / "3 estudiantes" */
export function plural(cantidad, singular, pluralForma) {
  return cantidad + ' ' + (Number(cantidad) === 1 ? singular : (pluralForma || singular + 's'));
}

export function colorLogro(porcentaje) {
  if (porcentaje >= 70) return 'verde';
  if (porcentaje >= 40) return 'ambar';
  return 'roja';
}

export function barra(porcentaje, clase) {
  const p = Math.max(0, Math.min(100, Number(porcentaje) || 0));
  return '<span class="barra-dato ' + (clase || colorLogro(p)) + '"><i style="width:' + p + '%"></i></span>';
}

export function fecha(valorSql) {
  if (!valorSql) return '—';
  const d = new Date(String(valorSql).replace(' ', 'T') + 'Z');
  if (Number.isNaN(d.getTime())) return String(valorSql);
  return d.toLocaleString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function reloj(segundos) {
  const s = Math.max(0, Math.round(segundos));
  const m = Math.floor(s / 60);
  return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}
