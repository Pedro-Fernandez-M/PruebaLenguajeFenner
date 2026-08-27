import { api, $, esc, parrafos, mostrarAviso, limpiarAviso, reloj, ROMANO } from './comun.js';

const vistas = {
  ingreso: $('#vista-ingreso'),
  pruebas: $('#vista-pruebas'),
  examen: $('#vista-examen'),
  fin: $('#vista-fin'),
};

let alumno = null;
let examen = null;          // payload del intento en curso
let respuestas = new Map(); // pregunta_id -> { alternativa, respuesta_texto }
let temporizador = null;
let restante = null;
const pendientesGuardado = new Map();

function verVista(nombre) {
  for (const [clave, nodo] of Object.entries(vistas)) nodo.hidden = clave !== nombre;
  window.scrollTo(0, 0);
}

function pintarIdentidad() {
  $('#identidad').textContent = alumno ? alumno.nombre + (alumno.curso ? ' · ' + alumno.curso : '') : '';
  $('#btn-salir').hidden = !alumno;
}

/* ------------------------------------------------------------------- ingreso */

$('#form-ingreso').addEventListener('submit', async (evento) => {
  evento.preventDefault();
  limpiarAviso($('#aviso-ingreso'));
  const codigo = $('#codigo-entrada').value.trim();
  try {
    const datos = await api('/api/alumno/ingresar', { cuerpo: { codigo } });
    alumno = datos.alumno;
    pintarIdentidad();
    await cargarPruebas();
  } catch (error) {
    mostrarAviso($('#aviso-ingreso'), error.message);
  }
});

// Da formato ABCD-1234 mientras se escribe.
$('#codigo-entrada').addEventListener('input', (evento) => {
  const limpio = evento.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  evento.target.value = limpio.length > 4 ? limpio.slice(0, 4) + '-' + limpio.slice(4) : limpio;
});

$('#btn-salir').addEventListener('click', async () => {
  const aviso = 'Cerrarás tu sesión. Tus respuestas quedan guardadas y puedes volver a entrar con tu código.\n\n¿Salir?';
  if (examen && !confirm(aviso)) return;
  // Se limpia antes de recargar para que no salte tambien el aviso del navegador
  // y el alumno tenga que confirmar dos veces.
  examen = null;
  await api('/api/alumno/salir', { cuerpo: {} });
  location.reload();
});

/* ------------------------------------------------------------ lista de pruebas */

async function cargarPruebas() {
  const datos = await api('/api/alumno/pruebas');
  alumno = datos.alumno;
  pintarIdentidad();
  $('#saludo').textContent = 'Hola, ' + alumno.nombre.split(',')[0].trim();

  const contenedor = $('#lista-pruebas');
  if (!datos.pruebas.length) {
    contenedor.innerHTML = '<div class="tarjeta"><p>Todavía no hay pruebas disponibles para tu curso.</p>' +
      '<p class="silencio">Espera las indicaciones de tu profesor o profesora.</p></div>';
  } else {
    contenedor.innerHTML = datos.pruebas.map((p) => {
      const enviada = p.intento && p.intento.estado === 'enviado';
      const enCurso = p.intento && p.intento.estado === 'en_curso';
      return '<div class="tarjeta">' +
        '<span class="etiqueta">' + esc(p.asignatura) + '</span> ' +
        '<span class="etiqueta gris">' + esc(p.nivel) + '</span>' +
        '<h2 style="margin-top:.6rem">' + esc(p.titulo) + '</h2>' +
        (p.descripcion ? '<p class="silencio">' + esc(p.descripcion) + '</p>' : '') +
        '<p class="silencio">' + p.total_preguntas + ' preguntas' +
          (p.duracion_min ? ' · ' + p.duracion_min + ' minutos' : ' · sin límite de tiempo') + '</p>' +
        (enviada
          ? '<span class="etiqueta verde">Ya la enviaste</span>'
          : '<button data-prueba="' + p.id + '">' + (enCurso ? 'Continuar' : 'Comenzar') + '</button>') +
        '</div>';
    }).join('');

    contenedor.querySelectorAll('button[data-prueba]').forEach((boton) => {
      boton.addEventListener('click', () => comenzar(boton.dataset.prueba));
    });
  }
  verVista('pruebas');
}

