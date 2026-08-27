import { api, $, $$, esc, parrafos, mostrarAviso, fecha, barra, plural, ROMANO } from './comun.js';

const recargar = () => window.recargarVista();

// Al guardar o crear se repinta la vista completa, lo que cerraria todos los
// bloques. Se recuerda cual debe quedar abierto para no perder el lugar: con
// decenas de preguntas, colapsar todo en cada guardado hace la carga inviable.
let foco = null;

function pedirFoco(tipo, id, enfocarCampo = false) {
  foco = { tipo, id, enfocarCampo };
  // Tras repintar, el enrutador vuelve al inicio de la pagina. Aqui se le avisa
  // que este repintado es "quedarse donde estaba", no navegar a otra vista.
  window.mantenerScroll = true;
}

function restaurarFoco() {
  if (!foco) return;
  const { tipo, id, enfocarCampo } = foco;
  foco = null;

  const caja = document.querySelector('[data-' + tipo + '="' + id + '"]');
  if (!caja) return;

  caja.open = true;
  caja.scrollIntoView({ block: 'center', behavior: 'smooth' });
  if (enfocarCampo) {
    const campo = caja.querySelector('[data-campo="enunciado"], [data-campo="titulo"]');
    if (campo) campo.focus();
  }
}

const LETRAS = ['A', 'B', 'C', 'D', 'E'];
const TIPOS_TEXTO = [
  'Narración',
  'Poema',
  'Texto dramático',
  'Texto de los medios de comunicación',
  'Texto de los medios de comunicación con finalidad argumentativa',
  'Texto informativo',
  'Otro',
];

function opciones(lista, seleccionado) {
  return lista.map((v) => '<option value="' + esc(v) + '"' + (v === seleccionado ? ' selected' : '') + '>' + esc(v) + '</option>').join('');
}

function cabecera(prueba, activa) {
  const enlaces = [
    ['editor', 'Editor'],
    ['vista', 'Ver la prueba'],
    ['monitor', 'Monitor'],
    ['informe', 'Informe'],
  ];
  return '<div class="fila no-imprimir"><a href="#pruebas" class="silencio">← Pruebas</a></div>' +
    '<h1>' + esc(prueba.titulo) + '</h1>' +
    '<div class="pestanas no-imprimir">' +
      enlaces.map(([clave, nombre]) =>
        '<a href="#prueba/' + prueba.id + '/' + clave + '"><button class="' + (clave === activa ? 'activa' : '') + '">' + nombre + '</button></a>').join('') +
    '</div>';
}

/* =========================================================== EDITOR DE PRUEBA */

export async function vistaEditor(nodo, id) {
  const [datos, nomina] = await Promise.all([
    api('/api/admin/pruebas/' + id),
    api('/api/admin/alumnos'),
  ]);
  const { prueba, textos, preguntas } = datos;

  nodo.innerHTML = cabecera(prueba, 'editor') +
    '<div id="aviso" class="aviso"></div>' +
    seccionAjustes(prueba, nomina.cursos) +
    seccionTextos(textos) +
    seccionPreguntas(preguntas, textos, prueba);

  conectarAjustes(prueba);
  conectarTextos(prueba, textos);
  conectarPreguntas(prueba, textos, preguntas);
  restaurarFoco();
}

function seccionAjustes(p, cursos) {
  return '<div class="tarjeta"><h2>Ajustes de la prueba</h2>' +
    '<div class="rejilla dos">' +
      '<div class="campo"><label>Título</label><input id="p-titulo" value="' + esc(p.titulo) + '"></div>' +
      '<div class="campo"><label>Asignatura</label><input id="p-asignatura" value="' + esc(p.asignatura) + '"></div>' +
      '<div class="campo"><label>Nivel</label><input id="p-nivel" value="' + esc(p.nivel) + '"></div>' +
      '<div class="campo"><label>Duración en minutos (vacío = sin límite)</label>' +
        '<input id="p-duracion" type="number" min="1" value="' + (p.duracion_min ?? '') + '"></div>' +
      '<div class="campo"><label>Estado</label><select id="p-estado">' +
        opciones(['borrador', 'publicada', 'cerrada'], p.estado) + '</select></div>' +
    '</div>' +
    seccionCursos(p, cursos) +
    '<div class="campo"><label>Descripción</label><input id="p-descripcion" value="' + esc(p.descripcion) + '"></div>' +
    '<div class="campo"><label>Instrucciones para el estudiante</label>' +
      '<textarea id="p-instrucciones" rows="3">' + esc(p.instrucciones) + '</textarea></div>' +

    '<h3>Umbrales de los niveles de logro</h3>' +
    '<p class="silencio">Nivel I por debajo del primer umbral, Nivel II entre ambos y Nivel III desde el segundo. ' +
      'Se aplican sobre el porcentaje de logro de cada estudiante.</p>' +
    '<div class="rejilla dos">' +
      '<div class="campo"><label>% mínimo para Nivel II</label><input id="p-n2" type="number" min="0" max="100" step="1" value="' + p.nivel2_min + '"></div>' +
      '<div class="campo"><label>% mínimo para Nivel III</label><input id="p-n3" type="number" min="0" max="100" step="1" value="' + p.nivel3_min + '"></div>' +
    '</div>' +
    '<label class="alternativa" style="max-width:520px">' +
      '<input type="checkbox" id="p-mostrar"' + (p.mostrar_resultado_alumno ? ' checked' : '') + '>' +
      '<span>Mostrar al estudiante su porcentaje y nivel al terminar</span></label>' +
    '<div class="fila fin"><button id="p-guardar">Guardar ajustes</button></div></div>';
}

