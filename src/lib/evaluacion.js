// Correccion y calculo de informes. Replica la logica del DIA:
//  - preguntas de alternativas: correcta / incorrecta / N (no responde)
//  - preguntas de desarrollo: codigo 2 (correcta), 1 (parcial), 0 (incorrecta)
//  - niveles de logro I / II / III segun umbrales configurables por prueba
import * as db from '../db/index.js';

export const EJES = ['Localizar', 'Interpretar y relacionar', 'Reflexionar'];

export const TIPOS_TEXTO = [
  'Narración',
  'Poema',
  'Texto dramático',
  'Texto de los medios de comunicación',
  'Texto de los medios de comunicación con finalidad argumentativa',
  'Texto informativo',
  'Otro',
];

export const LETRAS = ['A', 'B', 'C', 'D'];

// La ficha tecnica fija el codigo 2 como respuesta correcta, 1 como parcial y 0
// como incorrecta (incluida la respuesta en blanco).
export function puntajeDesarrollo(codigo, puntajeMaximo) {
  if (codigo === 2) return puntajeMaximo;
  if (codigo === 1) return puntajeMaximo / 2;
  return 0;
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

    if (pregunta.tipo === 'alternativas') {
      const acierto = !!(respuesta && respuesta.alternativa && respuesta.alternativa === pregunta.clave);
      const puntaje = acierto ? pregunta.puntaje : 0;
      obtenido += puntaje;
      if (respuesta) {
        await db.run('UPDATE respuestas SET puntaje = ?, corregida = 1 WHERE id = ?', [puntaje, respuesta.id]);
      }
      continue;
    }

    // Pregunta de desarrollo
    const tieneTexto = respuesta && String(respuesta.respuesta_texto || '').trim().length > 0;
    if (!tieneTexto) {
      // Respuesta en blanco: la pauta del DIA la clasifica como codigo 0.
      if (respuesta) {
        await db.run('UPDATE respuestas SET codigo_rubrica = 0, puntaje = 0, corregida = 1 WHERE id = ?', [respuesta.id]);
      }
      continue;
    }
    if (respuesta.codigo_rubrica === null || respuesta.codigo_rubrica === undefined) {
      pendientes += 1;
      continue;
    }
    const puntaje = puntajeDesarrollo(respuesta.codigo_rubrica, pregunta.puntaje);
    obtenido += puntaje;
    await db.run('UPDATE respuestas SET puntaje = ?, corregida = 1 WHERE id = ?', [puntaje, respuesta.id]);
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
  const acumuladoTipo = new Map();
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
      tipo_texto: pregunta.tipo_texto,
      eje: pregunta.eje,
      indicador: pregunta.indicador,
      enunciado: pregunta.enunciado,
      clave: pregunta.clave,
      total: totalAlumnos,
      pendientes: 0,
    };

    if (pregunta.tipo === 'alternativas') {
      const conteo = { A: 0, B: 0, C: 0, D: 0, N: 0 };
      for (const r of lista) {
        if (r.alternativa && conteo[r.alternativa] !== undefined) conteo[r.alternativa] += 1;
        else conteo.N += 1;
      }
      conteo.N += totalAlumnos - lista.length;
      obtenidoPregunta = (conteo[pregunta.clave] || 0) * pregunta.puntaje;

      fila.distribucion = LETRAS.map((letra) => ({
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
      const conteo = { 2: 0, 1: 0, 0: 0, N: 0 };
      for (const r of lista) {
        if (r.codigo_rubrica === 2 || r.codigo_rubrica === 1 || r.codigo_rubrica === 0) conteo[r.codigo_rubrica] += 1;
        else conteo.N += 1;
      }
      conteo.N += totalAlumnos - lista.length;
      obtenidoPregunta = conteo[2] * pregunta.puntaje + conteo[1] * (pregunta.puntaje / 2);

      fila.distribucion = [
        { letra: 'RC', contenido: 'Respuesta correcta (código 2)', cantidad: conteo[2], porcentaje: pct(conteo[2], totalAlumnos), correcta: true },
        { letra: 'RPC', contenido: 'Parcialmente correcta (código 1)', cantidad: conteo[1], porcentaje: pct(conteo[1], totalAlumnos), correcta: false },
        { letra: 'RI', contenido: 'Incorrecta (código 0)', cantidad: conteo[0], porcentaje: pct(conteo[0], totalAlumnos), correcta: false },
        { letra: 'N', contenido: 'Pendiente de corregir', cantidad: conteo.N, porcentaje: pct(conteo.N, totalAlumnos), correcta: false },
      ];
      fila.correctas = conteo[2];
      fila.pendientes = conteo.N;
    }

    fila.logro = pct(obtenidoPregunta, maximoPregunta);
    sumar(acumuladoEje, pregunta.eje, obtenidoPregunta, maximoPregunta);
    sumar(acumuladoTipo, pregunta.tipo_texto, obtenidoPregunta, maximoPregunta);
    detallePreguntas.push(fila);
  }

  const clavesEje = EJES.filter((eje) => acumuladoEje.has(eje))
    .concat([...acumuladoEje.keys()].filter((k) => !EJES.includes(k)));

  const porEje = clavesEje.map((eje) => {
    const a = acumuladoEje.get(eje);
    return {
      eje,
      porcentaje: pct(a.obtenido, a.maximo),
      preguntas: preguntas.filter((p) => p.eje === eje).length,
    };
  });

  const porTipoTexto = [...acumuladoTipo.entries()].map(([tipo, a]) => ({
    tipo_texto: tipo,
    porcentaje: pct(a.obtenido, a.maximo),
    preguntas: preguntas.filter((p) => p.tipo_texto === tipo).length,
  }));

  // 4. Resultados por estudiante
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
    enviado_en: i.enviado_en,
  }));

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
    pendientes_correccion: pendientesCorreccion,
    promedio_logro: totalAlumnos
      ? Math.round((porAlumno.reduce((s, a) => s + (a.porcentaje || 0), 0) / totalAlumnos) * 10) / 10
      : 0,
    distribucion_niveles: distribucionNiveles,
    por_eje: porEje,
    por_tipo_texto: porTipoTexto,
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
  const detalle = preguntas.map((p) => {
    const r = mapa.get(p.id) || null;
    const puntaje = r && r.puntaje != null ? r.puntaje : 0;
    if (p.eje) {
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
      tipo_texto: p.tipo_texto,
      indicador: p.indicador,
      enunciado: p.enunciado,
      clave: p.clave,
      respondio: r ? r.alternativa : null,
      respuesta_texto: r ? r.respuesta_texto : '',
      codigo_rubrica: r ? r.codigo_rubrica : null,
      puntaje,
      puntaje_max: p.puntaje,
      correcta: p.tipo === 'alternativas'
        ? !!(r && r.alternativa === p.clave)
        : !!(r && r.codigo_rubrica === 2),
    };
  });

  return {
    intento,
    prueba,
    por_eje: [...acumuladoEje.entries()].map(([eje, a]) => ({ eje, porcentaje: pct(a.obtenido, a.maximo) })),
    preguntas: detalle,
  };
}
