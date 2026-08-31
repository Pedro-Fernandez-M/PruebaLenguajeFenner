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

/* ================================================================= GRÁFICOS */
/*
 * Se dibujan en SVG a mano, sin librerias: la pagina no carga nada externo, se
 * imprimen nitidos a cualquier tamano y siguen funcionando sin internet.
 */

const PALETA = ['#1f4f82', '#3f77ad', '#7ba7d0'];

const gr = (valor) => String(valor).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Barras verticales con el porcentaje sobre cada una.
 * El viewBox deja margen arriba y abajo para que ni las cifras ni las etiquetas
 * queden cortadas, que es lo que pasa al ajustar el alto al contenido.
 */
export function graficoBarras(datos, { titulo = '', ejeY = '% de respuestas correctas' } = {}) {
  if (!datos.length) return '';

  const ancho = 640;
  const alto = 360;
  const izq = 62;
  const der = 24;
  const arriba = titulo ? 52 : 34;
  const abajo = 54;

  const areaAncho = ancho - izq - der;
  const areaAlto = alto - arriba - abajo;
  const paso = areaAncho / datos.length;
  const anchoBarra = Math.min(paso * 0.62, 118);

  const y = (valor) => arriba + areaAlto - (areaAlto * valor) / 100;

  const rejilla = [0, 20, 40, 60, 80, 100].map((v) =>
    '<line x1="' + izq + '" y1="' + y(v) + '" x2="' + (ancho - der) + '" y2="' + y(v) + '" ' +
      'stroke="#e6ebf1" stroke-width="1"/>' +
    '<text x="' + (izq - 10) + '" y="' + (y(v) + 4) + '" text-anchor="end" ' +
      'font-size="12" fill="#5a6b7d">' + v + '</text>').join('');

  const barras = datos.map((d, i) => {
    const cx = izq + paso * i + paso / 2;
    const x = cx - anchoBarra / 2;
    const altura = Math.max(1, (areaAlto * d.valor) / 100);
    const color = PALETA[i % PALETA.length];

    return '<rect x="' + x + '" y="' + y(d.valor) + '" width="' + anchoBarra + '" height="' + altura + '" ' +
        'fill="' + color + '" rx="3"/>' +
      '<text x="' + cx + '" y="' + (y(d.valor) - 9) + '" text-anchor="middle" ' +
        'font-size="15" font-weight="700" fill="#16202c">' + d.valor + '%</text>' +
      '<text x="' + cx + '" y="' + (arriba + areaAlto + 22) + '" text-anchor="middle" ' +
        'font-size="12.5" fill="#16202c">' + gr(d.etiqueta) + '</text>' +
      (d.detalle
        ? '<text x="' + cx + '" y="' + (arriba + areaAlto + 39) + '" text-anchor="middle" ' +
          'font-size="11" fill="#5a6b7d">' + gr(d.detalle) + '</text>'
        : '');
  }).join('');

  return '<svg viewBox="0 0 ' + ancho + ' ' + alto + '" class="grafico" role="img" ' +
      'aria-label="' + gr(titulo || ejeY) + '">' +
    (titulo ? '<text x="' + izq + '" y="24" font-size="15" font-weight="700" fill="#16202c">' + gr(titulo) + '</text>' : '') +
    '<text transform="translate(16 ' + (arriba + areaAlto / 2) + ') rotate(-90)" text-anchor="middle" ' +
      'font-size="11.5" fill="#5a6b7d">' + gr(ejeY) + '</text>' +
    rejilla +
    '<line x1="' + izq + '" y1="' + (arriba + areaAlto) + '" x2="' + (ancho - der) + '" y2="' + (arriba + areaAlto) + '" stroke="#16202c" stroke-width="1.5"/>' +
    barras +
  '</svg>';
}

/** Punto del borde del circulo para un angulo dado, en grados desde arriba. */
function punto(cx, cy, radio, grados) {
  const rad = ((grados - 90) * Math.PI) / 180;
  return [cx + radio * Math.cos(rad), cy + radio * Math.sin(rad)];
}

/**
 * Torta con la etiqueta de cada porcion afuera.
 * El ancho del viewBox deja sitio a los rotulos laterales: si se ajusta al
 * circulo, los nombres se cortan justo en los extremos.
 */
export function graficoTorta(datos, { titulo = '' } = {}) {
  const total = datos.reduce((s, d) => s + d.valor, 0);
  if (!total) return '';

  const ancho = 480;
  const alto = 320;
  const cx = 240;
  const cy = titulo ? 178 : 165;
  const radio = 92;

  let angulo = 0;
  const porciones = [];
  const rotulos = [];

  datos.forEach((d, i) => {
    if (!d.valor) return;
    const porcion = (d.valor / total) * 360;
    const color = PALETA[i % PALETA.length];

    // Una porcion de 360° no se puede trazar con un arco: se dibuja el circulo.
    if (porcion >= 359.99) {
      porciones.push('<circle cx="' + cx + '" cy="' + cy + '" r="' + radio + '" fill="' + color + '"/>');
    } else {
      const [x1, y1] = punto(cx, cy, radio, angulo);
      const [x2, y2] = punto(cx, cy, radio, angulo + porcion);
      const mayor = porcion > 180 ? 1 : 0;
      porciones.push('<path d="M ' + cx + ' ' + cy + ' L ' + x1 + ' ' + y1 +
        ' A ' + radio + ' ' + radio + ' 0 ' + mayor + ' 1 ' + x2 + ' ' + y2 + ' Z" ' +
        'fill="' + color + '" stroke="#fff" stroke-width="2"/>');
    }

    const medio = angulo + porcion / 2;
    const [lx, ly] = punto(cx, cy, radio + 26, medio);
    const derecha = lx >= cx;
    const tx = derecha ? Math.min(lx, ancho - 96) : Math.max(lx, 96);

    rotulos.push(
      '<text x="' + tx + '" y="' + ly + '" text-anchor="' + (derecha ? 'start' : 'end') + '" ' +
        'font-size="12.5" fill="#16202c">' + gr(d.etiqueta) + '</text>' +
      '<text x="' + tx + '" y="' + (ly + 16) + '" text-anchor="' + (derecha ? 'start' : 'end') + '" ' +
        'font-size="12.5" font-weight="700" fill="#16202c">' +
        Math.round((d.valor / total) * 1000) / 10 + '%</text>'
    );

    angulo += porcion;
  });

  return '<svg viewBox="0 0 ' + ancho + ' ' + alto + '" class="grafico" role="img" ' +
      'aria-label="' + gr(titulo || 'Distribución') + '">' +
    (titulo ? '<text x="' + cx + '" y="26" text-anchor="middle" font-size="15" font-weight="700" fill="#16202c">' + gr(titulo) + '</text>' : '') +
    porciones.join('') + rotulos.join('') +
  '</svg>';
}