/* -------------------------------------------------------------------- examen */

async function comenzar(pruebaId) {
  limpiarAviso($('#aviso-pruebas'));
  try {
    const inicio = await api('/api/alumno/pruebas/' + pruebaId + '/iniciar', { cuerpo: {} });
    await abrirIntento(inicio.intento_id);
  } catch (error) {
    mostrarAviso($('#aviso-pruebas'), error.message);
  }
}

async function abrirIntento(intentoId) {
  examen = await api('/api/alumno/intentos/' + intentoId);
  respuestas = new Map();
  for (const r of examen.respuestas) {
    respuestas.set(r.pregunta_id, { alternativa: r.alternativa, respuesta_texto: r.respuesta_texto || '' });
  }

  $('#examen-titulo').textContent = examen.prueba.titulo;
  $('#instrucciones').innerHTML = examen.prueba.instrucciones
    ? '<h3>Instrucciones</h3>' + parrafos(examen.prueba.instrucciones)
    : '<h3>Instrucciones</h3><p>Lee cada texto con atención y responde todas las preguntas. Puedes volver atrás y cambiar tus respuestas antes de enviar.</p>';

  pintarExamen();
  iniciarTemporizador(examen.intento.segundos_restantes);
  verVista('examen');
}

function pintarExamen() {
  const secciones = [];
  const textosOrdenados = [...examen.textos].sort((a, b) => a.orden - b.orden || a.id - b.id);

  for (const texto of textosOrdenados) {
    const preguntas = examen.preguntas.filter((p) => p.texto_id === texto.id);
    if (!preguntas.length) continue;
    secciones.push(
      '<section class="examen">' +
        '<article class="lectura">' +
          '<span class="etiqueta gris">' + esc(texto.tipo_texto) + '</span>' +
          '<h2 style="margin-top:.6rem">' + esc(texto.titulo) + '</h2>' +
          (texto.autor ? '<p class="silencio">' + esc(texto.autor) + '</p>' : '') +
          '<div class="cuerpo">' + parrafos(texto.contenido) + '</div>' +
          (texto.fuente ? '<p class="silencio" style="margin-top:1rem">Fuente: ' + esc(texto.fuente) + '</p>' : '') +
        '</article>' +
        '<div>' + preguntas.map(dibujarPregunta).join('') + '</div>' +
      '</section>'
    );
  }

  const sueltas = examen.preguntas.filter((p) => !p.texto_id);
  if (sueltas.length) secciones.push('<section>' + sueltas.map(dibujarPregunta).join('') + '</section>');

  $('#secciones').innerHTML = secciones.join('');
  $('#secciones').querySelectorAll('[data-pregunta]').forEach(conectarPregunta);
  actualizarAvance();
}

function dibujarPregunta(p) {
  const guardada = respuestas.get(p.id) || {};
  const cuerpo = p.tipo === 'alternativas'
    ? (p.opciones || []).map((o) => {
        const elegida = guardada.alternativa === o.letra;
        return '<label class="alternativa' + (elegida ? ' elegida' : '') + '">' +
          '<input type="radio" name="p' + p.id + '" value="' + o.letra + '"' + (elegida ? ' checked' : '') + '>' +
          '<span class="letra">' + o.letra + '.</span>' +
          '<span>' + esc(o.contenido) + '</span>' +
        '</label>';
      }).join('')
    : '<textarea rows="6" placeholder="Escribe aquí tu respuesta...">' + esc(guardada.respuesta_texto || '') + '</textarea>' +
      '<p class="silencio">Fundamenta tu respuesta usando información del texto.</p>';

  return '<div class="pregunta" id="pregunta-' + p.numero + '" data-pregunta="' + p.id + '">' +
    '<p><span class="numero">' + p.numero + '.</span> ' + esc(p.enunciado) + '</p>' +
    (p.cita ? '<div class="cita">' + esc(p.cita) + '</div>' : '') +
    cuerpo +
  '</div>';
}

