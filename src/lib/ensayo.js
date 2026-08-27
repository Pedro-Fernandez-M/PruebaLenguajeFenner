// Convierte un ensayo escrito en Word al modelo de la plataforma.
// Reconoce el formato habitual de las pruebas de comprensión lectora:
//
//   TEXTO 1
//   <título del texto>
//   ...cuerpo del texto...
//   1.- ¿Pregunta?
//   A. Alternativa      B. Alternativa
//   C. Alternativa      D. Alternativa
//
// Lo que no calce queda marcado como incidencia para que el docente lo revise
// en el editor: la idea es ahorrar el retipeo, no adivinar.
import { parrafosDeDocx } from './docx.js';

const RE_ENCABEZADO_TEXTO = /^\s*TEXTO\s*(?:N[°º]?\s*)?(\d+)\s*$/i;
const RE_PREGUNTA = /^\s*(\d{1,2})\s*[.\-—)]+\s*(.*)$/;
const RE_ALTERNATIVA = /(?:^|[\t\s])([A-E])\s*[.)-]\s+/g;

const TIPOS = {
  dramatico: 'Texto dramático',
  poema: 'Poema',
  narracion: 'Narración',
  medios: 'Texto de los medios de comunicación',
  argumentativo: 'Texto de los medios de comunicación con finalidad argumentativa',
};

/**
 * Heurística de tipo de texto a partir de su forma. Es solo un punto de partida:
 * el tipo se muestra en el editor para que el docente lo confirme o lo cambie.
 */
function adivinarTipo(cuerpo) {
  const lineas = cuerpo.split('\n').filter((l) => l.trim());
  if (!lineas.length) return TIPOS.narracion;

  const encabezado = lineas.slice(0, 3).join(' ');

  // Columnas de opinión: medio de comunicación con finalidad argumentativa.
  if (/\bOPINI[ÓO]N\b|\bCOLUMNA\b|\bEDITORIAL\b/i.test(encabezado)) return TIPOS.argumentativo;

  // Texto dramático: varias líneas que abren con el nombre del personaje en mayúsculas.
  const conAcotacion = lineas.filter((l) => /^[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s]{1,20}[.\-—]/.test(l.trim())).length;
  if (conAcotacion >= 3) return TIPOS.dramatico;

  // Poema: predominio de versos cortos.
  const cortas = lineas.filter((l) => l.trim().length < 60).length;
  const promedio = lineas.reduce((s, l) => s + l.length, 0) / lineas.length;
  if (cortas / lineas.length > 0.75 && promedio < 55) return TIPOS.poema;

  // Nota de prensa: titular en mayúsculas o mención explícita de la fuente.
  const titularMayusculas = /^[^a-záéíóúñ]{15,}$/.test(lineas[0].trim());
  if (titularMayusculas || /\b(Fuente|Recuperado de|Extra[íi]do de)\s*:/i.test(cuerpo)) return TIPOS.medios;

  return TIPOS.narracion;
}

function extraerAlternativas(bloque) {
  const texto = bloque.replace(/\n/g, ' \t ');
  const marcas = [...texto.matchAll(RE_ALTERNATIVA)];
  if (marcas.length < 2) return null;

  const opciones = {};
  for (let i = 0; i < marcas.length; i++) {
    const letra = marcas[i][1];
    const desde = marcas[i].index + marcas[i][0].length;
    const hasta = i + 1 < marcas.length ? marcas[i + 1].index : texto.length;
    const contenido = texto.slice(desde, hasta).replace(/[\t\s]+/g, ' ').trim();
    // Si una letra aparece dos veces gana la primera aparición.
    if (!opciones[letra]) opciones[letra] = contenido;
  }
  return opciones;
}

/**
 * @returns {{ textos: Array, preguntas: Array, incidencias: string[] }}
 */
