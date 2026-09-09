import { api, $, $$, esc, parrafos, mostrarAviso, fecha, barra, plural, ROMANO,
  graficoBarras, graficoTorta, formatoNota, colorNota } from './comun.js';
import { escalaDeNotas, calcularNota, NOTA_APROBACION } from './notas.js';

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
    ['corregir', 'Corregir'],
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

  const puntajeTotal = preguntas.reduce((s, p) => s + (p.puntaje || 0), 0);
  const criterios = datos.criterios || [];

  nodo.innerHTML = cabecera(prueba, 'editor') +
    '<div id="aviso" class="aviso"></div>' +
    seccionAjustes(prueba, nomina.cursos, puntajeTotal) +
    seccionCriterios(criterios, preguntas) +
    seccionPreguntas(preguntas, prueba, criterios);

  conectarAjustes(prueba, puntajeTotal);
  conectarCriterios(prueba);
  conectarPreguntas(prueba, preguntas);
  restaurarFoco();
}

/* ---------------------------------------------------------------- criterios */

/**
 * Los criterios que la docente puede asignar a sus preguntas.
 *
 * Van en un panel aparte y no dentro de cada pregunta: con cuarenta y siete
 * tarjetas, repetir el formulario de "agregar criterio" en cada una seria ruido.
 * Aqui se administran una vez y abajo se eligen con un clic.
 */
function seccionCriterios(criterios, preguntas) {
  // Criterios que alguna pregunta usa pero que ya no estan en la lista (los
  // borro alguien despues de clasificar). Se muestran igual, porque el informe
  // los sigue mostrando y esconderlos aqui seria mentir sobre la prueba.
  const enLista = criterios.map((c) => c.nombre);
  const huerfanos = [...new Set(preguntas.map((p) => p.eje).filter((e) => e && !enLista.includes(e)))];

  const ficha = (nombre, cuantas, id) =>
    '<span class="criterio' + (id ? '' : ' huerfano') + '"' + (id ? ' data-criterio-id="' + id + '"' : '') + '>' +
      '<span data-nombre-criterio>' + esc(nombre) + '</span>' +
      (cuantas ? ' <span class="silencio">(' + cuantas + ')</span>' : '') +
      (id
        ? '<button class="quitar" data-editar-criterio="' + id + '" ' +
          'data-nombre="' + esc(nombre) + '" ' +
          'title="Cambiarle el nombre a «' + esc(nombre) + '»">✎</button>' +
          '<button class="quitar" data-borrar-criterio="' + id + '" ' +
          'data-nombre="' + esc(nombre) + '" data-usos="' + cuantas + '" ' +
          'title="Quitar «' + esc(nombre) + '» de la lista">×</button>'
        : '') +
    '</span>';

  const usos = (nombre) => preguntas.filter((p) => p.eje === nombre).length;

  return '<div class="tarjeta"><h2>Criterios de evaluación</h2>' +
    '<p class="silencio">Cada pregunta mide uno. Escribe los que use esta prueba; ' +
      'quedan guardados para las siguientes. Entre paréntesis, cuántas preguntas de esta prueba lo usan.</p>' +

    (criterios.length || huerfanos.length
      ? '<div class="fila" style="gap:.4rem;margin-bottom:.8rem">' +
          criterios.map((c) => ficha(c.nombre, usos(c.nombre), c.id)).join('') +
          huerfanos.map((h) => ficha(h, usos(h), null)).join('') +
        '</div>'
      : '<p class="aviso info">Todavía no hay criterios. Escribe el primero abajo.</p>') +

    (huerfanos.length
      ? '<p class="silencio">Los criterios en gris ya no están en la lista, pero hay preguntas ' +
        'clasificadas con ellos y siguen apareciendo en el informe.</p>'
      : '') +

    '<div class="fila">' +
      '<input id="c-nuevo" class="crece" maxlength="80" placeholder="Escribe un criterio nuevo y presiona Agregar">' +
      '<button id="c-agregar" class="secundario">Agregar</button>' +
    '</div></div>';
}

function conectarCriterios(prueba) {
  const campo = $('#c-nuevo');

  const agregar = async () => {
    const nombre = campo.value.trim();
    if (!nombre) return;
    try {
      await api('/api/admin/pruebas/' + prueba.id + '/criterios', { cuerpo: { nombre } });
      window.mantenerScroll = true;
      recargar();
    } catch (error) {
      mostrarAviso($('#aviso'), error.message);
    }
  };

  $('#c-agregar').addEventListener('click', agregar);
  campo.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); agregar(); } });

  // Renombrar: la ficha se convierte en un campo de texto en su lugar. Se hace
  // aqui mismo y no en otra pantalla porque corregir una tilde tiene que costar
  // dos clics, no una navegacion.
  $$('[data-editar-criterio]').forEach((boton) => {
    boton.addEventListener('click', () => {
      const ficha = boton.closest('[data-criterio-id]');
      if (ficha.querySelector('input')) return;

      const nombre = boton.dataset.nombre;
      const original = ficha.innerHTML;
      ficha.innerHTML = '<input value="' + esc(nombre) + '" maxlength="80" ' +
        'style="width:16rem;padding:.15rem .4rem;font-size:.85rem">' +
        '<button class="quitar" data-confirmar>✓</button>' +
        '<button class="quitar" data-cancelar>×</button>';

      const campo = ficha.querySelector('input');
      campo.focus();
      campo.select();

      const cancelar = () => { ficha.innerHTML = original; conectarCriterios(prueba); };

      const guardar = async () => {
        const nuevo = campo.value.trim();
        if (!nuevo || nuevo === nombre) return cancelar();
        try {
          const r = await api('/api/admin/pruebas/' + prueba.id + '/criterios/' + boton.dataset.editarCriterio,
            { metodo: 'PUT', cuerpo: { nombre: nuevo } });
          window.mantenerScroll = true;
          // Se espera el repintado: el aviso hay que escribirlo en el #aviso
          // nuevo, porque el repintado reemplaza el nodo y se lo llevaria.
          await recargar();
          if (r.preguntas) {
            mostrarAviso($('#aviso'),
              'Criterio renombrado. Se actualizaron ' + plural(r.preguntas, 'pregunta') + '.', 'ok');
          }
        } catch (error) {
          mostrarAviso($('#aviso'), error.message);
          cancelar();
        }
      };

      ficha.querySelector('[data-confirmar]').addEventListener('click', guardar);
      ficha.querySelector('[data-cancelar]').addEventListener('click', cancelar);
      campo.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); guardar(); }
        if (e.key === 'Escape') { e.preventDefault(); cancelar(); }
      });
    });
  });

  $$('[data-borrar-criterio]').forEach((boton) => {
    boton.addEventListener('click', async () => {
      const usos = Number(boton.dataset.usos) || 0;
      const aviso = usos
        ? 'Lo usan ' + plural(usos, 'pregunta') + ' de esta prueba.\n\n' +
          'Esas preguntas lo conservan y siguen apareciendo en el informe; lo que pasa ' +
          'es que ya no podrás asignarlo a preguntas nuevas.\n\n¿Quitar «' + boton.dataset.nombre + '» de la lista?'
        : '¿Quitar «' + boton.dataset.nombre + '» de la lista?';
      if (!confirm(aviso)) return;

      await api('/api/admin/pruebas/' + prueba.id + '/criterios/' + boton.dataset.borrarCriterio, { metodo: 'DELETE' });
      window.mantenerScroll = true;
      recargar();
    });
  });
}

