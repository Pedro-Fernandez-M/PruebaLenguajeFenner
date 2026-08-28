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

Copia `.env.example` a `.env` para ajustar la configuración; todos los comandos
lo cargan solos si existe.

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

Una **prueba** es una lista de **preguntas de alternativas**, numeradas de corrido.
Cada pregunta declara **una habilidad**, que es lo que agrupa el informe:

```
Preguntas 1, 2, 3…  →  Cada una con su habilidad  →  Informe por habilidad
```

**Los textos no van en la plataforma**: se entregan impresos a los estudiantes, y
en pantalla solo aparecen las preguntas.

Las alternativas van de **A a E**; las que se dejen vacías no se muestran, así que
una prueba de cuatro opciones y otra de cinco conviven sin configurar nada.

Las habilidades son tres y cada pregunta mide **exactamente una**: *Localizar*,
*Interpretar y relacionar* y *Reflexionar*. El N° de OA y el indicador quedan como
datos opcionales.

Cada docente tiene su cuenta y ve **solo sus propias pruebas**: abrir la de una
colega devuelve un error, no la prueba con sus claves. La nómina, en cambio, es
común: cualquier docente puede evaluar a cualquier curso.

Los **niveles de logro** (I, II, III) se calculan sobre el porcentaje de logro de
cada estudiante, con umbrales configurables prueba por prueba (por defecto:
Nivel II desde 40 %, Nivel III desde 70 %).

---

## Flujo de trabajo del docente

1. **Alumnos y códigos.** La nómina ya está cargada, con un código único por
   estudiante tipo `K7M2-4X9P`. Desde ahí se puede regenerar el código de alguien
   o dar de baja a quien se retiró.
2. **Imprimir códigos.** Talones recortables agrupados por curso, uno por
   estudiante. Se puede imprimir un curso o todos; al imprimir todos, cada curso
   empieza en una hoja nueva. Solo salen los estudiantes vigentes.
3. **Crear la prueba.** *Nueva prueba*, y luego cargar los textos y las preguntas
   en el editor. También se puede *Duplicar* una prueba anterior para partir de ella.
4. **Escribir cada pregunta** con sus alternativas, marcar la correcta y elegir el
   criterio que evalúa. El botón *Guardar y agregar otra* encadena la siguiente
   heredando el texto y el criterio de la anterior.
5. **Revisar con *Ver la prueba***, que la muestra tal como la verá el estudiante,
   con la alternativa correcta destacada.
6. **Publicar.** En los ajustes, estado → *publicada*. Marca los cursos que pueden
   rendirla y fija una duración en minutos.
7. **Monitor.** Durante la prueba, ver quién está rindiendo y cuánto lleva respondido.
   Permite reabrir el intento de un alumno al que se le cortó la conexión.
8. **Informe.** Las cinco secciones del informe del DIA, filtrable por curso,
   imprimible y descargable en CSV.

---

## El informe

1. **Resultados según niveles de logro** — distribución de estudiantes en I / II / III.
2. **Resultados por habilidad** — porcentaje promedio de logro en cada una.
3. **Resultados por curso** — cuando la prueba la rinde más de un curso: logro,
   niveles y habilidades de cada uno, lado a lado.
4. **Resultados por pregunta** — el **porcentaje que eligió cada alternativa**,
   incluida la opción *N* (no responde). Un distractor sobre 30 % se marca en rojo.
5. **Resultados por estudiante** — puntaje, porcentaje y nivel.
6. **Lectura preliminar** — habilidad más y menos lograda, preguntas más débiles y
   las preguntas guía para el análisis pedagógico.

Dos botones generan además hojas imprimibles, cada una con salto de página:
**Informes por curso** (un informe completo por curso) e **Informes por alumno**
(una hoja por estudiante con su logro, su nivel y su desempeño por habilidad).

El CSV trae una fila por alumno y una columna por pregunta con la letra marcada,
más la clave y los niveles de logro.

---

## Qué trae cargado el sembrado

- **DIA Lectura II medio — Monitoreo Intermedio 2026.** La estructura oficial completa:
  7 textos, 38 preguntas con su OA, tipo de texto, eje, indicador y **la clave oficial**,
  más la pauta de corrección de la pregunta 27 transcrita textualmente. Los enunciados
  y las alternativas quedan vacíos, porque la ficha técnica no los publica: se copian
  del cuadernillo impreso.
