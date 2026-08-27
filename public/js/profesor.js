import { api, $, $$, esc, mostrarAviso, limpiarAviso, plural } from './comun.js';
import { vistaEditor, vistaPrevia, vistaMonitor, vistaInforme, vistaInformeAlumno } from './prueba.js';

const panel = $('#panel');
let docente = null;

/* --------------------------------------------------------------------- acceso */

$('#form-acceso').addEventListener('submit', async (evento) => {
  evento.preventDefault();
  limpiarAviso($('#aviso-acceso'));
  try {
    const datos = await api('/api/auth/profesor/ingresar', {
      cuerpo: { email: $('#email').value, password: $('#password').value },
    });
    docente = datos.profesor;
    await entrar();
  } catch (error) {
    mostrarAviso($('#aviso-acceso'), error.message);
  }
});

$('#btn-salir').addEventListener('click', async () => {
  await api('/api/auth/salir', { cuerpo: {} });
  location.reload();
});

async function entrar() {
  $('#acceso').hidden = true;
  $('#barra').hidden = false;
  panel.hidden = false;
  $('#docente').textContent = docente.nombre;
  if (!location.hash) location.hash = '#pruebas';
  await enrutar();
}

/* --------------------------------------------------------------------- rutas */

const rutas = [
  [/^#pruebas$/, vistaPruebas],
  [/^#alumnos$/, vistaAlumnos],
  [/^#codigos(?:\/(.*))?$/, vistaCodigos],
  [/^#cuenta$/, vistaCuenta],
  [/^#prueba\/(\d+)\/editor$/, vistaEditor],
  [/^#prueba\/(\d+)\/vista$/, vistaPrevia],
  [/^#prueba\/(\d+)\/monitor$/, vistaMonitor],
  [/^#prueba\/(\d+)\/informe$/, vistaInforme],
  [/^#intento\/(\d+)$/, vistaInformeAlumno],
];

async function enrutar() {
  if (!docente) return;
  const hash = location.hash || '#pruebas';
  for (const [patron, vista] of rutas) {
    const m = hash.match(patron);
    if (m) {
      panel.innerHTML = '<p class="silencio">Cargando…</p>';
      try {
        await vista(panel, ...m.slice(1));
      } catch (error) {
        panel.innerHTML = '<div class="aviso error">' + esc(error.message) + '</div>';
      }
      // Un repintado en el mismo lugar (guardar una pregunta) no debe saltar arriba.
      if (window.mantenerScroll) window.mantenerScroll = false;
      else window.scrollTo(0, 0);
      return;
    }
  }
  location.hash = '#pruebas';
}

window.addEventListener('hashchange', enrutar);

/* ---------------------------------------------------------- vista: pruebas */

const ETIQUETA_ESTADO = {
  borrador: '<span class="etiqueta gris">Borrador</span>',
  publicada: '<span class="etiqueta verde">Publicada</span>',
  cerrada: '<span class="etiqueta ambar">Cerrada</span>',
};

async function vistaPruebas(nodo) {
  const { pruebas } = await api('/api/admin/pruebas');

  nodo.innerHTML =
    '<div class="fila"><h1 class="crece">Pruebas</h1>' +
      '<a href="#cuenta" class="silencio">Mi cuenta</a>' +
      '<button id="btn-nueva">Nueva prueba</button></div>' +
    '<div id="aviso" class="aviso"></div>' +
    '<div id="caja-nueva"></div>' +
    (pruebas.length
      ? '<div class="tarjeta tabla-scroll"><table><thead><tr>' +
          '<th>Prueba</th><th>Estado</th><th>Contenido</th><th>Rendida</th><th></th>' +
        '</tr></thead><tbody>' +
        pruebas.map((p) =>
          '<tr>' +
            '<td><strong>' + esc(p.titulo) + '</strong><br><span class="silencio">' +
              esc(p.asignatura) + ' · ' + esc(p.nivel) +
              (p.cursos ? ' · cursos: ' + esc(p.cursos) : ' · todos los cursos') + '</span></td>' +
            '<td>' + (ETIQUETA_ESTADO[p.estado] || p.estado) + '</td>' +
            '<td class="silencio">' + plural(p.total_textos, 'texto') + '<br>' + plural(p.total_preguntas, 'pregunta') + '</td>' +
            '<td class="silencio">' + plural(p.total_enviados, 'enviada') +
              (p.total_en_curso ? '<br><span class="etiqueta ambar">' + p.total_en_curso + ' rindiendo</span>' : '') + '</td>' +
            '<td><div class="fila fin">' +
              '<a href="#prueba/' + p.id + '/editor"><button class="neutro chico">Editar</button></a>' +
              '<a href="#prueba/' + p.id + '/vista"><button class="neutro chico">Ver</button></a>' +
              '<a href="#prueba/' + p.id + '/monitor"><button class="neutro chico">Monitor</button></a>' +
              '<a href="#prueba/' + p.id + '/informe"><button class="secundario chico">Informe</button></a>' +
              '<button class="neutro chico" data-duplicar="' + p.id + '">Duplicar</button>' +
              '<button class="peligro chico" data-borrar="' + p.id + '">Eliminar</button>' +
            '</div></td>' +
          '</tr>').join('') +
        '</tbody></table></div>'
      : '<div class="tarjeta"><p>Aún no hay pruebas creadas.</p>' +
        '<p class="silencio">Crea una prueba, agrega los textos y luego las preguntas con su OA, eje de habilidad e indicador.</p></div>');

  $('#btn-nueva').addEventListener('click', () => formularioNuevaPrueba($('#caja-nueva')));

  nodo.querySelectorAll('[data-duplicar]').forEach((b) => b.addEventListener('click', async () => {
    await api('/api/admin/pruebas/' + b.dataset.duplicar + '/duplicar', { cuerpo: {} });
    enrutar();
  }));

  nodo.querySelectorAll('[data-borrar]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('Se eliminará la prueba con todos sus textos, preguntas y resultados. ¿Continuar?')) return;
    await api('/api/admin/pruebas/' + b.dataset.borrar, { metodo: 'DELETE' });
    enrutar();
  }));
}

function formularioNuevaPrueba(caja) {
  caja.innerHTML =
    '<div class="tarjeta"><h2>Nueva prueba</h2>' +
      '<div class="rejilla dos">' +
        '<div class="campo"><label>Título</label><input id="n-titulo" placeholder="Prueba de Lectura — Monitoreo Intermedio"></div>' +
        '<div class="campo"><label>Asignatura</label><input id="n-asignatura" value="Lectura"></div>' +
        '<div class="campo"><label>Nivel</label><input id="n-nivel" value="II medio"></div>' +
        '<div class="campo"><label>Duración en minutos (vacío = sin límite)</label><input id="n-duracion" type="number" min="1" placeholder="80"></div>' +
      '</div>' +
      '<div class="campo"><label>Descripción breve</label><input id="n-descripcion"></div>' +
      '<div class="fila fin"><button class="neutro" id="n-cancelar">Cancelar</button><button id="n-crear">Crear prueba</button></div>' +
    '</div>';

  $('#n-cancelar').addEventListener('click', () => { caja.innerHTML = ''; });
  $('#n-crear').addEventListener('click', async () => {
    const titulo = $('#n-titulo').value.trim();
    if (!titulo) return mostrarAviso($('#aviso'), 'Escribe un título para la prueba.');
    const { id } = await api('/api/admin/pruebas', {
      cuerpo: {
        titulo,
        asignatura: $('#n-asignatura').value,
        nivel: $('#n-nivel').value,
        duracion_min: $('#n-duracion').value || null,
        descripcion: $('#n-descripcion').value,
      },
    });
    location.hash = '#prueba/' + id + '/editor';
  });
}

/* ---------------------------------------------------------- vista: alumnos */

async function vistaAlumnos(nodo) {
  const cursoFiltro = sessionStorage.getItem('curso') || '';
  const datos = await api('/api/admin/alumnos' + (cursoFiltro ? '?curso=' + encodeURIComponent(cursoFiltro) : ''));

  nodo.innerHTML =
    '<div class="fila"><h1 class="crece">Alumnos y códigos</h1>' +
      '<a href="#codigos/' + encodeURIComponent(cursoFiltro) + '"><button class="secundario">Imprimir códigos</button></a>' +
      '</div>' +
    '<div id="aviso" class="aviso"></div>' +

    '<div class="tarjeta"><div class="fila">' +
      '<div style="min-width:190px"><label>Filtrar por curso</label>' +
        '<select id="filtro-curso"><option value="">Todos los cursos (' +
          datos.cursos.reduce((s, c) => s + c.n, 0) + ')</option>' +
          datos.cursos.map((c) => '<option value="' + esc(c.curso) + '"' +
            (c.curso === cursoFiltro ? ' selected' : '') + '>' + esc(c.curso) + ' (' + c.n + ')</option>').join('') +
        '</select></div>' +
    '</div></div>' +

    '<div class="tarjeta tabla-scroll"><table><thead><tr>' +
      '<th>N° mat.</th><th>Nombre</th><th>Curso</th><th>RUT</th><th>Código</th><th></th>' +
    '</tr></thead><tbody>' +
    (datos.alumnos.length
      ? datos.alumnos.map((a) =>
        '<tr' + (a.activo ? '' : ' style="opacity:.5"') + '>' +
          '<td class="silencio">' + esc(a.matricula) + '</td>' +
          '<td>' + esc(a.nombre) + '</td>' +
          '<td>' + esc(a.curso) + '</td>' +
          '<td class="silencio">' + esc(a.rut ? a.rut + '-' + a.dv : '') + '</td>' +
          '<td><span class="codigo-alumno">' + esc(a.codigo) + '</span></td>' +
          '<td><div class="fila fin">' +
            '<button class="neutro chico" data-regenerar="' + a.id + '">Nuevo código</button>' +
            '<button class="peligro chico" data-borrar="' + a.id + '">Eliminar</button>' +
          '</div></td>' +
        '</tr>').join('')
      : '<tr><td colspan="6" class="silencio">No hay alumnos cargados. Importa la planilla de matrícula o agrégalos uno a uno.</td></tr>') +
    '</tbody></table></div>';

  $('#filtro-curso').addEventListener('change', (e) => {
    sessionStorage.setItem('curso', e.target.value);
    enrutar();
  });

  nodo.querySelectorAll('[data-regenerar]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('El código antiguo dejará de servir. ¿Generar uno nuevo?')) return;
    await api('/api/admin/alumnos/' + b.dataset.regenerar + '/regenerar-codigo', { cuerpo: {} });
    enrutar();
  }));

  nodo.querySelectorAll('[data-borrar]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('Se eliminará el alumno y sus respuestas. ¿Continuar?')) return;
    await api('/api/admin/alumnos/' + b.dataset.borrar, { metodo: 'DELETE' });
    enrutar();
  }));

}

/* ------------------------------------------------- vista: hoja de códigos */

async function vistaCodigos(nodo, curso) {
  const filtro = decodeURIComponent(curso || '');
  // El selector lista siempre todos los cursos, aunque se este viendo uno solo.
  const completo = await api('/api/admin/alumnos');
  const porCursoTodos = new Map();
  for (const a of completo.alumnos.filter((x) => x.activo)) {
    porCursoTodos.set(a.curso, (porCursoTodos.get(a.curso) || 0) + 1);
  }
  const datos = await api('/api/admin/alumnos' + (filtro ? '?curso=' + encodeURIComponent(filtro) : ''));

  // Solo los vigentes: imprimir el talon de un estudiante retirado seria repartir
  // un codigo que ya no sirve.
  const vigentes = datos.alumnos.filter((a) => a.activo);

  // Agrupados por curso: se imprimen todos de una vez, pero cada curso empieza
  // en su propia hoja, que es como se reparten despues en la sala.
  const porCurso = new Map();
  for (const a of vigentes) {
    const c = a.curso || 'Sin curso';
    if (!porCurso.has(c)) porCurso.set(c, []);
    porCurso.get(c).push(a);
  }

  const talon = (a) =>
    '<div class="tarjeta" style="margin:0">' +
      '<div class="silencio" style="font-size:.78rem">' + esc(a.curso) +
        (a.matricula ? ' · N° ' + esc(a.matricula) : '') + '</div>' +
      '<div style="font-weight:600;margin:.2rem 0 .5rem">' + esc(a.nombre) + '</div>' +
      '<div class="codigo-alumno">' + esc(a.codigo) + '</div>' +
      '<div class="silencio" style="font-size:.75rem;margin-top:.4rem">' +
        'Ingresa en la dirección que indique tu profesor</div>' +
    '</div>';

  const hojas = [...porCurso.entries()].map(([c, lista], i) =>
    '<section class="hoja-curso"' + (i ? ' style="break-before:page"' : '') + '>' +
      '<div class="fila" style="margin:1.2rem 0 .6rem">' +
        '<h2 class="crece">' + esc(c) + '</h2>' +
        '<span class="silencio">' + plural(lista.length, 'estudiante') + '</span>' +
      '</div>' +
      '<div class="rejilla tres">' + lista.map(talon).join('') + '</div>' +
    '</section>').join('');

  nodo.innerHTML =
    '<div class="fila no-imprimir"><h1 class="crece">Códigos de acceso</h1>' +
      '<a href="#alumnos"><button class="neutro">Volver</button></a>' +
      '<button onclick="window.print()">Imprimir</button></div>' +

    '<div class="tarjeta no-imprimir"><div class="fila">' +
      '<div style="min-width:210px"><label>Curso a imprimir</label>' +
        '<select id="filtro-codigos">' +
          '<option value="">Todos (' + plural(vigentes.length, 'estudiante') + ')</option>' +
          [...porCursoTodos.entries()].map(([c, n]) => '<option value="' + esc(c) + '"' +
            (c === filtro ? ' selected' : '') + '>' + esc(c) + ' (' + n + ')</option>').join('') +
        '</select></div>' +
      '<p class="silencio crece" style="margin:0">Recorta y entrega un talón a cada estudiante. ' +
        'Al imprimir todos, cada curso empieza en una hoja nueva.</p>' +
    '</div></div>' +

    (vigentes.length ? hojas : '<div class="tarjeta"><p>No hay estudiantes vigentes en ese curso.</p></div>');

  $('#filtro-codigos').addEventListener('change', (e) => {
    location.hash = '#codigos/' + encodeURIComponent(e.target.value);
  });
}

/* ----------------------------------------------------------- vista: cuenta */

async function vistaCuenta(nodo) {
  const { profesores } = await api('/api/auth/profesores');

  nodo.innerHTML =
    '<h1>Mi cuenta</h1><div id="aviso" class="aviso"></div>' +
    '<div class="tarjeta"><h2>Cambiar contraseña</h2>' +
      '<div class="rejilla dos">' +
        '<div class="campo"><label>Contraseña actual</label><input id="c-actual" type="password"></div>' +
        '<div class="campo"><label>Nueva contraseña (mínimo 8 caracteres)</label><input id="c-nueva" type="password"></div>' +
      '</div><div class="fila fin"><button id="c-guardar">Guardar</button></div></div>' +

    '<div class="tarjeta"><h2>Docentes con acceso</h2>' +
      '<table><thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th></tr></thead><tbody>' +
      profesores.map((p) => '<tr><td>' + esc(p.nombre) + '</td><td>' + esc(p.email) + '</td><td>' + esc(p.rol) + '</td></tr>').join('') +
      '</tbody></table>' +
      (docente.rol === 'admin'
        ? '<h3 style="margin-top:1.2rem">Agregar docente</h3><div class="rejilla dos">' +
            '<div class="campo"><label>Nombre</label><input id="d-nombre"></div>' +
            '<div class="campo"><label>Correo</label><input id="d-email" type="email"></div>' +
            '<div class="campo"><label>Contraseña inicial</label><input id="d-password" type="text"></div>' +
            '<div class="campo"><label>Rol</label><select id="d-rol"><option value="profesor">Profesor</option><option value="admin">Administrador</option></select></div>' +
          '</div><div class="fila fin"><button id="d-crear">Crear docente</button></div>'
        : '<p class="silencio">Solo un administrador puede agregar docentes.</p>') +
    '</div>' +
    '<p><a href="#pruebas">Volver a las pruebas</a></p>';

  $('#c-guardar').addEventListener('click', async () => {
    try {
      await api('/api/auth/profesor/cambiar-password', {
        cuerpo: { actual: $('#c-actual').value, nueva: $('#c-nueva').value },
      });
      mostrarAviso($('#aviso'), 'Contraseña actualizada.', 'ok');
      $('#c-actual').value = ''; $('#c-nueva').value = '';
    } catch (error) {
      mostrarAviso($('#aviso'), error.message);
    }
  });

  const crear = $('#d-crear');
  if (crear) crear.addEventListener('click', async () => {
    try {
      await api('/api/auth/profesores', {
        cuerpo: {
          nombre: $('#d-nombre').value, email: $('#d-email').value,
          password: $('#d-password').value, rol: $('#d-rol').value,
        },
      });
      enrutar();
    } catch (error) {
      mostrarAviso($('#aviso'), error.message);
    }
  });
}

// prueba.js necesita repintar la vista actual; se expone así para no crear una
// dependencia circular entre ambos módulos.
window.recargarVista = enrutar;

/* --------------------------------------------------------------------- inicio */

(async function iniciar() {
  try {
    const sesion = await api('/api/auth/sesion');
    if (sesion.profesor) { docente = sesion.profesor; await entrar(); return; }
  } catch { /* sin sesión */ }
  $('#email').focus();
})();