function seccionAjustes(p, cursos, puntajeTotal) {
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
    seccionNotas(p, puntajeTotal) +

    // Al estudiante no se le muestra ningun resultado, ni al terminar ni
    // despues: la calificacion es del docente. Antes habia una casilla para
    // permitirlo; se quito a proposito, no por descuido.
    '<div class="fila fin"><button id="p-guardar">Guardar ajustes</button></div></div>';
}

/* ------------------------------------------------------------ calificacion */

/**
 * Escala de notas: cuantos puntos valen un 7,0, un 4,0 y un 1,0.
 *
 * Los tres campos admiten quedarse vacios, y vacio NO es cero: significa
 * "calcúlalo tú". El 7,0 sobre todo conviene dejarlo asi mientras la prueba se
 * escribe, porque cada pregunta nueva cambia el total y un numero fijo puesto al
 * principio quedaria desfasado sin avisar.
 */
function seccionNotas(p, puntajeTotal) {
  const auto = escalaDeNotas({ ...p, nota_activa: 1 }, puntajeTotal);
  const valor = (v) => (v === null || v === undefined ? '' : v);

  const campo = (id, etiqueta, guardado, sugerido) =>
    '<div class="campo"><label>' + etiqueta + '</label>' +
      '<input id="' + id + '" type="number" min="0" step="0.5" data-nota ' +
        'placeholder="automático: ' + sugerido + '" value="' + valor(guardado) + '"></div>';

  return '<h3>Calificación</h3>' +
    '<label class="alternativa" style="max-width:520px">' +
      '<input type="checkbox" id="p-nota-activa"' + (p.nota_activa ? ' checked' : '') + '>' +
      '<span>Calcular la nota de cada estudiante (escala de 1,0 a 7,0)</span></label>' +

    '<div id="p-nota-caja">' +
      '<p class="silencio">Fija cuántos puntos vale cada nota clave; las de en medio se calculan solas. ' +
        'Déjalo en blanco y se usa lo habitual: el 7,0 con el puntaje total y el 4,0 con el 60&nbsp;% de ese puntaje.</p>' +
      '<div class="rejilla tres">' +
        campo('p-nota-7', 'Puntaje para el 7,0', p.nota_puntaje_7, formatoPuntos(auto.puntaje_7)) +
        campo('p-nota-4', 'Puntaje para el 4,0', p.nota_puntaje_4, formatoPuntos(auto.puntaje_4)) +
        campo('p-nota-1', 'Puntaje para el 1,0', p.nota_puntaje_1, formatoPuntos(auto.puntaje_1)) +
      '</div>' +
      '<div id="p-nota-resumen" class="aviso"></div>' +
      '<details><summary class="silencio" style="cursor:pointer">Ver la tabla completa de puntaje a nota</summary>' +
        '<div id="p-nota-tabla" style="margin-top:.6rem"></div></details>' +
    '</div>';
}

/** Puntos sin decimales cuando son redondos: "28" en vez de "28.0". */
const formatoPuntos = (n) => String(Math.round(n * 10) / 10).replace('.', ',');

/**
 * Mantiene la vista previa al dia mientras se escribe. Ver la tabla antes de
 * guardar es lo que evita descubrir el 15 de octubre que el 4,0 quedo en un
 * puntaje que nadie alcanza.
 */
function conectarNotas(puntajeTotal) {
  const activa = $('#p-nota-activa');
  const caja = $('#p-nota-caja');
  const resumen = $('#p-nota-resumen');
  const tabla = $('#p-nota-tabla');

  const refrescar = () => {
    caja.style.opacity = activa.checked ? '1' : '.45';
    $$('[data-nota]').forEach((c) => { c.disabled = !activa.checked; });

    const escala = escalaDeNotas({
      nota_activa: 1,
      nota_puntaje_7: $('#p-nota-7').value === '' ? null : $('#p-nota-7').value,
      nota_puntaje_4: $('#p-nota-4').value === '' ? null : $('#p-nota-4').value,
      nota_puntaje_1: $('#p-nota-1').value === '' ? null : $('#p-nota-1').value,
    }, puntajeTotal);

    if (!activa.checked) {
      resumen.className = 'aviso';
      resumen.textContent = '';
      tabla.innerHTML = '';
      return;
    }

    if (!escala.valida) {
      resumen.className = 'aviso error';
      resumen.textContent = puntajeTotal === 0
        ? 'Todavía no hay preguntas, así que aún no se puede armar la escala.'
        : 'Esta escala no sirve: el 1,0 tiene que ir por debajo del 4,0 y el 4,0 por debajo del 7,0. ' +
          'Mientras esté así, la prueba no se califica.';
      tabla.innerHTML = '';
      return;
    }

    resumen.className = 'aviso info';
    resumen.innerHTML = 'La prueba tiene <strong>' + formatoPuntos(puntajeTotal) + ' puntos</strong>. ' +
      'El 4,0 se alcanza con <strong>' + formatoPuntos(escala.puntaje_4) + '</strong> ' +
      '(' + formatoPuntos(escala.exigencia) + ' % de exigencia) y el 7,0 con ' +
      '<strong>' + formatoPuntos(escala.puntaje_7) + '</strong>.' +
      (escala.puntaje_7 > puntajeTotal
        ? ' <strong>Ojo:</strong> el 7,0 pide más puntos de los que tiene la prueba, así que nadie puede sacarlo.'
        : '');

    tabla.innerHTML = tablaDePuntajes(escala, puntajeTotal);
  };

  [activa, $('#p-nota-7'), $('#p-nota-4'), $('#p-nota-1')]
    .forEach((c) => c.addEventListener('input', refrescar));
  activa.addEventListener('change', refrescar);
  refrescar();
}

