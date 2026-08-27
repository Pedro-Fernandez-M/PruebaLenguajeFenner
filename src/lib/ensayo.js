// Convierte un ensayo escrito en Word al modelo de la plataforma.
//
// Las pruebas de comprensión lectora del liceo vienen en varios formatos y todos
// se aceptan, porque exigir uno solo obligaría a reescribir documentos que ya
// existen:
//
//   TEXTO 1              TEXTO 1:            Lee el siguiente texto y responde
//   1) ¿Pregunta?        1.- ¿Pregunta?      las preguntas 1 a la 5:
//   A. Alternativa       a) Alternativa      1. ¿Pregunta?
//
// Si el documento es la versión del docente, la alternativa correcta suele venir
// pintada de otro color o resaltada: de ahí se saca la clave.
//
// Lo que no calce queda marcado como incidencia para que el docente lo revise en
// el editor: la idea es ahorrar el retipeo, no adivinar.
import { parrafosConFormato } from './docx.js';

// "TEXTO 1", "TEXTO 1:", "TEXTO N° 2 - La verdad"
const RE_ENCABEZADO_TEXTO = /^\s*TEXTO\s*(?:N[°º]?\s*)?(\d+)\s*[:.\-—]?\s*(.*)$/i;

// "Lee el siguiente texto y responde las preguntas 1 a la 5:"
// Debe nombrar las preguntas: sin ese requisito, una instrucción general como
// "Lea los siguientes textos y responda:" abriría un texto vacío.
const RE_ENCABEZADO_LECTURA = /^\s*(?:lee|lea)\b[^.]*\btexto\b[^.]*\bpreguntas?\b/i;

const RE_PREGUNTA = /^\s*(\d{1,2})\s*[.\-—)]+\s*(.*)$/;
// Acepta "A. texto", "a) texto", "a.- texto" y "a.-texto": esta última, sin
// espacio tras el guion, es frecuente en los documentos del liceo y se perdía.
const RE_ALTERNATIVA = /(?:^|[\t\s])([a-eA-E])\s*[.)](?:\s*-\s*|\s+)/g;

const TIPOS = {
  dramatico: 'Texto dramático',
  poema: 'Poema',
  narracion: 'Narración',
  medios: 'Texto de los medios de comunicación',
  argumentativo: 'Texto de los medios de comunicación con finalidad argumentativa',
};

const LETRAS = ['A', 'B', 'C', 'D', 'E'];

/**
 * Heurística de tipo de texto a partir de su forma. Es solo un punto de partida:
 * el tipo se muestra en el editor para que el docente lo confirme o lo cambie.
 */
function adivinarTipo(cuerpo) {
  const lineas = cuerpo.split('\n').filter((l) => l.trim());
  if (!lineas.length) return TIPOS.narracion;

  const encabezado = lineas.slice(0, 3).join(' ');
  if (/\bOPINI[ÓO]N\b|\bCOLUMNA\b|\bEDITORIAL\b|\bCARTA AL DIRECTOR\b/i.test(encabezado)) return TIPOS.argumentativo;

  const conAcotacion = lineas.filter((l) => /^[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s]{1,20}[.\-—]/.test(l.trim())).length;
  if (conAcotacion >= 3) return TIPOS.dramatico;

  const cortas = lineas.filter((l) => l.trim().length < 60).length;
  const promedio = lineas.reduce((s, l) => s + l.length, 0) / lineas.length;
  if (cortas / lineas.length > 0.75 && promedio < 55) return TIPOS.poema;

  const titularMayusculas = /^[^a-záéíóúñ]{15,}$/.test(lineas[0].trim());
  if (titularMayusculas || /\b(Fuente|Recuperado de|Extra[íi]do de)\s*:/i.test(cuerpo)) return TIPOS.medios;

  return TIPOS.narracion;
}

/**
 * Separa las alternativas de un bloque de párrafos.
 * @param {{texto: string, marcado: boolean}[]} lineas
 */
