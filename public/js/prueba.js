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
  const { prueba, preguntas } = datos;

  nodo.innerHTML = cabecera(prueba, 'editor') +
    '<div id="aviso" class="aviso"></div>' +
    seccionAjustes(prueba, nomina.cursos) +
    seccionPreguntas(preguntas, prueba);

  conectarAjustes(prueba);
  conectarPreguntas(prueba, preguntas);
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

/* ----------------------------------------------------------------- preguntas */

const HABILIDADES = ['Localizar', 'Interpretar y relacionar', 'Reflexionar'];

/**
 * Habilidad que mide la pregunta. Son tres y cada pregunta mide exactamente
 * una, asi que van como opciones excluyentes y no como texto libre: escribirla
 * a mano permitiria que una tilde distinta creara una habilidad aparte en el
 * informe sin que nada lo advirtiera.
 */
function bloqueCriterios(p) {
  return '<div class="campo" data-criterios><label>Habilidad que mide esta pregunta</label>' +
    '<div class="fila" style="gap:.4rem">' +
      HABILIDADES.map((h) =>
        '<label class="alternativa" style="margin:0">' +
          '<input type="radio" name="hab-' + p.id + '" data-criterio="' + esc(h) + '"' +
          (p.eje === h ? ' checked' : '') + '>' +
          '<span>' + esc(h) + '</span>' +
        '</label>').join('') +
    '</div>' +
    '<p class="silencio" data-resumen-criterios></p></div>';
}

function seccionPreguntas(preguntas, prueba) {
  // (criterios se calcula abajo y se pasa a cada tarjeta)
  const sinClasificar = preguntas.filter((p) => !p.eje).length;
  const sinClave = preguntas.filter((p) => p.tipo === 'alternativas' && !p.clave).length;

  return '<div class="tarjeta"><div class="fila"><h2 class="crece">Preguntas (' + preguntas.length + ')</h2>' +
      '<button id="q-nueva">Agregar pregunta</button></div>' +
    (sinClasificar || sinClave
      ? '<div class="aviso info">' +
          (sinClave ? sinClave + ' pregunta(s) de alternativas sin clave marcada. ' : '') +
          (sinClasificar ? sinClasificar + ' pregunta(s) sin criterio: no aparecerán en el desglose del informe.' : '') +
        '</div>'
      : '') +
    preguntas.map(tarjetaPregunta).join('') +
    (preguntas.length ? '' : '<p class="silencio">Todavía no hay preguntas.</p>') +
    '</div>';
}

function tarjetaPregunta(p) {
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
      '<div class="campo"><label>Puntaje</label><input data-campo="puntaje" type="number" min="1" value="' + p.puntaje + '"></div>' +
    '</div>' +

    '<div class="campo"><label>Enunciado</label><textarea data-campo="enunciado" rows="2">' + esc(p.enunciado) + '</textarea></div>' +
    '<div class="campo"><label>Fragmento citado dentro de la pregunta (opcional)</label>' +
      '<textarea data-campo="cita" rows="2">' + esc(p.cita) + '</textarea></div>' +

    // Un solo campo: el criterio que mide la pregunta. Es lo que agrupa el
    // informe. Se escribe libre porque cada prueba usa su propio conjunto
    // (los ejes del DIA en unas, "Extraccion de informacion" en otras), con
    // sugerencias de los ya usados para no tipear dos veces lo mismo.
    bloqueCriterios(p) +

    '<details style="margin-bottom:.8rem"><summary class="silencio">Datos adicionales (opcionales)</summary>' +
      '<div class="rejilla dos" style="margin-top:.6rem">' +
        '<div class="campo"><label>N° de OA</label><input data-campo="oa" value="' + esc(p.oa) + '" placeholder="3"></div>' +
        '<div class="campo"><label>Indicador de evaluación</label>' +
          '<input data-campo="indicador" value="' + esc(p.indicador) + '" ' +
          'placeholder="Descripción larga de lo que mide"></div>' +
      '</div>' +
    '</details>' +

    '<div data-cuerpo>' + cuerpoAlternativas + '</div>' +

    '<div class="fila fin" style="margin-top:.8rem">' +
      '<button class="peligro chico" data-borrar-pregunta="' + p.id + '">Eliminar</button>' +
      '<button class="neutro chico" data-guardar-pregunta="' + p.id + '">Guardar</button>' +
      '<button class="chico" data-guardar-y-seguir="' + p.id + '">Guardar y agregar otra</button>' +
    '</div></details>';
}