/**
 * Cursos habilitados. Antes era un campo de texto separado por comas, donde una
 * coma olvidada o un curso mal escrito dejaba fuera al curso entero sin aviso.
 * Con seis cursos, marcarlos es mas seguro y mas rapido.
 */
function seccionCursos(p, cursos) {
  const habilitados = String(p.cursos || '').split(',').map((c) => c.trim()).filter(Boolean);
  const todos = habilitados.length === 0;

  return '<div class="campo"><label>Cursos que pueden rendirla</label>' +
    '<div class="fila" style="gap:.4rem">' +
      '<label class="alternativa" style="margin:0">' +
        '<input type="checkbox" id="p-todos-cursos"' + (todos ? ' checked' : '') + '>' +
        '<span><strong>Todos los cursos</strong></span></label>' +
      cursos.map((c) =>
        '<label class="alternativa" style="margin:0">' +
          '<input type="checkbox" data-curso-habilitado="' + esc(c.curso) + '"' +
          (habilitados.includes(c.curso) ? ' checked' : '') + (todos ? ' disabled' : '') + '>' +
          '<span>' + esc(c.curso) + ' <span class="silencio">(' + c.n + ')</span></span>' +
        '</label>').join('') +
    '</div>' +
    '<p class="silencio" id="p-resumen-cursos"></p></div>';
}

function conectarCursos() {
  const todos = $('#p-todos-cursos');
  const casillas = () => $$('[data-curso-habilitado]');

  const refrescar = () => {
    casillas().forEach((c) => { c.disabled = todos.checked; });
    const marcados = casillas().filter((c) => c.checked).map((c) => c.dataset.cursoHabilitado);
    $('#p-resumen-cursos').textContent = todos.checked
      ? 'La verán los estudiantes de cualquier curso.'
      : (marcados.length
        ? 'Solo la verán: ' + marcados.join(', ') + '.'
        : 'Sin cursos marcados no la verá nadie. Marca al menos uno, o «Todos los cursos».');
  };

  todos.addEventListener('change', refrescar);
  casillas().forEach((c) => c.addEventListener('change', refrescar));
  refrescar();
}

/** Devuelve el valor que espera el servidor: lista separada por comas, vacía = todos. */
function leerCursos() {
  if ($('#p-todos-cursos').checked) return '';
  return $$('[data-curso-habilitado]').filter((c) => c.checked).map((c) => c.dataset.cursoHabilitado).join(', ');
}

function conectarAjustes(prueba) {
  conectarCursos();
  $('#p-guardar').addEventListener('click', async () => {
    await api('/api/admin/pruebas/' + prueba.id, {
      metodo: 'PUT',
      cuerpo: {
        titulo: $('#p-titulo').value,
        asignatura: $('#p-asignatura').value,
        nivel: $('#p-nivel').value,
        duracion_min: $('#p-duracion').value === '' ? null : $('#p-duracion').value,
        cursos: leerCursos(),
        estado: $('#p-estado').value,
        descripcion: $('#p-descripcion').value,
        instrucciones: $('#p-instrucciones').value,
        nivel2_min: $('#p-n2').value,
        nivel3_min: $('#p-n3').value,
        mostrar_resultado_alumno: $('#p-mostrar').checked,
      },
    });
    mostrarAviso($('#aviso'), 'Ajustes guardados.', 'ok');
  });
}

/* -------------------------------------------------------------------- textos */

function seccionTextos(textos) {
  return '<div class="tarjeta"><div class="fila"><h2 class="crece">Textos (' + textos.length + ')</h2>' +
      '<button class="secundario" id="t-nuevo">Agregar texto</button></div>' +
    '<p class="silencio">Cada texto es el estímulo de un grupo de preguntas. El tipo de texto se copia a las preguntas asociadas para el informe.</p>' +
    textos.map((t) =>
      '<details class="tarjeta" style="margin:.6rem 0" data-texto="' + t.id + '">' +
        '<summary><strong>' + t.orden + '. ' + esc(t.titulo) + '</strong> ' +
          '<span class="etiqueta gris">' + esc(t.tipo_texto) + '</span></summary>' +
        '<div class="rejilla dos" style="margin-top:.8rem">' +
          '<div class="campo"><label>Título</label><input data-campo="titulo" value="' + esc(t.titulo) + '"></div>' +
          '<div class="campo"><label>Autor</label><input data-campo="autor" value="' + esc(t.autor) + '"></div>' +
          '<div class="campo"><label>Tipo de texto</label><select data-campo="tipo_texto">' + opciones(TIPOS_TEXTO, t.tipo_texto) + '</select></div>' +
          '<div class="campo"><label>Orden</label><input data-campo="orden" type="number" min="1" value="' + t.orden + '"></div>' +
        '</div>' +
        '<div class="campo"><label>Fuente</label><input data-campo="fuente" value="' + esc(t.fuente) + '"></div>' +
        '<div class="campo"><label>Contenido del texto</label>' +
          '<textarea data-campo="contenido" rows="14">' + esc(t.contenido) + '</textarea></div>' +
        '<div class="fila fin"><button class="peligro chico" data-borrar-texto="' + t.id + '">Eliminar texto</button>' +
          '<button class="chico" data-guardar-texto="' + t.id + '">Guardar texto</button></div>' +
      '</details>').join('') +
    '</div>';
}

