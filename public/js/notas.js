// Calificacion en la escala chilena de 1,0 a 7,0.
//
// Vive en public/ y no en src/lib/ para que el servidor y el navegador usen el
// MISMO archivo: el editor muestra la tabla de puntaje a nota mientras la
// profesora escribe la escala, y el informe la calcula despues. Con dos copias
// de la formula, la vista previa y la nota real terminarian discrepando.
// No hay nada reservado aqui: la escala se le entrega impresa al curso.
//
// La nota no se guarda: se calcula a partir del puntaje cada vez que se pide.
// Asi, si la profesora corrige una clave o ajusta la escala, todas las notas
// quedan al dia sin tener que recorrer los intentos uno por uno.
//
// La escala se define con TRES anclajes de puntaje, que es como se piensa en la
// sala: cuantos puntos valen un 7,0, cuantos un 4,0 y cuantos un 1,0. Entre esos
// puntos la nota se interpola en linea recta, con un quiebre en el 4,0. Ese
// quiebre es lo que distingue esta escala de una regla de tres: permite que el
// 4,0 este al 60 % de exigencia sin que el 7,0 deje de ser el puntaje total.

export const NOTA_MIN = 1;
export const NOTA_APROBACION = 4;
export const NOTA_MAX = 7;

/** Exigencia habitual en Chile: el 4,0 se alcanza con el 60 % del puntaje. */
export const EXIGENCIA_POR_DEFECTO = 0.6;

// Ojo con Number(null): devuelve 0, no NaN. Como la base guarda NULL para
// "automático", sin este descarte previo un anclaje sin fijar se leeria como un
// puntaje de cero y la escala entera saldria mal.
const numero = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const redondear = (n) => Math.round(n * 10) / 10;

/**
 * Arma la escala de una prueba, completando lo que la profesora no fijo.
 *
 * El puntaje del 7,0 se deja en automatico a proposito: mientras la prueba se
 * escribe, cada pregunta nueva cambia el total, y un valor fijo puesto al
 * principio quedaria desfasado sin que nada lo advirtiera.
 *
 * @param prueba          fila de `pruebas`
 * @param puntajeMaximo   suma de los puntajes de las preguntas, hoy
 */
export function escalaDeNotas(prueba, puntajeMaximo) {
  const total = Math.max(0, numero(puntajeMaximo) ?? 0);

  const p7 = numero(prueba?.nota_puntaje_7) ?? total;
  const p1 = numero(prueba?.nota_puntaje_1) ?? 0;
  const p4 = numero(prueba?.nota_puntaje_4) ?? redondear(p7 * EXIGENCIA_POR_DEFECTO);

  // Una escala mal ordenada daria notas sin sentido (o divisiones por cero), asi
  // que se marca invalida y no se califica: mejor sin nota que con una inventada.
  const valida = total > 0 && p1 >= 0 && p1 < p4 && p4 < p7;

  return {
    activa: !!prueba?.nota_activa && valida,
    valida,
    puntaje_maximo: total,
    puntaje_1: p1,
    puntaje_4: p4,
    puntaje_7: p7,
    // Porcentaje del puntaje del 7,0 con el que se alcanza el 4,0.
    exigencia: p7 > 0 ? redondear((p4 / p7) * 100) : 0,
    automatico_7: numero(prueba?.nota_puntaje_7) === null,
    automatico_4: numero(prueba?.nota_puntaje_4) === null,
    automatico_1: numero(prueba?.nota_puntaje_1) === null,
  };
}

/**
 * Nota que corresponde a un puntaje, con un decimal.
 * Devuelve null si la escala no sirve o el puntaje no es un numero.
 */
export function calcularNota(puntaje, escala) {
  if (!escala || !escala.valida) return null;
  const p = numero(puntaje);
  if (p === null) return null;

  const { puntaje_1: p1, puntaje_4: p4, puntaje_7: p7 } = escala;

  if (p <= p1) return NOTA_MIN;
  if (p >= p7) return NOTA_MAX;

  const nota = p >= p4
    ? NOTA_APROBACION + ((NOTA_MAX - NOTA_APROBACION) * (p - p4)) / (p7 - p4)
    : NOTA_MIN + ((NOTA_APROBACION - NOTA_MIN) * (p - p1)) / (p4 - p1);

  return redondear(nota);
}

export const aprobada = (nota) => nota !== null && nota >= NOTA_APROBACION;

/** Promedio de un conjunto de notas, con un decimal. Ignora las que faltan. */
export function promedioDeNotas(notas) {
  const validas = notas.filter((n) => n !== null && n !== undefined);
  if (!validas.length) return null;
  return redondear(validas.reduce((s, n) => s + n, 0) / validas.length);
}

/**
 * Valida los anclajes que llegan del formulario, antes de guardarlos.
 *
 * Solo compara los que vinieron con un valor: dejar uno en automatico es
 * legitimo, y una prueba recien creada todavia no tiene preguntas, asi que
 * exigir aqui una escala completa impediria crearla. Lo que no cuadre despues
 * lo detecta escalaDeNotas() y la prueba simplemente no se califica.
 *
 * Devuelve { ok } o { ok: false, error } con el motivo en palabras.
 */
export function validarEscala({ puntaje_1, puntaje_4, puntaje_7 }) {
  const p1 = numero(puntaje_1);
  const p4 = numero(puntaje_4);
  const p7 = numero(puntaje_7);

  for (const [valor, nombre] of [[p1, '1,0'], [p4, '4,0'], [p7, '7,0']]) {
    if (valor !== null && valor < 0) {
      return { ok: false, error: 'El puntaje del ' + nombre + ' no puede ser negativo.' };
    }
  }

  if (p1 !== null && p4 !== null && !(p1 < p4)) {
    return { ok: false, error: 'El puntaje del 4,0 tiene que ser mayor que el del 1,0.' };
  }
  if (p4 !== null && p7 !== null && !(p4 < p7)) {
    return { ok: false, error: 'El puntaje del 7,0 tiene que ser mayor que el del 4,0.' };
  }
  if (p1 !== null && p7 !== null && !(p1 < p7)) {
    return { ok: false, error: 'El puntaje del 7,0 tiene que ser mayor que el del 1,0.' };
  }

  return { ok: true };
}
