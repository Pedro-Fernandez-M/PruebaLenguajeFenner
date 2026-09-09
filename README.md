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

Una **prueba** es una lista de preguntas numeradas de corrido. Cada pregunta
declara **un criterio**, que es lo que agrupa el informe:

```
Preguntas 1, 2, 3…  →  Cada una con su criterio  →  Informe por criterio
```

**Los textos no van en la plataforma**: se entregan impresos a los estudiantes, y
en pantalla solo aparecen las preguntas.

Las alternativas van de **A a E**; las que se dejen vacías no se muestran, así que
una prueba de cuatro opciones y otra de cinco conviven sin configurar nada.

### Los criterios

Cada pregunta declara **un criterio**, y la lista la arma cada docente: se
escriben, se renombran con el ✎, se quitan con la ×, y se asignan con un clic.
Una base nueva parte con los tres ejes del DIA de Lectura (*Localizar*,
*Interpretar y relacionar* y *Reflexionar*), pero son un punto de partida, no una
lista cerrada.

Se eligen de una lista en vez de escribirse en cada pregunta porque una tilde
distinta crearía un criterio gemelo y el informe repartiría las preguntas entre
los dos sin avisar. Por lo mismo, al crear uno la comparación ignora mayúsculas
**y tildes**: «Extracción de información» y «extraccion de informacion» chocan.

Las preguntas guardan el **nombre** del criterio, no una referencia. Eso tiene
dos consecuencias:

- **Renombrar** un criterio arrastra el cambio a las preguntas que lo usan, en la
  misma transacción. Si solo cambiara la lista, el informe mostraría dos: el
  nuevo vacío y el viejo con todo.
- **Quitarlo** de la lista no borra la clasificación: las preguntas que ya lo
  tenían lo conservan, siguen apareciendo en el informe y el editor las muestra
  en gris como «fuera de la lista», para que guardarlas no lo pierda en silencio.

Un criterio solo alcanza a las pruebas de su docente: si dos tienen uno que se
llama igual, no es el mismo criterio y renombrar el de una no toca el de la otra.

### Dos formas de responder

Cada pregunta se responde **en pantalla** o **en papel**:

| | En pantalla | En papel |
|---|---|---|
| El estudiante | marca una alternativa | la escribe en la hoja impresa |
| Aparece en el navegador | sí | **no** |
| Se corrige | sola, contra la clave | la docente anota el puntaje |

Las preguntas en papel conservan su número, así que en pantalla puede verse
1, 2, 4, 5… y eso es correcto: los números tienen que calzar con el cuadernillo
que el estudiante tiene en la mesa.

Se corrigen en la pestaña **Corregir**, una grilla con una fila por estudiante y
una columna por pregunta: **✓** pone el puntaje completo, **✗** pone cero, y para
una respuesta a medias se escribe el puntaje. Cada casilla se guarda sola y la
nota se recalcula al momento.

Mientras queden preguntas en papel sin corregir, esos puntos no suman, y el
informe lo avisa arriba y en rojo.

El N° de OA y el indicador quedan como datos opcionales.

Cada docente tiene su cuenta y ve **solo sus propias pruebas**: abrir la de una
colega devuelve un error, no la prueba con sus claves. La nómina, en cambio, es
común: cualquier docente puede evaluar a cualquier curso.

Los **niveles de logro** (I, II, III) se calculan sobre el porcentaje de logro de
cada estudiante, con umbrales configurables prueba por prueba (por defecto:
Nivel II desde 40 %, Nivel III desde 70 %).

### La nota

Cada prueba lleva además una **calificación de 1,0 a 7,0**, definida con tres
anclajes de puntaje: cuántos puntos valen un **7,0**, cuántos un **4,0** y
cuántos un **1,0**. Entre ellos la nota se interpola en línea recta, con un
quiebre en el 4,0; ese quiebre es lo que permite que el 4,0 esté al 60 % de
exigencia sin que el 7,0 deje de ser el puntaje total.

Los tres campos admiten quedarse **vacíos**, que no es lo mismo que cero:
significa *calcúlalo tú*. Por defecto el 7,0 es el puntaje total de la prueba, el
4,0 el 60 % de ese puntaje y el 1,0 son cero puntos. Conviene dejar el 7,0 en
automático mientras la prueba se escribe, porque cada pregunta nueva cambia el
total y un número fijo puesto al principio quedaría desfasado sin avisar.

El editor muestra en vivo la **tabla completa de puntaje a nota** mientras se
escribe la escala, para que no haya que descubrir el día de la evaluación que el
4,0 quedó en un puntaje que nadie alcanza. Si la escala queda mal ordenada, la
prueba simplemente no se califica y el editor lo dice: mejor sin nota que con una
inventada.

La nota **no se guarda**: se calcula desde el puntaje cada vez que se pide. Así,
corregir una clave mal cargada o mover el puntaje del 4,0 actualiza todas las
notas de una vez, sin recorrer los intentos. La fórmula vive en
`public/js/notas.js` y la usan **el servidor y el navegador**, para que la vista
previa del editor y la nota del informe no puedan discrepar.

### La nota es del docente

El estudiante **nunca** ve su nota, ni su puntaje, ni su porcentaje, ni su nivel
de logro. Al enviar solo se le confirma que sus respuestas quedaron registradas.

No es una opción desactivada por defecto: no existe la ruta que se lo entregaría,
de modo que tampoco hay nada que pedir a mano desde el navegador. Antes había una
casilla para permitirlo, y se quitó junto con su columna en la base — dejarla
dormida sería una trampa, porque bastaría ponerla en 1 para resucitar una
pantalla que ya no existe.

---

## Flujo de trabajo del docente