function conectarTextos(prueba, textos) {
  $('#t-nuevo').addEventListener('click', async () => {
    const { id } = await api('/api/admin/pruebas/' + prueba.id + '/textos', {
      cuerpo: { titulo: 'Texto ' + (textos.length + 1), orden: textos.length + 1 },
    });
    pedirFoco('texto', id, true);
    recargar();
  });

  document.querySelectorAll('[data-guardar-texto]').forEach((boton) => {
    boton.addEventListener('click', async () => {
      const caja = boton.closest('[data-texto]');
      const cuerpo = {};
      caja.querySelectorAll('[data-campo]').forEach((c) => { cuerpo[c.dataset.campo] = c.value; });
      await api('/api/admin/textos/' + boton.dataset.guardarTexto, { metodo: 'PUT', cuerpo });
      mostrarAviso($('#aviso'), 'Texto guardado.', 'ok');
      recargar();
    });
  });

  document.querySelectorAll('[data-borrar-texto]').forEach((boton) => {
    boton.addEventListener('click', async () => {
      if (!confirm('Se eliminará el texto. Las preguntas asociadas quedarán sin texto. ¿Continuar?')) return;
      await api('/api/admin/textos/' + boton.dataset.borrarTexto, { metodo: 'DELETE' });
      recargar();
    });
  });
}

/* ----------------------------------------------------------------- preguntas */

const CRITERIOS_SUGERIDOS = [
  'Localizar',
  'Interpretar y relacionar',
  'Reflexionar',
  'Extracción de información',
  'Construcción de significado',
  'Incremento de vocabulario',
];

function seccionPreguntas(preguntas, textos, prueba) {
  const sinClasificar = preguntas.filter((p) => !p.eje).length;
  const sinClave = preguntas.filter((p) => p.tipo === 'alternativas' && !p.clave).length;

  const usados = [...new Set(preguntas.map((p) => p.eje).filter(Boolean))];
  const sugerencias = [...new Set([...usados, ...CRITERIOS_SUGERIDOS])];

  return '<datalist id="criterios-sugeridos">' +
      sugerencias.map((c) => '<option value="' + esc(c) + '">').join('') +
    '</datalist>' +
    '<div class="tarjeta"><div class="fila"><h2 class="crece">Preguntas (' + preguntas.length + ')</h2>' +
      '<button class="secundario" id="q-pegar">Cargar varias</button>' +
      '<button id="q-nueva">Agregar pregunta</button></div>' +
    (sinClasificar || sinClave
      ? '<div class="aviso info">' +
          (sinClave ? sinClave + ' pregunta(s) de alternativas sin clave marcada. ' : '') +
          (sinClasificar ? sinClasificar + ' pregunta(s) sin criterio: no aparecerán en el desglose del informe.' : '') +
        '</div>'
      : '') +
    '<div id="caja-pegar"></div>' +
    preguntas.map((p) => tarjetaPregunta(p, textos)).join('') +
    (preguntas.length ? '' : '<p class="silencio">Todavía no hay preguntas.</p>') +
    '</div>';
}

function tarjetaPregunta(p, textos) {
  const esAlternativas = p.tipo === 'alternativas';
  const resumen = (p.enunciado || '(sin enunciado)').slice(0, 90);

  const cuerpoAlternativas =
    '<label>Alternativas (marca la correcta)</label>' +
    LETRAS.map((letra) => {
      const o = (p.opciones || []).find((x) => x.letra === letra) || { contenido: '' };
      return '<div class="fila" style="margin-bottom:.35rem">' +
        '<label class="alternativa" style="margin:0;flex:none">' +
          '<input type="radio" name="clave-' + p.id + '" data-clave="' + letra + '"' + (p.clave === letra ? ' checked' : '') + '>' +
          '<span class="letra">' + letra + '</span></label>' +
        '<input class="crece" data-opcion="' + letra + '" value="' + esc(o.contenido) + '">' +
      '</div>';
    }).join('');


  return '<details class="tarjeta" style="margin:.6rem 0" data-pregunta="' + p.id + '">' +
    '<summary><strong>' + p.numero + '.</strong> ' + esc(resumen) +
      (esAlternativas
        ? (p.clave ? ' <span class="etiqueta verde">Clave ' + p.clave + '</span>' : ' <span class="etiqueta roja">sin clave</span>')
        : ' <span class="etiqueta ambar">Desarrollo</span>') +
      (p.eje ? ' <span class="etiqueta">' + esc(p.eje) + '</span>' : '') +
    '</summary>' +

    '<div class="rejilla dos" style="margin-top:.8rem">' +
      '<div class="campo"><label>N° de pregunta</label><input data-campo="numero" type="number" min="1" value="' + p.numero + '"></div>' +
      // La plataforma evalua solo preguntas de alternativas: el tipo va fijo y
      // no se ofrece como opcion.
      '<input type="hidden" data-campo="tipo" value="alternativas">' +
      '<div class="campo"><label>Texto asociado</label><select data-campo="texto_id">' +
        '<option value="">— sin texto —</option>' +
        textos.map((t) => '<option value="' + t.id + '"' + (t.id === p.texto_id ? ' selected' : '') + '>' + esc(t.titulo) + '</option>').join('') +
      '</select></div>' +
      '<div class="campo"><label>Puntaje</label><input data-campo="puntaje" type="number" min="1" value="' + p.puntaje + '"></div>' +
    '</div>' +

    '<div class="campo"><label>Enunciado</label><textarea data-campo="enunciado" rows="2">' + esc(p.enunciado) + '</textarea></div>' +
    '<div class="campo"><label>Fragmento citado dentro de la pregunta (opcional)</label>' +
      '<textarea data-campo="cita" rows="2">' + esc(p.cita) + '</textarea></div>' +

    // Un solo campo: el criterio que mide la pregunta. Es lo que agrupa el
    // informe. Se escribe libre porque cada prueba usa su propio conjunto
    // (los ejes del DIA en unas, "Extraccion de informacion" en otras), con
    // sugerencias de los ya usados para no tipear dos veces lo mismo.
    '<div class="campo"><label>Criterio que evalúa esta pregunta</label>' +
      '<input data-campo="eje" list="criterios-sugeridos" value="' + esc(p.eje) + '" ' +
      'placeholder="Localizar, Interpretar y relacionar, Reflexionar…"></div>' +

    '<details style="margin-bottom:.8rem"><summary class="silencio">Datos adicionales (opcionales)</summary>' +
      '<div class="rejilla dos" style="margin-top:.6rem">' +
        '<div class="campo"><label>N° de OA</label><input data-campo="oa" value="' + esc(p.oa) + '" placeholder="3"></div>' +
        '<div class="campo"><label>Indicador de evaluación</label>' +
          '<input data-campo="indicador" value="' + esc(p.indicador) + '" ' +
          'placeholder="Descripción larga de lo que mide"></div>' +
      '</div>' +
      '<p class="silencio">El tipo de texto no se define aquí: se toma del texto asociado.</p>' +
    '</details>' +

    '<div data-cuerpo>' + cuerpoAlternativas + '</div>' +

    '<div class="fila fin" style="margin-top:.8rem">' +
      '<button class="peligro chico" data-borrar-pregunta="' + p.id + '">Eliminar</button>' +
      '<button class="neutro chico" data-guardar-pregunta="' + p.id + '">Guardar</button>' +
      '<button class="chico" data-guardar-y-seguir="' + p.id + '">Guardar y agregar otra</button>' +
    '</div></details>';
}