/** Aviso bajo las casillas: cuantos criterios lleva la pregunta. */
function resumir(caja) {
  const nota = caja.querySelector('[data-resumen-criterios]');
  if (!nota) return;
  const marcada = caja.querySelector('[data-criterio]:checked');
  nota.textContent = marcada ? '' : 'Sin habilidad: no aparecerá en el desglose del informe.';
}

function leerPregunta(caja) {
  const cuerpo = {};
  caja.querySelectorAll('[data-campo]').forEach((c) => { cuerpo[c.dataset.campo] = c.value; });
  const marcada = caja.querySelector('[data-criterio]:checked');
  cuerpo.eje = marcada ? marcada.dataset.criterio : '';

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
 * Si se viene de "guardar y agregar otra", hereda OA, criterio e indicador de la
 * anterior: en una prueba real varias preguntas seguidas comparten esa
 * clasificacion, y volver a elegirla cada vez es puro roce.
 */
async function agregarPregunta(prueba, numero, anterior = null) {
  const cuerpo = { numero, enunciado: '' };
  if (anterior) {
    cuerpo.oa = anterior.oa;
    cuerpo.eje = anterior.eje;
    cuerpo.indicador = anterior.indicador;
  }
  const { id } = await api('/api/admin/pruebas/' + prueba.id + '/preguntas', { cuerpo });
  pedirFoco('pregunta', id, true);
  recargar();
}

function conectarPreguntas(prueba, preguntas) {
  $('#q-nueva').addEventListener('click', () => agregarPregunta(prueba, preguntas.length + 1));

  document.querySelectorAll('[data-criterios]').forEach((caja) => {
    caja.querySelectorAll('[data-criterio]').forEach((c) => c.addEventListener('change', () => resumir(caja)));
    resumir(caja);
  });

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
  const [r, establecimiento] = await Promise.all([
    api('/api/admin/pruebas/' + id + '/informe' + (curso ? '?curso=' + encodeURIComponent(curso) : '')),
    api('/api/admin/establecimiento'),
  ]);

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
      '<a href="#prueba/' + id + '/informes-cursos"><button class="secundario">Informes por curso</button></a>' +
      '<a href="#prueba/' + id + '/informes-alumnos"><button class="secundario">Informes por alumno</button></a>' +
      '<button class="neutro" id="btn-recalcular">Recalcular</button>' +
      '<button onclick="window.print()">Imprimir</button>' +
    '</div>' +


    '<div class="rejilla tres">' +
      tarjetaDato('Estudiantes evaluados', r.total_alumnos, r.en_curso ? '<span class="silencio">' + r.en_curso + ' aún rindiendo</span>' : '') +
      tarjetaDato('Logro promedio del curso', r.promedio_logro + '%') +
      tarjetaDato('Preguntas', r.preguntas.length) +
    '</div>' +

    portada(r, establecimiento) +
    seccionNiveles(r) +
    seccionEjes(r) +
    seccionPorCurso(r) +
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

/** Encabezado identificatorio, como el del informe oficial del DIA. */
function portada(r, e) {
  const ahora = new Date().toLocaleString('es-CL', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
  const dato = (etiqueta, valor) => valor
    ? '<tr><td style="width:230px;color:var(--tinta-suave)">' + etiqueta + '</td><td><strong>' + esc(valor) + '</strong></td></tr>'
    : '';

  return '<div class="tarjeta"><h2>Informe de resultados</h2><table><tbody>' +
    dato('Establecimiento', e.nombre) +
    dato('RBD', e.rbd) +
    dato('Comuna', e.comuna) +
    dato('Prueba', r.prueba.titulo) +
    dato('Asignatura', r.prueba.asignatura) +
    dato('Nivel', r.prueba.nivel) +
    dato('Curso', r.filtro_curso || 'Todos los cursos') +
    dato('Estudiantes que considera este informe', String(r.total_alumnos)) +
    dato('Fecha de generación', ahora) +
    '</tbody></table>' +
    '<p class="silencio" style="margin-top:1rem">Estos resultados sirven para ajustar la planificación ' +
      'y focalizar el apoyo. No están pensados para calificar ni para comparar cursos entre sí.</p>' +
    '</div>';
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
  return '<div class="tarjeta"><h2>2. Resultados por criterio</h2>' +
    '<p class="silencio">Porcentaje promedio de logro del curso en cada criterio evaluado. ' +
      'Una pregunta que declara dos criterios cuenta en ambos.</p>' +
    '<table><tbody>' +
    r.por_eje.map((e) =>
      '<tr><td style="width:230px">' + esc(e.eje) + '<br><span class="silencio">' + plural(e.preguntas, 'pregunta') + '</span></td>' +
        '<td style="width:50%">' + barra(e.porcentaje) + '</td>' +
        '<td><strong>' + e.porcentaje + '%</strong></td></tr>').join('') +
    '</tbody></table>' +

    '</div>';
}

/**
 * Comparacion entre cursos. Con una prueba que rinden seis cursos, mirarlos de a
 * uno filtrando obliga a anotar los numeros aparte para poder compararlos.
 */
function seccionPorCurso(r) {
  if (r.por_curso.length < 2) return '';
  const habilidades = r.por_eje.map((e) => e.eje);

  return '<div class="tarjeta tabla-scroll"><h2>3. Resultados por curso</h2>' +
    '<table><thead><tr><th>Curso</th><th>Estudiantes</th><th>Logro</th>' +
      '<th>Niveles de logro</th>' +
      habilidades.map((h) => '<th>' + esc(h) + '</th>').join('') +
    '</tr></thead><tbody>' +
    r.por_curso.map((c) =>
      '<tr><td><strong>' + esc(c.curso) + '</strong></td>' +
        '<td class="silencio">' + c.total + '</td>' +
        '<td>' + barra(c.promedio) + ' <strong>' + c.promedio + '%</strong></td>' +
        '<td style="white-space:nowrap">' + c.niveles.map((n) =>
          '<span class="etiqueta ' + (n.nivel === 3 ? 'verde' : n.nivel === 2 ? 'ambar' : 'roja') + '">' +
          n.etiqueta.replace('Nivel ', '') + ': ' + n.cantidad + '</span> ').join('') + '</td>' +
        habilidades.map((h) => {
          const e = c.por_eje.find((x) => x.eje === h);
          return '<td>' + (e ? e.porcentaje + '%' : '—') + '</td>';
        }).join('') +
      '</tr>').join('') +
    '</tbody></table>' +
    '<p class="silencio">Estos resultados sirven para focalizar el apoyo, no para ordenar cursos entre sí: ' +
      'cada uno llega con una historia distinta.</p></div>';
}

function seccionTabla1(r) {
  return '<div class="tarjeta tabla-scroll"><h2>4. Resultados por pregunta</h2>' +
    '<p class="silencio">La alternativa correcta va destacada. Un distractor con alto porcentaje señala un error de comprensión que vale la pena indagar.</p>' +
    '<table><thead><tr>' +
      '<th>N°</th><th>Criterio</th><th>% respuestas</th><th>Logro</th>' +
    '</tr></thead><tbody>' +
    r.preguntas.map((p) =>
      '<tr><td><strong>' + p.numero + '</strong></td>' +
        '<td class="silencio">' + esc(p.eje) + '</td>' +
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
  return '<div class="tarjeta tabla-scroll"><h2>5. Resultados por estudiante</h2>' +
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

  return '<div class="tarjeta"><h2>6. Lectura preliminar de los resultados</h2>' +
    '<ul>' +
      (ejes.length
        ? '<li>Criterio menos logrado: <strong>' + esc(ejes[0].eje) + '</strong> (' + ejes[0].porcentaje + '%). ' +
          'Criterio más logrado: <strong>' + esc(ejes[ejes.length - 1].eje) + '</strong> (' + ejes[ejes.length - 1].porcentaje + '%).</li>'
        : '') +
      '<li><strong>' + bajoNivel1.porcentaje + '%</strong> del curso (' + plural(bajoNivel1.cantidad, 'estudiante') + ') está en Nivel I: ' +
        'no demuestra haber alcanzado los aprendizajes mínimos del nivel.</li>' +
      '<li>Preguntas con menor logro: ' +
        preguntasDebiles.map((p) => 'N° ' + p.numero + ' (' + p.logro + '%)').join(', ') + '.</li>' +
    '</ul>' +
    '<h3>Preguntas guía para el análisis</h3>' +
    '<ul class="silencio">' +
      '<li>¿Los resultados reflejan las habilidades y contenidos trabajados hasta ahora en el curso?</li>' +
      '<li>¿Las preguntas con menor logro pertenecen a un mismo texto o a un mismo criterio?</li>' +
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
    '<div class="examen-simple">' + r.preguntas.map(dibujarPreguntaPrevia).join('') + '</div>';
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

/* ============================================= INFORMES INDIVIDUALES EN BLOQUE */

/**
 * Un informe por estudiante, todos en una vista imprimible con salto de pagina
 * entre uno y otro. Es la hoja que se le entrega a cada uno.
 */
export async function vistaInformesAlumnos(nodo, id) {
  const curso = sessionStorage.getItem('curso-informe') || '';
  const [r, establecimiento] = await Promise.all([
    api('/api/admin/pruebas/' + id + '/informes-alumnos' + (curso ? '?curso=' + encodeURIComponent(curso) : '')),
    api('/api/admin/establecimiento'),
  ]);

  if (!r.total) {
    nodo.innerHTML = '<div class="fila no-imprimir"><a href="#prueba/' + id + '/informe" class="silencio">← Informe del curso</a></div>' +
      '<div class="tarjeta"><p>Todavía no hay pruebas entregadas.</p></div>';
    return;
  }

  nodo.innerHTML =
    '<div class="fila no-imprimir"><h1 class="crece">Informes por estudiante</h1>' +
      '<a href="#prueba/' + id + '/informe"><button class="neutro">Volver al informe</button></a>' +
      '<button onclick="window.print()">Imprimir los ' + r.total + '</button></div>' +
    '<p class="silencio no-imprimir">Una hoja por estudiante' +
      (curso ? ' de ' + esc(curso) : '') + '. Al imprimir, cada informe empieza en una página nueva.</p>' +
    r.informes.map((inf, i) => hojaDeAlumno(inf, establecimiento, i)).join('');
}

function hojaDeAlumno(inf, e, indice) {
  const { intento, prueba } = inf;
  const correctas = inf.preguntas.filter((p) => p.correcta).length;

  return '<section class="hoja-curso"' + (indice ? ' style="break-before:page"' : '') + '>' +
    '<div class="tarjeta">' +
      '<div class="silencio" style="font-size:.8rem">' + esc(e.nombre || '') +
        (e.rbd ? ' · RBD ' + esc(e.rbd) : '') + '</div>' +
      '<h2 style="margin:.3rem 0">' + esc(intento.nombre) + '</h2>' +
      '<p class="silencio">' + esc(prueba.titulo) + ' · ' + esc(intento.curso) +
        ' · entregada el ' + fecha(intento.enviado_en) + '</p>' +

      '<div class="rejilla tres" style="margin:1rem 0">' +
        tarjetaDato('Logro', intento.porcentaje + '%') +
        tarjetaDato('Puntaje', intento.puntaje + ' / ' + intento.puntaje_max) +
        tarjetaDato('Nivel de logro', ROMANO[intento.nivel_logro] || '—') +
      '</div>' +

      '<h3>Desempeño por criterio</h3>' +
      (inf.por_eje.length
        ? '<table><tbody>' + inf.por_eje.map((c) =>
            '<tr><td style="width:250px">' + esc(c.eje) + '</td>' +
              '<td style="width:45%">' + barra(c.porcentaje) + '</td>' +
              '<td><strong>' + c.porcentaje + '%</strong></td></tr>').join('') +
          '</tbody></table>'
        : '<p class="silencio">Las preguntas de esta prueba no tienen criterio asignado.</p>') +

      '<h3 style="margin-top:1.2rem">Respuestas</h3>' +
      '<p class="silencio">' + correctas + ' correctas de ' + inf.preguntas.length + '.</p>' +
      '<div class="navegador">' +
        inf.preguntas.map((p) =>
          '<span class="marca-respuesta ' + (p.correcta ? 'ok' : (p.respondio ? 'mal' : 'vacia')) + '" ' +
            'title="' + esc(p.eje || '') + '">' + p.numero + '</span>').join('') +
      '</div>' +
      '<p class="silencio" style="margin-top:.6rem;font-size:.8rem">' +
        '<span class="marca-respuesta ok">■</span> correcta · ' +
        '<span class="marca-respuesta mal">■</span> incorrecta · ' +
        '<span class="marca-respuesta vacia">■</span> sin responder</p>' +
    '</div>' +
  '</section>';
}

/* ================================================ INFORMES POR CURSO EN BLOQUE */

/**
 * Un informe completo por cada curso que rindio, en hojas separadas. Es lo que
 * se entrega en el consejo de profesores o se archiva por curso.
 */
export async function vistaInformesCursos(nodo, id) {
  const establecimiento = await api('/api/admin/establecimiento');
  const general = await api('/api/admin/pruebas/' + id + '/informe');

  if (!general.total_alumnos) {
    nodo.innerHTML = '<div class="fila no-imprimir"><a href="#prueba/' + id + '/informe" class="silencio">← Informe general</a></div>' +
      '<div class="tarjeta"><p>Todavía no hay pruebas entregadas.</p></div>';
    return;
  }

  const cursos = general.cursos_disponibles;
  const informes = [];
  for (const curso of cursos) {
    informes.push(await api('/api/admin/pruebas/' + id + '/informe?curso=' + encodeURIComponent(curso)));
  }

  nodo.innerHTML =
    '<div class="fila no-imprimir"><h1 class="crece">Informes por curso</h1>' +
      '<a href="#prueba/' + id + '/informe"><button class="neutro">Informe general</button></a>' +
      '<button onclick="window.print()">Imprimir los ' + informes.length + '</button></div>' +
    '<p class="silencio no-imprimir">Un informe completo por curso. Al imprimir, cada uno empieza en una página nueva.</p>' +
    informes.map((r, i) => hojaDeCurso(r, establecimiento, i)).join('');
}

function hojaDeCurso(r, e, indice) {
  return '<section class="hoja-curso"' + (indice ? ' style="break-before:page"' : '') + '>' +
    '<div class="tarjeta">' +
      '<div class="silencio" style="font-size:.8rem">' + esc(e.nombre || '') +
        (e.rbd ? ' · RBD ' + esc(e.rbd) : '') + '</div>' +
      '<h2 style="margin:.3rem 0">' + esc(r.filtro_curso) + '</h2>' +
      '<p class="silencio">' + esc(r.prueba.titulo) + ' · ' + plural(r.total_alumnos, 'estudiante') +
        ' · logro promedio ' + r.promedio_logro + '%</p>' +
    '</div>' +
    seccionNiveles(r) +
    seccionEjes(r) +
    seccionPorAlumno(r) +
  '</section>';
}
