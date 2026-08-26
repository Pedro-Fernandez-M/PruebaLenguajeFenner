// Estructura oficial de la prueba de Lectura de II medio, Monitoreo Intermedio 2026,
// transcrita de la Ficha Técnica de la Agencia de Calidad de la Educación:
// 7 textos, 38 preguntas, sus OA, ejes de habilidad, indicadores y claves.
// Los enunciados y las alternativas NO vienen en la ficha, por eso quedan vacíos:
// el docente los copia desde el cuadernillo impreso.

export const TEXTOS_DIA = [
  { orden: 1, titulo: 'Texto 1 — Narración',                          tipo_texto: 'Narración',                                                       preguntas: [1, 2, 3, 4, 5, 6] },
  { orden: 2, titulo: 'Texto 2 — Medios de comunicación',             tipo_texto: 'Texto de los medios de comunicación',                             preguntas: [7, 8, 9, 10, 11, 12] },
  { orden: 3, titulo: 'Texto 3 — Medios de comunicación (relacionado con el Texto 2)', tipo_texto: 'Texto de los medios de comunicación',             preguntas: [13, 14, 15] },
  { orden: 4, titulo: 'Texto 4 — Texto dramático',                    tipo_texto: 'Texto dramático',                                                 preguntas: [16, 17, 18, 19, 20, 21] },
  { orden: 5, titulo: 'Texto 5 — Medios de comunicación',             tipo_texto: 'Texto de los medios de comunicación',                             preguntas: [22, 23, 24, 25, 26, 27] },
  { orden: 6, titulo: 'Texto 6 — Poema',                              tipo_texto: 'Poema',                                                           preguntas: [28, 29, 30, 31, 32, 33] },
  { orden: 7, titulo: 'Texto 7 — Medios de comunicación, finalidad argumentativa', tipo_texto: 'Texto de los medios de comunicación con finalidad argumentativa', preguntas: [34, 35, 36, 37, 38] },
];

const L = 'Localizar';
const I = 'Interpretar y relacionar';
const R = 'Reflexionar';

export const PREGUNTAS_DIA = [
  [1,  '3',  L, 'Localizan información explícita relevante en un texto narrativo.', 'D'],
  [2,  '3',  I, 'Infieren información relevante sobre personajes en un texto narrativo.', 'A'],
  [3,  '3',  I, 'Interpretan el sentido de elementos simbólicos presentes en un texto narrativo.', 'B'],
  [4,  '3',  I, 'Infieren el conflicto en un texto narrativo.', 'C'],
  [5,  '3',  I, 'Infieren el tema central de un texto narrativo.', 'B'],
  [6,  '3',  R, 'Evalúan el efecto o visión del uso de un determinado narrador en un texto narrativo.', 'D'],
  [7,  '10', I, 'Infieren información relevante en un texto de los medios de comunicación.', 'C'],
  [8,  '10', I, 'Infieren información relevante que entregan los recursos lingüísticos en un texto de los medios de comunicación.', 'C'],
  [9,  '10', L, 'Localizan información explícita relevante en un texto de los medios de comunicación.', 'B'],
  [10, '10', I, 'Infieren el tema central de un texto de los medios de comunicación o un fragmento relevante de este.', 'D'],
  [11, '10', R, 'Distinguen un hecho de una opinión en un texto de los medios de comunicación.', 'C'],
  [12, '10', I, 'Infieren información relevante en un texto de los medios de comunicación.', 'A'],
  [13, '10', I, 'Comparan información relevante entre dos textos de los medios de comunicación.', 'A'],
  [14, '10', R, 'Determinan propósitos explícitos e implícitos en un texto de los medios de comunicación.', 'B'],
  [15, '10', R, 'Evalúan la forma en que dos fuentes abordan un mismo hecho o tema en textos de los medios de comunicación.', 'B'],
  [16, '5',  L, 'Localizan información explícita relevante en un texto dramático.', 'C'],
  [17, '5',  I, 'Infieren información relevante sobre personajes en un texto dramático.', 'B'],
  [18, '5',  I, 'Infieren información relevante sobre personajes en un texto dramático.', 'B'],
  [19, '5',  I, 'Caracterizan las relaciones entre los personajes de un texto dramático.', 'D'],
  [20, '5',  I, 'Infieren información relevante sobre personajes en un texto dramático.', 'A'],
  [21, '5',  R, 'Determinan la visión de mundo que se presenta en un texto dramático.', 'C'],
  [22, '10', L, 'Localizan información explícita relevante en un texto de los medios de comunicación.', 'D'],
  [23, '10', I, 'Infieren el tema central de un texto de los medios de comunicación o un fragmento relevante de este.', 'C'],
  [24, '10', I, 'Infieren información relevante en un texto de los medios de comunicación.', 'D'],
  [25, '10', I, 'Infieren información relevante en un texto de los medios de comunicación.', 'B'],
  [26, '10', R, 'Determinan propósitos explícitos e implícitos en un texto de los medios de comunicación.', 'C'],
  [27, '10', R, 'Formulan una postura personal sobre algún aspecto controversial de un texto de los medios de comunicación.', 'DESARROLLO'],
  [28, '4',  I, 'Establecen conclusiones sobre distintos aspectos en un poema.', 'B'],
  [29, '4',  I, 'Establecen conclusiones sobre distintos aspectos en un poema.', 'B'],
  [30, '4',  I, 'Infieren el sentido global de un poema.', 'A'],
  [31, '4',  I, 'Establecen conclusiones sobre distintos aspectos en un poema.', 'D'],
  [32, '4',  I, 'Interpretan el sentido de elementos simbólicos presentes en un poema.', 'A'],
  [33, '4',  R, 'Evalúan el efecto o función que tienen las repeticiones o el lenguaje figurado en un poema.', 'C'],
  [34, '10', R, 'Evalúan la forma en que se aborda el tema en un texto argumentativo.', 'B'],
  [35, '9',  I, 'Infieren la tesis del autor en un texto argumentativo.', 'C'],
  [36, '9',  I, 'Infieren los argumentos que respaldan la tesis del autor en un texto argumentativo.', 'B'],
  [37, '9',  I, 'Infieren información relevante (datos, hechos, opiniones, etc.) en un texto argumentativo.', 'A'],
  [38, '9',  R, 'Determinan los prejuicios, estereotipos y creencias en un texto argumentativo.', 'D'],
];