function leerPregunta(caja) {
  const cuerpo = {};
  caja.querySelectorAll('[data-campo]').forEach((c) => { cuerpo[c.dataset.campo] = c.value; });
  cuerpo.texto_id = cuerpo.texto_id ? Number(cuerpo.texto_id) : null;

  if (cuerpo.tipo === 'alternativas') {
    cuerpo.opciones = [...caja.querySelectorAll('[data-opcion]')].map((c) => ({ letra: c.dataset.opcion, contenido: c.value }));
    const marcada = caja.querySelector('[data-clave]:checked');
    cuerpo.clave = marcada ? marcada.dataset.clave : null;
  } else {
    cuerpo.rubricas = [2, 1, 0].map((codigo) => ({
      codigo,
      descripcion: (caja.querySelector('[data-rubrica="' + codigo + '"]') || {}).value || '',
      ejemplos: (caja.querySelector('[data-ejemplo="' + codigo + '"]') || {}).value || '',
    }));
  }
  return cuerpo;
}

/**
 * Crea una pregunta y deja el editor listo para escribirla.
 * Si se viene de "guardar y agregar otra", hereda texto asociado, OA, eje e
 * indicador de la anterior: en una prueba real varias preguntas seguidas
 * comparten esa clasificacion, y volver a elegirla cada vez es puro roce.
 */
async function agregarPregunta(prueba, numero, anterior = null) {
  const cuerpo = { tipo: 'alternativas', numero, enunciado: '' };
  if (anterior) {
    cuerpo.texto_id = anterior.texto_id;
    cuerpo.oa = anterior.oa;
    cuerpo.eje = anterior.eje;
    cuerpo.indicador = anterior.indicador;
  }
  const { id } = await api('/api/admin/pruebas/' + prueba.id + '/preguntas', { cuerpo });
  pedirFoco('pregunta', id, true);
  recargar();
}

function conectarPreguntas(prueba, textos, preguntas) {
  $('#q-nueva').addEventListener('click', () => agregarPregunta(prueba, preguntas.length + 1));

  $('#q-pegar').addEventListener('click', () => formularioLote($('#caja-pegar'), prueba, textos));

  document.querySelectorAll('[data-guardar-pregunta]').forEach((boton) => {
    boton.addEventListener('click', async () => {
      const caja = boton.closest('[data-pregunta]');
      const id = boton.dataset.guardarPregunta;
      await api('/api/admin/preguntas/' + id, { metodo: 'PUT', cuerpo: leerPregunta(caja) });
      mostrarAviso($('#aviso'), 'Pregunta guardada.', 'ok');
      pedirFoco('pregunta', id);
      recargar();
    });
  });

  // El boton que hace usable la carga de una prueba larga: guarda y deja lista
  // la siguiente, sin tener que volver arriba a buscar "Agregar pregunta".
  document.querySelectorAll('[data-guardar-y-seguir]').forEach((boton) => {
    boton.addEventListener('click', async () => {
      const caja = boton.closest('[data-pregunta]');
      await api('/api/admin/preguntas/' + boton.dataset.guardarYSeguir, { metodo: 'PUT', cuerpo: leerPregunta(caja) });
      await agregarPregunta(prueba, preguntas.length + 1, leerPregunta(caja));
    });
  });

  document.querySelectorAll('[data-borrar-pregunta]').forEach((boton) => {
    boton.addEventListener('click', async () => {
      if (!confirm('¿Eliminar esta pregunta y las respuestas ya registradas en ella?')) return;
      await api('/api/admin/preguntas/' + boton.dataset.borrarPregunta, { metodo: 'DELETE' });
      recargar();
    });
  });
}

const PLANTILLA_LOTE = `1|Localizar|3|Localizan información explícita relevante en un texto narrativo.|D|¿Quién es el dueño de la taberna?|Chispa.|Monda.|Pincha.|Ponce.
2|Interpretar y relacionar|3|Infieren información relevante sobre personajes.|A|¿Qué le preocupa a Ponce?|Que el bebé sea varón.|Que esté sano.|Que sea hermoso.|Que nazca pronto.`;

