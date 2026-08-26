# Plataforma de evaluación diagnóstica (DIA)

Los alumnos entran con un **código personal** y rinden la prueba en el navegador.
El docente crea las pruebas, define **qué criterios evalúa cada pregunta** y obtiene
un informe con la misma estructura que el que entrega la plataforma del DIA.

Modelada sobre la *Ficha Técnica de la Prueba de Lectura de II medio, Monitoreo Intermedio 2026*
de la Agencia de Calidad de la Educación y sobre el informe de resultados del RBD 22140.

---

## Puesta en marcha

Requiere **Node.js 22.5 o superior**.

```bash
npm install
```

```bash
npm run seed
```

```bash
npm start
```

Al arrancar, la consola imprime las direcciones. Los alumnos entran desde cualquier
equipo de la red del liceo a `http://<ip-del-notebook>:3000/`; el docente entra a
`http://localhost:3000/profesor`.

La cuenta docente inicial se crea en el primer arranque con lo que esté en `.env`
(por defecto `profesor@liceo.cl` / `dia2026`). **Cámbiala apenas ingreses**, en
*Mi cuenta*.

Otros comandos:

```bash
npm run dev
```

```bash
npm run reset
```

`reset` borra la base y la vuelve a crear desde cero. Se lleva todos los resultados.

---

## Cómo se modela una prueba

Una **prueba** contiene **textos**, y cada texto es el estímulo de un grupo de
**preguntas**. Cada pregunta carga los cuatro criterios de clasificación que usa
el DIA, y son los que después arman el informe:

| Criterio | Ejemplo |
|---|---|
| **N° de OA** | 3, 4, 5, 9, 10 |
| **Tipo de texto** | Narración, Poema, Texto dramático, Texto de los medios de comunicación, TMC con finalidad argumentativa |
| **Eje de habilidad** | Localizar · Interpretar y relacionar · Reflexionar |
| **Indicador de evaluación** | «Infieren el conflicto en un texto narrativo.» |

Hay dos tipos de pregunta:

- **Alternativas (A–D).** Una sola correcta. Se corrigen solas al momento de entregar.
- **Desarrollo.** El alumno escribe. El docente las corrige con una **pauta de
  códigos**: `2` correcta, `1` parcialmente correcta, `0` incorrecta. Las respuestas
  en blanco quedan en código 0 automáticamente, tal como indica la pauta oficial.

Los **niveles de logro** (I, II, III) se calculan sobre el porcentaje de logro de
cada estudiante, con umbrales configurables prueba por prueba (por defecto:
Nivel II desde 40 %, Nivel III desde 70 %).

---

## Flujo de trabajo del docente

1. **Alumnos y códigos → Importar planilla.** Sube la planilla de matrícula `.xlsx`
   tal como viene: se detectan solas las columnas *N° MAT.*, *NÓMINA DE ALUMNOS*,
   *CURSO* y *CÉDULA IDENTIDAD*. Cada alumno recibe un código único tipo `K7M2-4X9P`.
   Si vuelves a importar, los alumnos existentes se actualizan y **conservan su código**.
2. **Imprimir códigos.** Genera una hoja de talones recortables, uno por estudiante.
3. **Crear la prueba.** Tres caminos:
   - *Nueva prueba* y cargar los textos y preguntas a mano.
   - *Importar desde Word*, si ya tienes el ensayo en `.docx` (ver más abajo).
   - *Duplicar* una prueba anterior.
4. **Clasificar cada pregunta** con su OA, eje de habilidad e indicador, y marcar la clave.
5. **Publicar.** En los ajustes, estado → *publicada*. Puedes limitar a ciertos cursos
   y fijar una duración en minutos.
6. **Monitor.** Durante la prueba, ver quién está rindiendo y cuánto lleva respondido.
   Permite reabrir el intento de un alumno al que se le cortó la conexión.
7. **Corrección.** Solo para las preguntas de desarrollo: se muestra la pauta al lado
   de cada respuesta y se asigna el código 2/1/0. El puntaje se recalcula al instante.
8. **Informe.** Las cinco secciones del informe del DIA, filtrable por curso,
   imprimible y descargable en CSV.

---

## El informe

1. **Resultados según niveles de logro** — distribución de estudiantes en I / II / III.
2. **Resultados según ejes de habilidad** — porcentaje promedio de logro por eje,
   y además por tipo de texto.
3. **Resultados por pregunta** — para cada pregunta, su OA, tipo de texto, eje e
   indicador, y el **porcentaje que eligió cada alternativa**, incluida la opción
   *N* (no responde). Un distractor sobre 30 % se marca en rojo. Para las de
   desarrollo se muestra RC / RPC / RI.
4. **Resultados por estudiante** — puntaje, porcentaje y nivel, con detalle individual
   pregunta a pregunta.
