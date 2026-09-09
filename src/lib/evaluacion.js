// Correccion y calculo de informes. Replica la logica del DIA:
//  - preguntas de alternativas: correcta / incorrecta / N (no responde)
//  - preguntas de desarrollo: codigo 2 (correcta), 1 (parcial), 0 (incorrecta)
//  - niveles de logro I / II / III segun umbrales configurables por prueba
import * as db from '../db/index.js';
import { escalaDeNotas, calcularNota, promedioDeNotas, aprobada } from '../../public/js/notas.js';

// Cada pregunta declara UN criterio, que es lo que agrupa el informe. La lista
// ya no es fija: cada docente arma la suya (tabla `criterios`), porque las
// pruebas cambian de un ano a otro. Aqui solo se usa el nombre que quedo
// guardado en la pregunta.

// Como responde el alumno cada pregunta:
//   alternativas  la marca en pantalla y se corrige sola contra la clave
//   papel         la escribe en la hoja impresa; no aparece en pantalla y la
//                 corrige la docente, que anota el puntaje obtenido
export const TIPOS_PREGUNTA = ['alternativas', 'papel'];

export const esDePapel = (pregunta) => pregunta.tipo === 'papel';

// Las pruebas de comprension lectora usan 4 o 5 alternativas segun el caso.
// Se admiten hasta cinco: las que queden vacias no se muestran al estudiante
// ni aparecen en el informe, asi que ambos formatos conviven sin configurar nada.
export const LETRAS = ['A', 'B', 'C', 'D', 'E'];


/** Deja el puntaje de una correccion dentro de lo que vale la pregunta. */
export function puntajeValido(valor, puntajeMaximo) {
  const n = Number(valor);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(puntajeMaximo, Math.round(n * 100) / 100));
}

export function nivelDeLogro(porcentaje, nivel2Min, nivel3Min) {
  if (porcentaje >= nivel3Min) return 3;
  if (porcentaje >= nivel2Min) return 2;
  return 1;
}

export const NOMBRE_NIVEL = {
  1: 'Nivel I — no logra los aprendizajes mínimos',
  2: 'Nivel II — logra parcialmente los OA',
  3: 'Nivel III — logra satisfactoriamente los OA',
};

/**
 * Corrige un intento completo y actualiza sus totales.
 * Las preguntas de alternativas se corrigen solas; las de desarrollo solo suman
 * una vez que el profesor asigno el codigo de rubrica. Las respuestas de
 * desarrollo en blanco se marcan codigo 0, tal como indica la pauta del DIA.
 */
export async function recalcularIntento(intentoId) {
  const intento = await db.get('SELECT * FROM intentos WHERE id = ?', [intentoId]);
  if (!intento) return null;
  const prueba = await db.get('SELECT * FROM pruebas WHERE id = ?', [intento.prueba_id]);
  const preguntas = await db.all('SELECT * FROM preguntas WHERE prueba_id = ? ORDER BY numero', [intento.prueba_id]);
  const respuestas = await db.all('SELECT * FROM respuestas WHERE intento_id = ?', [intentoId]);
  const porPregunta = new Map(respuestas.map((r) => [r.pregunta_id, r]));

  let obtenido = 0;
  let maximo = 0;
  let pendientes = 0;

  for (const pregunta of preguntas) {
    maximo += pregunta.puntaje;
    const respuesta = porPregunta.get(pregunta.id);

    if (!esDePapel(pregunta)) {
      const acierto = !!(respuesta && respuesta.alternativa && respuesta.alternativa === pregunta.clave);
      const puntaje = acierto ? pregunta.puntaje : 0;
      obtenido += puntaje;
      if (respuesta) {
        await db.run('UPDATE respuestas SET puntaje = ?, corregida = 1 WHERE id = ?', [puntaje, respuesta.id]);
      }
      continue;
    }

    // Pregunta en papel: el alumno no la responde en pantalla, asi que aqui no
    // hay nada que corregir solo. Suma unicamente lo que la docente ya anoto;
    // mientras no lo haga, cuenta como pendiente y NO como cero, para que el
    // informe pueda avisar en vez de mostrar notas bajas inventadas.
    if (respuesta && respuesta.corregida && respuesta.puntaje !== null && respuesta.puntaje !== undefined) {
      obtenido += respuesta.puntaje;
    } else {
      pendientes += 1;
    }
  }

  const porcentaje = maximo > 0 ? Math.round((obtenido / maximo) * 1000) / 10 : 0;
  const nivel = nivelDeLogro(porcentaje, prueba.nivel2_min, prueba.nivel3_min);

  await db.run(
    'UPDATE intentos SET puntaje = ?, puntaje_max = ?, porcentaje = ?, nivel_logro = ? WHERE id = ?',
    [obtenido, maximo, porcentaje, nivel, intentoId]
  );

  return { obtenido, maximo, porcentaje, nivel, pendientes };
}