function formularioLote(caja, prueba, textos) {
  caja.innerHTML =
    '<div class="tarjeta"><h3>Cargar varias preguntas de una vez</h3>' +
      '<p class="silencio">Una línea por pregunta, con los campos separados por barra vertical <code>|</code>:<br>' +
      '<code>N°|eje|OA|indicador|clave|enunciado|A|B|C|D</code><br>' +
      'La clave es la letra de la alternativa correcta.</p>' +
      '<div class="campo"><label>Texto al que se asocian</label><select id="lote-texto">' +
        '<option value="">— sin texto —</option>' +
        textos.map((t) => '<option value="' + t.id + '">' + esc(t.titulo) + '</option>').join('') +
      '</select></div>' +
      '<div class="campo"><textarea id="lote-datos" rows="8" placeholder="' + esc(PLANTILLA_LOTE) + '"></textarea></div>' +
      '<div class="fila fin"><button class="neutro" id="lote-cancelar">Cancelar</button>' +
        '<button id="lote-cargar">Cargar preguntas</button></div>' +
    '</div>';

  $('#lote-cancelar').addEventListener('click', () => { caja.innerHTML = ''; });

  $('#lote-cargar').addEventListener('click', async () => {
    const textoId = $('#lote-texto').value ? Number($('#lote-texto').value) : null;
    const lista = $('#lote-datos').value.split('\n').map((linea) => linea.trim()).filter(Boolean).map((linea) => {
      const c = linea.split('|').map((x) => x.trim());
      return {
        numero: Number(c[0]) || undefined,
        eje: c[1] || '',
        oa: c[2] || '',
        indicador: c[3] || '',
        tipo: 'alternativas',
        clave: (c[4] || '').toUpperCase(),
        enunciado: c[5] || '',
        texto_id: textoId,
        opciones: LETRAS.map((letra, i) => ({ letra, contenido: c[6 + i] || '' })),
      };
    });

    if (!lista.length) return mostrarAviso($('#aviso'), 'No se reconoció ninguna línea.');
    const r = await api('/api/admin/pruebas/' + prueba.id + '/preguntas/lote', { cuerpo: { preguntas: lista } });
    mostrarAviso($('#aviso'), r.creadas + ' preguntas cargadas.', 'ok');
    recargar();
  });
}

/* ================================================================== MONITOR */

export async function vistaMonitor(nodo, id) {
  const datos = await api('/api/admin/pruebas/' + id + '/monitor');
  const enCurso = datos.intentos.filter((i) => i.estado === 'en_curso');
  const enviados = datos.intentos.filter((i) => i.estado === 'enviado');

  nodo.innerHTML = cabecera(datos.prueba, 'monitor') +
    '<div class="rejilla tres">' +
      tarjetaDato('Rindiendo ahora', enCurso.length) +
      tarjetaDato('Ya enviaron', enviados.length) +
      tarjetaDato('Preguntas', datos.total_preguntas) +
    '</div>' +
    (datos.prueba.estado !== 'publicada'
      ? '<div class="aviso info">La prueba está en estado <strong>' + esc(datos.prueba.estado) +
        '</strong>. Cámbiala a <em>publicada</em> en el editor para que los alumnos puedan entrar.</div>'
      : '') +
    '<div class="fila"><div class="crece"></div><button id="btn-refrescar" class="neutro">Actualizar</button></div>' +

    '<div class="tarjeta tabla-scroll"><h2>En desarrollo</h2>' +
      (enCurso.length
        ? '<table><thead><tr><th>Alumno</th><th>Curso</th><th>Avance</th><th>Comenzó</th><th></th></tr></thead><tbody>' +
          enCurso.map((i) => {
            const p = datos.total_preguntas ? Math.round((i.respondidas / datos.total_preguntas) * 100) : 0;
            return '<tr><td>' + esc(i.nombre) + '</td><td>' + esc(i.curso) + '</td>' +
              '<td>' + barra(p, 'azul') + ' <span class="silencio">' + i.respondidas + '/' + datos.total_preguntas + '</span></td>' +
              '<td class="silencio">' + fecha(i.iniciado_en) + '</td>' +
              '<td><button class="peligro chico" data-borrar-intento="' + i.id + '">Anular</button></td></tr>';
          }).join('') + '</tbody></table>'
        : '<p class="silencio">Nadie está rindiendo en este momento.</p>') +
    '</div>' +

    '<div class="tarjeta tabla-scroll"><h2>Entregadas</h2>' +
      (enviados.length
        ? '<table><thead><tr><th>Alumno</th><th>Curso</th><th>% logro</th><th>Nivel</th><th>Entregó</th><th></th></tr></thead><tbody>' +
          enviados.map((i) =>
            '<tr><td>' + esc(i.nombre) + '</td><td>' + esc(i.curso) + '</td>' +
              '<td>' + barra(i.porcentaje) + ' ' + (i.porcentaje ?? 0) + '%</td>' +
              '<td>' + etiquetaNivel(i.nivel_logro) + '</td>' +
              '<td class="silencio">' + fecha(i.enviado_en) + '</td>' +
              '<td><div class="fila fin">' +
                '<a href="#intento/' + i.id + '"><button class="neutro chico">Ver</button></a>' +
                '<button class="neutro chico" data-reabrir="' + i.id + '">Reabrir</button>' +
              '</div></td></tr>').join('') + '</tbody></table>'
        : '<p class="silencio">Todavía no hay entregas.</p>') +
    '</div>';

  $('#btn-refrescar').addEventListener('click', recargar);

  nodo.querySelectorAll('[data-reabrir]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('El alumno podrá volver a entrar y modificar sus respuestas. ¿Continuar?')) return;
    await api('/api/admin/intentos/' + b.dataset.reabrir + '/reabrir', { cuerpo: {} });
    recargar();
  }));

  nodo.querySelectorAll('[data-borrar-intento]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('Se borrarán las respuestas de este intento. ¿Continuar?')) return;
    await api('/api/admin/intentos/' + b.dataset.borrarIntento, { metodo: 'DELETE' });
    recargar();
  }));
}

