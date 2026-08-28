-- Esquema para Postgres (Supabase). Equivalente a schema.sql.
--
-- Dos decisiones deliberadas para que el resto del código no tenga que
-- distinguir el motor:
--   * Las marcas de tiempo se guardan como TEXT en formato 'YYYY-MM-DD HH:MM:SS'
--     UTC, igual que datetime('now') en SQLite. Así el parseo del navegador y de
--     src/routes/alumno.js sirve sin cambios.
--   * Los booleanos se guardan como INTEGER 0/1, igual que en SQLite.

CREATE OR REPLACE FUNCTION ahora_utc() RETURNS TEXT AS $$
  SELECT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS');
$$ LANGUAGE SQL STABLE;

CREATE TABLE IF NOT EXISTS profesores (
  id            INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre        TEXT    NOT NULL,
  email         TEXT    NOT NULL UNIQUE,
  password_hash TEXT    NOT NULL,
  rol           TEXT    NOT NULL DEFAULT 'profesor',
  cursos        TEXT    NOT NULL DEFAULT '',
  activo        INTEGER NOT NULL DEFAULT 1,
  creado_en     TEXT    NOT NULL DEFAULT ahora_utc()
);

CREATE TABLE IF NOT EXISTS alumnos (
  id        INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  matricula TEXT,
  rut       TEXT,
  dv        TEXT,
  nombre    TEXT    NOT NULL,
  curso     TEXT    NOT NULL DEFAULT '',
  regimen   TEXT    NOT NULL DEFAULT '',
  codigo    TEXT    NOT NULL UNIQUE,
  activo    INTEGER NOT NULL DEFAULT 1,
  creado_en TEXT    NOT NULL DEFAULT ahora_utc()
);
CREATE INDEX IF NOT EXISTS ix_alumnos_curso ON alumnos(curso);

CREATE TABLE IF NOT EXISTS pruebas (
  id                       INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  titulo                   TEXT    NOT NULL,
  asignatura               TEXT    NOT NULL DEFAULT 'Lectura',
  nivel                    TEXT    NOT NULL DEFAULT 'II medio',
  descripcion              TEXT    NOT NULL DEFAULT '',
  instrucciones            TEXT    NOT NULL DEFAULT '',
  duracion_min             INTEGER,
  estado                   TEXT    NOT NULL DEFAULT 'borrador',
  cursos                   TEXT    NOT NULL DEFAULT '',
  mostrar_resultado_alumno INTEGER NOT NULL DEFAULT 0,
  nivel2_min               REAL    NOT NULL DEFAULT 40,
  nivel3_min               REAL    NOT NULL DEFAULT 70,
  profesor_id              INTEGER REFERENCES profesores(id) ON DELETE SET NULL,
  creado_en                TEXT    NOT NULL DEFAULT ahora_utc()
);

CREATE TABLE IF NOT EXISTS preguntas (
  id         INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  prueba_id  INTEGER NOT NULL REFERENCES pruebas(id) ON DELETE CASCADE,
  numero     INTEGER NOT NULL,
  tipo       TEXT    NOT NULL DEFAULT 'alternativas',
  enunciado  TEXT    NOT NULL DEFAULT '',
  cita       TEXT    NOT NULL DEFAULT '',
  oa         TEXT    NOT NULL DEFAULT '',
  eje        TEXT    NOT NULL DEFAULT '',
  indicador  TEXT    NOT NULL DEFAULT '',
  clave      TEXT,
  puntaje    INTEGER NOT NULL DEFAULT 1,
  UNIQUE(prueba_id, numero)
);
CREATE INDEX IF NOT EXISTS ix_preguntas_prueba ON preguntas(prueba_id);

CREATE TABLE IF NOT EXISTS opciones (
  id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pregunta_id INTEGER NOT NULL REFERENCES preguntas(id) ON DELETE CASCADE,
  letra       TEXT    NOT NULL,
  contenido   TEXT    NOT NULL DEFAULT '',
  UNIQUE(pregunta_id, letra)
);

CREATE TABLE IF NOT EXISTS intentos (
  id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  prueba_id   INTEGER NOT NULL REFERENCES pruebas(id) ON DELETE CASCADE,
  alumno_id   INTEGER NOT NULL REFERENCES alumnos(id) ON DELETE CASCADE,
  estado      TEXT    NOT NULL DEFAULT 'en_curso',
  iniciado_en TEXT    NOT NULL DEFAULT ahora_utc(),
  enviado_en  TEXT,
  puntaje     REAL,
  puntaje_max REAL,
  porcentaje  REAL,
  nivel_logro INTEGER,
  UNIQUE(prueba_id, alumno_id)
);

CREATE TABLE IF NOT EXISTS respuestas (
  id              INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  intento_id      INTEGER NOT NULL REFERENCES intentos(id) ON DELETE CASCADE,
  pregunta_id     INTEGER NOT NULL REFERENCES preguntas(id) ON DELETE CASCADE,
  alternativa     TEXT,
  respuesta_texto TEXT    NOT NULL DEFAULT '',
  codigo_rubrica  INTEGER,
  puntaje         REAL,
  corregida       INTEGER NOT NULL DEFAULT 0,
  actualizado_en  TEXT    NOT NULL DEFAULT ahora_utc(),
  UNIQUE(intento_id, pregunta_id)
);
CREATE INDEX IF NOT EXISTS ix_respuestas_intento ON respuestas(intento_id);
