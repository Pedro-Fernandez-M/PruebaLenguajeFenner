// Lector minimo de archivos .xlsx sin dependencias externas.
// Un .xlsx es un ZIP con XML adentro: aqui se descomprime el ZIP a mano y se
// leen sharedStrings + las hojas. Alcanza para importar nominas de alumnos y
// evita agregar una libreria pesada que ademas complicaria el paso a Vercel.
import zlib from 'node:zlib';

function leerZip(buffer) {
  // Localizar el End Of Central Directory (firma 0x06054b50) desde el final.
  let eocd = -1;
  for (let i = buffer.length - 22; i >= 0 && i > buffer.length - 66000; i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('El archivo no parece un .xlsx válido (no se encontró el índice del ZIP).');

  const totalEntradas = buffer.readUInt16LE(eocd + 10);
  let puntero = buffer.readUInt32LE(eocd + 16);
  const entradas = new Map();

  for (let n = 0; n < totalEntradas; n++) {
    if (buffer.readUInt32LE(puntero) !== 0x02014b50) break;
    const metodo = buffer.readUInt16LE(puntero + 10);
    const largoComprimido = buffer.readUInt32LE(puntero + 20);
    const largoNombre = buffer.readUInt16LE(puntero + 28);
    const largoExtra = buffer.readUInt16LE(puntero + 30);
    const largoComentario = buffer.readUInt16LE(puntero + 32);
    const offsetLocal = buffer.readUInt32LE(puntero + 42);
    const nombre = buffer.toString('utf8', puntero + 46, puntero + 46 + largoNombre);
    entradas.set(nombre, { metodo, largoComprimido, offsetLocal });
    puntero += 46 + largoNombre + largoExtra + largoComentario;
  }

  return {
    nombres: [...entradas.keys()],
    leer(nombre) {
      const e = entradas.get(nombre);
      if (!e) return null;
      const largoNombre = buffer.readUInt16LE(e.offsetLocal + 26);
      const largoExtra = buffer.readUInt16LE(e.offsetLocal + 28);
      const inicio = e.offsetLocal + 30 + largoNombre + largoExtra;
      const crudo = buffer.subarray(inicio, inicio + e.largoComprimido);
      if (e.metodo === 0) return crudo;
      if (e.metodo === 8) return zlib.inflateRawSync(crudo);
      throw new Error('Método de compresión ZIP no soportado: ' + e.metodo);
    },
  };
}

const ENTIDADES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" };

function desescapar(texto) {
  return texto
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&(amp|lt|gt|quot|apos);/g, (m) => ENTIDADES[m]);
}

function textoDeNodo(xml) {
  // Concatena todos los <t>...</t>: cubre celdas con formato mixto (runs).
  const partes = [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => desescapar(m[1]));
  return partes.join('');
}

function columnaANumero(ref) {
  const letras = (ref.match(/^[A-Z]+/) || [''])[0];
  let n = 0;
  for (const c of letras) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
}

/**
 * Devuelve [{ nombre, filas: string[][] }] con el contenido de cada hoja.
 * Los valores se entregan como texto ya normalizado.
 */
export function leerXlsx(buffer) {
  const zip = leerZip(buffer);

  const cadenas = [];
  const bufCadenas = zip.leer('xl/sharedStrings.xml');
  if (bufCadenas) {
    const xml = bufCadenas.toString('utf8');
    for (const m of xml.matchAll(/<si>([\s\S]*?)<\/si>/g)) cadenas.push(textoDeNodo(m[1]));
  }

  const relaciones = new Map();
  const bufRels = zip.leer('xl/_rels/workbook.xml.rels');
  if (bufRels) {
    const xml = bufRels.toString('utf8');
    for (const m of xml.matchAll(/<Relationship\b[^>]*>/g)) {
      const id = (m[0].match(/Id="([^"]+)"/) || [])[1];
      const destino = (m[0].match(/Target="([^"]+)"/) || [])[1];
      if (id && destino) relaciones.set(id, destino.replace(/^\/?xl\//, '').replace(/^\.\//, ''));
    }
  }

  const hojas = [];
  const bufLibro = zip.leer('xl/workbook.xml');
  if (!bufLibro) throw new Error('El archivo .xlsx no contiene xl/workbook.xml');
  const xmlLibro = bufLibro.toString('utf8');

  let indice = 0;
  for (const m of xmlLibro.matchAll(/<sheet\b[^>]*>/g)) {
    indice += 1;
    const nombre = desescapar((m[0].match(/name="([^"]*)"/) || ['', 'Hoja' + indice])[1]);
    const rid = (m[0].match(/r:id="([^"]+)"/) || [])[1];
    const ruta = 'xl/' + (relaciones.get(rid) || 'worksheets/sheet' + indice + '.xml');
    const bufHoja = zip.leer(ruta) || zip.leer('xl/worksheets/sheet' + indice + '.xml');
    if (!bufHoja) continue;

    const xmlHoja = bufHoja.toString('utf8');
    const filas = [];

    for (const fm of xmlHoja.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      const fila = [];
      for (const cm of fm[1].matchAll(/<c\b([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const atributos = cm[1] || '';
        const cuerpo = cm[2] || '';
        const ref = (atributos.match(/r="([A-Z]+\d+)"/) || [])[1];
        const tipo = (atributos.match(/t="([^"]+)"/) || [])[1];
        let valor = '';

        if (tipo === 's') {
          const idx = parseInt((cuerpo.match(/<v>([\s\S]*?)<\/v>/) || [])[1] || '-1', 10);
          valor = cadenas[idx] ?? '';
        } else if (tipo === 'inlineStr') {
          valor = textoDeNodo(cuerpo);
        } else {
          const v = (cuerpo.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
          valor = v == null ? '' : desescapar(v);
        }

        const col = ref ? columnaANumero(ref) : fila.length;
        while (fila.length < col) fila.push('');
        fila[col] = String(valor).trim();
      }
      filas.push(fila);
    }

    hojas.push({ nombre, filas });
  }

  return hojas;
}