/** Puntaje por puntaje, para pegarla en la pizarra o revisarla de un vistazo. */
function tablaDePuntajes(escala, puntajeTotal) {
  const tope = Math.max(puntajeTotal, escala.puntaje_7);
  const celdas = [];

  for (let puntos = 0; puntos <= tope; puntos++) {
    const nota = calcularNota(puntos, escala);
    celdas.push(
      '<span class="celda-nota' + (nota >= NOTA_APROBACION ? ' aprueba' : '') + '">' +
        '<b>' + puntos + '</b> ' + formatoNota(nota) + '</span>'
    );
  }

  return '<div class="tabla-notas">' + celdas.join('') + '</div>' +
    '<p class="silencio" style="margin-top:.5rem">Puntos y la nota que les corresponde. ' +
      'Lo verde es de 4,0 para arriba.</p>';
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

function conectarAjustes(prueba, puntajeTotal) {
  conectarCursos();
  conectarNotas(puntajeTotal);

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
        // Vacío viaja como cadena vacía y el servidor lo guarda como NULL, que
        // es lo que significa «automático». Un 0 sería un puntaje de verdad.
        nota_activa: $('#p-nota-activa').checked,
        nota_puntaje_7: $('#p-nota-7').value,
        nota_puntaje_4: $('#p-nota-4').value,
        nota_puntaje_1: $('#p-nota-1').value,
      },
    });
    mostrarAviso($('#aviso'), 'Ajustes guardados.', 'ok');
  });
}

/* ----------------------------------------------------------------- preguntas */

/**
 * Criterio que mide la pregunta: uno solo, elegido de la lista de arriba.
 *
 * Se elige y no se escribe aqui: escribirlo en cada pregunta permitiria que una
 * tilde distinta creara un criterio aparte en el informe sin que nada lo
 * advirtiera. Si la pregunta trae un criterio que ya no esta en la lista, se
 * muestra igual y marcado, para que guardarla no lo borre en silencio.
 */
function bloqueCriterios(p, criterios) {
  const nombres = criterios.map((c) => c.nombre);
  const opcionesCriterio = p.eje && !nombres.includes(p.eje) ? nombres.concat([p.eje]) : nombres;

  if (!opcionesCriterio.length) {
    return '<div class="campo" data-criterios><label>Criterio que mide esta pregunta</label>' +
      '<p class="silencio">Agrega criterios arriba para poder elegir uno.</p></div>';
  }

  return '<div class="campo" data-criterios><label>Criterio que mide esta pregunta</label>' +
    '<div class="fila" style="gap:.4rem">' +
      opcionesCriterio.map((h) =>
        '<label class="alternativa" style="margin:0">' +
          '<input type="radio" name="hab-' + p.id + '" data-criterio="' + esc(h) + '"' +
          (p.eje === h ? ' checked' : '') + '>' +
          '<span>' + esc(h) + (nombres.includes(h) ? '' : ' <span class="silencio">(fuera de la lista)</span>') + '</span>' +
        '</label>').join('') +
    '</div>' +
    '<p class="silencio" data-resumen-criterios></p></div>';
}

/**
 * Como responde el alumno esta pregunta.
 *
 * Es lo primero que hay que decidir, porque cambia el resto de la tarjeta: una
 * pregunta en papel no lleva alternativas ni clave, y ni siquiera se le envia al
 * navegador del alumno.
 */
function bloqueTipo(p) {
  const opcion = (valor, titulo, detalle) =>
    '<label class="alternativa" style="margin:0;align-items:flex-start">' +
      '<input type="radio" name="tipo-' + p.id + '" data-tipo="' + valor + '"' +
        (p.tipo === valor ? ' checked' : '') + '>' +
      '<span><strong>' + titulo + '</strong><br>' +
        '<span class="silencio">' + detalle + '</span></span>' +
    '</label>';

  return '<div class="campo" data-tipos><label>¿Cómo la responde el estudiante?</label>' +
    '<div class="rejilla dos">' +
      opcion('alternativas', 'En pantalla', 'Marca una alternativa. Se corrige sola con la clave.') +
      opcion('papel', 'En papel', 'La escribe en la hoja impresa. No aparece en pantalla y la corriges tú.') +
    '</div></div>';
}

function seccionPreguntas(preguntas, prueba, criterios) {
  const sinClasificar = preguntas.filter((p) => !p.eje).length;
  const sinClave = preguntas.filter((p) => p.tipo !== 'papel' && !p.clave).length;
  const enPapel = preguntas.filter((p) => p.tipo === 'papel');
  const puntajeTotal = preguntas.reduce((s, p) => s + (p.puntaje || 0), 0);

  return '<div class="tarjeta"><div class="fila"><h2 class="crece">Preguntas (' + preguntas.length + ')</h2>' +
      '<span class="silencio">' + puntajeTotal + ' puntos en total</span>' +
      '<button id="q-nueva">Agregar pregunta</button></div>' +
    (sinClasificar || sinClave
      ? '<div class="aviso info">' +
          (sinClave ? sinClave + ' pregunta(s) de alternativas sin clave marcada. ' : '') +
          (sinClasificar ? sinClasificar + ' pregunta(s) sin criterio: no aparecerán en el desglose del informe.' : '') +
        '</div>'
      : '') +
    (enPapel.length
      ? '<div class="aviso info">' + plural(enPapel.length, 'pregunta') + ' se responde(n) <strong>en papel</strong> ' +
        '(N° ' + enPapel.map((p) => p.numero).join(', ') + '). No aparecen en pantalla: ' +
        'las corriges tú en la pestaña <strong>Corregir</strong>, cuando los estudiantes hayan entregado.</div>'
      : '') +
    preguntas.map((p) => tarjetaPregunta(p, criterios)).join('') +
    (preguntas.length ? '' : '<p class="silencio">Todavía no hay preguntas.</p>') +
    '</div>';
}