const tarjetaDato = (titulo, valor, extra = '') =>
  '<div class="tarjeta"><div class="silencio">' + esc(titulo) + '</div>' +
  '<div class="numero-grande">' + valor + '</div>' + extra + '</div>';

const etiquetaNivel = (n) => {
  const clase = n === 3 ? 'verde' : n === 2 ? 'ambar' : 'roja';
  return '<span class="etiqueta ' + clase + '">Nivel ' + (ROMANO[n] || '—') + '</span>';
};

/* ================================================================== INFORME */

export async function vistaInforme(nodo, id) {
  const curso = sessionStorage.getItem('curso-informe') || '';
  const r = await api('/api/admin/pruebas/' + id + '/informe' + (curso ? '?curso=' + encodeURIComponent(curso) : ''));

  if (!r.total_alumnos) {
    nodo.innerHTML = cabecera(r.prueba, 'informe') +
      '<div class="tarjeta"><p>Todavía no hay pruebas entregadas.</p>' +
      '<p class="silencio">El informe se construye con los intentos ya enviados.</p></div>';
    return;
  }

  nodo.innerHTML = cabecera(r.prueba, 'informe') +
    '<div class="fila no-imprimir">' +
      '<div style="min-width:200px"><label>Curso</label><select id="filtro"><option value="">Todos los cursos</option>' +
        r.cursos_disponibles.map((c) => '<option value="' + esc(c) + '"' + (c === curso ? ' selected' : '') + '>' + esc(c) + '</option>').join('') +
      '</select></div>' +
      '<div class="crece"></div>' +
      '<a href="/api/admin/pruebas/' + id + '/informe.csv' + (curso ? '?curso=' + encodeURIComponent(curso) : '') + '">' +
        '<button class="neutro">Descargar CSV</button></a>' +
      '<button class="neutro" id="btn-recalcular">Recalcular</button>' +
      '<button onclick="window.print()">Imprimir</button>' +
    '</div>' +


    '<div class="rejilla tres">' +
      tarjetaDato('Estudiantes evaluados', r.total_alumnos, r.en_curso ? '<span class="silencio">' + r.en_curso + ' aún rindiendo</span>' : '') +
      tarjetaDato('Logro promedio del curso', r.promedio_logro + '%') +
      tarjetaDato('Preguntas', r.preguntas.length) +
    '</div>' +

    seccionNiveles(r) +
    seccionEjes(r) +
    seccionTabla1(r) +
    seccionPorAlumno(r) +
    seccionConclusiones(r);

  $('#filtro').addEventListener('change', (e) => {
    sessionStorage.setItem('curso-informe', e.target.value);
    recargar();
  });

  $('#btn-recalcular').addEventListener('click', async () => {
    await api('/api/admin/pruebas/' + id + '/recalcular', { cuerpo: {} });
    recargar();
  });
}

function seccionNiveles(r) {
  return '<div class="tarjeta"><h2>1. Resultados según niveles de logro</h2>' +
    '<p class="silencio">Nivel I: no logra los aprendizajes mínimos · Nivel II: logra parcialmente los OA · ' +
      'Nivel III: logra satisfactoriamente los OA. Umbrales: II desde ' + r.prueba.nivel2_min + '%, III desde ' + r.prueba.nivel3_min + '%.</p>' +
    '<table><tbody>' +
    r.distribucion_niveles.map((n) => {
      const clase = n.nivel === 3 ? 'verde' : n.nivel === 2 ? 'ambar' : 'roja';
      return '<tr><td style="width:130px"><span class="etiqueta ' + clase + '">' + n.etiqueta + '</span></td>' +
        '<td style="width:55%">' + barra(n.porcentaje, clase) + '</td>' +
        '<td><strong>' + n.porcentaje + '%</strong> <span class="silencio">(' + n.cantidad + ' estudiantes)</span></td></tr>';
    }).join('') +
    '</tbody></table></div>';
}

function seccionEjes(r) {
  return '<div class="tarjeta"><h2>2. Resultados según ejes de habilidad</h2>' +
    '<p class="silencio">Porcentaje promedio de logro del curso en cada eje de comprensión lectora.</p>' +
    '<table><tbody>' +
    r.por_eje.map((e) =>
      '<tr><td style="width:230px">' + esc(e.eje) + '<br><span class="silencio">' + plural(e.preguntas, 'pregunta') + '</span></td>' +
        '<td style="width:50%">' + barra(e.porcentaje) + '</td>' +
        '<td><strong>' + e.porcentaje + '%</strong></td></tr>').join('') +
    '</tbody></table>' +

    (r.por_tipo_texto.length
      ? '<h3 style="margin-top:1.4rem">Logro por tipo de texto</h3><table><tbody>' +
        r.por_tipo_texto.map((t) =>
          '<tr><td style="width:230px">' + esc(t.tipo_texto || '(sin clasificar)') + '<br><span class="silencio">' + plural(t.preguntas, 'pregunta') + '</span></td>' +
            '<td style="width:50%">' + barra(t.porcentaje) + '</td>' +
            '<td><strong>' + t.porcentaje + '%</strong></td></tr>').join('') +
        '</tbody></table>'
      : '') +
    '</div>';
}