5. **Lectura preliminar** — eje más y menos logrado, preguntas más débiles y las
   preguntas guía para el análisis pedagógico.

El CSV trae una fila por alumno y una columna por pregunta (la letra marcada, o
`C2`/`C1`/`C0` en las de desarrollo), más la clave y los niveles de logro.

---

## Importar un ensayo desde Word

*Pruebas → Importar desde Word.* Reconoce el formato habitual de las pruebas de
comprensión lectora:

```
TEXTO 1
Calima (obra dos actos)
...cuerpo del texto...

1.- ¿Quién es el dueño de la taberna?
A. Chispa.          B. Monda.
C. Pincha.          D. Ponce.
```

Sobre el ensayo `ENSAYO SIMCE 2°.docx` recupera los 9 textos y las 47 preguntas
con sus cuatro alternativas.

Dos límites que conviene tener presentes:

- **No importa las claves**, porque el `.docx` del estudiante no las trae. La prueba
  queda en borrador y hay que marcar la alternativa correcta de cada pregunta.
- **El tipo de texto es una conjetura** a partir de la forma del texto (versos cortos →
  poema, nombres de personaje en mayúscula → dramático, «OPINIÓN» → argumentativo).
  Acierta en la mayoría, pero hay que confirmarlo en el editor. El eje de habilidad,
  el OA y el indicador quedan vacíos: esos los define el docente.

---

## Qué trae cargado el sembrado

- **DIA Lectura II medio — Monitoreo Intermedio 2026.** La estructura oficial completa:
  7 textos, 38 preguntas con su OA, tipo de texto, eje, indicador y **la clave oficial**,
  más la pauta de corrección de la pregunta 27 transcrita textualmente. Los enunciados
  y las alternativas quedan vacíos, porque la ficha técnica no los publica: se copian
  del cuadernillo impreso.
- **Prueba de demostración.** Un texto corto con 5 preguntas de alternativas y 1 de
  desarrollo con su pauta, publicada y lista para probar el circuito completo.
- **Tres alumnos de demostración** con sus códigos.

---

## Estructura del proyecto

```
server.js                arranque del servidor local
src/
  app.js                 arma la aplicación Express (reutilizable en Vercel)
  db/
    index.js             capa de datos: elige el motor
    sqlite.js            driver local (node:sqlite)
    schema.sql           esquema de tablas
  lib/
    seguridad.js         hash de contraseñas, sesiones firmadas, códigos de alumno
    sesion.js            middlewares de profesor y alumno
    evaluacion.js        corrección y cálculo de los informes
    xlsx.js              lector de planillas sin dependencias
    docx.js / ensayo.js  importador de ensayos en Word
  routes/
    auth.js  alumno.js  admin.js  informes.js
public/                  interfaz (HTML, CSS y JS sin compilación)
scripts/
  seed.mjs               carga inicial
  datos-dia.mjs          estructura oficial del DIA transcrita
```

---

## Notas de seguridad

- Las contraseñas se guardan con `scrypt` y sal por usuario.
- Las sesiones son cookies firmadas con HMAC-SHA256. **Cambia `SESSION_SECRET`
  en `.env`** por una cadena larga y aleatoria.
- La prueba que recibe el alumno **nunca incluye la clave ni las pautas de
  corrección**: se filtran en el servidor, no en el navegador.
- El servidor local escucha en toda la red (`0.0.0.0`). Es lo que permite que los
  alumnos entren desde sus equipos, pero significa que cualquiera en esa red puede
  llegar al panel docente: la contraseña es lo único que lo protege.

---

## Paso a Vercel (pendiente)

El código ya está preparado, pero **falta un paso** para desplegar: Vercel corre en
funciones sin disco persistente, así que SQLite no sirve allá.

Lo que ya está resuelto:

- `src/app.js` construye la aplicación por separado del arranque, así que se puede
  exportar como handler.
- Toda la capa de datos pasa por `src/db/index.js`, con consultas asíncronas,
  marcadores `?` y SQL portable a propósito.
- Las sesiones no necesitan almacén en servidor.
- La interfaz no tiene paso de compilación.

Lo que falta hacer:

1. Crear `src/db/postgres.js` con el mismo contrato que `sqlite.js`
   (`all` / `get` / `run` / `exec` / `tx`), traduciendo `?` a `$1…$n`.
2. Activarlo en `src/db/index.js`, donde hoy hay un error explícito si existe
   `DATABASE_URL`.
3. Traducir `schema.sql` a Postgres (`SERIAL`/`IDENTITY` en vez de
   `INTEGER PRIMARY KEY AUTOINCREMENT`, `TIMESTAMPTZ` en vez de `datetime('now')`).
4. Agregar `api/index.js` que exporte la app y un `vercel.json` que reescriba
   `/api/*` hacia ella.
5. Definir `SESSION_SECRET` y `DATABASE_URL` como variables de entorno del proyecto.