function tarjetaPregunta(p, criterios) {
  const enPapel = p.tipo === 'papel';
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
      (enPapel
        ? ' <span class="etiqueta ambar">En papel · ' + plural(p.puntaje, 'punto') + '</span>'
        : (p.clave ? ' <span class="etiqueta verde">Clave ' + p.clave + '</span>' : ' <span class="etiqueta roja">sin clave</span>')) +
      (p.eje ? ' <span class="etiqueta">' + esc(p.eje) + '</span>' : '') +
    '</summary>' +

    '<div class="rejilla dos" style="margin-top:.8rem">' +
      '<div class="campo"><label>N° de pregunta</label><input data-campo="numero" type="number" min="1" value="' + p.numero + '"></div>' +
      '<div class="campo"><label>Puntaje</label><input data-campo="puntaje" type="number" min="1" value="' + p.puntaje + '"></div>' +
    '</div>' +

    bloqueTipo(p) +

    '<div class="campo"><label>Enunciado</label><textarea data-campo="enunciado" rows="2">' + esc(p.enunciado) + '</textarea></div>' +
    '<div class="campo"><label>Fragmento citado dentro de la pregunta (opcional)</label>' +
      '<textarea data-campo="cita" rows="2">' + esc(p.cita) + '</textarea></div>' +

    bloqueCriterios(p, criterios) +

    '<details style="margin-bottom:.8rem"><summary class="silencio">Datos adicionales (opcionales)</summary>' +
      '<div class="rejilla dos" style="margin-top:.6rem">' +
        '<div class="campo"><label>N° de OA</label><input data-campo="oa" value="' + esc(p.oa) + '" placeholder="3"></div>' +
        '<div class="campo"><label>Indicador de evaluación</label>' +
          '<input data-campo="indicador" value="' + esc(p.indicador) + '" ' +
          'placeholder="Descripción larga de lo que mide"></div>' +
      '</div>' +
    '</details>' +

    '<div data-cuerpo' + (enPapel ? ' hidden' : '') + '>' + cuerpoAlternativas + '</div>' +
    '<div data-aviso-papel class="aviso info"' + (enPapel ? '' : ' hidden') + '>' +
      'Esta pregunta no aparece en pantalla. El estudiante la responde en la hoja impresa ' +
      'y tú anotas su puntaje (de 0 a ' + p.puntaje + ') en la pestaña <strong>Corregir</strong>.</div>' +

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

  const tipo = caja.querySelector('[data-tipo]:checked');
  cuerpo.tipo = tipo ? tipo.dataset.tipo : 'alternativas';

  // Una pregunta en papel no lleva alternativas ni clave. Enviarlas igual
  // dejaria guardado un texto que despues reaparece si vuelve a ser de pantalla,
  // pero sobre todo haria creer que tiene clave cuando no la tiene.
  if (cuerpo.tipo === 'papel') return cuerpo;

  cuerpo.opciones = [...caja.querySelectorAll('[data-opcion]')]
    .map((c) => ({ letra: c.dataset.opcion, contenido: c.value }));

  const correcta = caja.querySelector('[data-clave]:checked');
  cuerpo.clave = correcta ? correcta.dataset.clave : null;

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
    // Tambien el tipo y el puntaje: las preguntas en papel suelen ir juntas al
    // final de la prueba, y volver a marcarlo en cada una es puro roce.
    cuerpo.tipo = anterior.tipo;
    cuerpo.puntaje = anterior.puntaje;
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

  // Cambiar el tipo reordena la tarjeta al instante: sin esto, marcar «en papel»
  // dejaria las cinco alternativas a la vista y no quedaria claro que se ignoran.
  document.querySelectorAll('[data-pregunta]').forEach((caja) => {
    const cuerpo = caja.querySelector('[data-cuerpo]');
    const aviso = caja.querySelector('[data-aviso-papel]');
    if (!cuerpo || !aviso) return;

    caja.querySelectorAll('[data-tipo]').forEach((radio) => {
      radio.addEventListener('change', () => {
        const enPapel = radio.dataset.tipo === 'papel' && radio.checked;
        cuerpo.hidden = enPapel;
        aviso.hidden = !enPapel;
      });
    });
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

/* ================================================================ CORREGIR */

/**
 * Correccion de las preguntas que se responden en papel.
 *
 * Es una grilla —una fila por estudiante, una columna por pregunta— y no una
 * ficha por estudiante: la profesora corrige con la pila de hojas al lado y va
 * anotando; obligarla a entrar y salir de doscientas fichas haria la tarea
 * inviable. Cada casilla se guarda sola al cambiarla.
 */
export async function vistaCorregir(nodo, id) {
  const curso = sessionStorage.getItem('curso-informe') || '';
  const r = await api('/api/admin/pruebas/' + id + '/correccion' + (curso ? '?curso=' + encodeURIComponent(curso) : ''));

  if (!r.preguntas.length) {
    nodo.innerHTML = cabecera(r.prueba, 'corregir') +
      '<div class="tarjeta"><p>Esta prueba no tiene preguntas en papel.</p>' +
      '<p class="silencio">En el editor, cada pregunta puede responderse <strong>en pantalla</strong> ' +
      '(se corrige sola) o <strong>en papel</strong> (la corriges aquí).</p></div>';
    return;
  }

  if (!r.alumnos.length) {
    nodo.innerHTML = cabecera(r.prueba, 'corregir') +
      '<div class="tarjeta"><p>Todavía no hay pruebas entregadas' + (curso ? ' en ' + esc(curso) : '') + '.</p>' +
      '<p class="silencio">Las preguntas en papel se corrigen después de que el estudiante envía la parte en pantalla.</p></div>';
    return;
  }

  const total = r.alumnos.length * r.preguntas.length;

  nodo.innerHTML = cabecera(r.prueba, 'corregir') +
    '<div id="aviso" class="aviso"></div>' +

    '<div class="tarjeta"><h2>Preguntas en papel</h2>' +
      '<p class="silencio">Anota el puntaje que obtuvo cada estudiante. ' +
        'El botón <strong>✓</strong> pone el puntaje completo y <strong>✗</strong> pone cero; ' +
        'si la respuesta quedó a medias, escribe el puntaje directamente en la casilla. ' +
        'Cada cambio se guarda solo y la nota se recalcula al momento.</p>' +
      '<table><thead><tr><th>N°</th><th>Pregunta</th><th>Criterio</th><th>Puntaje</th></tr></thead><tbody>' +
        r.preguntas.map((p) =>
          '<tr><td><strong>' + p.numero + '</strong></td>' +
            '<td>' + esc((p.enunciado || '(sin enunciado)').slice(0, 120)) + '</td>' +
            '<td class="silencio">' + esc(p.eje || '—') + '</td>' +
            '<td>' + p.puntaje + '</td></tr>').join('') +
      '</tbody></table></div>' +

    '<div class="fila no-imprimir">' +
      '<div style="min-width:200px"><label>Curso</label><select id="filtro">' +
        '<option value="">Todos los cursos</option>' +
        r.cursos_disponibles.map((c) => '<option value="' + esc(c) + '"' + (c === curso ? ' selected' : '') + '>' + esc(c) + '</option>').join('') +
      '</select></div>' +
      '<div class="crece"></div>' +
      '<div id="avance" class="etiqueta"></div>' +
    '</div>' +

    '<div class="tarjeta tabla-scroll">' +
      '<table class="corregir"><thead><tr>' +
        '<th>Estudiante</th><th>Curso</th>' +
        r.preguntas.map((p) => '<th>N° ' + p.numero + ' <span class="silencio">/ ' + p.puntaje + '</span></th>').join('') +
      '</tr></thead><tbody>' +
      r.alumnos.map((a) =>
        '<tr data-intento="' + a.intento_id + '">' +
          '<td>' + esc(a.nombre) + '</td><td class="silencio">' + esc(a.curso) + '</td>' +
          r.preguntas.map((p) => celdaCorreccion(a, p)).join('') +
        '</tr>').join('') +
      '</tbody></table></div>';

  const refrescarAvance = () => {
    const hechas = $$('[data-puntaje]').filter((c) => c.value !== '').length;
    const nodoAvance = $('#avance');
    nodoAvance.textContent = 'Corregidas ' + hechas + ' de ' + total;
    nodoAvance.className = 'etiqueta' + (hechas === total ? ' verde' : '');
  };

  $('#filtro').addEventListener('change', (e) => {
    sessionStorage.setItem('curso-informe', e.target.value);
    recargar();
  });

  conectarCorreccion(refrescarAvance);
  refrescarAvance();
}

function celdaCorreccion(alumno, pregunta) {
  const valor = alumno.puntajes[pregunta.id];
  const anotado = valor !== undefined && valor !== null;

  return '<td class="celda-correccion' + (anotado ? '' : ' pendiente') + '">' +
    '<div class="fila" style="gap:.25rem;flex-wrap:nowrap">' +
      '<button class="chico neutro" data-marcar="' + pregunta.puntaje + '" title="Correcta: ' + pregunta.puntaje + ' puntos">✓</button>' +
      '<button class="chico neutro" data-marcar="0" title="Incorrecta: cero puntos">✗</button>' +
      '<input data-puntaje type="number" min="0" max="' + pregunta.puntaje + '" step="0.5" ' +
        'data-pregunta="' + pregunta.id + '" data-max="' + pregunta.puntaje + '" ' +
        'value="' + (anotado ? valor : '') + '" placeholder="—">' +
    '</div></td>';
}

function conectarCorreccion(refrescarAvance) {
  const guardar = async (campo) => {
    const celda = campo.closest('td');
    const intentoId = campo.closest('[data-intento]').dataset.intento;
    const valor = campo.value.trim();

    celda.classList.add('guardando');
    try {
      await api('/api/admin/intentos/' + intentoId + '/correccion', {
        metodo: 'PUT',
        cuerpo: { pregunta_id: Number(campo.dataset.pregunta), puntaje: valor === '' ? null : valor },
      });
      celda.classList.remove('guardando', 'error');
      celda.classList.toggle('pendiente', valor === '');
      refrescarAvance();
    } catch (error) {
      celda.classList.remove('guardando');
      celda.classList.add('error');
      mostrarAviso($('#aviso'), 'No se pudo guardar: ' + error.message);
    }
  };

  $$('[data-puntaje]').forEach((campo) => {
    campo.addEventListener('change', () => guardar(campo));
  });

  $$('[data-marcar]').forEach((boton) => {
    boton.addEventListener('click', () => {
      const campo = boton.closest('.fila').querySelector('[data-puntaje]');
      campo.value = boton.dataset.marcar;
      guardar(campo);
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


    // Con preguntas en papel sin corregir, los puntajes estan incompletos y las
    // notas salen mas bajas de lo que corresponde. Decirlo arriba y fuerte evita
    // que alguien traspase al libro de clases un informe a medio hacer.
    (r.pendientes_correccion
      ? '<div class="aviso error"><strong>Faltan correcciones.</strong> ' +
        'Hay ' + plural(r.pendientes_correccion, 'respuesta') + ' en papel sin corregir. ' +
        'Mientras tanto esos puntos no suman, así que los porcentajes y las notas de abajo ' +
        'están por debajo de lo que van a quedar. ' +
        '<a href="#prueba/' + id + '/corregir">Ir a corregir</a>.</div>'
      : '') +

    '<div class="rejilla tres">' +
      tarjetaDato('Estudiantes evaluados', r.total_alumnos, r.en_curso ? '<span class="silencio">' + r.en_curso + ' aún rindiendo</span>' : '') +
      tarjetaDato('Logro promedio del curso', r.promedio_logro + '%') +
      (r.escala_notas.activa
        ? tarjetaDato('Promedio de notas', formatoNota(r.promedio_nota),
            '<span class="silencio">' + r.aprobados + ' de ' + r.total_alumnos + ' aprueban</span>')
        : '') +
      tarjetaDato('Preguntas', r.preguntas.length) +
    '</div>' +

    portada(r, establecimiento) +
    seccionNiveles(r) +
    seccionEjes(r) +
    seccionPorCurso(r) +
    seccionTabla1(r) +
    seccionPorAlumno(r) +
    seccionCalificacion(r) +
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
    (r.escala_notas.activa
      ? dato('Escala de notas',
          '1,0 con ' + formatoPuntos(r.escala_notas.puntaje_1) + ' pts · ' +
          '4,0 con ' + formatoPuntos(r.escala_notas.puntaje_4) + ' pts · ' +
          '7,0 con ' + formatoPuntos(r.escala_notas.puntaje_7) + ' pts')
      : '') +
    dato('Fecha de generación', ahora) +
    '</tbody></table>' +
    '<p class="silencio" style="margin-top:1rem">Estos resultados sirven para ajustar la planificación ' +
      'y focalizar el apoyo. Las notas son una referencia del desempeño en esta prueba; ' +
      'los cursos no se comparan entre sí.</p>' +
    '</div>';
}

function seccionNiveles(r, conGrafico = true) {
  const torta = graficoTorta(
    r.distribucion_niveles.map((n) => ({ etiqueta: n.etiqueta, valor: n.cantidad })),
    { titulo: 'Distribución por nivel de logro' }
  );

  return '<div class="tarjeta"><h2>1. Resultados según niveles de logro</h2>' +
    '<p class="silencio">Nivel I: no logra los aprendizajes mínimos · Nivel II: logra parcialmente los OA · ' +
      'Nivel III: logra satisfactoriamente los OA. Umbrales: II desde ' + r.prueba.nivel2_min + '%, III desde ' + r.prueba.nivel3_min + '%.</p>' +
    (conGrafico ? '<div class="con-grafico"><div>' + torta + '</div>' : '<div>') +
      '<table><tbody>' +
      r.distribucion_niveles.map((n) => {
        const clase = n.nivel === 3 ? 'verde' : n.nivel === 2 ? 'ambar' : 'roja';
        return '<tr><td style="width:110px"><span class="etiqueta ' + clase + '">' + n.etiqueta + '</span></td>' +
          '<td>' + barra(n.porcentaje, clase) + '</td>' +
          '<td style="white-space:nowrap"><strong>' + n.porcentaje + '%</strong> ' +
          '<span class="silencio">(' + plural(n.cantidad, 'estudiante') + ')</span></td></tr>';
      }).join('') +
      '</tbody></table>' +
    '</div></div>';
}

function seccionEjes(r) {
  return '<div class="tarjeta"><h2>2. Resultados según eje de habilidad</h2>' +
    '<p class="silencio">Porcentaje promedio de respuestas correctas del curso en cada habilidad. ' +
      'Cada pregunta mide una sola.</p>' +
    graficoBarras(
      r.por_eje.map((e) => ({
        etiqueta: e.eje,
        valor: e.porcentaje,
        detalle: plural(e.preguntas, 'pregunta'),
      }))
    ) +
    '</div>';
}

/**
 * Comparacion entre cursos. Con una prueba que rinden seis cursos, mirarlos de a
 * uno filtrando obliga a anotar los numeros aparte para poder compararlos.
 */
function seccionPorCurso(r) {
  if (r.por_curso.length < 2) return '';
  const habilidades = r.por_eje.map((e) => e.eje);
  const conNota = !!r.escala_notas.activa;

  return '<div class="tarjeta tabla-scroll"><h2>3. Resultados por curso</h2>' +
    '<table><thead><tr><th>Curso</th><th>Estudiantes</th><th>Logro</th>' +
      (conNota ? '<th>Promedio</th><th>Aprueban</th>' : '') +
      '<th>Niveles de logro</th>' +
      habilidades.map((h) => '<th>' + esc(h) + '</th>').join('') +
    '</tr></thead><tbody>' +
    r.por_curso.map((c) =>
      '<tr><td><strong>' + esc(c.curso) + '</strong></td>' +
        '<td class="silencio">' + c.total + '</td>' +
        '<td>' + barra(c.promedio) + ' <strong>' + c.promedio + '%</strong></td>' +
        (conNota
          ? '<td class="nota ' + colorNota(c.promedio_nota) + '">' + formatoNota(c.promedio_nota) + '</td>' +
            '<td style="white-space:nowrap">' + c.aprobados + ' de ' + c.total +
              ' <span class="silencio">(' + c.porcentaje_aprobacion + '%)</span></td>'
          : '') +
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
  const conPapel = r.preguntas.some((p) => p.tipo === 'papel');

  return '<div class="tarjeta tabla-scroll"><h2>4. Resultados por pregunta</h2>' +
    '<p class="silencio">La alternativa correcta va destacada. Un distractor con alto porcentaje señala un error de comprensión que vale la pena indagar.' +
      (conPapel
        ? ' En las preguntas <strong>en papel</strong> no hay alternativas: se muestra cuántas quedaron ' +
          'correctas (C), con puntaje parcial (P), incorrectas (I) y sin corregir (N).'
        : '') + '</p>' +
    '<table><thead><tr>' +
      '<th>N°</th><th>Criterio</th><th>% respuestas</th><th>Logro</th>' +
    '</tr></thead><tbody>' +
    r.preguntas.map((p) =>
      '<tr><td><strong>' + p.numero + '</strong>' +
          (p.tipo === 'papel' ? '<br><span class="etiqueta ambar">papel</span>' : '') + '</td>' +
        '<td class="silencio">' + esc(p.eje) + '</td>' +
        '<td style="white-space:nowrap">' +
          p.distribucion.map((d) =>
            '<div' + (d.correcta ? ' style="font-weight:700"' : (d.porcentaje >= 30 && !d.correcta ? ' style="color:var(--rojo)"' : '')) + '>' +
              d.letra + ': ' + d.porcentaje + '%</div>').join('') +
        '</td>' +
        // Una pregunta en papel que nadie ha corregido todavia no tiene logro:
        // mostrar 0 % la haria ver como el peor resultado de la prueba.
        '<td>' + (p.tipo === 'papel' && !p.corregidas
          ? '<span class="silencio">sin corregir</span>'
          : barra(p.logro) + ' ' + p.logro + '%') + '</td>' +
      '</tr>').join('') +
    '</tbody></table></div>';
}

function seccionPorAlumno(r) {
  const conNota = !!r.escala_notas.activa;

  return '<div class="tarjeta tabla-scroll"><h2>5. Resultados por estudiante</h2>' +
    '<table><thead><tr><th>Estudiante</th><th>Curso</th><th>Puntaje</th><th>% logro</th>' +
      (conNota ? '<th>Nota</th>' : '') + '<th>Nivel</th><th></th></tr></thead><tbody>' +
    r.alumnos.map((a) =>
      '<tr><td>' + esc(a.nombre) + '</td><td>' + esc(a.curso) + '</td>' +
        '<td class="silencio">' + a.puntaje + ' / ' + a.puntaje_max + '</td>' +
        '<td>' + barra(a.porcentaje) + ' ' + a.porcentaje + '%</td>' +
        (conNota ? '<td class="nota ' + colorNota(a.nota) + '">' + formatoNota(a.nota) + '</td>' : '') +
        '<td>' + etiquetaNivel(a.nivel_logro) + '</td>' +
        '<td class="no-imprimir"><a href="#intento/' + a.intento_id + '"><button class="neutro chico">Ver detalle</button></a></td></tr>').join('') +
    '</tbody></table></div>';
}

/* --------------------------------------------------------- calificaciones */

// Tramos con que se suele mirar un curso: quienes reprueban, quienes pasan
// raspando, y los dos tramos de arriba.
const TRAMOS_NOTA = [
  { etiqueta: '1,0 a 3,9', desde: 1, hasta: 3.9 },
  { etiqueta: '4,0 a 4,9', desde: 4, hasta: 4.9 },
  { etiqueta: '5,0 a 5,9', desde: 5, hasta: 5.9 },
  { etiqueta: '6,0 a 7,0', desde: 6, hasta: 7 },
];

function seccionCalificacion(r) {
  if (!r.escala_notas.activa) return '';

  const notas = r.alumnos.map((a) => a.nota).filter((n) => n !== null && n !== undefined);
  if (!notas.length) return '';

  const total = notas.length;
  const pct = (n) => Math.round((n / total) * 1000) / 10;

  const tramos = TRAMOS_NOTA.map((t) => {
    const cantidad = notas.filter((n) => n >= t.desde && n <= t.hasta).length;
    return { ...t, cantidad, porcentaje: pct(cantidad) };
  });

  const e = r.escala_notas;

  return '<div class="tarjeta"><h2>6. Resultados según calificación</h2>' +
    '<p class="silencio">Escala usada: <strong>1,0</strong> con ' + formatoPuntos(e.puntaje_1) + ' puntos, ' +
      '<strong>4,0</strong> con ' + formatoPuntos(e.puntaje_4) + ' (' + formatoPuntos(e.exigencia) + ' % de exigencia) y ' +
      '<strong>7,0</strong> con ' + formatoPuntos(e.puntaje_7) + '. Los puntajes intermedios se interpolan.</p>' +

    '<div class="rejilla tres">' +
      tarjetaDato('Promedio del curso', formatoNota(r.promedio_nota)) +
      tarjetaDato('Aprueban', r.aprobados + ' de ' + total, '<span class="silencio">' + r.porcentaje_aprobacion + '%</span>') +
      tarjetaDato('Reprueban', (total - r.aprobados) + ' de ' + total,
        '<span class="silencio">' + (Math.round((100 - r.porcentaje_aprobacion) * 10) / 10) + '%</span>') +
    '</div>' +

    '<div class="par-graficos">' +
      graficoBarras(
        tramos.map((t) => ({ etiqueta: t.etiqueta, valor: t.porcentaje, detalle: plural(t.cantidad, 'estudiante') })),
        { titulo: 'Distribución de notas', ejeY: '% del curso' }
      ) +
      graficoTorta(
        [{ etiqueta: 'Aprueban', valor: r.aprobados }, { etiqueta: 'Reprueban', valor: total - r.aprobados }],
        { titulo: 'Aprobación' }
      ) +
    '</div>' +

    '<table><tbody>' +
      tramos.map((t) =>
        '<tr><td style="width:130px"><span class="nota ' + colorNota(t.desde) + '">' + t.etiqueta + '</span></td>' +
          '<td>' + barra(t.porcentaje, colorNota(t.desde)) + '</td>' +
          '<td style="white-space:nowrap"><strong>' + t.porcentaje + '%</strong> ' +
          '<span class="silencio">(' + plural(t.cantidad, 'estudiante') + ')</span></td></tr>').join('') +
    '</tbody></table></div>';
}

function seccionConclusiones(r) {
  const ejes = [...r.por_eje].sort((a, b) => a.porcentaje - b.porcentaje);
  const preguntasDebiles = [...r.preguntas].sort((a, b) => a.logro - b.logro).slice(0, 5);
  const bajoNivel1 = r.distribucion_niveles.find((n) => n.nivel === 1);

  return '<div class="tarjeta"><h2>' + (r.escala_notas.activa ? '7' : '6') +
    '. Lectura preliminar de los resultados</h2>' +
    '<ul>' +
      (ejes.length
        ? '<li>Criterio menos logrado: <strong>' + esc(ejes[0].eje) + '</strong> (' + ejes[0].porcentaje + '%). ' +
          'Criterio más logrado: <strong>' + esc(ejes[ejes.length - 1].eje) + '</strong> (' + ejes[ejes.length - 1].porcentaje + '%).</li>'
        : '') +
      '<li><strong>' + bajoNivel1.porcentaje + '%</strong> del curso (' + plural(bajoNivel1.cantidad, 'estudiante') + ') está en Nivel I: ' +
        'no demuestra haber alcanzado los aprendizajes mínimos del nivel.</li>' +
      (r.escala_notas.activa
        ? '<li>El promedio de notas es <strong>' + formatoNota(r.promedio_nota) + '</strong> y ' +
          'aprueba el <strong>' + r.porcentaje_aprobacion + '%</strong> ' +
          '(' + plural(r.aprobados, 'estudiante') + ' de ' + r.total_alumnos + ').</li>'
        : '') +
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

    (r.pendientes_correccion
      ? '<div class="aviso error"><strong>Nota provisoria.</strong> Le falta(n) ' +
        plural(r.pendientes_correccion, 'pregunta') + ' en papel por corregir, así que esos puntos ' +
        'todavía no suman. <a href="#prueba/' + r.prueba.id + '/corregir">Ir a corregir</a>.</div>'
      : '') +

    '<div class="rejilla tres">' +
      (r.escala_notas.activa
        ? tarjetaDato('Nota', '<span class="nota ' + colorNota(r.nota) + '">' + formatoNota(r.nota) + '</span>',
            '<span class="silencio">4,0 con ' + formatoPuntos(r.escala_notas.puntaje_4) + ' puntos</span>')
        : '') +
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
      '<table><thead><tr><th>N°</th><th>Criterio</th><th>Respondió</th><th>Correcta</th><th>Puntaje</th><th></th></tr></thead><tbody>' +
      r.preguntas.map((p) => {
        const enPapel = p.tipo === 'papel';
        const marca = !enPapel || p.corregida
          ? (p.correcta ? '<span class="etiqueta verde">✓</span>' : '<span class="etiqueta roja">✗</span>')
          : '<span class="etiqueta ambar">sin corregir</span>';

        return '<tr><td><strong>' + p.numero + '</strong>' +
            (enPapel ? ' <span class="etiqueta ambar">papel</span>' : '') + '</td>' +
          '<td class="silencio">' + esc(p.eje) + '</td>' +
          '<td>' + (enPapel
            ? '<span class="silencio">en la hoja impresa</span>'
            : (p.respondio || '<span class="silencio">no respondió</span>')) + '</td>' +
          '<td>' + (enPapel ? '—' : esc(p.clave || '')) + '</td>' +
          '<td class="silencio">' + p.puntaje + ' / ' + p.puntaje_max + '</td>' +
          '<td>' + marca + '</td>' +
        '</tr>';
      }).join('') +
      '</tbody></table></div>';
}

/* ============================================================ VISTA PREVIA */

/**
 * La prueba tal como la vera el estudiante, con la clave destacada.
 * Permite revisarla antes de publicar sin ocupar el codigo de un alumno.
 */
export async function vistaPrevia(nodo, id) {
  const r = await api('/api/admin/pruebas/' + id + '/vista-previa');
  const sinClave = r.preguntas.filter((p) => p.tipo !== 'papel' && !p.clave).length;
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
  const enPapel = p.tipo === 'papel';

  const alternativas = enPapel
    ? '<div class="aviso info" style="margin:.6rem 0 0">Se responde en la hoja impresa. ' +
      'No aparece en pantalla; vale ' + plural(p.puntaje, 'punto') + ' y la corriges tú.</div>'
    : (p.opciones || []).map((o) => {
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
      (enPapel ? '<span class="etiqueta ambar">en papel</span> ' : '') +
      (p.eje ? '<span class="etiqueta">' + esc(p.eje) + '</span>' : '<span class="etiqueta roja">sin criterio</span>') +
      (enPapel || p.clave ? '' : ' <span class="etiqueta roja">sin clave</span>') +
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
        (inf.escala_notas.activa
          ? tarjetaDato('Nota', '<span class="nota ' + colorNota(inf.nota) + '">' + formatoNota(inf.nota) + '</span>',
              '<span class="silencio">4,0 con ' + formatoPuntos(inf.escala_notas.puntaje_4) + ' puntos</span>')
          : '') +
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
      '<p class="silencio">' + correctas + ' correctas de ' + inf.preguntas.length + '.' +
        (inf.pendientes_correccion
          ? ' <strong>Faltan ' + plural(inf.pendientes_correccion, 'pregunta') + ' en papel por corregir.</strong>'
          : '') + '</p>' +
      '<div class="navegador">' +
        inf.preguntas.map((p) => {
          const sinCorregir = p.tipo === 'papel' && !p.corregida;
          const clase = sinCorregir ? 'vacia' : (p.correcta ? 'ok' : (p.tipo === 'papel' || p.respondio ? 'mal' : 'vacia'));
          return '<span class="marca-respuesta ' + clase + '" ' +
            'title="' + esc(p.eje || '') + (p.tipo === 'papel' ? ' · en papel' : '') + '">' +
            p.numero + '</span>';
        }).join('') +
      '</div>' +
      '<p class="silencio" style="margin-top:.6rem;font-size:.8rem">' +
        '<span class="marca-respuesta ok">■</span> correcta · ' +
        '<span class="marca-respuesta mal">■</span> incorrecta · ' +
        '<span class="marca-respuesta vacia">■</span> sin responder o sin corregir</p>' +
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
        ' · logro promedio ' + r.promedio_logro + '%' +
        (r.escala_notas.activa
          ? ' · promedio ' + formatoNota(r.promedio_nota) + ' · aprueba el ' + r.porcentaje_aprobacion + '%'
          : '') + '</p>' +
    '</div>' +
    '<div class="tarjeta">' +
      '<h3>Resultados del curso según eje de habilidad</h3>' +
      '<div class="par-graficos">' +
        graficoBarras(
          r.por_eje.map((e) => ({ etiqueta: e.eje, valor: e.porcentaje, detalle: plural(e.preguntas, 'pregunta') }))
        ) +
        graficoTorta(
          r.distribucion_niveles.map((n) => ({ etiqueta: n.etiqueta, valor: n.cantidad })),
          { titulo: 'Distribución por nivel de logro' }
        ) +
      '</div>' +
      '<p class="silencio" style="text-align:center">' +
        plural(r.total_alumnos, 'estudiante considerado', 'estudiantes considerados') + '</p>' +
    '</div>' +
    seccionNiveles(r, false) +
    seccionCalificacion(r) +
    seccionPorAlumno(r) +
  '</section>';
}