function seccionTabla1(r) {
  return '<div class="tarjeta tabla-scroll"><h2>3. Resultados por pregunta</h2>' +
    '<p class="silencio">La alternativa correcta va destacada. Un distractor con alto porcentaje señala un error de comprensión que vale la pena indagar.</p>' +
    '<table><thead><tr>' +
      '<th>N°</th><th>OA</th><th>Tipo de texto</th><th>Eje</th><th>Indicador</th><th>% respuestas</th><th>Logro</th>' +
    '</tr></thead><tbody>' +
    r.preguntas.map((p) =>
      '<tr><td><strong>' + p.numero + '</strong></td>' +
        '<td>' + esc(p.oa) + '</td>' +
        '<td class="silencio">' + esc(p.tipo_texto) + '</td>' +
        '<td class="silencio">' + esc(p.eje) + '</td>' +
        '<td class="silencio">' + esc(p.indicador) + '</td>' +
        '<td style="white-space:nowrap">' +
          p.distribucion.map((d) =>
            '<div' + (d.correcta ? ' style="font-weight:700"' : (d.porcentaje >= 30 && !d.correcta ? ' style="color:var(--rojo)"' : '')) + '>' +
              d.letra + ': ' + d.porcentaje + '%</div>').join('') +
        '</td>' +
        '<td>' + barra(p.logro) + ' ' + p.logro + '%</td>' +
      '</tr>').join('') +
    '</tbody></table></div>';
}

function seccionPorAlumno(r) {
  return '<div class="tarjeta tabla-scroll"><h2>4. Resultados por estudiante</h2>' +
    '<table><thead><tr><th>Estudiante</th><th>Curso</th><th>Puntaje</th><th>% logro</th><th>Nivel</th><th></th></tr></thead><tbody>' +
    r.alumnos.map((a) =>
      '<tr><td>' + esc(a.nombre) + '</td><td>' + esc(a.curso) + '</td>' +
        '<td class="silencio">' + a.puntaje + ' / ' + a.puntaje_max + '</td>' +
        '<td>' + barra(a.porcentaje) + ' ' + a.porcentaje + '%</td>' +
        '<td>' + etiquetaNivel(a.nivel_logro) + '</td>' +
        '<td class="no-imprimir"><a href="#intento/' + a.intento_id + '"><button class="neutro chico">Ver detalle</button></a></td></tr>').join('') +
    '</tbody></table></div>';
}

function seccionConclusiones(r) {
  const ejes = [...r.por_eje].sort((a, b) => a.porcentaje - b.porcentaje);
  const preguntasDebiles = [...r.preguntas].sort((a, b) => a.logro - b.logro).slice(0, 5);
  const bajoNivel1 = r.distribucion_niveles.find((n) => n.nivel === 1);

  return '<div class="tarjeta"><h2>5. Lectura preliminar de los resultados</h2>' +
    '<ul>' +
      (ejes.length
        ? '<li>Eje menos logrado: <strong>' + esc(ejes[0].eje) + '</strong> (' + ejes[0].porcentaje + '%). ' +
          'Eje más logrado: <strong>' + esc(ejes[ejes.length - 1].eje) + '</strong> (' + ejes[ejes.length - 1].porcentaje + '%).</li>'
        : '') +
      '<li><strong>' + bajoNivel1.porcentaje + '%</strong> del curso (' + plural(bajoNivel1.cantidad, 'estudiante') + ') está en Nivel I: ' +
        'no demuestra haber alcanzado los aprendizajes mínimos del nivel.</li>' +
      '<li>Preguntas con menor logro: ' +
        preguntasDebiles.map((p) => 'N° ' + p.numero + ' (' + p.logro + '%)').join(', ') + '.</li>' +
    '</ul>' +
    '<h3>Preguntas guía para el análisis</h3>' +
    '<ul class="silencio">' +
      '<li>¿Los resultados reflejan las habilidades y contenidos trabajados hasta ahora en el curso?</li>' +
      '<li>¿Las preguntas con menor logro pertenecen a un mismo tipo de texto o a un mismo indicador?</li>' +
      '<li>¿Algún distractor concentró un porcentaje alto? ¿Qué error de comprensión revela?</li>' +
      '<li>¿Qué OA conviene retomar antes de seguir avanzando en la planificación?</li>' +
    '</ul></div>';
}

/* ------------------------------------------------------- informe individual */