function conectarPregunta(nodo) {
  const id = Number(nodo.dataset.pregunta);

  nodo.querySelectorAll('input[type=radio]').forEach((radio) => {
    radio.addEventListener('change', () => {
      nodo.querySelectorAll('.alternativa').forEach((l) => l.classList.remove('elegida'));
      radio.closest('.alternativa').classList.add('elegida');
      respuestas.set(id, { alternativa: radio.value, respuesta_texto: '' });
      guardar(id);
      actualizarAvance();
    });
  });

  const area = nodo.querySelector('textarea');
  if (area) {
    area.addEventListener('input', () => {
      respuestas.set(id, { alternativa: null, respuesta_texto: area.value });
      actualizarAvance();
      // Se guarda con retardo para no golpear el servidor en cada tecla.
      clearTimeout(pendientesGuardado.get(id));
      pendientesGuardado.set(id, setTimeout(() => guardar(id), 800));
    });
    area.addEventListener('blur', () => guardar(id));
  }
}

async function guardar(preguntaId) {
  if (!examen) return;
  const valor = respuestas.get(preguntaId) || {};
  try {
    await api('/api/alumno/intentos/' + examen.intento.id + '/respuesta', {
      cuerpo: {
        pregunta_id: preguntaId,
        alternativa: valor.alternativa || null,
        respuesta_texto: valor.respuesta_texto || '',
      },
    });
    limpiarAviso($('#aviso-examen'));
  } catch (error) {
    if (error.estado === 409) return terminar({});
    mostrarAviso($('#aviso-examen'), 'No se pudo guardar la última respuesta (' + error.message + '). Revisa la conexión.');
  }
}

function respondida(p) {
  const r = respuestas.get(p.id);
  if (!r) return false;
  return p.tipo === 'alternativas' ? !!r.alternativa : !!String(r.respuesta_texto || '').trim();
}

function actualizarAvance() {
  const total = examen.preguntas.length;
  const hechas = examen.preguntas.filter(respondida).length;
  $('#examen-avance').textContent = 'Respondidas ' + hechas + ' de ' + total;

  $('#navegador').innerHTML = examen.preguntas
    .map((p) => '<a href="#pregunta-' + p.numero + '" class="' + (respondida(p) ? 'lista' : '') + '">' + p.numero + '</a>')
    .join('');

  document.querySelectorAll('[data-pregunta]').forEach((nodo) => {
    const p = examen.preguntas.find((q) => q.id === Number(nodo.dataset.pregunta));
    nodo.classList.toggle('respondida', respondida(p));
  });
}

/* --------------------------------------------------------------- temporizador */

function iniciarTemporizador(segundos) {
  clearInterval(temporizador);
  restante = segundos;
  if (restante === null || restante === undefined) {
    $('#reloj-caja').innerHTML = '';
    return;
  }
  const pintar = () => {
    $('#reloj-caja').innerHTML = '<span class="reloj' + (restante <= 300 ? ' urgente' : '') + '">' + reloj(restante) + '</span>';
  };
  pintar();
  temporizador = setInterval(() => {
    restante -= 1;
    pintar();
    if (restante <= 0) {
      clearInterval(temporizador);
      enviar(true);
    }
  }, 1000);
}

/* ---------------------------------------------------------------------- envío */

$('#btn-enviar').addEventListener('click', () => enviar(false));