export function convertirEnsayo(buffer) {
  const parrafos = parrafosDeDocx(buffer);

  const textos = [];
  const preguntas = [];
  const incidencias = [];

  let textoActual = null;
  let acumuladoTexto = [];
  let preguntaActual = null;
  let acumuladoPregunta = [];
  let esperandoTitulo = false;

  // Se cierra una sola vez por texto: el cuerpo es todo lo que va entre el
  // encabezado "TEXTO n" y la primera pregunta.
  const cerrarTexto = () => {
    if (!textoActual || textoActual.cerrado) return;
    const cuerpo = acumuladoTexto.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    textoActual.contenido = cuerpo;
    textoActual.tipo_texto = adivinarTipo(cuerpo);
    textoActual.cerrado = true;
    if (!cuerpo) incidencias.push(textoActual.titulo + ': quedó sin contenido, hay que pegarlo a mano.');
    acumuladoTexto = [];
  };

  const cerrarPregunta = () => {
    if (!preguntaActual) return;
    const bloque = acumuladoPregunta.join('\n');
    const opciones = extraerAlternativas(bloque);

    if (!opciones) {
      preguntaActual.tipo = 'desarrollo';
      preguntaActual.opciones = [];
      incidencias.push('Pregunta ' + preguntaActual.numero + ': no se reconocieron alternativas, quedó como pregunta de desarrollo.');
    } else {
      const faltantes = ['A', 'B', 'C', 'D'].filter((l) => !opciones[l]);
      if (faltantes.length) {
        incidencias.push('Pregunta ' + preguntaActual.numero + ': faltan las alternativas ' + faltantes.join(', ') + '.');
      }
      preguntaActual.opciones = ['A', 'B', 'C', 'D', 'E'].map((letra) => ({ letra, contenido: opciones[letra] || '' }));
    }

    preguntas.push(preguntaActual);
    preguntaActual = null;
    acumuladoPregunta = [];
  };

  for (const parrafo of parrafos) {
    const linea = parrafo.replace(/\t/g, '\t').trimEnd();
    const limpia = linea.trim();

    const encabezado = limpia.match(RE_ENCABEZADO_TEXTO);
    if (encabezado) {
      cerrarPregunta();
      cerrarTexto();
      textoActual = {
        orden: textos.length + 1,
        titulo: 'Texto ' + encabezado[1],
        autor: '',
        tipo_texto: TIPOS.narracion,
        contenido: '',
        cerrado: false,
      };
      textos.push(textoActual);
      esperandoTitulo = true;
      continue;
    }

    // La primera línea con contenido tras el encabezado se usa como título.
    if (esperandoTitulo && limpia) {
      textoActual.titulo = 'Texto ' + textos.length + ' — ' + limpia.slice(0, 80);
      esperandoTitulo = false;
      acumuladoTexto.push(linea);
      continue;
    }

    const pregunta = limpia.match(RE_PREGUNTA);
    // Solo se acepta como pregunta si el número es plausible y la línea parece un enunciado.
    const pareceEnunciado = pregunta && pregunta[2].length > 8 && /[¿?]|\bcuál\b|\bqué\b|\bpor qué\b/i.test(pregunta[2]);

    if (pareceEnunciado) {
      cerrarPregunta();
      if (textoActual) cerrarTexto();
      preguntaActual = {
        numero: Number(pregunta[1]),
        tipo: 'alternativas',
        enunciado: pregunta[2].trim(),
        texto_indice: textos.length ? textos.length - 1 : null,
        eje: '',
        oa: '',
        indicador: '',
        clave: null,
      };
      continue;
    }

    if (preguntaActual) acumuladoPregunta.push(linea);
    else if (textoActual) acumuladoTexto.push(linea);
  }

  cerrarPregunta();
  cerrarTexto();

  for (const t of textos) delete t.cerrado;

  // Los números deben quedar correlativos para la plataforma.
  preguntas.sort((a, b) => a.numero - b.numero);
  const vistos = new Set();
  for (const p of preguntas) {
    if (vistos.has(p.numero)) incidencias.push('El número de pregunta ' + p.numero + ' aparece repetido.');
    vistos.add(p.numero);
  }

  incidencias.unshift(
    'Ninguna pregunta trae marcada la alternativa correcta: el .docx es la versión del estudiante. ' +
    'Debes marcar la clave de cada pregunta en el editor antes de publicar.'
  );

  return { textos, preguntas, incidencias };
}
