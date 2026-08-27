// Lector de .docx sin dependencias: el archivo es un ZIP con XML adentro.
// Se descomprime el ZIP a mano y se extraen los párrafos en orden, junto con las
// marcas de formato que hacen falta para interpretar una pauta de corrección.
import zlib from 'node:zlib';

function abrirZip(buffer) {
  let eocd = -1;
  for (let i = buffer.length - 22; i >= 0 && i > buffer.length - 66000; i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('El archivo no parece un .docx válido.');

  const total = buffer.readUInt16LE(eocd + 10);
  let puntero = buffer.readUInt32LE(eocd + 16);
  const entradas = new Map();

  for (let n = 0; n < total; n++) {
    if (buffer.readUInt32LE(puntero) !== 0x02014b50) break;
    const metodo = buffer.readUInt16LE(puntero + 10);
    const comprimido = buffer.readUInt32LE(puntero + 20);
    const largoNombre = buffer.readUInt16LE(puntero + 28);
    const largoExtra = buffer.readUInt16LE(puntero + 30);
    const largoComentario = buffer.readUInt16LE(puntero + 32);
    const offset = buffer.readUInt32LE(puntero + 42);
    entradas.set(buffer.toString('utf8', puntero + 46, puntero + 46 + largoNombre), { metodo, comprimido, offset });
    puntero += 46 + largoNombre + largoExtra + largoComentario;
  }

  return (nombre) => {
    const e = entradas.get(nombre);
    if (!e) return null;
    const ln = buffer.readUInt16LE(e.offset + 26);
    const le = buffer.readUInt16LE(e.offset + 28);
    const inicio = e.offset + 30 + ln + le;
    const crudo = buffer.subarray(inicio, inicio + e.comprimido);
    return e.metodo === 8 ? zlib.inflateRawSync(crudo) : crudo;
  };
}

const ENTIDADES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" };

const desescapar = (t) => t
  .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
  .replace(/&(amp|lt|gt|quot|apos);/g, (m) => ENTIDADES[m]);

// Word usa espacios duros con frecuencia; se normalizan a espacio corriente.
const ESPACIO_DURO = new RegExp(String.fromCharCode(160), 'g');

/** Rearma el párrafo respetando dónde caían los tabuladores entre los w:t. */
function reconstruirConTabs(cuerpo) {
  let salida = '';
  const patron = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|\t/g;
  let m;
  while ((m = patron.exec(cuerpo)) !== null) {
    salida += m[0] === '\t' ? '\t' : desescapar(m[1]);
  }
  return salida;
}

/**
 * Devuelve los párrafos con su texto y las marcas de formato relevantes.
 *
 * Una pauta de corrección en Word suele venir como la alternativa correcta
 * pintada de otro color o resaltada, así que ese dato hay que conservarlo:
 * es la clave de la pregunta.
 *
 * @returns {{ texto: string, color: string, resaltado: boolean, negrita: boolean }[]}
 */
export function parrafosConFormato(buffer) {
  const leer = abrirZip(buffer);
  const xml = (leer('word/document.xml') || Buffer.alloc(0)).toString('utf8');

  return [...xml.matchAll(/<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g)]
    .map((m) => {
      const original = m[1];
      // Los tabuladores separan columnas de alternativas: se conservan.
      const cuerpo = original
        .replace(/<w:tab\b[^>]*\/>/g, '\t')
        .replace(/<w:br\b[^>]*\/>/g, '\n');

      const partes = [...cuerpo.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map((t) => desescapar(t[1]));
      const soloTexto = partes.join('');
      const tabs = (cuerpo.match(/\t/g) || []).length;
      const texto = (tabs && soloTexto ? reconstruirConTabs(cuerpo) : soloTexto)
        .replace(ESPACIO_DURO, ' ')
        .replace(/[ \t]+$/g, '');

      const color = (original.match(/<w:color\s+w:val="([0-9A-Fa-f]{6})"/) || [])[1] || '';

      return {
        texto,
        // El negro es el color por defecto: no marca nada.
        color: /^000000$/i.test(color) ? '' : color.toUpperCase(),
        resaltado: /<w:highlight\s/.test(original),
        negrita: /<w:b\s*\/>|<w:b\s/.test(original),
      };
    })
    .filter((p, i, todos) => p.texto.trim() !== '' || (todos[i - 1]?.texto || '').trim() !== '');
}

/** Devuelve los párrafos del documento como texto plano, en orden de lectura. */
export function parrafosDeDocx(buffer) {
  return parrafosConFormato(buffer).map((p) => p.texto);
}