// Salir sin entregar. Antes la unica salida era enviar la prueba o cerrar la
// sesion completa, asi que quien entraba por error quedaba atrapado.
$('#btn-pausar').addEventListener('click', async () => {
  if (!examen) return;
  const faltan = examen.preguntas.filter((p) => !respondida(p)).length;
  const aviso = 'Vas a salir sin entregar.\n\n'
    + 'Tus respuestas quedan guardadas y puedes volver a entrar con tu código para continuar'
    + (faltan ? ' (te faltan ' + faltan + ' preguntas).' : '.')
    + (restante === null || restante === undefined ? '' : '\n\nOjo: el tiempo sigue corriendo.')
    + '\n\n¿Salir de la prueba?';
  if (!confirm(aviso)) return;

  // Se fuerza el guardado de lo que quedara en el retardo del autoguardado.
  for (const [id, tiempo] of pendientesGuardado) { clearTimeout(tiempo); await guardar(id); }
  pendientesGuardado.clear();

  clearInterval(temporizador);
  examen = null;
  $('#reloj-caja').innerHTML = '';
  await cargarPruebas();
});

async function enviar(automatico) {
  if (!examen) return;
  const faltan = examen.preguntas.filter((p) => !respondida(p)).length;

  if (!automatico) {
    const mensaje = faltan
      ? 'Te quedan ' + faltan + ' preguntas sin responder. ¿Enviar de todas formas? No podrás volver a entrar.'
      : '¿Enviar tu prueba? No podrás volver a entrar.';
    if (!confirm(mensaje)) return;
  }

  $('#btn-enviar').disabled = true;
  clearInterval(temporizador);

  // Se fuerza el guardado de cualquier texto que quedara en el retardo.
  for (const [id, tiempo] of pendientesGuardado) { clearTimeout(tiempo); await guardar(id); }
  pendientesGuardado.clear();

  try {
    const resultado = await api('/api/alumno/intentos/' + examen.intento.id + '/enviar', { cuerpo: {} });
    await terminar(resultado, automatico);
  } catch (error) {
    $('#btn-enviar').disabled = false;
    mostrarAviso($('#aviso-examen'), error.message);
  }
}

async function terminar(resultado, automatico) {
  const intentoId = examen ? examen.intento.id : resultado.intento_id;
  examen = null;
  $('#reloj-caja').innerHTML = '';
  if (automatico) $('#mensaje-fin').textContent = 'Se acabó el tiempo y tu prueba se envió automáticamente.';

  if (resultado && resultado.muestra_resultado) {
    try {
      const r = await api('/api/alumno/intentos/' + intentoId + '/resultado');
      $('#resultado-alumno').innerHTML =
        '<div class="tarjeta" style="text-align:left">' +
          '<h3>Tu resultado</h3>' +
          '<p class="numero-grande">' + r.porcentaje + '%</p>' +
          '<p class="silencio">' + r.puntaje + ' de ' + r.puntaje_max + ' puntos · Nivel ' + ROMANO[r.nivel_logro] + '</p>' +
          '<table><tbody>' + r.por_eje.map((e) =>
            '<tr><td>' + esc(e.eje) + '</td><td style="text-align:right">' + e.porcentaje + '%</td></tr>').join('') +
          '</tbody></table>' +
        '</div>';
    } catch { /* si el profesor cerró la vista de resultados, no se muestra nada */ }
  }
  verVista('fin');
}

// Evita perder respuestas por un cierre accidental de la pestaña.
window.addEventListener('beforeunload', (evento) => {
  if (examen) { evento.preventDefault(); evento.returnValue = ''; }
});

/* --------------------------------------------------------------------- inicio */

(async function iniciar() {
  try {
    const sesion = await api('/api/auth/sesion');
    if (sesion.alumno) { alumno = sesion.alumno; await cargarPruebas(); return; }
  } catch { /* sin sesión previa */ }
  verVista('ingreso');
  $('#codigo-entrada').focus();
})();
