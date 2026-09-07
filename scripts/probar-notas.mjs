// Comprueba el calculo de la nota sin tocar la base de datos.
//
//   npm run probar-notas
//
// La escala es la unica parte del sistema donde un error no se nota: una nota
// mal calculada se ve razonable y termina en el libro de clases igual.
import { escalaDeNotas, calcularNota, validarEscala, promedioDeNotas } from '../public/js/notas.js';

let fallos = 0;

const igual = (nombre, obtenido, esperado) => {
  const ok = JSON.stringify(obtenido) === JSON.stringify(esperado);
  if (!ok) fallos += 1;
  console.log(
    (ok ? '  ok    ' : '  FALLA ') + nombre.padEnd(42) + JSON.stringify(obtenido) +
    (ok ? '' : '   esperaba ' + JSON.stringify(esperado))
  );
};

console.log('\nEscala automatica sobre 47 puntos (7,0 = total, 4,0 = 60 %)');
const auto = escalaDeNotas({ nota_activa: 1 }, 47);
igual('puntaje del 7,0', auto.puntaje_7, 47);
igual('puntaje del 4,0', auto.puntaje_4, 28.2);
igual('puntaje del 1,0', auto.puntaje_1, 0);
igual('queda activa', auto.activa, true);
igual('0 puntos', calcularNota(0, auto), 1);
igual('28,2 puntos', calcularNota(28.2, auto), 4);
igual('47 puntos', calcularNota(47, auto), 7);
igual('14,1 puntos (mitad del tramo bajo)', calcularNota(14.1, auto), 2.5);
igual('37,6 puntos (mitad del tramo alto)', calcularNota(37.6, auto), 5.5);
igual('50 puntos, por sobre el maximo', calcularNota(50, auto), 7);

// La base guarda NULL cuando el anclaje queda en automatico, y Number(null) es
// 0, no NaN. Una vez esto hizo que la escala entera se leyera como "todo en
// cero puntos" y ninguna prueba se calificara.
console.log('\nAnclajes en automático tal como llegan de la base (NULL)');
const nulos = escalaDeNotas(
  { nota_activa: 1, nota_puntaje_7: null, nota_puntaje_4: null, nota_puntaje_1: null }, 47
);
igual('NULL no se confunde con cero', nulos.puntaje_7, 47);
igual('el 4,0 se completa solo', nulos.puntaje_4, 28.2);
igual('la escala queda utilizable', nulos.activa, true);
igual('y califica', calcularNota(30, nulos), 4.3);
igual('cadena vacía tambien es automático', escalaDeNotas({ nota_activa: 1, nota_puntaje_7: '' }, 47).puntaje_7, 47);

console.log('\nEscala escrita a mano: 1,0 con 5 pts / 4,0 con 30 / 7,0 con 45');
const mano = escalaDeNotas(
  { nota_activa: 1, nota_puntaje_1: 5, nota_puntaje_4: 30, nota_puntaje_7: 45 }, 47
);
igual('5 puntos', calcularNota(5, mano), 1);
igual('3 puntos, bajo el anclaje del 1,0', calcularNota(3, mano), 1);
igual('30 puntos', calcularNota(30, mano), 4);
igual('45 puntos', calcularNota(45, mano), 7);
igual('47 puntos, por sobre el 7,0', calcularNota(47, mano), 7);
igual('17,5 puntos', calcularNota(17.5, mano), 2.5);
igual('exigencia declarada', mano.exigencia, 66.7);

console.log('\nEscalas que no sirven: mejor sin nota que con una inventada');
igual('prueba sin preguntas', escalaDeNotas({ nota_activa: 1 }, 0).activa, false);
igual('4,0 por sobre el 7,0', escalaDeNotas({ nota_activa: 1, nota_puntaje_4: 60 }, 47).activa, false);
igual('calificacion desactivada', escalaDeNotas({ nota_activa: 0 }, 47).activa, false);
igual(
  'no devuelve nota si la escala es invalida',
  calcularNota(20, escalaDeNotas({ nota_activa: 1, nota_puntaje_4: 60 }, 47)),
  null
);

console.log('\nValidacion de lo que llega del formulario');
igual('todo en automatico', validarEscala({}).ok, true);
igual('solo el 4,0 fijado', validarEscala({ puntaje_4: 30 }).ok, true);
igual('4,0 por debajo del 1,0', validarEscala({ puntaje_1: 30, puntaje_4: 10 }).ok, false);
igual('7,0 por debajo del 4,0', validarEscala({ puntaje_4: 40, puntaje_7: 30 }).ok, false);
igual('puntaje negativo', validarEscala({ puntaje_1: -1 }).ok, false);
igual('escala coherente', validarEscala({ puntaje_1: 0, puntaje_4: 28, puntaje_7: 47 }).ok, true);

console.log('\nPromedios');
igual('promedio del curso', promedioDeNotas([4, 5.5, 7]), 5.5);
igual('curso sin notas', promedioDeNotas([null, null]), null);

console.log('');
if (fallos) {
  console.error(fallos + (fallos === 1 ? ' comprobacion falló.' : ' comprobaciones fallaron.'));
  process.exit(1);
}
console.log('Todas las comprobaciones pasaron.\n');