- **Prueba de demostración.** Un texto corto con preguntas de alternativas,
  publicada y lista para probar el circuito completo.
- **Tres alumnos de demostración** con sus códigos.

---

## Estructura del proyecto

```
server.js                arranque del servidor local
src/
  app.js                 arma la aplicación Express (reutilizable en Vercel)
  db/
    index.js             capa de datos: elige el motor segun el entorno
    sqlite.js            driver local (node:sqlite)
    postgres.js          driver para Supabase
    schema.sql           esquema SQLite
    schema.postgres.sql  esquema Postgres
  lib/
    seguridad.js         hash de contraseñas, sesiones firmadas, códigos de alumno
    sesion.js            middlewares de profesor y alumno
    evaluacion.js        corrección y cálculo de los informes
  routes/
    auth.js  alumno.js  admin.js  informes.js
public/                  interfaz (HTML, CSS y JS sin compilación)
api/index.js             punto de entrada para Vercel
vercel.json              configuracion del despliegue
scripts/
  seed.mjs               carga inicial
  datos-dia.mjs          estructura oficial del DIA transcrita
  probar-postgres.mjs    prueba el esquema Postgres contra PGlite
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

## Despliegue en Vercel con Supabase

La plataforma corre con dos motores. En el liceo usa **SQLite** sobre un archivo
local; si existe la variable `DATABASE_URL` cambia sola a **Postgres**. El código
de las rutas es el mismo en ambos casos.

### 1. Crear la base en Supabase

En tu proyecto de Supabase: **Project Settings → Database → Connection string**,
y copia la del **Transaction pooler** (puerto `6543`). Esa es la que corresponde
para funciones serverless; la conexión directa del puerto `5432` abre demasiadas
conexiones y Supabase termina rechazándolas.

Queda con esta forma:

```
postgresql://postgres.abcdefgh:TU-CLAVE@aws-0-us-east-1.pooler.supabase.com:6543/postgres
```

### 2. Cargar el esquema y los datos iniciales

Descomenta la línea `DATABASE_URL` en tu `.env` y pega ahí la cadena del pooler.
Después, desde tu equipo:

```bash
npm run seed
```

Crea las tablas, la cuenta docente y la plantilla del DIA. Para volver a empezar
de cero en la base remota hace falta pedirlo explícitamente, porque es
irreversible:

```bash
npm run reset -- --forzar
```

### 3. Variables de entorno en Vercel

En **Settings → Environment Variables**:

| Variable | Valor |
|---|---|
| `DATABASE_URL` | la cadena del pooler de Supabase |
| `SESSION_SECRET` | una cadena larga y aleatoria |
| `ADMIN_EMAIL` | tu correo docente |
| `ADMIN_PASSWORD` | una contraseña propia |

`SESSION_SECRET` firma las cookies de sesión: si cambia, todos los usuarios
quedan desconectados, así que conviene fijarla una vez y no tocarla.

### 4. Desplegar

Importas el repositorio en Vercel. No hay paso de compilación: `api/index.js`
atiende la API y `public/` se sirve como archivos estáticos, según lo que declara
`vercel.json`.

### Comprobar la parte de Postgres sin desplegar

```bash
npm run probar-postgres
```

Aplica `schema.postgres.sql` y corre las consultas de la aplicación contra un
Postgres real (PGlite, el mismo motor compilado a WebAssembly), sin necesidad de
conectarse a Supabase.

### Diferencias que resuelve el driver de Postgres

- Las consultas se escriben con `?` y se traducen a `$1…$n`.
- SQLite devuelve `lastInsertRowid`; en Postgres se agrega `RETURNING id`.
- Las transacciones necesitan que `BEGIN` y `COMMIT` viajen por la misma conexión
  del pool: se resuelve con `AsyncLocalStorage`.
- Las marcas de tiempo se guardan como texto `'YYYY-MM-DD HH:MM:SS'` en UTC en
  ambos motores, para que el navegador las interprete igual.

### Un límite a tener presente

Vercel corta las peticiones sobre **4,5 MB**. Los importadores mandan el archivo
en base64, lo que agrega alrededor de un tercio: un `.docx` o `.xlsx` de hasta
unos 3 MB entra sin problema (el ensayo de ejemplo pesa 0,5 MB y la nómina
completa 0,08 MB), pero un documento con muchas imágenes incrustadas podría no
pasar. En el servidor local no existe ese límite.