export async function vistaInformeAlumno(nodo, intentoId) {
  const r = await api('/api/admin/intentos/' + intentoId + '/informe');

  nodo.innerHTML =
    '<div class="fila no-imprimir"><a href="#prueba/' + r.prueba.id + '/informe" class="silencio">← Informe del curso</a>' +
      '<div class="crece"></div><button onclick="window.print()">Imprimir</button></div>' +
    '<h1>' + esc(r.intento.nombre) + '</h1>' +
    '<p class="silencio">' + esc(r.prueba.titulo) + ' · ' + esc(r.intento.curso) + ' · entregada el ' + fecha(r.intento.enviado_en) + '</p>' +

    '<div class="rejilla tres">' +
      tarjetaDato('Logro', r.intento.porcentaje + '%') +
      tarjetaDato('Puntaje', r.intento.puntaje + ' / ' + r.intento.puntaje_max) +
      tarjetaDato('Nivel de logro', ROMANO[r.intento.nivel_logro] || '—') +
    '</div>' +

    '<div class="tarjeta"><h2>Desempeño por eje de habilidad</h2><table><tbody>' +
      r.por_eje.map((e) =>
        '<tr><td style="width:230px">' + esc(e.eje) + '</td>' +
          '<td style="width:50%">' + barra(e.porcentaje) + '</td>' +
          '<td><strong>' + e.porcentaje + '%</strong></td></tr>').join('') +
    '</tbody></table></div>' +

    '<div class="tarjeta tabla-scroll"><h2>Detalle pregunta a pregunta</h2>' +
      '<table><thead><tr><th>N°</th><th>Eje</th><th>Indicador</th><th>Respondió</th><th>Correcta</th><th></th></tr></thead><tbody>' +
      r.preguntas.map((p) =>
        '<tr><td><strong>' + p.numero + '</strong></td>' +
          '<td class="silencio">' + esc(p.eje) + '</td>' +
          '<td class="silencio">' + esc(p.indicador) + '</td>' +
          '<td>' + (p.tipo === 'alternativas'
            ? (p.respondio || '<span class="silencio">no respondió</span>')
            : (p.codigo_rubrica === null || p.codigo_rubrica === undefined
                ? '<span class="etiqueta ambar">sin corregir</span>'
                : 'Código ' + p.codigo_rubrica)) + '</td>' +
          '<td>' + (p.tipo === 'alternativas' ? esc(p.clave || '') : '—') + '</td>' +
          '<td>' + (p.correcta ? '<span class="etiqueta verde">✓</span>' : '<span class="etiqueta roja">✗</span>') + '</td>' +
        '</tr>' +
        '').join('') +
      '</tbody></table></div>';
}

/* ============================================================ VISTA PREVIA */

/**
 * La prueba tal como la vera el estudiante, con la clave destacada.
 * Permite revisarla antes de publicar sin ocupar el codigo de un alumno.
 */
export async function vistaPrevia(nodo, id) {
  const r = await api('/api/admin/pruebas/' + id + '/vista-previa');
  const sinClave = r.preguntas.filter((p) => !p.clave).length;
  const sinCriterio = r.preguntas.filter((p) => !p.eje).length;

  const secciones = [];
  const textos = [...r.textos].sort((a, b) => a.orden - b.orden || a.id - b.id);

  for (const t of textos) {
    const preguntas = r.preguntas.filter((p) => p.texto_id === t.id);
    if (!preguntas.length) continue;
    secciones.push(
      '<section class="examen">' +
        '<article class="lectura">' +
          '<span class="etiqueta gris">' + esc(t.tipo_texto) + '</span>' +
          '<h2 style="margin-top:.6rem">' + esc(t.titulo) + '</h2>' +
          (t.autor ? '<p class="silencio">' + esc(t.autor) + '</p>' : '') +
          '<div class="cuerpo">' + parrafos(t.contenido) + '</div>' +
        '</article>' +
        '<div>' + preguntas.map(dibujarPreguntaPrevia).join('') + '</div>' +
      '</section>'
    );
  }

  const sueltas = r.preguntas.filter((p) => !p.texto_id);
  if (sueltas.length) secciones.push('<section>' + sueltas.map(dibujarPreguntaPrevia).join('') + '</section>');

  nodo.innerHTML = cabecera(r.prueba, 'vista') +
    '<div class="tarjeta no-imprimir"><div class="fila">' +
      '<div class="crece"><strong>Así la verá el estudiante.</strong> ' +
      '<span class="silencio">La alternativa correcta va destacada en verde; el estudiante no la ve.</span></div>' +
      '<button onclick="window.print()">Imprimir</button>' +
    '</div>' +
    (sinClave || sinCriterio
      ? '<div class="aviso info" style="margin:.8rem 0 0">' +
          (sinClave ? '<strong>' + plural(sinClave, 'pregunta') + ' sin alternativa correcta marcada.</strong> ' +
            'Esas se cuentan como incorrectas para todos. ' : '') +
          (sinCriterio ? plural(sinCriterio, 'pregunta') + ' sin criterio: no aparecerán en el desglose del informe.' : '') +
        '</div>'
      : '<div class="aviso ok" style="margin:.8rem 0 0">Todas las preguntas tienen clave y criterio.</div>') +
    '</div>' +
    (r.prueba.instrucciones
      ? '<div class="tarjeta"><h3>Instrucciones</h3>' + parrafos(r.prueba.instrucciones) + '</div>'
      : '') +
    secciones.join('');
}

function dibujarPreguntaPrevia(p) {
  const alternativas = (p.opciones || []).map((o) => {
    const correcta = o.letra === p.clave;
    return '<div class="alternativa' + (correcta ? ' elegida' : '') + '" style="cursor:default">' +
      '<span class="letra">' + o.letra + '.</span>' +
      '<span>' + esc(o.contenido) + '</span>' +
      (correcta ? '<span class="etiqueta verde" style="margin-left:auto">correcta</span>' : '') +
    '</div>';
  }).join('');

  return '<div class="pregunta">' +
    '<p><span class="numero">' + p.numero + '.</span> ' + esc(p.enunciado) + '</p>' +
    (p.cita ? '<div class="cita">' + esc(p.cita) + '</div>' : '') +
    alternativas +
    '<p class="silencio" style="margin:.6rem 0 0">' +
      (p.eje ? '<span class="etiqueta">' + esc(p.eje) + '</span>' : '<span class="etiqueta roja">sin criterio</span>') +
      (p.clave ? '' : ' <span class="etiqueta roja">sin clave</span>') +
    '</p>' +
  '</div>';
}