function extraerAlternativas(lineas) {
  const opciones = {};
  let marcada = null;

  for (const linea of lineas) {
    const texto = linea.texto.replace(/\n/g, ' \t ');
    const marcas = [...texto.matchAll(RE_ALTERNATIVA)];
    if (!marcas.length) continue;

    for (let i = 0; i < marcas.length; i++) {
      const letra = marcas[i][1].toUpperCase();
      const desde = marcas[i].index + marcas[i][0].length;
      const hasta = i + 1 < marcas.length ? marcas[i + 1].index : texto.length;
      const contenido = texto.slice(desde, hasta).replace(/[\t\s]+/g, ' ').trim();
      if (!opciones[letra]) opciones[letra] = contenido;

      // Solo sirve como clave si la línea trae UNA alternativa: cuando vienen
      // varias en la misma línea el formato no permite saber a cuál apunta.
      if (linea.marcado && marcas.length === 1) marcada = letra;
    }
  }

  return Object.keys(opciones).length >= 2 ? { opciones, marcada } : null;
}

/**
 * @returns {{ textos: Array, preguntas: Array, incidencias: string[] }}
 */
export function convertirEnsayo(buffer) {
  const parrafos = parrafosConFormato(buffer);

  // El color solo indica la clave si marca a una minoría de las alternativas.
  // En un documento donde todo viene de color, la marca no significa nada.
  const alternativas = parrafos.filter((p) => new RegExp(RE_ALTERNATIVA.source).test(p.texto));
  const coloreadas = alternativas.filter((p) => p.color || p.resaltado);
  const proporcion = alternativas.length ? coloreadas.length / alternativas.length : 0;
  const hayPauta = coloreadas.length >= 3 && proporcion <= 0.45;

  const textos = [];
  const preguntas = [];
  const incidencias = [];
  const omitidas = [];

  let textoActual = null;
  let acumuladoTexto = [];
  let preguntaActual = null;
  let acumuladoPregunta = [];
  let esperandoTitulo = false;

  const abrirTexto = (titulo) => {
    cerrarTexto();
    textoActual = {
      orden: textos.length + 1,
      titulo: titulo || 'Texto ' + (textos.length + 1),
      autor: '',
      tipo_texto: TIPOS.narracion,
      contenido: '',
      cerrado: false,
    };
    textos.push(textoActual);
    acumuladoTexto = [];
  };

  // Se cierra una sola vez por texto: el cuerpo es todo lo que va entre el
  // encabezado y la primera pregunta.
  function cerrarTexto() {
    if (!textoActual || textoActual.cerrado) return;
    // Se unen con línea en blanco para que cada párrafo del Word siga siendo un
    // párrafo al leerlo; si no, el texto le llega al estudiante como un bloque
    // corrido de miles de caracteres.
    const cuerpo = acumuladoTexto.join('\n\n').trim();
    textoActual.contenido = cuerpo;
    textoActual.tipo_texto = adivinarTipo(cuerpo);
    textoActual.cerrado = true;
    if (!cuerpo) incidencias.push(textoActual.titulo + ': quedó sin contenido, hay que pegarlo a mano.');
    acumuladoTexto = [];
  }

  const cerrarPregunta = () => {
    if (!preguntaActual) return;
    const resultado = extraerAlternativas(acumuladoPregunta);

    if (!resultado) {
      // La plataforma solo evalúa preguntas de alternativas. Una sin opciones no
      // se puede corregir ni contar, así que se deja fuera y se avisa cuál fue:
      // colarla vacía daría una prueba que parece completa y no lo está.
      omitidas.push(preguntaActual.numero);
      preguntaActual = null;
      acumuladoPregunta = [];
      return;
    } else {
      const { opciones, marcada } = resultado;
      const faltantes = ['A', 'B', 'C', 'D'].filter((l) => !opciones[l]);
      if (faltantes.length) {
        incidencias.push('Pregunta ' + preguntaActual.numero + ': faltan las alternativas ' + faltantes.join(', ') + '.');
      }
      preguntaActual.opciones = LETRAS.map((letra) => ({ letra, contenido: opciones[letra] || '' }));
      if (hayPauta && marcada) preguntaActual.clave = marcada;
    }

    preguntas.push(preguntaActual);
    preguntaActual = null;
    acumuladoPregunta = [];
  };

  for (const parrafo of parrafos) {
    const limpia = parrafo.texto.trim();

    const encabezado = limpia.match(RE_ENCABEZADO_TEXTO);
    if (encabezado) {
      cerrarPregunta();
      const restoEnLaMismaLinea = encabezado[2].trim();
      abrirTexto(restoEnLaMismaLinea ? 'Texto ' + encabezado[1] + ' — ' + restoEnLaMismaLinea.slice(0, 70) : null);
      esperandoTitulo = !restoEnLaMismaLinea;
      continue;
    }

    if (RE_ENCABEZADO_LECTURA.test(limpia) && limpia.length < 140) {
      cerrarPregunta();
      abrirTexto(null);
      esperandoTitulo = true;
      continue;
    }

    // La primera línea con contenido tras el encabezado se usa como título,
    // salvo que sea ya una pregunta: eso indica que el encabezado no abria un
    // texto nuevo y el bloque quedaria encabezado por un enunciado.
    if (esperandoTitulo && limpia && RE_PREGUNTA.test(limpia) && /[¿?]/.test(limpia)) {
      esperandoTitulo = false;
      textos.pop();
      textoActual = textos[textos.length - 1] || null;
    } else if (esperandoTitulo && limpia) {
      esperandoTitulo = false;
      // Una línea muy larga no es un título sino el comienzo del texto: se deja
      // en el cuerpo y el texto conserva su nombre genérico.
      if (limpia.length <= 120) {
        // El título se muestra aparte como encabezado, así que no se repite en
        // el cuerpo: si no, el estudiante lo lee dos veces seguidas.
        textoActual.titulo = 'Texto ' + textos.length + ' — ' + limpia;
        continue;
      }
      acumuladoTexto.push(limpia);
      continue;
    }

    const pregunta = limpia.match(RE_PREGUNTA);
    const pareceEnunciado = pregunta && pregunta[2].length > 8
      && /[¿?]|\bcuál\b|\bqué\b|\bpor qué\b|\bsegún\b|\bmenciona\b/i.test(pregunta[2]);

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

    if (preguntaActual) acumuladoPregunta.push({ texto: limpia, marcado: !!(parrafo.color || parrafo.resaltado) });
    else if (textoActual) acumuladoTexto.push(limpia);
  }

  cerrarPregunta();
  cerrarTexto();
  for (const t of textos) delete t.cerrado;

  preguntas.sort((a, b) => a.numero - b.numero);
  const vistos = new Set();
  for (const p of preguntas) {
    if (vistos.has(p.numero)) incidencias.push('El número de pregunta ' + p.numero + ' aparece repetido.');
    vistos.add(p.numero);
  }

  if (omitidas.length) {
    incidencias.push(
      'Quedaron fuera ' + omitidas.length + ' pregunta(s) sin alternativas en el documento (N° ' +
      omitidas.join(', ') + '). Si corresponden a la prueba, hay que agregarlas a mano con sus opciones.'
    );
  }

  const conClave = preguntas.filter((p) => p.clave).length;
  if (hayPauta) {
    incidencias.unshift(
      'Se detectó la pauta en el formato del documento: ' + conClave + ' de ' + preguntas.length +
      ' preguntas quedaron con su clave marcada. Conviene revisarlas antes de publicar.'
    );
    const sinClave = preguntas.filter((p) => !p.clave && p.tipo === 'alternativas').map((p) => p.numero);
    if (sinClave.length) {
      incidencias.push('Sin clave detectada: preguntas ' + sinClave.join(', ') + '. Hay que marcarlas a mano.');
    }
  } else {
    incidencias.unshift(
      'Ninguna pregunta trae marcada la alternativa correcta: parece la versión del estudiante. ' +
      'Debes marcar la clave de cada pregunta en el editor antes de publicar.'
    );
  }

  return { textos, preguntas, incidencias };
}
