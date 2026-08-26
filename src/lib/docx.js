// Lector de .docx sin dependencias: el archivo es un ZIP con XML adentro.
// Se reutiliza el descompresor de xlsx.js y se extraen los párrafos en orden,
// que es lo único que necesita el importador de ensayos.
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

/** Devuelve los párrafos del documento como texto plano, en orden de lectura. */
export function parrafosDeDocx(buffer) {
  const leer = abrirZip(buffer);
  const xml = (leer('word/document.xml') || Buffer.alloc(0)).toString('utf8');

  return [...xml.matchAll(/<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g)]
    .map((m) => {
      let cuerpo = m[1];
      // Los tabuladores separan columnas de alternativas: se conservan.
      cuerpo = cuerpo.replace(/<w:tab\b[^>]*\/>/g, '\t');
      cuerpo = cuerpo.replace(/<w:br\b[^>]*\/>/g, '\n');
      const partes = [...cuerpo.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map((t) => desescapar(t[1]));
      // El texto de w:t va intercalado con los tabuladores ya convertidos.
      const soloTexto = partes.join('');
      const tabs = (cuerpo.match(/\t/g) || []).length;
      return tabs && soloTexto ? reconstruirConTabs(cuerpo) : soloTexto;
    })
    .map((p) => p.replace(/ /g, ' ').replace(/[ \t]+$/g, ''))
    .filter((p, i, todos) => p.trim() !== '' || (todos[i - 1] || '').trim() !== '');
}

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