const pct = (parte, total) => (total > 0 ? Math.round((parte / total) * 1000) / 10 : 0);

/**
 * Informe de curso equivalente al que entrega la plataforma del DIA:
 * niveles de logro, porcentaje por eje de habilidad, detalle por pregunta con
 * distribucion de distractores y resultado por estudiante.
 */
export async function informeDePrueba(pruebaId, filtroCurso = '') {
  const prueba = await db.get('SELECT * FROM pruebas WHERE id = ?', [pruebaId]);
  if (!prueba) return null;

  const preguntas = await db.all(
    'SELECT * FROM preguntas WHERE prueba_id = ? ORDER BY numero',
    [pruebaId]
  );
  const opciones = await db.all(
    'SELECT o.* FROM opciones o JOIN preguntas p ON p.id = o.pregunta_id WHERE p.prueba_id = ? ORDER BY o.letra',
    [pruebaId]
  );

  const params = [pruebaId];
  let sqlCurso = '';
  if (filtroCurso) {
    sqlCurso = ' AND a.curso = ?';
    params.push(filtroCurso);
  }

  const intentos = await db.all(
    'SELECT i.*, a.nombre, a.curso, a.matricula, a.codigo FROM intentos i ' +
      'JOIN alumnos a ON a.id = i.alumno_id ' +
      "WHERE i.prueba_id = ? AND i.estado = 'enviado'" + sqlCurso +
      ' ORDER BY a.curso, a.nombre',
    params
  );

  const totalAlumnos = intentos.length;
  const idsIntentos = intentos.map((i) => i.id);

  let respuestas = [];
  if (idsIntentos.length) {
    const marcadores = idsIntentos.map(() => '?').join(',');
    respuestas = await db.all(
      'SELECT * FROM respuestas WHERE intento_id IN (' + marcadores + ')',
      idsIntentos
    );
  }

  const respuestasPorPregunta = new Map();
  for (const r of respuestas) {
    if (!respuestasPorPregunta.has(r.pregunta_id)) respuestasPorPregunta.set(r.pregunta_id, []);
    respuestasPorPregunta.get(r.pregunta_id).push(r);
  }

  // 1. Distribucion de estudiantes segun nivel de logro
  const niveles = { 1: 0, 2: 0, 3: 0 };
  for (const i of intentos) niveles[i.nivel_logro || 1] += 1;
  const distribucionNiveles = [1, 2, 3].map((n) => ({
    nivel: n,
    etiqueta: ['', 'Nivel I', 'Nivel II', 'Nivel III'][n],
    descripcion: NOMBRE_NIVEL[n],
    cantidad: niveles[n],
    porcentaje: pct(niveles[n], totalAlumnos),
  }));

  // 2. Logro por eje de habilidad y por tipo de texto
  const acumuladoEje = new Map();
  const sumar = (mapa, clave, obtenido, maximo) => {
    if (!clave) return;
    const actual = mapa.get(clave) || { obtenido: 0, maximo: 0 };
    actual.obtenido += obtenido;
    actual.maximo += maximo;
    mapa.set(clave, actual);
  };

  // 3. Detalle por pregunta
  const detallePreguntas = [];

  for (const pregunta of preguntas) {
    const lista = respuestasPorPregunta.get(pregunta.id) || [];
    const opcionesPregunta = opciones.filter((o) => o.pregunta_id === pregunta.id);

    let obtenidoPregunta = 0;
    const maximoPregunta = pregunta.puntaje * totalAlumnos;

    const fila = {
      id: pregunta.id,
      numero: pregunta.numero,
      tipo: pregunta.tipo,
      oa: pregunta.oa,
      eje: pregunta.eje,
      indicador: pregunta.indicador,
      enunciado: pregunta.enunciado,
      clave: pregunta.clave,
      puntaje: pregunta.puntaje,
      total: totalAlumnos,
      pendientes: 0,
    };

    if (!esDePapel(pregunta)) {
      const conteo = { A: 0, B: 0, C: 0, D: 0, E: 0, N: 0 };
      for (const r of lista) {
        if (r.alternativa && conteo[r.alternativa] !== undefined) conteo[r.alternativa] += 1;
        else conteo.N += 1;
      }
      conteo.N += totalAlumnos - lista.length;
      obtenidoPregunta = (conteo[pregunta.clave] || 0) * pregunta.puntaje;

      // Solo se listan las alternativas que la pregunta realmente usa; incluir
      // una E vacia con 0% seria ruido en el informe.
      const letrasEnUso = LETRAS.filter((letra) => {
        const o = opcionesPregunta.find((x) => x.letra === letra);
        return (o && String(o.contenido || '').trim()) || letra === pregunta.clave || conteo[letra] > 0;
      });

      fila.distribucion = letrasEnUso.map((letra) => ({
        letra,
        contenido: (opcionesPregunta.find((o) => o.letra === letra) || {}).contenido || '',
        cantidad: conteo[letra],
        porcentaje: pct(conteo[letra], totalAlumnos),
        correcta: letra === pregunta.clave,
      }));
      fila.distribucion.push({
        letra: 'N',
        contenido: 'No responde / nulo',
        cantidad: conteo.N,
        porcentaje: pct(conteo.N, totalAlumnos),
        correcta: false,
      });
      fila.correctas = conteo[pregunta.clave] || 0;
    } else {
      // Pregunta en papel. Aqui no hay alternativas que repartir: lo que
      // interesa es cuantos la tienen corregida, con cuanto puntaje, y cuantas
      // quedan por revisar.
      const corregidas = lista.filter((r) => r.corregida && r.puntaje !== null && r.puntaje !== undefined);
      const sinCorregir = totalAlumnos - corregidas.length;

      obtenidoPregunta = corregidas.reduce((s, r) => s + r.puntaje, 0);

      const completo = corregidas.filter((r) => r.puntaje >= pregunta.puntaje).length;
      const parcial = corregidas.filter((r) => r.puntaje > 0 && r.puntaje < pregunta.puntaje).length;
      const cero = corregidas.filter((r) => r.puntaje === 0).length;

      fila.distribucion = [
        { letra: 'C', contenido: 'Correcta (puntaje completo)', cantidad: completo, porcentaje: pct(completo, totalAlumnos), correcta: true },
        { letra: 'P', contenido: 'Puntaje parcial', cantidad: parcial, porcentaje: pct(parcial, totalAlumnos), correcta: false },
        { letra: 'I', contenido: 'Incorrecta (cero puntos)', cantidad: cero, porcentaje: pct(cero, totalAlumnos), correcta: false },
        { letra: 'N', contenido: 'Sin corregir', cantidad: sinCorregir, porcentaje: pct(sinCorregir, totalAlumnos), correcta: false },
      ];
      fila.correctas = completo;
      fila.pendientes = sinCorregir;
      fila.corregidas = corregidas.length;
      // El logro se mide sobre lo YA corregido: con la mitad del curso sin
      // revisar, dividir por el curso completo daria un porcentaje que parece
      // un mal resultado cuando en realidad es trabajo a medio hacer.
      fila.logro = pct(obtenidoPregunta, pregunta.puntaje * corregidas.length);
      sumar(acumuladoEje, pregunta.eje, obtenidoPregunta, pregunta.puntaje * corregidas.length);
      detallePreguntas.push(fila);
      continue;
    }

    fila.logro = pct(obtenidoPregunta, maximoPregunta);
    sumar(acumuladoEje, pregunta.eje, obtenidoPregunta, maximoPregunta);
    detallePreguntas.push(fila);
  }

  // Los criterios se listan en el orden en que aparecen en la prueba (las
  // preguntas vienen ordenadas por numero). Antes el orden lo daba una lista
  // fija de tres; ahora cada docente arma la suya y ese orden ya no existe.
  const clavesEje = [];
  for (const p of preguntas) {
    if (p.eje && acumuladoEje.has(p.eje) && !clavesEje.includes(p.eje)) clavesEje.push(p.eje);
  }

  const porEje = clavesEje.map((eje) => {
    const a = acumuladoEje.get(eje);
    return {
      eje,
      porcentaje: pct(a.obtenido, a.maximo),
      preguntas: preguntas.filter((p) => p.eje === eje).length,
    };
  });

  // 4. Resultados por estudiante
  //
  // La nota se calcula aqui y no se guarda: la escala vive en la prueba, asi que
  // corregir una clave o mover el puntaje del 4,0 actualiza todas las notas sin
  // tener que recorrer los intentos.
  const escala = escalaDeNotas(prueba, preguntas.reduce((s, p) => s + p.puntaje, 0));

  const porAlumno = intentos.map((i) => ({
    intento_id: i.id,
    alumno_id: i.alumno_id,
    nombre: i.nombre,
    curso: i.curso,
    matricula: i.matricula,
    puntaje: i.puntaje,
    puntaje_max: i.puntaje_max,
    porcentaje: i.porcentaje,
    nivel_logro: i.nivel_logro,
    nota: escala.activa ? calcularNota(i.puntaje, escala) : null,
    enviado_en: i.enviado_en,
  }));

  // Desglose por curso: una prueba suele rendirla mas de un curso y el equipo
  // necesita compararlos sin volver a filtrar y mirar de a uno.
  const porCurso = [];
  const cursosPresentes = [...new Set(intentos.map((i) => i.curso).filter(Boolean))].sort();

  for (const curso of cursosPresentes) {
    const suyos = porAlumno.filter((a) => a.curso === curso);
    const niveles = { 1: 0, 2: 0, 3: 0 };
    for (const a of suyos) niveles[a.nivel_logro || 1] += 1;

    // El logro por habilidad se recalcula sobre las respuestas de este curso.
    const idsCurso = new Set(intentos.filter((i) => i.curso === curso).map((i) => i.id));
    const acumulado = new Map();

    for (const pregunta of preguntas) {
      if (!pregunta.eje) continue;
      const lista = (respuestasPorPregunta.get(pregunta.id) || []).filter((r) => idsCurso.has(r.intento_id));
      const a = acumulado.get(pregunta.eje) || { obtenido: 0, maximo: 0 };

      if (esDePapel(pregunta)) {
        // Igual que en el detalle por pregunta: solo cuentan las ya corregidas,
        // para no confundir "sin revisar" con "mal respondida".
        const corregidas = lista.filter((r) => r.corregida && r.puntaje !== null && r.puntaje !== undefined);
        a.obtenido += corregidas.reduce((s, r) => s + r.puntaje, 0);
        a.maximo += pregunta.puntaje * corregidas.length;
      } else {
        const aciertos = lista.filter((r) => r.alternativa && r.alternativa === pregunta.clave).length;
        a.obtenido += aciertos * pregunta.puntaje;
        a.maximo += pregunta.puntaje * suyos.length;
      }

      acumulado.set(pregunta.eje, a);
    }

    const aprobadosCurso = suyos.filter((a) => aprobada(a.nota)).length;

    porCurso.push({
      curso,
      total: suyos.length,
      promedio: suyos.length
        ? Math.round((suyos.reduce((n, a) => n + (a.porcentaje || 0), 0) / suyos.length) * 10) / 10
        : 0,
      promedio_nota: escala.activa ? promedioDeNotas(suyos.map((a) => a.nota)) : null,
      aprobados: aprobadosCurso,
      porcentaje_aprobacion: escala.activa ? pct(aprobadosCurso, suyos.length) : null,
      niveles: [1, 2, 3].map((n) => ({
        nivel: n,
        etiqueta: ['', 'Nivel I', 'Nivel II', 'Nivel III'][n],
        cantidad: niveles[n],
        porcentaje: pct(niveles[n], suyos.length),
      })),
      por_eje: clavesEje.filter((e) => acumulado.has(e)).map((eje) => ({
        eje,
        porcentaje: pct(acumulado.get(eje).obtenido, acumulado.get(eje).maximo),
      })),
    });
  }

  const pendientesCorreccion = detallePreguntas.reduce((n, f) => n + (f.pendientes || 0), 0);

  const cursos = await db.all(
    'SELECT DISTINCT a.curso FROM intentos i JOIN alumnos a ON a.id = i.alumno_id ' +
      "WHERE i.prueba_id = ? AND i.estado = 'enviado' AND a.curso <> '' ORDER BY a.curso",
    [pruebaId]
  );

  const enCurso = await db.get(
    "SELECT COUNT(*) AS n FROM intentos WHERE prueba_id = ? AND estado = 'en_curso'",
    [pruebaId]
  );

  return {
    prueba,
    filtro_curso: filtroCurso,
    cursos_disponibles: cursos.map((c) => c.curso),
    total_alumnos: totalAlumnos,
    en_curso: enCurso ? enCurso.n : 0,
    preguntas_papel: preguntas.filter(esDePapel).length,
    pendientes_correccion: pendientesCorreccion,
    promedio_logro: totalAlumnos
      ? Math.round((porAlumno.reduce((s, a) => s + (a.porcentaje || 0), 0) / totalAlumnos) * 10) / 10
      : 0,
    escala_notas: escala,
    promedio_nota: escala.activa ? promedioDeNotas(porAlumno.map((a) => a.nota)) : null,
    aprobados: porAlumno.filter((a) => aprobada(a.nota)).length,
    reprobados: escala.activa ? porAlumno.filter((a) => !aprobada(a.nota)).length : 0,
    porcentaje_aprobacion: escala.activa
      ? pct(porAlumno.filter((a) => aprobada(a.nota)).length, totalAlumnos)
      : null,
    distribucion_niveles: distribucionNiveles,
    por_eje: porEje,
    por_curso: porCurso,
    preguntas: detallePreguntas,
    alumnos: porAlumno,
  };
}

