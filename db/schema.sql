-- ============================================================================
-- There and Back Again — Portfolio Database Schema (SQLite / Turso-libSQL)
-- Canonical career data + LOTR game presentation layer
-- Conventions: ISO-8601 TEXT dates ('YYYY-MM'), NULL end_date = "Present",
--              sort_order for display ordering, map_u/map_v = map fractions 0..1
-- ============================================================================
PRAGMA foreign_keys = ON;

-- ────────────────────────── CANONICAL CAREER DATA ───────────────────────────

CREATE TABLE profiles (
  id            INTEGER PRIMARY KEY,
  full_name     TEXT NOT NULL,
  headline      TEXT NOT NULL,                -- e.g. 'Full-Stack Software Engineer'
  location      TEXT,
  phone         TEXT,
  email         TEXT,
  summary       TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE profile_links (
  id            INTEGER PRIMARY KEY,
  profile_id    INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  label         TEXT NOT NULL,                -- 'GitHub', 'LinkedIn', 'Website'
  url           TEXT NOT NULL,
  sort_order    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE profile_languages (
  id            INTEGER PRIMARY KEY,
  profile_id    INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,                -- 'Russian'
  proficiency   TEXT                          -- 'native/bilingual'
);

CREATE TABLE skill_categories (
  id            INTEGER PRIMARY KEY,
  name          TEXT NOT NULL UNIQUE,         -- 'Languages', 'Frameworks & UI', ...
  sort_order    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE skills (
  id            INTEGER PRIMARY KEY,
  category_id   INTEGER NOT NULL REFERENCES skill_categories(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  level         TEXT CHECK (level IN ('core','working','familiar') OR level IS NULL),
  sort_order    INTEGER NOT NULL DEFAULT 0,
  UNIQUE (category_id, name)
);

CREATE TABLE experiences (
  id              INTEGER PRIMARY KEY,
  company         TEXT NOT NULL,
  title           TEXT NOT NULL,
  location        TEXT,
  employment_type TEXT,                       -- 'full-time' | 'apprenticeship' | 'project-based'
  start_date      TEXT NOT NULL,              -- 'YYYY-MM'
  end_date        TEXT,                       -- NULL = Present
  summary         TEXT,
  tech_stack      TEXT,                       -- optional display string ('TypeScript · Next.js · ...')
  sort_order      INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE experience_highlights (
  id            INTEGER PRIMARY KEY,
  experience_id INTEGER NOT NULL REFERENCES experiences(id) ON DELETE CASCADE,
  body          TEXT NOT NULL,
  sort_order    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE experience_skills (
  experience_id INTEGER NOT NULL REFERENCES experiences(id) ON DELETE CASCADE,
  skill_id      INTEGER NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  PRIMARY KEY (experience_id, skill_id)
);

CREATE TABLE educations (
  id            INTEGER PRIMARY KEY,
  institution   TEXT NOT NULL,
  location      TEXT,
  start_year    INTEGER,
  end_year      INTEGER,
  gpa           TEXT,
  notes         TEXT                          -- 'Dean''s List honoree (multiple semesters)…'
);

CREATE TABLE education_degrees (
  id            INTEGER PRIMARY KEY,
  education_id  INTEGER NOT NULL REFERENCES educations(id) ON DELETE CASCADE,
  degree        TEXT NOT NULL,                -- 'B.A.'
  field         TEXT NOT NULL,                -- 'Economics'
  honors        TEXT,                         -- 'Cum Laude'
  sort_order    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE education_courses (
  id            INTEGER PRIMARY KEY,
  education_id  INTEGER NOT NULL REFERENCES educations(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  sort_order    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE projects (
  id            INTEGER PRIMARY KEY,
  slug          TEXT NOT NULL UNIQUE,         -- 'lotr-portfolio'
  name          TEXT NOT NULL,
  kind          TEXT CHECK (kind IN ('professional','personal')),
  description   TEXT,
  repo_url      TEXT,
  live_url      TEXT,
  year_start    INTEGER,
  year_end      INTEGER,                      -- NULL = ongoing
  sort_order    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE project_highlights (
  id            INTEGER PRIMARY KEY,
  project_id    INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  body          TEXT NOT NULL,
  sort_order    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE project_skills (
  project_id    INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  skill_id      INTEGER NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  PRIMARY KEY (project_id, skill_id)
);

-- Downloadable résumé variants (the contact scroll's "download résumé" button)
CREATE TABLE resume_variants (
  id            INTEGER PRIMARY KEY,
  label         TEXT NOT NULL UNIQUE,         -- 'Software Engineer', 'Business & Data Analyst'
  file_path     TEXT NOT NULL,                -- '/resume/Konstantin_Nikolaev_Software_Engineer.pdf'
  is_default    INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0,1)),
  sort_order    INTEGER NOT NULL DEFAULT 0
);

-- ──────────────────────── GAME PRESENTATION LAYER ───────────────────────────

CREATE TABLE regions (
  id              INTEGER PRIMARY KEY,
  slug            TEXT NOT NULL UNIQUE,       -- 'shire' | 'dwarf' | 'elf' | 'gondor' | 'mordor'
  place           TEXT NOT NULL,              -- 'The Shire'
  glyph           TEXT NOT NULL,              -- 'S'
  ring_color      TEXT NOT NULL,              -- '#5c8a3c'
  map_u           REAL NOT NULL CHECK (map_u BETWEEN 0 AND 1),
  map_v           REAL NOT NULL CHECK (map_v BETWEEN 0 AND 1),
  quote           TEXT,
  weather_caption TEXT,                       -- HUD caption when flying through
  sort_order      INTEGER NOT NULL DEFAULT 0
);

-- Common Tongue ↔ Elvish copy for each region scroll
CREATE TABLE region_tones (
  id            INTEGER PRIMARY KEY,
  region_id     INTEGER NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
  tone          TEXT NOT NULL CHECK (tone IN ('common','elvish')),
  label         TEXT NOT NULL,
  title         TEXT NOT NULL,
  subtitle      TEXT NOT NULL,
  UNIQUE (region_id, tone)
);

CREATE TABLE region_deeds (
  id            INTEGER PRIMARY KEY,
  region_id     INTEGER NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
  body          TEXT NOT NULL,
  sort_order    INTEGER NOT NULL DEFAULT 0
);

-- One artifact per region, claimed on first visit
CREATE TABLE artifacts (
  id            INTEGER PRIMARY KEY,
  region_id     INTEGER NOT NULL UNIQUE REFERENCES regions(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT NOT NULL
);

-- Bridge: which canonical career entities a region dramatizes.
-- Exactly one target per row; a region may have several rows.
CREATE TABLE region_links (
  id            INTEGER PRIMARY KEY,
  region_id     INTEGER NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
  experience_id INTEGER REFERENCES experiences(id) ON DELETE CASCADE,
  education_id  INTEGER REFERENCES educations(id)  ON DELETE CASCADE,
  project_id    INTEGER REFERENCES projects(id)    ON DELETE CASCADE,
  CHECK (
    (experience_id IS NOT NULL) + (education_id IS NOT NULL) + (project_id IS NOT NULL) = 1
  )
);

-- Earned titles (the six ranks in the quest log)
CREATE TABLE titles (
  id            INTEGER PRIMARY KEY,
  name          TEXT NOT NULL UNIQUE,
  unlock_rule   TEXT,                         -- human-readable unlock description
  sort_order    INTEGER NOT NULL DEFAULT 0
);

-- Collectible lost pages of the Red Book
CREATE TABLE lost_pages (
  id            INTEGER PRIMARY KEY,          -- keep the game's 0-based ids
  map_u         REAL NOT NULL CHECK (map_u BETWEEN 0 AND 1),
  map_v         REAL NOT NULL CHECK (map_v BETWEEN 0 AND 1),
  hint          TEXT NOT NULL                 -- 'on the winds over Weathertop'
);

-- The Beacons of Gondor minigame
CREATE TABLE beacons (
  id            INTEGER PRIMARY KEY,          -- keep the game's 0-based ids
  map_u         REAL NOT NULL CHECK (map_u BETWEEN 0 AND 1),
  map_v         REAL NOT NULL CHECK (map_v BETWEEN 0 AND 1),
  name          TEXT NOT NULL                 -- 'Amon Dîn'
);

-- Selectable LOTR cursors (SVG stored inline as data-URI or raw SVG)
CREATE TABLE cursors (
  id            INTEGER PRIMARY KEY,
  slug          TEXT NOT NULL UNIQUE,         -- 'staff', 'blade', 'ring', 'axe', 'bow'
  name          TEXT NOT NULL,                -- "Gandalf's staff"
  svg           TEXT NOT NULL,
  sort_order    INTEGER NOT NULL DEFAULT 0
);

-- Movie-moment voice lines: region fly-over triggers + journey events
CREATE TABLE voice_lines (
  id            INTEGER PRIMARY KEY,
  trigger_key   TEXT NOT NULL UNIQUE,         -- 'mordor', 'moria', 'intro', 'beacons', 'complete'
  kind          TEXT NOT NULL CHECK (kind IN ('region','event')),
  region_id     INTEGER REFERENCES regions(id) ON DELETE SET NULL,
  file_name     TEXT NOT NULL,                -- 'mordor.mp3' under public/audio/
  subtitle      TEXT,                         -- movie-style caption shown while playing
  credit        TEXT                          -- freesound.org attribution
);

-- XP economy (region / page / beacon / all_pages_bonus / all_beacons_bonus)
CREATE TABLE xp_rules (
  rule_key      TEXT PRIMARY KEY,
  points        INTEGER NOT NULL
);

-- Misc world constants (MAP_W, MAP_H, SEA_LEVEL, save key, …)
CREATE TABLE game_settings (
  key           TEXT PRIMARY KEY,
  value         TEXT NOT NULL
);

-- ────────────────────────────── INDEXES ─────────────────────────────────────

CREATE INDEX idx_profile_links_profile   ON profile_links(profile_id);
CREATE INDEX idx_profile_langs_profile   ON profile_languages(profile_id);
CREATE INDEX idx_skills_category         ON skills(category_id);
CREATE INDEX idx_exp_highlights_exp      ON experience_highlights(experience_id);
CREATE INDEX idx_exp_skills_skill        ON experience_skills(skill_id);
CREATE INDEX idx_edu_degrees_edu         ON education_degrees(education_id);
CREATE INDEX idx_edu_courses_edu         ON education_courses(education_id);
CREATE INDEX idx_proj_highlights_proj    ON project_highlights(project_id);
CREATE INDEX idx_proj_skills_skill       ON project_skills(skill_id);
CREATE INDEX idx_region_tones_region     ON region_tones(region_id);
CREATE INDEX idx_region_deeds_region     ON region_deeds(region_id);
CREATE INDEX idx_region_links_region     ON region_links(region_id);
CREATE INDEX idx_voice_lines_region      ON voice_lines(region_id);

-- ────────────────────────────── VIEWS ───────────────────────────────────────

-- Everything the ScrollPanel needs for one region, one tone, in one query
CREATE VIEW v_region_scroll AS
SELECT
  r.id            AS region_id,
  r.slug,
  r.place,
  r.glyph,
  r.ring_color,
  r.map_u,
  r.map_v,
  r.quote,
  rt.tone,
  rt.label,
  rt.title,
  rt.subtitle,
  a.name          AS artifact_name,
  a.description   AS artifact_desc
FROM regions r
JOIN region_tones rt ON rt.region_id = r.id
LEFT JOIN artifacts a ON a.region_id = r.id;

-- Career timeline: experiences and education merged, newest first
CREATE VIEW v_timeline AS
SELECT 'experience' AS entry_type, id, company AS org, title AS heading,
       start_date, end_date
FROM experiences
UNION ALL
SELECT 'education', id, institution, 'Student',
       CAST(start_year AS TEXT), CAST(end_year AS TEXT)
FROM educations
ORDER BY start_date DESC;