1. **Alumnos y códigos.** La nómina ya está cargada, con un código único por
   estudiante tipo `K7M2-4X9P`. Desde ahí se puede regenerar el código de alguien
   o dar de baja a quien se retiró.
2. **Imprimir códigos.** Talones recortables agrupados por curso, uno por
   estudiante. Se puede imprimir un curso o todos; al imprimir todos, cada curso
   empieza en una hoja nueva. Solo salen los estudiantes vigentes.
3. **Crear la prueba.** *Nueva prueba*, y luego escribir las preguntas en el
   editor. También se puede *Duplicar* una prueba anterior para partir de ella.
4. **Armar los criterios**, en el panel del editor: se escriben, se asignan con un
   clic y se quitan con una ×.
5. **Escribir cada pregunta**: elegir si se responde en pantalla o en papel, poner
   su puntaje, sus alternativas y la correcta, y marcar el criterio que evalúa. El
   botón *Guardar y agregar otra* encadena la siguiente heredando criterio, tipo y
   puntaje de la anterior.
6. **Revisar con *Ver la prueba***, que la muestra tal como la verá el estudiante,
   con la alternativa correcta destacada.
7. **Publicar.** En los ajustes, estado → *publicada*. Marca los cursos que pueden
   rendirla y fija una duración en minutos.
8. **Monitor.** Durante la prueba, ver quién está rindiendo y cuánto lleva respondido.
   Permite reabrir el intento de un alumno al que se le cortó la conexión.
9. **Corregir.** Si la prueba tiene preguntas en papel, anotar el puntaje de cada
   estudiante en la grilla. Solo aparece lo que falta por revisar.
10. **Informe.** Las secciones del informe del DIA más la de calificación,
    filtrable por curso, imprimible y descargable en CSV.

---

## El informe

1. **Resultados según niveles de logro** — distribución de estudiantes en I / II / III,
   con gráfico de torta.
2. **Resultados según eje de habilidad** — porcentaje promedio de respuestas correctas
   en cada criterio, con gráfico de barras.
3. **Resultados por curso** — cuando la prueba la rinde más de un curso: logro,
   niveles y habilidades de cada uno, lado a lado.
4. **Resultados por pregunta** — el **porcentaje que eligió cada alternativa**,
   incluida la opción *N* (no responde). Un distractor sobre 30 % se marca en rojo.
   En las preguntas en papel no hay alternativas: se muestra cuántas quedaron
   correctas, con puntaje parcial, incorrectas y **sin corregir**.
5. **Resultados por estudiante** — puntaje, porcentaje, **nota** y nivel.
6. **Resultados según calificación** — promedio del curso, cuántos aprueban y la
   distribución de notas por tramo, con gráfico de barras y de torta.
7. **Lectura preliminar** — habilidad más y menos lograda, preguntas más débiles y
   las preguntas guía para el análisis pedagógico.

Dos botones generan además hojas imprimibles, cada una con salto de página:
**Informes por curso** (un informe completo por curso, con sus dos gráficos) e **Informes por alumno**
(una hoja por estudiante con su logro, su nivel y su desempeño por habilidad).

El CSV trae una fila por alumno y una columna por pregunta con la letra marcada,
más la **nota**, la clave y los niveles de logro. La nota va con coma decimal y
sin comillas, para que Excel la tome como número y no como texto.

---

## Qué trae cargado el sembrado

- **La cuenta docente** y sus tres criterios iniciales.
- **Prueba de demostración**, publicada y lista para recorrer el circuito completo:
  cinco preguntas de alternativas en pantalla y una en papel de 4 puntos, que
  permite probar la corrección a mano y ver cómo cambia la nota.
- **Tres alumnos de demostración** con sus códigos.

La nómina real se carga aparte; el sembrado no la toca.

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
    esquemas.js          los dos .sql inlineados (generado, no editar a mano)
    migraciones.js       los ALTER TABLE para bases que ya existen
  lib/
    seguridad.js         hash de contraseñas, sesiones firmadas, códigos de alumno
    sesion.js            middlewares de profesor y alumno
    evaluacion.js        corrección y cálculo de los informes
  routes/
    auth.js  alumno.js  admin.js  informes.js
public/                  interfaz (HTML, CSS y JS sin compilación)
  js/notas.js            escala de notas: la usan el navegador Y el servidor
api/index.js             punto de entrada para Vercel
vercel.json              configuracion del despliegue
scripts/
  seed.mjs               carga inicial
  datos-dia.mjs          estructura oficial del DIA transcrita (referencia,
                         ya no se carga: dependia de la tabla de textos)
  estado.mjs             qué hay cargado en la base, sin tocarla
  generar-esquemas.mjs   regenera esquemas.js desde los .sql
  probar-notas.mjs       comprueba el cálculo de la nota
  probar-postgres.mjs    prueba el esquema y la migración contra PGlite
  replicar-prueba.mjs    copia una prueba a las demás docentes
```

---

## Notas de seguridad

- Las contraseñas se guardan con `scrypt` y sal por usuario.
- Las sesiones son cookies firmadas con HMAC-SHA256. **Cambia `SESSION_SECRET`
  en `.env`** por una cadena larga y aleatoria.
- La prueba que recibe el alumno **nunca incluye la clave ni las pautas de
  corrección**: se filtran en el servidor, no en el navegador. Las preguntas en
  papel no le llegan siquiera.
- El alumno **no tiene manera de conocer su nota**: no existe una ruta que se la
  entregue. La calificación solo se ve desde el panel docente.
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

Además reconstruye una base **anterior**, le carga una prueba con sus preguntas y
le aplica encima las migraciones de verdad, para comprobar que un `ALTER TABLE`
sobre una base con datos no se lleva nada por delante. La base de Supabase nunca
recibe el esquema nuevo —ya tiene las tablas—, así que ese es el único camino que
recorre en la práctica.

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