/** Informe individual: cada pregunta con lo que respondio el estudiante. */
export async function informeDeAlumno(intentoId) {
  const intento = await db.get(
    'SELECT i.*, a.nombre, a.curso, a.matricula FROM intentos i JOIN alumnos a ON a.id = i.alumno_id WHERE i.id = ?',
    [intentoId]
  );
  if (!intento) return null;

  const prueba = await db.get('SELECT * FROM pruebas WHERE id = ?', [intento.prueba_id]);
  const preguntas = await db.all('SELECT * FROM preguntas WHERE prueba_id = ? ORDER BY numero', [intento.prueba_id]);
  const respuestas = await db.all('SELECT * FROM respuestas WHERE intento_id = ?', [intentoId]);
  const mapa = new Map(respuestas.map((r) => [r.pregunta_id, r]));

  const acumuladoEje = new Map();
  let pendientes = 0;

  const detalle = preguntas.map((p) => {
    const r = mapa.get(p.id) || null;
    const puntaje = r && r.puntaje != null ? r.puntaje : 0;
    const porRevisar = esDePapel(p) && !(r && r.corregida);
    if (porRevisar) pendientes += 1;

    // Una pregunta en papel sin revisar no entra al desglose: contarla como
    // cero haria ver el criterio como no logrado cuando lo que falta es
    // corregirla.
    if (p.eje && !porRevisar) {
      const a = acumuladoEje.get(p.eje) || { obtenido: 0, maximo: 0 };
      a.obtenido += puntaje;
      a.maximo += p.puntaje;
      acumuladoEje.set(p.eje, a);
    }
    return {
      numero: p.numero,
      tipo: p.tipo,
      eje: p.eje,
      oa: p.oa,
      indicador: p.indicador,
      enunciado: p.enunciado,
      clave: p.clave,
      respondio: r ? r.alternativa : null,
      puntaje,
      puntaje_max: p.puntaje,
      // En papel no hay "respondió": hay corregida o pendiente.
      corregida: esDePapel(p) ? !!(r && r.corregida) : true,
      correcta: esDePapel(p)
        ? !!(r && r.corregida && puntaje >= p.puntaje)
        : !!(r && r.alternativa === p.clave),
    };
  });

  const escala = escalaDeNotas(prueba, preguntas.reduce((s, p) => s + p.puntaje, 0));

  return {
    intento,
    prueba,
    escala_notas: escala,
    // Con preguntas en papel sin corregir la nota todavia no esta cerrada: se
    // entrega igual, pero acompanada del pendiente para que la vista lo diga.
    nota: escala.activa ? calcularNota(intento.puntaje, escala) : null,
    pendientes_correccion: pendientes,
    por_eje: [...acumuladoEje.entries()].map(([eje, a]) => ({ eje, porcentaje: pct(a.obtenido, a.maximo) })),
    preguntas: detalle,
  };
}