// Pauta de corrección de la pregunta 27, transcrita de la ficha técnica.
export const RUBRICA_DIA_27 = [
  {
    codigo: 2,
    descripcion:
      'La o el estudiante formula una opinión crítica a partir de un aspecto controversial de la lectura, ' +
      'con fundamentos que integren información del texto de los medios de comunicación y/o sus conocimientos previos, ' +
      'evidenciando en su respuesta una comprensión y análisis adecuado del texto.\n\n' +
      'Se considera correcta la respuesta en que el o la estudiante formula una postura personal sobre la efectividad ' +
      'de una iniciativa para solucionar problemáticas sociales asociadas a la situación ambiental y social de las personas.',
    ejemplos:
      'Sí, porque es un paso para que las personas desarrollen conciencia sobre el manejo de la basura y, al mismo tiempo, ' +
      'se ayuda a las familias que no tienen qué comer.\n\n' +
      'No, porque solo mejora la situación básica de algunas familias, pero no de toda la población, y lo mismo pasa con la basura, ' +
      'ya que la gente sigue produciéndola.',
  },
  {
    codigo: 1,
    descripcion:
      'La o el estudiante formula una opinión a partir de un aspecto controversial de la lectura, pero no demuestra ' +
      'un análisis profundo de la situación expuesta en su respuesta.\n\n' +
      'Es parcial cuando comprende el texto de manera general, pero sin aludir a los resultados obtenidos por la implementación ' +
      'de la iniciativa en términos globales: puede aludir a un aspecto puntual mencionado, pero no evalúa la proyección de los ' +
      'efectos de la iniciativa como resolución definitiva a problemáticas sociales.',
    ejemplos:
      'Sí, porque las personas que no pueden alimentarse, lo pueden hacer de forma gratuita.\n\n' +
      'No, porque el Estado debería resolver los problemas de las personas y no un negocio particular.',
  },
  {
    codigo: 0,
    descripcion:
      'La o el estudiante formula una opinión respecto a la situación por la que se pregunta, pero evidencia en su respuesta ' +
      'una comprensión errónea del texto y/o la información solicitada en la pregunta, pues no realiza un análisis crítico ' +
      'de la información global y evidencia errores en la comprensión lectora (respuestas incoherentes, vagas, tautológicas, etcétera).\n\n' +
      'También son incorrectas las respuestas en blanco.',
    ejemplos:
      'Sí, porque se solucionaron los dos problemas.\n\n' +
      'No, porque no es apropiado juntar basura en un café.',
  },
];
