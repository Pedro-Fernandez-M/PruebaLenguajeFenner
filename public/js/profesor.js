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

/** Lee un archivo local y devuelve su contenido en base64. */
function aBase64(archivo) {
  return new Promise((resolver) => {
    const lector = new FileReader();
    lector.onload = () => resolver(String(lector.result).split(',')[1]);
    lector.readAsDataURL(archivo);
  });
}

/* ---------------------------------------------------------- vista: alumnos */

async function vistaAlumnos(nodo) {
  const cursoFiltro = sessionStorage.getItem('curso') || '';
  const datos = await api('/api/admin/alumnos' + (cursoFiltro ? '?curso=' + encodeURIComponent(cursoFiltro) : ''));

  nodo.innerHTML =
    '<div class="fila"><h1 class="crece">Alumnos y códigos</h1>' +
      '<a href="#codigos/' + encodeURIComponent(cursoFiltro) + '"><button class="secundario">Imprimir códigos</button></a>' +
      '<button id="btn-importar">Importar planilla</button></div>' +
    '<div id="aviso" class="aviso"></div>' +
    '<div id="caja-importar"></div>' +

    '<div class="tarjeta"><div class="fila">' +
      '<div style="min-width:190px"><label>Filtrar por curso</label>' +
        '<select id="filtro-curso"><option value="">Todos los cursos (' +
          datos.cursos.reduce((s, c) => s + c.n, 0) + ')</option>' +
          datos.cursos.map((c) => '<option value="' + esc(c.curso) + '"' +
            (c.curso === cursoFiltro ? ' selected' : '') + '>' + esc(c.curso) + ' (' + c.n + ')</option>').join('') +
        '</select></div>' +
      '<div class="crece"></div>' +
      '<button class="neutro" id="btn-agregar">Agregar alumno</button>' +
    '</div></div>' +
    '<div id="caja-agregar"></div>' +

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

  $('#btn-agregar').addEventListener('click', () => {
    $('#caja-agregar').innerHTML =
      '<div class="tarjeta"><h2>Agregar alumno</h2><div class="rejilla dos">' +
        '<div class="campo"><label>Nombre completo</label><input id="a-nombre"></div>' +
        '<div class="campo"><label>Curso</label><input id="a-curso" value="' + esc(cursoFiltro) + '" placeholder="2° A"></div>' +
        '<div class="campo"><label>N° matrícula</label><input id="a-matricula"></div>' +
        '<div class="campo"><label>RUT (sin dígito verificador)</label><input id="a-rut"></div>' +
      '</div><div class="fila fin"><button id="a-guardar">Guardar y generar código</button></div></div>';

    $('#a-guardar').addEventListener('click', async () => {
      const nombre = $('#a-nombre').value.trim();
      if (!nombre) return mostrarAviso($('#aviso'), 'El alumno necesita un nombre.');
      await api('/api/admin/alumnos', {
        cuerpo: {
          nombre, curso: $('#a-curso').value.trim(),
          matricula: $('#a-matricula').value.trim(), rut: $('#a-rut').value.trim(),
        },
      });
      enrutar();
    });
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

  $('#btn-importar').addEventListener('click', () => formularioImportar($('#caja-importar')));
}

function formularioImportar(caja) {
  caja.innerHTML =
    '<div class="tarjeta"><h2>Importar nómina desde Excel</h2>' +
      '<p class="silencio">Sirve la planilla de matrícula tal como viene: se detectan solas las columnas ' +
      '<em>N° MAT.</em>, <em>NÓMINA DE ALUMNOS</em>, <em>CURSO</em> y <em>CÉDULA IDENTIDAD</em>. ' +
      'Si un alumno ya existe (mismo RUT o matrícula) se actualizan sus datos y conserva su código.</p>' +
      '<div class="campo"><input type="file" id="archivo" accept=".xlsx"></div>' +
      '<div id="previsualizacion"></div>' +
    '</div>';

  $('#archivo').addEventListener('change', async (evento) => {
    const archivo = evento.target.files[0];
    if (!archivo) return;
    const base64 = await aBase64(archivo);

    const previa = $('#previsualizacion');
    previa.innerHTML = '<p class="silencio">Leyendo planilla…</p>';
    try {
      const { hojas } = await api('/api/admin/alumnos/analizar', { cuerpo: { archivo: base64 } });
      const todos = hojas.flatMap((h) => h.alumnos);
      if (!todos.length) {
        previa.innerHTML = '<div class="aviso error">No se reconocio ningun alumno en la planilla.</div>';
        return;
      }

      // Se agrupa por curso para poder cargar solo los niveles que interesan.
      const cursos = [...new Set(todos.map((a) => a.curso).filter(Boolean))].sort();
      const conteo = (c) => todos.filter((a) => a.curso === c).length;
      const regimenes = (c) => {
        const lista = todos.filter((a) => a.curso === c);
        const i = lista.filter((a) => a.regimen === 'Interno').length;
        const e = lista.filter((a) => a.regimen === 'Externo').length;
        return i || e ? ' (' + i + ' internos, ' + e + ' externos)' : '';
      };

      previa.innerHTML =
        '<h3>Se encontraron ' + plural(todos.length, 'alumno') + ' en ' + plural(cursos.length, 'curso') + '</h3>' +
        '<p class="silencio">Marca los cursos que quieres cargar.</p>' +
        '<div class="fila" style="margin-bottom:.6rem">' +
          '<button class="neutro chico" id="marcar-todos">Marcar todos</button>' +
          '<button class="neutro chico" id="marcar-ninguno">Desmarcar todos</button>' +
          cursos.map((c) => c.replace(/[^0-9]/g, '')).filter((n, i, a) => n && a.indexOf(n) === i).sort()
            .map((n) => '<button class="neutro chico" data-nivel="' + n + '">Solo ' + n + '° medio</button>').join('') +
        '</div>' +
        '<div class="rejilla tres">' +
        cursos.map((c) =>
          '<label class="alternativa" style="margin:0">' +
            '<input type="checkbox" data-curso="' + esc(c) + '" checked>' +
            '<span><strong>' + esc(c) + '</strong><br><span class="silencio">' +
              plural(conteo(c), 'alumno') + esc(regimenes(c)) + '</span></span>' +
          '</label>').join('') +
        '</div>' +
        '<div class="fila fin" style="margin-top:.9rem">' +
          '<span class="silencio crece" id="resumen-seleccion"></span>' +
          '<button id="confirmar-importar">Importar seleccionados</button></div>';

      const marcadas = () => $$('[data-curso]', previa).filter((c) => c.checked).map((c) => c.dataset.curso);
      const refrescar = () => {
        const n = todos.filter((a) => marcadas().includes(a.curso)).length;
        $('#resumen-seleccion').textContent = 'Se cargaran ' + plural(n, 'alumno') + '.';
        $('#confirmar-importar').disabled = n === 0;
      };

      $$('[data-curso]', previa).forEach((c) => c.addEventListener('change', refrescar));
      $('#marcar-todos').addEventListener('click', () => {
        $$('[data-curso]', previa).forEach((c) => { c.checked = true; });
        refrescar();
      });
      $('#marcar-ninguno').addEventListener('click', () => {
        $$('[data-curso]', previa).forEach((c) => { c.checked = false; });
        refrescar();
      });
      $$('[data-nivel]', previa).forEach((boton) => boton.addEventListener('click', () => {
        $$('[data-curso]', previa).forEach((c) => {
          c.checked = c.dataset.curso.replace(/[^0-9]/g, '') === boton.dataset.nivel;
        });
        refrescar();
      }));
      refrescar();

      $('#confirmar-importar').addEventListener('click', async () => {
        const elegidos = marcadas();
        const alumnos = todos.filter((a) => elegidos.includes(a.curso));
        const r = await api('/api/admin/alumnos/importar', { cuerpo: { alumnos } });
        mostrarAviso($('#aviso'),
          plural(r.creados, 'alumno nuevo', 'alumnos nuevos') + ' con codigo y ' + r.actualizados + ' actualizados.', 'ok');
        caja.innerHTML = '';
        enrutar();
      });
    } catch (error) {
      previa.innerHTML = '<div class="aviso error">' + esc(error.message) + '</div>';
    }
  });
}

/* ------------------------------------------------- vista: hoja de códigos */

async function vistaCodigos(nodo, curso) {
  const filtro = decodeURIComponent(curso || '');
  const datos = await api('/api/admin/alumnos' + (filtro ? '?curso=' + encodeURIComponent(filtro) : ''));

  nodo.innerHTML =
    '<div class="fila no-imprimir"><h1 class="crece">Códigos de acceso' + (filtro ? ' — ' + esc(filtro) : '') + '</h1>' +
      '<a href="#alumnos"><button class="neutro">Volver</button></a>' +
      '<button onclick="window.print()">Imprimir</button></div>' +
    '<p class="silencio no-imprimir">Recorta y entrega un talón a cada estudiante. El código sirve para todas las pruebas que le asignes.</p>' +
    '<div class="rejilla tres">' +
    datos.alumnos.map((a) =>
      '<div class="tarjeta" style="margin:0">' +
        '<div class="silencio" style="font-size:.78rem">' + esc(a.curso) + (a.matricula ? ' · N° ' + esc(a.matricula) : '') + '</div>' +
        '<div style="font-weight:600;margin:.2rem 0 .5rem">' + esc(a.nombre) + '</div>' +
        '<div class="codigo-alumno">' + esc(a.codigo) + '</div>' +
        '<div class="silencio" style="font-size:.75rem;margin-top:.4rem">Ingresa en la dirección que indique tu profesor</div>' +
      '</div>').join('') +
    '</div>';
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
