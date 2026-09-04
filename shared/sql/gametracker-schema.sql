-- ============================================================================
-- GameTracker — canonical sports event engine
-- Project: Venuewise Platform (urwnbskrtoplgnkkxuvl)
--
-- WHAT THIS IS
--   The single canonical record for a sporting event. Schedule sources write
--   into it (Section VI, Monsignor Martin, Arbiter, manual admin, ...), score
--   sources update the SAME record (ScoreBird, ScoreStream, manual, ...), and
--   every consumer -- 5StarSportsMedia.com, the GameTracker mobile app,
--   HuddleSphere, team/league sites, notifications -- reads it back through the
--   public API functions at the bottom of this file.
--
--   Sources -> gametracker.events -> public.gametracker_* -> consumers
--
-- WHAT THIS IS NOT
--   Not football-specific. Not two-team-specific. Sport-specific live state
--   (down/distance, inning half, set scores, power play) lives in
--   result_data jsonb -- never as new columns on the canonical record.
--
-- SAFETY
--   Additive only. Creates a NEW schema. Touches no existing table, view,
--   function, policy or grant. public.events (HomeHuddle calendar sync) and
--   public.game_scores (5-Star editorial recaps) are untouched and unrenamed.
--   Idempotent: safe to re-run.
--
-- ACCESS MODEL
--   gametracker.* is locked (RLS on, no policies, no anon/authenticated grants).
--   The ONLY way in is the SECURITY DEFINER functions in `public` at the bottom.
--   That mirrors the pattern already used by public_games_board /
--   public_athlete_directory / is_admin on this project.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS gametracker;

-- Nobody talks to the tables directly. Consumers use the public API functions.
REVOKE ALL ON SCHEMA gametracker FROM PUBLIC;
REVOKE ALL ON SCHEMA gametracker FROM anon, authenticated;


-- ══════════════════════════════════════════════════════════════════════════
-- 1. NORMALIZATION HELPERS
-- ══════════════════════════════════════════════════════════════════════════

-- Lowercase, strip punctuation, collapse whitespace. The basis of every match.
CREATE OR REPLACE FUNCTION gametracker.norm_text(p_text text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT nullif(
    trim(regexp_replace(
      regexp_replace(lower(coalesce(p_text, '')), '[^a-z0-9]+', ' ', 'g'),
      '\s+', ' ', 'g')),
    '');
$$;

-- School-name normalization. "Orchard Park High School", "Orchard Park HS" and
-- "orchard park" all collapse to 'orchard park'. Deliberately conservative:
-- it strips institution suffixes only, never distinguishing words. "Nichols
-- Academy" keeps "academy"; "Canisius" keeps "canisius".
CREATE OR REPLACE FUNCTION gametracker.norm_school(p_name text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT gametracker.norm_text(
    regexp_replace(
      coalesce(p_name, ''),
      '(\m)(senior high school|junior senior high school|jr sr high school|high school|highschool|central school district|central school|senior high|sr high|jr/sr high|h\.s\.|hs|csd)(\M)',
      ' ', 'gi'));
$$;

CREATE OR REPLACE FUNCTION gametracker.slugify(p_text text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT replace(coalesce(gametracker.norm_text(p_text), ''), ' ', '-');
$$;

-- Real schedule files write start times a dozen ways: '18:00', '6:00 PM',
-- '630pm', '6.30 p.m.', '1800'. Anything unrecognized returns NULL rather than
-- a guess -- a silently wrong start time is worse than a missing one.
CREATE OR REPLACE FUNCTION gametracker.parse_time(p_raw text)
RETURNS time LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v    text := lower(trim(coalesce(p_raw, '')));
  v_pm boolean := NULL;
  v_h  integer;
  v_m  integer := 0;
BEGIN
  IF v = '' OR v IN ('tbd', 'tba', 'n/a', 'na', 'none', '-') THEN RETURN NULL; END IF;

  -- meridiem, however it is punctuated: 'pm', 'p.m.', 'P M'
  IF v ~ '[ap]\.?\s?m\.?$' THEN
    v_pm := (regexp_replace(v, '^.*([ap])\.?\s?m\.?$', '\1') = 'p');
    v := trim(regexp_replace(v, '[ap]\.?\s?m\.?$', ''));
  END IF;

  v := regexp_replace(v, '[\s.]', '', 'g');   -- '6.30' / '6 30' -> '630'

  IF    v ~ '^[0-9]{1,2}$'            THEN v_h := v::integer;
  ELSIF v ~ '^[0-9]{1,2}:[0-9]{2}$'   THEN v_h := split_part(v, ':', 1)::integer;
                                           v_m := split_part(v, ':', 2)::integer;
  ELSIF v ~ '^[0-9]{3}$'              THEN v_h := left(v, 1)::integer;
                                           v_m := right(v, 2)::integer;
  ELSIF v ~ '^[0-9]{4}$'              THEN v_h := left(v, 2)::integer;
                                           v_m := right(v, 2)::integer;
  ELSIF v ~ '^[0-9]{1,2}:[0-9]{2}:[0-9]{2}$' THEN
                                           v_h := split_part(v, ':', 1)::integer;
                                           v_m := split_part(v, ':', 2)::integer;
  ELSE  RETURN NULL;                        -- unrecognized: say nothing, never guess
  END IF;

  IF v_pm IS TRUE  AND v_h < 12 THEN v_h := v_h + 12; END IF;
  IF v_pm IS FALSE AND v_h = 12 THEN v_h := 0;        END IF;

  IF v_h > 23 OR v_m > 59 THEN RETURN NULL; END IF;
  RETURN make_time(v_h, v_m, 0);
END;
$$;

-- Maps whatever a source calls a status onto the five canonical states.
CREATE OR REPLACE FUNCTION gametracker.norm_status(p_raw text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE gametracker.norm_text(p_raw)
    WHEN 'upcoming'    THEN 'upcoming'
    WHEN 'scheduled'   THEN 'upcoming'
    WHEN 'pre'         THEN 'upcoming'
    WHEN 'pregame'     THEN 'upcoming'
    WHEN 'live'        THEN 'live'
    WHEN 'in progress' THEN 'live'
    WHEN 'inprogress'  THEN 'live'
    WHEN 'active'      THEN 'live'
    WHEN 'halftime'    THEN 'live'
    WHEN 'final'       THEN 'final'
    WHEN 'complete'    THEN 'final'
    WHEN 'completed'   THEN 'final'
    WHEN 'finished'    THEN 'final'
    WHEN 'postponed'   THEN 'postponed'
    WHEN 'ppd'         THEN 'postponed'
    WHEN 'delayed'     THEN 'postponed'
    WHEN 'cancelled'   THEN 'cancelled'
    WHEN 'canceled'    THEN 'cancelled'
    WHEN 'suspended'   THEN 'suspended'
    ELSE NULL
  END;
$$;


-- ══════════════════════════════════════════════════════════════════════════
-- 2. REFERENCE DATA
-- ══════════════════════════════════════════════════════════════════════════

-- Every sport GameTracker can carry. scoring_model is what stops this from
-- becoming a football app: a cross country meet is not home-vs-away and the
-- UI reads this column to know that.
CREATE TABLE IF NOT EXISTS gametracker.sports (
  key                text PRIMARY KEY,           -- 'football', 'girls-soccer'
  display_name       text NOT NULL,              -- 'Girls Soccer'
  base_sport         text NOT NULL,              -- 'soccer'  (gender-agnostic)
  gender             text NOT NULL DEFAULT 'coed'
                       CHECK (gender IN ('boys', 'girls', 'coed', 'mixed')),
  season             text NOT NULL
                       CHECK (season IN ('fall', 'winter', 'spring', 'year-round')),
  scoring_model      text NOT NULL DEFAULT 'team_vs_team'
                       CHECK (scoring_model IN ('team_vs_team', 'meet', 'individual', 'bracket')),
  period_label       text NOT NULL DEFAULT 'Period',  -- 'Quarter', 'Inning', 'Set'
  period_abbrev      text NOT NULL DEFAULT 'P',       -- 'Q', 'Inn', 'Set'
  regulation_periods integer,
  has_clock          boolean NOT NULL DEFAULT true,
  sort_order         integer NOT NULL DEFAULT 100,
  active             boolean NOT NULL DEFAULT true
);

-- Leagues are DATA, not schema. Section VI is one row, not a hard-coded
-- assumption -- Monsignor Martin, NYSCHSAA, youth leagues and tournaments all
-- arrive the same way.
CREATE TABLE IF NOT EXISTS gametracker.leagues (
  key            text PRIMARY KEY,        -- 'section-vi'
  name           text NOT NULL,           -- 'Section VI'
  short_name     text,
  governing_body text,                    -- 'NYSPHSAA'
  section        text,                    -- 'VI'   (nullable)
  region         text DEFAULT 'WNY',
  level_of_play  text DEFAULT 'high-school',
  sort_order     integer NOT NULL DEFAULT 100,
  active         boolean NOT NULL DEFAULT true
);

-- Canonical school/team identity. Auto-populated by the importer so school
-- pages work the moment a schedule lands; auto_created flags rows an admin
-- has not yet reviewed or merged.
CREATE TABLE IF NOT EXISTS gametracker.schools (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug           text NOT NULL UNIQUE,
  name           text NOT NULL,
  name_norm      text NOT NULL,
  full_name      text,
  nickname       text,                    -- 'Quakers'
  city           text,
  state          text DEFAULT 'NY',
  county         text,
  league_key     text REFERENCES gametracker.leagues(key) ON DELETE SET NULL,
  classification text,                    -- 'AA', 'A', 'B' ... source-defined
  logo_url       text,
  colors         jsonb,
  auto_created   boolean NOT NULL DEFAULT false,
  active         boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS gt_schools_name_norm_idx ON gametracker.schools (name_norm);

-- "Willy North" -> Williamsville North. Every source spells things its own way;
-- corrections land here instead of in code.
CREATE TABLE IF NOT EXISTS gametracker.school_aliases (
  alias_norm text PRIMARY KEY,
  school_id  uuid NOT NULL REFERENCES gametracker.schools(id) ON DELETE CASCADE,
  source     text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Provenance registry. `publish` is the gate between "imported" and "on the
-- public site" -- test and staging feeds can round-trip through the whole
-- pipeline without ever reaching a reader.
CREATE TABLE IF NOT EXISTS gametracker.sources (
  key            text PRIMARY KEY,        -- 'section_vi_2026'
  name           text NOT NULL,
  kind           text NOT NULL DEFAULT 'schedule'
                   CHECK (kind IN ('schedule', 'score', 'both', 'manual')),
  adapter        text NOT NULL DEFAULT 'json'
                   CHECK (adapter IN ('json', 'csv', 'arbiter', 'scorebird',
                                      'scorestream', 'scorescrape', 'manual', 'api')),
  publish        boolean NOT NULL DEFAULT false,
  trust_rank     integer NOT NULL DEFAULT 100,   -- lower wins a conflict
  attribution    text,      -- shown only when a licence actually requires it
  notes          text,
  last_import_at timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);


-- ══════════════════════════════════════════════════════════════════════════
-- 3. THE CANONICAL EVENT
-- ══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS gametracker.events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- provenance (Phase 7)
  source          text NOT NULL REFERENCES gametracker.sources(key) ON DELETE RESTRICT,
  source_event_id text NOT NULL,
  score_source    text REFERENCES gametracker.sources(key) ON DELETE SET NULL,

  -- classification
  sport           text NOT NULL REFERENCES gametracker.sports(key) ON DELETE RESTRICT,
  gender          text NOT NULL DEFAULT 'coed'
                    CHECK (gender IN ('boys', 'girls', 'coed', 'mixed')),
  level           text NOT NULL DEFAULT 'varsity',   -- varsity/jv/modified/freshman
  league          text REFERENCES gametracker.leagues(key) ON DELETE SET NULL,
  section         text,
  classification  text,
  season          integer NOT NULL,
  season_phase    text NOT NULL DEFAULT 'regular'
                    CHECK (season_phase IN ('preseason', 'scrimmage', 'regular',
                                            'tournament', 'playoff', 'championship')),
  region          text DEFAULT 'WNY',

  -- participants. away_team_name is NULLABLE on purpose: a cross country meet,
  -- a swim invitational or a wrestling tournament has no "away team".
  -- `participants` carries the full field for those.
  home_team_id    uuid REFERENCES gametracker.schools(id) ON DELETE SET NULL,
  away_team_id    uuid REFERENCES gametracker.schools(id) ON DELETE SET NULL,
  home_team_name  text NOT NULL,
  away_team_name  text,
  event_name      text,          -- 'Section VI Cross Country Championships'
  participants    jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- when / where
  event_date      date NOT NULL,
  start_time      time,
  timezone        text NOT NULL DEFAULT 'America/New_York',
  starts_at       timestamptz,   -- maintained by trigger; the sort key
  venue           text,
  venue_detail    jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- state (Phase 5: ONE record moves upcoming -> live -> final)
  status          text NOT NULL DEFAULT 'upcoming'
                    CHECK (status IN ('upcoming', 'live', 'final',
                                      'postponed', 'cancelled', 'suspended')),
  home_score      integer,
  away_score      integer,
  period          text,          -- 'Q3', 'Set 3', 'Top 5', 'OT'
  clock           text,          -- '4:12'

  -- sport-specific live state. Football puts down/distance/possession here,
  -- baseball puts inning_half/outs/balls/strikes, volleyball puts set_scores,
  -- a track meet puts its results table. NEVER add a sport column above.
  result_data     jsonb NOT NULL DEFAULT '{}'::jsonb,

  notes           text,
  last_synced_at  timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT gt_events_source_uniq UNIQUE (source, source_event_id)
);

CREATE INDEX IF NOT EXISTS gt_events_date_idx    ON gametracker.events (event_date);
CREATE INDEX IF NOT EXISTS gt_events_starts_idx  ON gametracker.events (starts_at);
CREATE INDEX IF NOT EXISTS gt_events_sport_idx   ON gametracker.events (sport, event_date);
CREATE INDEX IF NOT EXISTS gt_events_league_idx  ON gametracker.events (league, event_date);
CREATE INDEX IF NOT EXISTS gt_events_status_idx  ON gametracker.events (status) WHERE status = 'live';
CREATE INDEX IF NOT EXISTS gt_events_home_idx    ON gametracker.events (home_team_id, event_date);
CREATE INDEX IF NOT EXISTS gt_events_away_idx    ON gametracker.events (away_team_id, event_date);
CREATE INDEX IF NOT EXISTS gt_events_season_idx  ON gametracker.events (season, region);

-- Phase 9 readiness. Every state change lands here, whoever caused it --
-- importer, live adapter or admin. No notification system is built yet;
-- delivered_at is the hook a future worker claims rows through.
CREATE TABLE IF NOT EXISTS gametracker.event_log (
  id           bigserial PRIMARY KEY,
  event_id     uuid REFERENCES gametracker.events(id) ON DELETE CASCADE,
  name         text NOT NULL,   -- game.created | game.updated | game.started
                                -- score.updated | game.final | game.cancelled
                                -- game.postponed
  payload      jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at  timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz
);
CREATE INDEX IF NOT EXISTS gt_event_log_undelivered_idx
  ON gametracker.event_log (occurred_at) WHERE delivered_at IS NULL;

-- One row per import run, dry runs included. This is the audit trail that
-- answers "where did this game come from and when".
CREATE TABLE IF NOT EXISTS gametracker.import_batches (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source         text,
  adapter        text,
  dry_run        boolean NOT NULL DEFAULT true,
  submitted_by   uuid,
  total_count    integer NOT NULL DEFAULT 0,
  created_count  integer NOT NULL DEFAULT 0,
  updated_count  integer NOT NULL DEFAULT 0,
  unchanged_count integer NOT NULL DEFAULT 0,
  failed_count   integer NOT NULL DEFAULT 0,
  result         jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at     timestamptz NOT NULL DEFAULT now(),
  finished_at    timestamptz
);


-- ══════════════════════════════════════════════════════════════════════════
-- 4. TRIGGERS — starts_at, updated_at, and the Phase 9 event stream
-- ══════════════════════════════════════════════════════════════════════════

-- starts_at is derived, not supplied. timezone is a per-row column so this
-- cannot be a generated column (AT TIME ZONE with a non-constant zone is
-- STABLE, not IMMUTABLE) -- hence a trigger.
CREATE OR REPLACE FUNCTION gametracker.tg_events_derive()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.starts_at := (NEW.event_date + coalesce(NEW.start_time, time '00:00'))
                     AT TIME ZONE coalesce(NEW.timezone, 'America/New_York');
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS gt_events_derive ON gametracker.events;
CREATE TRIGGER gt_events_derive
  BEFORE INSERT OR UPDATE ON gametracker.events
  FOR EACH ROW EXECUTE FUNCTION gametracker.tg_events_derive();

-- Phase 9. Emitting from a trigger rather than from the importer means EVERY
-- writer -- schedule import, live-score adapter, manual admin correction --
-- produces the same event stream. A future adapter gets notifications for free.
CREATE OR REPLACE FUNCTION gametracker.tg_events_emit()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_base jsonb;
BEGIN
  v_base := jsonb_build_object(
    'event_id',   NEW.id,
    'sport',      NEW.sport,
    'league',     NEW.league,
    'region',     NEW.region,
    'home_team',  NEW.home_team_name,
    'away_team',  NEW.away_team_name,
    'event_date', NEW.event_date,
    'status',     NEW.status,
    'home_score', NEW.home_score,
    'away_score', NEW.away_score,
    'source',     NEW.source);

  IF TG_OP = 'INSERT' THEN
    INSERT INTO gametracker.event_log (event_id, name, payload)
    VALUES (NEW.id, 'game.created', v_base);
    IF NEW.status = 'live'  THEN
      INSERT INTO gametracker.event_log (event_id, name, payload)
      VALUES (NEW.id, 'game.started', v_base);
    ELSIF NEW.status = 'final' THEN
      INSERT INTO gametracker.event_log (event_id, name, payload)
      VALUES (NEW.id, 'game.final', v_base);
    END IF;
    RETURN NEW;
  END IF;

  -- status transitions
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO gametracker.event_log (event_id, name, payload)
    VALUES (NEW.id,
      CASE NEW.status
        WHEN 'live'      THEN 'game.started'
        WHEN 'final'     THEN 'game.final'
        WHEN 'cancelled' THEN 'game.cancelled'
        WHEN 'postponed' THEN 'game.postponed'
        ELSE 'game.updated'
      END,
      v_base || jsonb_build_object('previous_status', OLD.status));
  END IF;

  -- score movement (independent of status: a score can change mid-period)
  IF NEW.home_score IS DISTINCT FROM OLD.home_score
     OR NEW.away_score IS DISTINCT FROM OLD.away_score THEN
    INSERT INTO gametracker.event_log (event_id, name, payload)
    VALUES (NEW.id, 'score.updated',
      v_base || jsonb_build_object(
        'previous_home_score', OLD.home_score,
        'previous_away_score', OLD.away_score,
        'period', NEW.period,
        'clock',  NEW.clock));
  END IF;

  -- schedule/venue changes readers actually care about
  IF NEW.event_date IS DISTINCT FROM OLD.event_date
     OR NEW.start_time IS DISTINCT FROM OLD.start_time
     OR NEW.venue IS DISTINCT FROM OLD.venue THEN
    INSERT INTO gametracker.event_log (event_id, name, payload)
    VALUES (NEW.id, 'game.updated',
      v_base || jsonb_build_object(
        'previous_event_date', OLD.event_date,
        'previous_start_time', OLD.start_time,
        'previous_venue',      OLD.venue,
        'venue',               NEW.venue));
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS gt_events_emit ON gametracker.events;
CREATE TRIGGER gt_events_emit
  AFTER INSERT OR UPDATE ON gametracker.events
  FOR EACH ROW EXECUTE FUNCTION gametracker.tg_events_emit();

CREATE OR REPLACE FUNCTION gametracker.tg_touch()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS gt_schools_touch ON gametracker.schools;
CREATE TRIGGER gt_schools_touch BEFORE UPDATE ON gametracker.schools
  FOR EACH ROW EXECUTE FUNCTION gametracker.tg_touch();

DROP TRIGGER IF EXISTS gt_sources_touch ON gametracker.sources;
CREATE TRIGGER gt_sources_touch BEFORE UPDATE ON gametracker.sources
  FOR EACH ROW EXECUTE FUNCTION gametracker.tg_touch();


-- ══════════════════════════════════════════════════════════════════════════
-- 5. LOCKDOWN
-- RLS on with no policies = no direct access for anon or authenticated, the
-- same posture public.teams already uses. Reads and writes go through the
-- SECURITY DEFINER functions below, which is where the rules actually live.
-- ══════════════════════════════════════════════════════════════════════════

ALTER TABLE gametracker.sports         ENABLE ROW LEVEL SECURITY;
ALTER TABLE gametracker.leagues        ENABLE ROW LEVEL SECURITY;
ALTER TABLE gametracker.schools        ENABLE ROW LEVEL SECURITY;
ALTER TABLE gametracker.school_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE gametracker.sources        ENABLE ROW LEVEL SECURITY;
ALTER TABLE gametracker.events         ENABLE ROW LEVEL SECURITY;
ALTER TABLE gametracker.event_log      ENABLE ROW LEVEL SECURITY;
ALTER TABLE gametracker.import_batches ENABLE ROW LEVEL SECURITY;


-- ══════════════════════════════════════════════════════════════════════════
-- 6. SEED — the Section VI sports calendar, all three seasons
-- Reference data, not invented activity. No games, scores or results are
-- seeded anywhere in this file.
-- ══════════════════════════════════════════════════════════════════════════

INSERT INTO gametracker.sports
  (key, display_name, base_sport, gender, season, scoring_model, period_label, period_abbrev, regulation_periods, has_clock, sort_order)
VALUES
  -- ── FALL ────────────────────────────────────────────────────────────────
  ('football',              'Football',                'football',     'boys',  'fall',   'team_vs_team', 'Quarter', 'Q',    4, true,  10),
  ('boys-soccer',           'Boys Soccer',             'soccer',       'boys',  'fall',   'team_vs_team', 'Half',    'H',    2, true,  20),
  ('girls-soccer',          'Girls Soccer',            'soccer',       'girls', 'fall',   'team_vs_team', 'Half',    'H',    2, true,  21),
  ('girls-volleyball',      'Girls Volleyball',        'volleyball',   'girls', 'fall',   'team_vs_team', 'Set',     'Set',  5, false, 30),
  ('boys-volleyball',       'Boys Volleyball',         'volleyball',   'boys',  'fall',   'team_vs_team', 'Set',     'Set',  5, false, 31),
  ('field-hockey',          'Field Hockey',            'field-hockey', 'girls', 'fall',   'team_vs_team', 'Quarter', 'Q',    4, true,  40),
  ('boys-cross-country',    'Boys Cross Country',      'cross-country','boys',  'fall',   'meet',         'Race',    'Race', NULL, false, 50),
  ('girls-cross-country',   'Girls Cross Country',     'cross-country','girls', 'fall',   'meet',         'Race',    'Race', NULL, false, 51),
  ('girls-swimming',        'Girls Swimming & Diving', 'swimming',     'girls', 'fall',   'meet',         'Event',   'Ev',   NULL, false, 60),
  ('girls-tennis',          'Girls Tennis',            'tennis',       'girls', 'fall',   'individual',   'Match',   'M',    NULL, false, 70),
  ('girls-golf',            'Girls Golf',              'golf',         'girls', 'fall',   'meet',         'Round',   'Rd',   NULL, false, 80),
  ('boys-golf-fall',        'Boys Golf (Fall)',        'golf',         'boys',  'fall',   'meet',         'Round',   'Rd',   NULL, false, 81),
  ('girls-gymnastics',      'Girls Gymnastics',        'gymnastics',   'girls', 'fall',   'meet',         'Rotation','Rot',  NULL, false, 90),
  ('boys-cheer-fall',       'Competitive Cheer (Fall)','cheer',        'coed',  'fall',   'meet',         'Round',   'Rd',   NULL, false, 95),

  -- ── WINTER ──────────────────────────────────────────────────────────────
  ('boys-basketball',       'Boys Basketball',         'basketball',   'boys',  'winter', 'team_vs_team', 'Quarter', 'Q',    4, true, 110),
  ('girls-basketball',      'Girls Basketball',        'basketball',   'girls', 'winter', 'team_vs_team', 'Quarter', 'Q',    4, true, 111),
  ('boys-ice-hockey',       'Boys Ice Hockey',         'ice-hockey',   'boys',  'winter', 'team_vs_team', 'Period',  'P',    3, true, 120),
  ('girls-ice-hockey',      'Girls Ice Hockey',        'ice-hockey',   'girls', 'winter', 'team_vs_team', 'Period',  'P',    3, true, 121),
  ('wrestling',             'Wrestling',               'wrestling',    'boys',  'winter', 'team_vs_team', 'Bout',    'Bout', NULL, false, 130),
  ('girls-wrestling',       'Girls Wrestling',         'wrestling',    'girls', 'winter', 'team_vs_team', 'Bout',    'Bout', NULL, false, 131),
  ('boys-swimming',         'Boys Swimming & Diving',  'swimming',     'boys',  'winter', 'meet',         'Event',   'Ev',   NULL, false, 140),
  ('boys-indoor-track',     'Boys Indoor Track & Field','indoor-track','boys',  'winter', 'meet',         'Event',   'Ev',   NULL, false, 150),
  ('girls-indoor-track',    'Girls Indoor Track & Field','indoor-track','girls','winter', 'meet',         'Event',   'Ev',   NULL, false, 151),
  ('boys-bowling',          'Boys Bowling',            'bowling',      'boys',  'winter', 'team_vs_team', 'Game',    'G',    3, false, 160),
  ('girls-bowling',         'Girls Bowling',           'bowling',      'girls', 'winter', 'team_vs_team', 'Game',    'G',    3, false, 161),
  ('competitive-cheer',     'Competitive Cheer',       'cheer',        'coed',  'winter', 'meet',         'Round',   'Rd',   NULL, false, 170),
  ('unified-basketball',    'Unified Basketball',      'basketball',   'coed',  'winter', 'team_vs_team', 'Quarter', 'Q',    4, true, 180),
  ('boys-skiing',           'Boys Alpine Skiing',      'skiing',       'boys',  'winter', 'meet',         'Run',     'Run',  NULL, false, 190),
  ('girls-skiing',          'Girls Alpine Skiing',     'skiing',       'girls', 'winter', 'meet',         'Run',     'Run',  NULL, false, 191),

  -- ── SPRING ──────────────────────────────────────────────────────────────
  ('baseball',              'Baseball',                'baseball',     'boys',  'spring', 'team_vs_team', 'Inning',  'Inn',  7, false, 210),
  ('softball',              'Softball',                'softball',     'girls', 'spring', 'team_vs_team', 'Inning',  'Inn',  7, false, 211),
  ('boys-lacrosse',         'Boys Lacrosse',           'lacrosse',     'boys',  'spring', 'team_vs_team', 'Quarter', 'Q',    4, true, 220),
  ('girls-lacrosse',        'Girls Lacrosse',          'lacrosse',     'girls', 'spring', 'team_vs_team', 'Half',    'H',    2, true, 221),
  ('boys-track',            'Boys Track & Field',      'track',        'boys',  'spring', 'meet',         'Event',   'Ev',   NULL, false, 230),
  ('girls-track',           'Girls Track & Field',     'track',        'girls', 'spring', 'meet',         'Event',   'Ev',   NULL, false, 231),
  ('boys-tennis',           'Boys Tennis',             'tennis',       'boys',  'spring', 'individual',   'Match',   'M',    NULL, false, 240),
  ('boys-golf',             'Boys Golf',               'golf',         'boys',  'spring', 'meet',         'Round',   'Rd',   NULL, false, 250),
  ('boys-crew',             'Boys Crew',               'crew',         'boys',  'spring', 'meet',         'Race',    'Race', NULL, false, 260),
  ('girls-crew',            'Girls Crew',              'crew',         'girls', 'spring', 'meet',         'Race',    'Race', NULL, false, 261),
  ('girls-flag-football',   'Girls Flag Football',     'flag-football','girls', 'spring', 'team_vs_team', 'Half',    'H',    2, true, 270)
ON CONFLICT (key) DO UPDATE SET
  display_name       = EXCLUDED.display_name,
  base_sport         = EXCLUDED.base_sport,
  gender             = EXCLUDED.gender,
  season             = EXCLUDED.season,
  scoring_model      = EXCLUDED.scoring_model,
  period_label       = EXCLUDED.period_label,
  period_abbrev      = EXCLUDED.period_abbrev,
  regulation_periods = EXCLUDED.regulation_periods,
  has_clock          = EXCLUDED.has_clock,
  sort_order         = EXCLUDED.sort_order;

INSERT INTO gametracker.leagues (key, name, short_name, governing_body, section, region, sort_order)
VALUES
  ('section-vi',       'Section VI',                'Section VI', 'NYSPHSAA', 'VI', 'WNY', 10),
  ('monsignor-martin', 'Monsignor Martin',          'MMHSAA',     'MMHSAA',   NULL, 'WNY', 20),
  ('section-v',        'Section V',                 'Section V',  'NYSPHSAA', 'V',  'WNY', 30),
  ('independent',      'Independent / Non-League',  'Ind.',        NULL,      NULL, 'WNY', 90)
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name, short_name = EXCLUDED.short_name,
  governing_body = EXCLUDED.governing_body, section = EXCLUDED.section,
  region = EXCLUDED.region, sort_order = EXCLUDED.sort_order;

-- Two sources exist from the start: manual admin entry (publishes), and a
-- self-test lane (never publishes) so the whole pipeline can be exercised
-- against the real database without a single invented game reaching a reader.
INSERT INTO gametracker.sources (key, name, kind, adapter, publish, trust_rank, notes)
VALUES
  ('manual_admin', 'Manual admin entry', 'both', 'manual', true,  10,
   'Corrections and hand-entered events made by an authorized 5-Star admin. Highest trust.'),
  ('selftest',     'Pipeline self-test', 'both', 'json',   false, 900,
   'Never published. Used to verify import/upsert/status transitions against the live database.')
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name, kind = EXCLUDED.kind, adapter = EXCLUDED.adapter,
  trust_rank = EXCLUDED.trust_rank, notes = EXCLUDED.notes;


-- ══════════════════════════════════════════════════════════════════════════
-- 7. TEAM RESOLUTION
-- Alias first, then normalized name, then (optionally) create. Auto-created
-- schools are flagged so an admin can merge duplicates later without the
-- import having to block on a human.
-- ══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION gametracker.resolve_school(
  p_name   text,
  p_league text DEFAULT NULL,
  p_create boolean DEFAULT false
) RETURNS uuid
LANGUAGE plpgsql
SET search_path TO 'gametracker', 'public', 'pg_temp'
AS $$
DECLARE
  v_norm text := gametracker.norm_school(p_name);
  v_id   uuid;
  v_slug text;
  v_n    integer := 1;
BEGIN
  IF v_norm IS NULL THEN RETURN NULL; END IF;

  SELECT school_id INTO v_id FROM gametracker.school_aliases WHERE alias_norm = v_norm;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  SELECT id INTO v_id FROM gametracker.schools WHERE name_norm = v_norm;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  IF NOT p_create THEN RETURN NULL; END IF;

  v_slug := gametracker.slugify(v_norm);
  WHILE EXISTS (SELECT 1 FROM gametracker.schools WHERE slug = v_slug) LOOP
    v_n := v_n + 1;
    v_slug := gametracker.slugify(v_norm) || '-' || v_n;
  END LOOP;

  INSERT INTO gametracker.schools (slug, name, name_norm, league_key, auto_created)
  VALUES (v_slug, trim(p_name), v_norm, p_league, true)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;


-- ══════════════════════════════════════════════════════════════════════════
-- 8. THE IMPORTER  (Phase 2)
--
-- Source-agnostic by construction: it takes a jsonb array and knows nothing
-- about where the array came from. Section VI, Monsignor Martin, Arbiter,
-- ScoreBird, a CSV an admin pasted in -- all the same call. Adding a source is
-- writing a shim that produces this array, not touching this function.
--
-- Field aliases are accepted so the football-era payload shape
-- (source_game_id / game_date / home_team / game_clock) and the universal
-- shape (source_event_id / event_date / home_team_name / clock) both work.
--
-- Idempotent by (source, source_event_id): running the same file twice
-- produces creates then unchanged, never duplicates.
-- ══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION gametracker.import_events(
  p_payload        jsonb,
  p_dry_run        boolean DEFAULT true,
  p_default_source text    DEFAULT NULL,
  p_submitted_by   uuid    DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'gametracker', 'public', 'pg_temp'
AS $$
DECLARE
  v_items       jsonb;
  v_item        jsonb;
  v_idx         integer := 0;
  v_batch       uuid := gen_random_uuid();
  v_rows        jsonb := '[]'::jsonb;
  v_created     integer := 0;
  v_updated     integer := 0;
  v_unchanged   integer := 0;
  v_failed      integer := 0;
  v_sources     text[] := '{}';

  v_source      text;
  v_sid         text;
  v_sport       text;
  v_status      text;
  v_date        date;
  v_time        time;
  v_season      integer;
  v_home        text;
  v_away        text;
  v_venue       text;
  v_league      text;
  v_gender      text;
  v_level       text;
  v_tz          text;
  v_home_id     uuid;
  v_away_id     uuid;
  v_existing    gametracker.events%ROWTYPE;
  v_changes     text[];
  v_err         text;
  v_action      text;
  v_label       text;
  v_id          uuid;
BEGIN
  -- Accept a bare array, or {"events":[...]} / {"games":[...]}
  v_items := CASE
    WHEN jsonb_typeof(p_payload) = 'array' THEN p_payload
    WHEN p_payload ? 'events' THEN p_payload -> 'events'
    WHEN p_payload ? 'games'  THEN p_payload -> 'games'
    ELSE NULL
  END;

  IF v_items IS NULL OR jsonb_typeof(v_items) <> 'array' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Payload must be a JSON array of events, or an object with an "events" or "games" array.');
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_items) LOOP
    v_idx     := v_idx + 1;
    v_err     := NULL;
    v_changes := '{}';
    v_action  := NULL;
    v_id      := NULL;

    BEGIN
      -- ── read, accepting either field vocabulary ──────────────────────────
      v_source := nullif(trim(coalesce(v_item ->> 'source', p_default_source, '')), '');
      v_sid    := nullif(trim(coalesce(v_item ->> 'source_event_id',
                                       v_item ->> 'source_game_id', '')), '');
      v_sport  := gametracker.slugify(coalesce(v_item ->> 'sport', ''));
      v_home   := nullif(trim(coalesce(v_item ->> 'home_team_name',
                                       v_item ->> 'home_team', '')), '');
      v_away   := nullif(trim(coalesce(v_item ->> 'away_team_name',
                                       v_item ->> 'away_team', '')), '');
      v_venue  := nullif(trim(coalesce(v_item ->> 'venue', '')), '');
      v_tz     := coalesce(nullif(trim(coalesce(v_item ->> 'timezone', '')), ''), 'America/New_York');

      -- ── validate (Phase 2.1) ─────────────────────────────────────────────
      IF v_source IS NULL THEN
        RAISE EXCEPTION 'missing "source" (and no default source supplied)';
      END IF;
      IF NOT EXISTS (SELECT 1 FROM gametracker.sources WHERE key = v_source) THEN
        RAISE EXCEPTION 'unknown source "%" — register it in gametracker.sources first', v_source;
      END IF;
      IF v_sid IS NULL THEN
        RAISE EXCEPTION 'missing "source_event_id"';
      END IF;
      IF v_sport IS NULL OR NOT EXISTS (SELECT 1 FROM gametracker.sports WHERE key = v_sport) THEN
        RAISE EXCEPTION 'unknown sport "%" — must be a key in gametracker.sports', coalesce(v_item ->> 'sport', '');
      END IF;
      IF v_home IS NULL THEN
        RAISE EXCEPTION 'missing "home_team_name"';
      END IF;

      -- ── normalize dates/times (Phase 2.3) ────────────────────────────────
      BEGIN
        v_date := (coalesce(v_item ->> 'event_date', v_item ->> 'game_date', v_item ->> 'date'))::date;
      EXCEPTION WHEN others THEN
        RAISE EXCEPTION 'unparseable date "%" — use YYYY-MM-DD',
          coalesce(v_item ->> 'event_date', v_item ->> 'game_date', v_item ->> 'date', '');
      END;
      IF v_date IS NULL THEN RAISE EXCEPTION 'missing "event_date"'; END IF;

      v_time := gametracker.parse_time(coalesce(v_item ->> 'start_time', v_item ->> 'time'));

      v_status := coalesce(gametracker.norm_status(v_item ->> 'status'), 'upcoming');

      v_season := coalesce(
        nullif(regexp_replace(coalesce(v_item ->> 'season', ''), '[^0-9]', '', 'g'), '')::integer,
        -- fall sports belong to the calendar year they start in; a February
        -- basketball game belongs to the season that began the prior autumn
        CASE WHEN extract(month FROM v_date) >= 7
             THEN extract(year FROM v_date)::integer
             ELSE extract(year FROM v_date)::integer - 1 END);

      v_league := nullif(gametracker.slugify(coalesce(v_item ->> 'league', '')), '');
      IF v_league IS NOT NULL AND NOT EXISTS (SELECT 1 FROM gametracker.leagues WHERE key = v_league) THEN
        RAISE EXCEPTION 'unknown league "%" — register it in gametracker.leagues first', v_item ->> 'league';
      END IF;

      v_gender := coalesce(nullif(lower(trim(coalesce(v_item ->> 'gender', ''))), ''),
                           (SELECT gender FROM gametracker.sports WHERE key = v_sport));
      v_level  := coalesce(nullif(lower(trim(coalesce(v_item ->> 'level', ''))), ''), 'varsity');

      -- ── normalize team names (Phase 2.2) ─────────────────────────────────
      v_home_id := gametracker.resolve_school(v_home, v_league, NOT p_dry_run);
      v_away_id := gametracker.resolve_school(v_away, v_league, NOT p_dry_run);

      v_label := coalesce(v_away, 'TBD') || ' @ ' || v_home;

      SELECT * INTO v_existing
      FROM gametracker.events
      WHERE source = v_source AND source_event_id = v_sid;

      -- ── decide (Phase 2.4/2.5/2.6) ───────────────────────────────────────
      IF v_existing.id IS NULL THEN
        v_action := 'create';
      ELSE
        v_id := v_existing.id;
        IF v_existing.event_date  IS DISTINCT FROM v_date  THEN v_changes := array_append(v_changes, 'event_date'::text); END IF;
        IF v_existing.start_time  IS DISTINCT FROM v_time  THEN v_changes := array_append(v_changes, 'start_time'::text); END IF;
        IF v_existing.venue          IS DISTINCT FROM v_venue  THEN v_changes := array_append(v_changes, 'venue'::text); END IF;
        IF v_existing.status      IS DISTINCT FROM v_status THEN v_changes := array_append(v_changes, 'status'::text); END IF;
        IF v_existing.home_team_name IS DISTINCT FROM v_home THEN v_changes := array_append(v_changes, 'home_team_name'::text); END IF;
        IF v_existing.away_team_name IS DISTINCT FROM v_away THEN v_changes := array_append(v_changes, 'away_team_name'::text); END IF;
        IF v_existing.sport       IS DISTINCT FROM v_sport  THEN v_changes := array_append(v_changes, 'sport'::text); END IF;
        IF v_existing.league      IS DISTINCT FROM v_league THEN v_changes := array_append(v_changes, 'league'::text); END IF;
        IF v_existing.level       IS DISTINCT FROM v_level  THEN v_changes := array_append(v_changes, 'level'::text); END IF;
        v_action := CASE WHEN cardinality(v_changes) > 0 THEN 'update' ELSE 'unchanged' END;
      END IF;

      -- ── write (Phase 2.7 records last_synced_at) ─────────────────────────
      IF NOT p_dry_run THEN
        INSERT INTO gametracker.events AS e (
          source, source_event_id, sport, gender, level, league, section,
          classification, season, season_phase, region,
          home_team_id, away_team_id, home_team_name, away_team_name,
          event_name, participants, event_date, start_time, timezone, venue,
          status, notes, last_synced_at)
        VALUES (
          v_source, v_sid, v_sport, v_gender, v_level, v_league,
          nullif(trim(coalesce(v_item ->> 'section', '')), ''),
          nullif(trim(coalesce(v_item ->> 'classification', '')), ''),
          v_season,
          coalesce(nullif(lower(trim(coalesce(v_item ->> 'season_phase', ''))), ''), 'regular'),
          coalesce(nullif(trim(coalesce(v_item ->> 'region', '')), ''), 'WNY'),
          v_home_id, v_away_id, v_home, v_away,
          nullif(trim(coalesce(v_item ->> 'event_name', '')), ''),
          coalesce(v_item -> 'participants', '[]'::jsonb),
          v_date, v_time, v_tz, v_venue, v_status,
          nullif(trim(coalesce(v_item ->> 'notes', '')), ''),
          now())
        ON CONFLICT (source, source_event_id) DO UPDATE SET
          sport          = EXCLUDED.sport,
          gender         = EXCLUDED.gender,
          level          = EXCLUDED.level,
          league         = EXCLUDED.league,
          section        = EXCLUDED.section,
          classification = EXCLUDED.classification,
          season         = EXCLUDED.season,
          season_phase   = EXCLUDED.season_phase,
          region         = EXCLUDED.region,
          home_team_id   = coalesce(EXCLUDED.home_team_id, e.home_team_id),
          away_team_id   = coalesce(EXCLUDED.away_team_id, e.away_team_id),
          home_team_name = EXCLUDED.home_team_name,
          away_team_name = EXCLUDED.away_team_name,
          event_name     = EXCLUDED.event_name,
          participants   = EXCLUDED.participants,
          event_date     = EXCLUDED.event_date,
          start_time     = EXCLUDED.start_time,
          timezone       = EXCLUDED.timezone,
          venue          = EXCLUDED.venue,
          -- A schedule feed must never drag a live or finished game backwards
          -- to 'upcoming'. Score feeds and admins own status from kickoff on.
          status         = CASE
                             WHEN e.status IN ('live', 'final')
                                  AND EXCLUDED.status = 'upcoming' THEN e.status
                             ELSE EXCLUDED.status
                           END,
          notes          = EXCLUDED.notes,
          last_synced_at = now()
        RETURNING e.id INTO v_id;
      END IF;

      CASE v_action
        WHEN 'create'    THEN v_created   := v_created + 1;
        WHEN 'update'    THEN v_updated   := v_updated + 1;
        ELSE                  v_unchanged := v_unchanged + 1;
      END CASE;

      IF NOT (v_source = ANY (v_sources)) THEN v_sources := array_append(v_sources, v_source); END IF;

      v_rows := v_rows || jsonb_build_object(
        'index',           v_idx,
        'source',          v_source,
        'source_event_id', v_sid,
        'matchup',         v_label,
        'sport',           v_sport,
        'event_date',      v_date,
        'start_time',      v_time,
        'status',          v_status,
        'action',          v_action,
        'changes',         to_jsonb(v_changes),
        'event_id',        v_id);

    EXCEPTION WHEN others THEN
      v_failed := v_failed + 1;
      v_err := SQLERRM;
      v_rows := v_rows || jsonb_build_object(
        'index',           v_idx,
        'source',          v_source,
        'source_event_id', v_sid,
        'matchup',         coalesce(v_label, ''),
        'action',          'error',
        'error',           v_err);
    END;
  END LOOP;

  IF NOT p_dry_run AND array_length(v_sources, 1) > 0 THEN
    UPDATE gametracker.sources SET last_import_at = now() WHERE key = ANY (v_sources);
  END IF;

  INSERT INTO gametracker.import_batches (
    id, source, dry_run, submitted_by, total_count,
    created_count, updated_count, unchanged_count, failed_count, result, finished_at)
  VALUES (
    v_batch,
    coalesce(array_to_string(v_sources, ','), p_default_source),
    p_dry_run, p_submitted_by, v_idx,
    v_created, v_updated, v_unchanged, v_failed,
    jsonb_build_object('rows', v_rows), now());

  RETURN jsonb_build_object(
    'ok',       v_failed = 0,
    'dry_run',  p_dry_run,
    'batch_id', v_batch,
    'sources',  to_jsonb(v_sources),
    'summary',  jsonb_build_object(
                  'total',     v_idx,
                  'created',   v_created,
                  'updated',   v_updated,
                  'unchanged', v_unchanged,
                  'failed',    v_failed),
    'message',  CASE
                  WHEN v_idx = 0 THEN 'Nothing to import — the file contained no events.'
                  WHEN p_dry_run THEN
                    format('Preview only, nothing saved. %s to add, %s to update, %s already current, %s with problems.',
                           v_created, v_updated, v_unchanged, v_failed)
                  ELSE
                    format('Imported. %s added, %s updated, %s already current, %s with problems.',
                           v_created, v_updated, v_unchanged, v_failed)
                END,
    'rows',     v_rows);
END;
$$;


-- ══════════════════════════════════════════════════════════════════════════
-- 9. THE PUBLIC READ API  (Phase 3)
--
-- Reachable over PostgREST as
--   GET  /rest/v1/rpc/gametracker_events?p_region=WNY&p_sport=football
--   POST /rest/v1/rpc/gametracker_events   (body = the same params)
-- with only the publishable key. No 5-Star-specific logic lives in here: the
-- mobile app, HuddleSphere, a team site and a notification worker all call the
-- identical function.
--
-- Only events from sources marked publish = true are ever returned. That is
-- what lets a feed be round-tripped end to end without a test game showing up
-- in front of a reader.
--
-- Sort order is fixed here, not in the client: live first, then upcoming by
-- start time, then postponed, then finals most-recent-first.
-- ══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.gametracker_events(
  p_region      text    DEFAULT NULL,
  p_sport       text    DEFAULT NULL,   -- 'football', 'girls-soccer', or a base sport like 'soccer'
  p_gender      text    DEFAULT NULL,   -- 'boys' | 'girls' | 'coed'
  p_league      text    DEFAULT NULL,   -- 'section-vi' | 'Section VI'
  p_section     text    DEFAULT NULL,   -- 'VI'
  p_school      text    DEFAULT NULL,   -- slug or name; matches home OR away
  p_status      text    DEFAULT NULL,   -- canonical status, or 'today'/'tonight'/'results'
  p_season_name text    DEFAULT NULL,   -- 'fall' | 'winter' | 'spring'
  p_date        date    DEFAULT NULL,
  p_date_from   date    DEFAULT NULL,
  p_date_to     date    DEFAULT NULL,
  p_season      integer DEFAULT NULL,
  p_level       text    DEFAULT NULL,
  p_limit       integer DEFAULT 200,
  p_offset      integer DEFAULT 0
)
RETURNS TABLE (
  id              uuid,
  sport           text,
  sport_name      text,
  base_sport      text,
  sport_season    text,
  scoring_model   text,
  period_label    text,
  period_abbrev   text,
  gender          text,
  level           text,
  league          text,
  league_name     text,
  section         text,
  classification  text,
  season          integer,
  season_phase    text,
  region          text,
  home_team_name  text,
  away_team_name  text,
  home_team_slug  text,
  away_team_slug  text,
  event_name      text,
  participants    jsonb,
  event_date      date,
  start_time      text,
  starts_at       timestamptz,
  timezone        text,
  venue           text,
  status          text,
  home_score      integer,
  away_score      integer,
  period          text,
  clock           text,
  result_data     jsonb,
  source          text,
  last_synced_at  timestamptz
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'gametracker', 'public', 'pg_temp'
AS $$
  WITH params AS (
    SELECT
      nullif(trim(coalesce(p_region, '')), '')                    AS region,
      nullif(gametracker.slugify(coalesce(p_sport, '')), '')      AS sport,
      nullif(lower(trim(coalesce(p_gender, ''))), '')             AS gender,
      nullif(gametracker.slugify(coalesce(p_league, '')), '')     AS league,
      nullif(upper(trim(coalesce(p_section, ''))), '')            AS section,
      nullif(gametracker.norm_school(coalesce(p_school, '')), '') AS school,
      nullif(lower(trim(coalesce(p_status, ''))), '')             AS view,
      nullif(lower(trim(coalesce(p_season_name, ''))), '')        AS season_name,
      nullif(lower(trim(coalesce(p_level, ''))), '')              AS level,
      (now() AT TIME ZONE 'America/New_York')::date               AS today
  )
  SELECT
    e.id, e.sport, s.display_name, s.base_sport, s.season, s.scoring_model,
    s.period_label, s.period_abbrev,
    e.gender, e.level, e.league, l.name, e.section, e.classification,
    e.season, e.season_phase, e.region,
    e.home_team_name, e.away_team_name, hs.slug, aws.slug,
    e.event_name, e.participants,
    e.event_date,
    CASE WHEN e.start_time IS NULL THEN NULL
         ELSE to_char(e.start_time, 'FMHH12:MI AM') END,
    e.starts_at, e.timezone, e.venue,
    e.status, e.home_score, e.away_score, e.period, e.clock, e.result_data,
    e.source, e.last_synced_at
  FROM gametracker.events e
  JOIN gametracker.sports  s   ON s.key = e.sport
  JOIN gametracker.sources src ON src.key = e.source
  LEFT JOIN gametracker.leagues l  ON l.key = e.league
  LEFT JOIN gametracker.schools hs ON hs.id = e.home_team_id
  LEFT JOIN gametracker.schools aws ON aws.id = e.away_team_id
  CROSS JOIN params p
  WHERE src.publish = true
    AND (p.region      IS NULL OR e.region ILIKE p.region)
    AND (p.sport       IS NULL OR e.sport = p.sport OR s.base_sport = p.sport)
    AND (p.gender      IS NULL OR e.gender = p.gender)
    AND (p.league      IS NULL OR e.league = p.league)
    AND (p.section     IS NULL OR upper(coalesce(e.section, l.section, '')) = p.section)
    AND (p.level       IS NULL OR e.level = p.level)
    AND (p.season_name IS NULL OR s.season = p.season_name)
    AND (p_season      IS NULL OR e.season = p_season)
    AND (p.school      IS NULL
         OR hs.name_norm = p.school OR aws.name_norm = p.school
         OR hs.slug = gametracker.slugify(p.school) OR aws.slug = gametracker.slugify(p.school)
         OR gametracker.norm_school(e.home_team_name) = p.school
         OR gametracker.norm_school(e.away_team_name) = p.school)
    AND (p_date      IS NULL OR e.event_date = p_date)
    AND (p_date_from IS NULL OR e.event_date >= p_date_from)
    AND (p_date_to   IS NULL OR e.event_date <= p_date_to)
    AND (
      p.view IS NULL OR p.view IN ('all', 'any')
      OR (p.view = 'live'      AND e.status = 'live')
      OR (p.view = 'upcoming'  AND e.status = 'upcoming' AND e.starts_at >= now() - interval '4 hours')
      OR (p.view IN ('final', 'results') AND e.status = 'final')
      OR (p.view = 'today'     AND e.event_date = p.today)
      OR (p.view = 'tonight'   AND e.event_date = p.today
                               AND (e.start_time IS NULL OR e.start_time >= time '16:00'))
      OR (p.view = 'postponed' AND e.status IN ('postponed', 'suspended'))
      OR (p.view = 'cancelled' AND e.status = 'cancelled')
      OR (p.view NOT IN ('live','upcoming','final','results','today','tonight',
                         'postponed','cancelled','all','any')
          AND e.status = p.view)
    )
  ORDER BY
    CASE e.status
      WHEN 'live'      THEN 0
      WHEN 'upcoming'  THEN 1
      WHEN 'suspended' THEN 2
      WHEN 'postponed' THEN 2
      WHEN 'final'     THEN 3
      ELSE 4
    END,
    CASE WHEN e.status = 'final'
         THEN -extract(epoch FROM e.starts_at)
         ELSE  extract(epoch FROM e.starts_at) END,
    e.sport, e.home_team_name
  LIMIT greatest(coalesce(p_limit, 200), 1)
  OFFSET greatest(coalesce(p_offset, 0), 0);
$$;

-- Single event, for a game detail view or a notification payload.
CREATE OR REPLACE FUNCTION public.gametracker_event(p_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'gametracker', 'public', 'pg_temp'
AS $$
  SELECT to_jsonb(x) FROM (
    SELECT e.id, e.sport, s.display_name AS sport_name, s.base_sport,
           s.scoring_model, s.period_label, s.period_abbrev,
           e.gender, e.level, e.league, l.name AS league_name, e.section,
           e.classification, e.season, e.season_phase, e.region,
           e.home_team_name, e.away_team_name, hs.slug AS home_team_slug,
           aws.slug AS away_team_slug, e.event_name, e.participants,
           e.event_date,
           CASE WHEN e.start_time IS NULL THEN NULL
                ELSE to_char(e.start_time, 'FMHH12:MI AM') END AS start_time,
           e.starts_at, e.timezone, e.venue, e.status,
           e.home_score, e.away_score, e.period, e.clock, e.result_data,
           e.source, e.last_synced_at
    FROM gametracker.events e
    JOIN gametracker.sports  s   ON s.key = e.sport
    JOIN gametracker.sources src ON src.key = e.source
    LEFT JOIN gametracker.leagues l   ON l.key = e.league
    LEFT JOIN gametracker.schools hs  ON hs.id = e.home_team_id
    LEFT JOIN gametracker.schools aws ON aws.id = e.away_team_id
    WHERE src.publish = true AND e.id = p_id
  ) x;
$$;

-- Everything a filter bar needs, derived from what is actually loaded. The UI
-- never hard-codes a sport list: if only football is populated, only football
-- appears, and the page says so instead of showing empty tabs.
CREATE OR REPLACE FUNCTION public.gametracker_filters(
  p_region text    DEFAULT NULL,
  p_season integer DEFAULT NULL
) RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'gametracker', 'public', 'pg_temp'
AS $$
  WITH visible AS (
    SELECT e.*
    FROM gametracker.events e
    JOIN gametracker.sources src ON src.key = e.source
    WHERE src.publish = true
      AND (p_region IS NULL OR e.region ILIKE p_region)
      AND (p_season IS NULL OR e.season = p_season)
  )
  SELECT jsonb_build_object(
    'total_events', (SELECT count(*) FROM visible),
    'live_count',   (SELECT count(*) FROM visible WHERE status = 'live'),
    'today_count',  (SELECT count(*) FROM visible
                      WHERE event_date = (now() AT TIME ZONE 'America/New_York')::date),
    'date_range',   (SELECT jsonb_build_object('min', min(event_date), 'max', max(event_date)) FROM visible),
    'last_synced',  (SELECT max(last_synced_at) FROM visible),
    'sports', coalesce((
      SELECT jsonb_agg(x ORDER BY x ->> 'sort_order', x ->> 'display_name')
      FROM (
        SELECT DISTINCT jsonb_build_object(
                 'key', s.key, 'display_name', s.display_name,
                 'base_sport', s.base_sport, 'gender', s.gender,
                 'season', s.season, 'scoring_model', s.scoring_model,
                 'sort_order', lpad(s.sort_order::text, 5, '0'),
                 'count', (SELECT count(*) FROM visible v2 WHERE v2.sport = s.key)) AS x
        FROM gametracker.sports s
        WHERE EXISTS (SELECT 1 FROM visible v WHERE v.sport = s.key)
      ) t), '[]'::jsonb),
    'leagues', coalesce((
      SELECT jsonb_agg(x ORDER BY x ->> 'sort_order', x ->> 'name')
      FROM (
        SELECT DISTINCT jsonb_build_object(
                 'key', l.key, 'name', l.name, 'section', l.section,
                 'sort_order', lpad(l.sort_order::text, 5, '0'),
                 'count', (SELECT count(*) FROM visible v2 WHERE v2.league = l.key)) AS x
        FROM gametracker.leagues l
        WHERE EXISTS (SELECT 1 FROM visible v WHERE v.league = l.key)
      ) t), '[]'::jsonb),
    'seasons', coalesce((
      SELECT jsonb_agg(DISTINCT season ORDER BY season DESC) FROM visible), '[]'::jsonb),
    'season_names', coalesce((
      SELECT jsonb_agg(DISTINCT s.season)
      FROM visible v JOIN gametracker.sports s ON s.key = v.sport), '[]'::jsonb),
    'schools', coalesce((
      SELECT jsonb_agg(x ORDER BY x ->> 'name')
      FROM (
        SELECT DISTINCT jsonb_build_object('slug', sc.slug, 'name', sc.name) AS x
        FROM gametracker.schools sc
        WHERE EXISTS (SELECT 1 FROM visible v
                      WHERE v.home_team_id = sc.id OR v.away_team_id = sc.id)
      ) t), '[]'::jsonb));
$$;

-- Phase: school pages. Everything a "/schools/orchard-park" page needs, in one
-- round trip, entirely from GameTracker.
CREATE OR REPLACE FUNCTION public.gametracker_school(
  p_slug   text,
  p_season integer DEFAULT NULL
) RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'gametracker', 'public', 'pg_temp'
AS $$
  WITH sc AS (
    SELECT * FROM gametracker.schools
    WHERE slug = gametracker.slugify(p_slug)
       OR name_norm = gametracker.norm_school(p_slug)
    LIMIT 1
  ), ev AS (
    SELECT e.id, e.sport, s.display_name AS sport_name, e.gender, e.level,
           e.league, e.home_team_name, e.away_team_name, e.event_date,
           CASE WHEN e.start_time IS NULL THEN NULL
                ELSE to_char(e.start_time, 'FMHH12:MI AM') END AS start_time,
           e.starts_at, e.venue, e.status, e.home_score, e.away_score,
           e.period, e.clock, e.result_data, e.source,
           (e.home_team_id = sc.id) AS is_home,
           (now() AT TIME ZONE 'America/New_York')::date AS today
    FROM gametracker.events e
    JOIN gametracker.sports  s   ON s.key = e.sport
    JOIN gametracker.sources src ON src.key = e.source
    CROSS JOIN sc
    WHERE src.publish = true
      AND (e.home_team_id = sc.id OR e.away_team_id = sc.id)
      AND (p_season IS NULL OR e.season = p_season)
  )
  SELECT CASE WHEN (SELECT count(*) FROM sc) = 0 THEN NULL ELSE jsonb_build_object(
    'school', (SELECT jsonb_build_object(
                 'slug', slug, 'name', name, 'full_name', full_name,
                 'nickname', nickname, 'city', city, 'state', state,
                 'league', league_key, 'classification', classification,
                 'logo_url', logo_url, 'needs_review', auto_created) FROM sc),
    'today',    coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.starts_at)
                          FROM ev t WHERE t.event_date = t.today), '[]'::jsonb),
    'upcoming', coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.starts_at)
                          FROM ev t WHERE t.status = 'upcoming' AND t.event_date > t.today), '[]'::jsonb),
    'results',  coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.starts_at DESC)
                          FROM ev t WHERE t.status = 'final'), '[]'::jsonb))
  END;
$$;

GRANT EXECUTE ON FUNCTION public.gametracker_events(text,text,text,text,text,text,text,text,date,date,date,integer,text,integer,integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gametracker_event(uuid)             TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gametracker_filters(text, integer)  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gametracker_school(text, integer)   TO anon, authenticated;


-- ══════════════════════════════════════════════════════════════════════════
-- 10. THE ADMIN / ADAPTER WRITE API  (Phases 5 & 6)
--
-- Every one of these is gated on public.is_admin() -- the same gate admin.html
-- already uses. A control that cannot do its job is worse than no control, so
-- these raise rather than silently no-op when the caller is not an admin.
-- ══════════════════════════════════════════════════════════════════════════

-- Phase 6: preview-then-commit import. Call with p_dry_run = true to show the
-- operator exactly what will happen, then again with false to apply it.
CREATE OR REPLACE FUNCTION public.gametracker_import(
  p_payload jsonb,
  p_dry_run boolean DEFAULT true,
  p_source  text    DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'gametracker', 'public', 'pg_temp'
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorized. Sign in as a 5-Star admin to import schedules.'
      USING ERRCODE = '42501';
  END IF;
  RETURN gametracker.import_events(p_payload, p_dry_run, p_source, auth.uid());
END;
$$;

-- Admin read: includes events from sources that are NOT published, so an
-- operator can inspect staged or test data before turning a source live.
CREATE OR REPLACE FUNCTION public.gametracker_event_admin(p_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'gametracker', 'public', 'pg_temp'
AS $$
  SELECT CASE WHEN public.is_admin() THEN (
    SELECT to_jsonb(x) FROM (
      SELECT e.*, s.display_name AS sport_name, src.publish AS source_published
      FROM gametracker.events e
      JOIN gametracker.sports  s   ON s.key = e.sport
      JOIN gametracker.sources src ON src.key = e.source
      WHERE e.id = p_id
    ) x)
  END;
$$;

-- Phase 5: the SAME record moves upcoming -> live -> final. This is the call a
-- ScoreBird/ScoreStream adapter will make, and the one an admin makes by hand
-- until such an adapter exists. Nothing creates a second "scoreboard" row.
CREATE OR REPLACE FUNCTION public.gametracker_update_live(
  p_id           uuid,
  p_status       text    DEFAULT NULL,
  p_home_score   integer DEFAULT NULL,
  p_away_score   integer DEFAULT NULL,
  p_period       text    DEFAULT NULL,
  p_clock        text    DEFAULT NULL,
  p_result_data  jsonb   DEFAULT NULL,
  p_score_source text    DEFAULT 'manual_admin'
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'gametracker', 'public', 'pg_temp'
AS $$
DECLARE
  v_status text;
  v_id     uuid;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorized. Sign in as a 5-Star admin to update a score.'
      USING ERRCODE = '42501';
  END IF;

  IF p_status IS NOT NULL THEN
    v_status := gametracker.norm_status(p_status);
    IF v_status IS NULL THEN
      RAISE EXCEPTION 'Unrecognized status "%". Use upcoming, live, final, postponed or cancelled.', p_status;
    END IF;
  END IF;

  IF p_score_source IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM gametracker.sources WHERE key = p_score_source) THEN
    RAISE EXCEPTION 'Unknown score source "%".', p_score_source;
  END IF;

  UPDATE gametracker.events SET
    status       = coalesce(v_status, status),
    home_score   = coalesce(p_home_score, home_score),
    away_score   = coalesce(p_away_score, away_score),
    period       = coalesce(p_period, period),
    clock        = coalesce(p_clock, clock),
    result_data  = coalesce(result_data, '{}'::jsonb) || coalesce(p_result_data, '{}'::jsonb),
    score_source = coalesce(p_score_source, score_source),
    last_synced_at = now()
  WHERE id = p_id
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'No GameTracker event with id %', p_id;
  END IF;
  RETURN public.gametracker_event_admin(v_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.gametracker_admin_events(
  p_source text    DEFAULT NULL,
  p_date   date    DEFAULT NULL,
  p_sport  text    DEFAULT NULL,
  p_limit  integer DEFAULT 200
) RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'gametracker', 'public', 'pg_temp'
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorized.' USING ERRCODE = '42501';
  END IF;
  RETURN coalesce((
    SELECT jsonb_agg(to_jsonb(x) ORDER BY x.starts_at)
    FROM (
      SELECT e.id, e.source, e.source_event_id, e.sport, s.display_name AS sport_name,
             e.league, e.level, e.home_team_name, e.away_team_name,
             e.event_date,
             CASE WHEN e.start_time IS NULL THEN NULL
                  ELSE to_char(e.start_time, 'FMHH12:MI AM') END AS start_time,
             e.starts_at, e.venue, e.status, e.home_score, e.away_score,
             e.period, e.clock, e.result_data, e.last_synced_at,
             src.publish AS source_published
      FROM gametracker.events e
      JOIN gametracker.sports  s   ON s.key = e.sport
      JOIN gametracker.sources src ON src.key = e.source
      WHERE (p_source IS NULL OR e.source = p_source)
        AND (p_date   IS NULL OR e.event_date = p_date)
        AND (p_sport  IS NULL OR e.sport = gametracker.slugify(p_sport))
      ORDER BY e.starts_at
      LIMIT greatest(coalesce(p_limit, 200), 1)
    ) x), '[]'::jsonb);
END;
$$;

-- Phase 7/8: registering a source is the whole of "adding an adapter" on the
-- database side. Arbiter, ScoreBird and ScoreStream each become one row.
CREATE OR REPLACE FUNCTION public.gametracker_save_source(
  p_key        text,
  p_name       text    DEFAULT NULL,
  p_kind       text    DEFAULT 'schedule',
  p_adapter    text    DEFAULT 'json',
  p_publish    boolean DEFAULT false,
  p_trust_rank integer DEFAULT 100,
  p_notes      text    DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'gametracker', 'public', 'pg_temp'
AS $$
DECLARE v_key text := nullif(trim(coalesce(p_key, '')), '');
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorized.' USING ERRCODE = '42501';
  END IF;
  IF v_key IS NULL THEN RAISE EXCEPTION 'A source key is required.'; END IF;

  INSERT INTO gametracker.sources (key, name, kind, adapter, publish, trust_rank, notes)
  VALUES (v_key, coalesce(nullif(trim(coalesce(p_name,'')),''), v_key),
          coalesce(p_kind, 'schedule'), coalesce(p_adapter, 'json'),
          coalesce(p_publish, false), coalesce(p_trust_rank, 100), p_notes)
  ON CONFLICT (key) DO UPDATE SET
    name       = coalesce(nullif(trim(coalesce(p_name,'')),''), gametracker.sources.name),
    kind       = coalesce(p_kind, gametracker.sources.kind),
    adapter    = coalesce(p_adapter, gametracker.sources.adapter),
    publish    = coalesce(p_publish, gametracker.sources.publish),
    trust_rank = coalesce(p_trust_rank, gametracker.sources.trust_rank),
    notes      = coalesce(p_notes, gametracker.sources.notes);

  RETURN (SELECT to_jsonb(s) FROM gametracker.sources s WHERE s.key = v_key);
END;
$$;

CREATE OR REPLACE FUNCTION public.gametracker_sources()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'gametracker', 'public', 'pg_temp'
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorized.' USING ERRCODE = '42501';
  END IF;
  RETURN coalesce((
    SELECT jsonb_agg(to_jsonb(x) ORDER BY x.key)
    FROM (
      SELECT s.*,
             (SELECT count(*) FROM gametracker.events e WHERE e.source = s.key) AS event_count
      FROM gametracker.sources s
    ) x), '[]'::jsonb);
END;
$$;

-- Team-name corrections without a code change: "Willy North" -> williamsville-north.
CREATE OR REPLACE FUNCTION public.gametracker_link_alias(
  p_alias       text,
  p_school_slug text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'gametracker', 'public', 'pg_temp'
AS $$
DECLARE
  v_school uuid;
  v_norm   text := gametracker.norm_school(p_alias);
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorized.' USING ERRCODE = '42501';
  END IF;
  IF v_norm IS NULL THEN RAISE EXCEPTION 'An alias is required.'; END IF;

  SELECT id INTO v_school FROM gametracker.schools WHERE slug = gametracker.slugify(p_school_slug);
  IF v_school IS NULL THEN
    RAISE EXCEPTION 'No school with slug "%"', p_school_slug;
  END IF;

  INSERT INTO gametracker.school_aliases (alias_norm, school_id, source)
  VALUES (v_norm, v_school, 'admin')
  ON CONFLICT (alias_norm) DO UPDATE SET school_id = EXCLUDED.school_id;

  RETURN jsonb_build_object('ok', true, 'alias', v_norm, 'school_slug', p_school_slug);
END;
$$;

-- Removing a mistaken import. Deliberately admin-only and per-row: there is no
-- bulk delete here, because a bulk delete is how a season disappears by accident.
CREATE OR REPLACE FUNCTION public.gametracker_delete_event(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'gametracker', 'public', 'pg_temp'
AS $$
DECLARE v_n integer;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorized.' USING ERRCODE = '42501';
  END IF;
  DELETE FROM gametracker.events WHERE id = p_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN jsonb_build_object('ok', v_n > 0, 'deleted', v_n);
END;
$$;

-- ══════════════════════════════════════════════════════════════════════════
-- 11. GRANTS AND HARDENING
--
-- Postgres grants EXECUTE to PUBLIC on every new function, and PUBLIC includes
-- `anon`. A plain `GRANT ... TO authenticated` therefore does NOT keep an
-- anonymous caller out -- it only adds a grant alongside the default one. Every
-- admin function below checks is_admin() and raises 42501 regardless, but a
-- grant that is never meant to be used should not exist, so revoke first and
-- then grant deliberately. (Found by the Supabase security advisors against
-- this build, not guessed at.)
-- ══════════════════════════════════════════════════════════════════════════

-- Public read API: anon on purpose. Returns published sources only.
REVOKE ALL ON FUNCTION public.gametracker_events(text,text,text,text,text,text,text,text,date,date,date,integer,text,integer,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.gametracker_event(uuid)            FROM PUBLIC;
REVOKE ALL ON FUNCTION public.gametracker_filters(text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.gametracker_school(text, integer)  FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.gametracker_events(text,text,text,text,text,text,text,text,date,date,date,integer,text,integer,integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gametracker_event(uuid)            TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gametracker_filters(text, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gametracker_school(text, integer)  TO anon, authenticated;

-- Admin / adapter API: signed-in admins only. anon must not even hold a grant.
REVOKE ALL ON FUNCTION public.gametracker_import(jsonb, boolean, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.gametracker_update_live(uuid, text, integer, integer, text, text, jsonb, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.gametracker_event_admin(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.gametracker_admin_events(text, date, text, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.gametracker_save_source(text, text, text, text, boolean, integer, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.gametracker_sources() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.gametracker_link_alias(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.gametracker_delete_event(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.gametracker_import(jsonb, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.gametracker_update_live(uuid, text, integer, integer, text, text, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.gametracker_event_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.gametracker_admin_events(text, date, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.gametracker_save_source(text, text, text, text, boolean, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.gametracker_sources() TO authenticated;
GRANT EXECUTE ON FUNCTION public.gametracker_link_alias(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.gametracker_delete_event(uuid) TO authenticated;

-- Internals. Only the public wrappers above are reachable.
REVOKE ALL ON FUNCTION gametracker.import_events(jsonb, boolean, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION gametracker.resolve_school(text, text, boolean)       FROM PUBLIC, anon, authenticated;

-- Pin search_path on the helpers and triggers. The two trigger functions run
-- inside SECURITY DEFINER writes, which is exactly where a role-mutable
-- search_path is worth closing.
ALTER FUNCTION gametracker.norm_text(text)    SET search_path = 'pg_catalog', 'public', 'pg_temp';
ALTER FUNCTION gametracker.norm_school(text)  SET search_path = 'gametracker', 'pg_catalog', 'public', 'pg_temp';
ALTER FUNCTION gametracker.slugify(text)      SET search_path = 'gametracker', 'pg_catalog', 'public', 'pg_temp';
ALTER FUNCTION gametracker.norm_status(text)  SET search_path = 'gametracker', 'pg_catalog', 'public', 'pg_temp';
ALTER FUNCTION gametracker.parse_time(text)   SET search_path = 'pg_catalog', 'public', 'pg_temp';
ALTER FUNCTION gametracker.tg_events_derive() SET search_path = 'gametracker', 'pg_catalog', 'public', 'pg_temp';
ALTER FUNCTION gametracker.tg_events_emit()   SET search_path = 'gametracker', 'pg_catalog', 'public', 'pg_temp';
ALTER FUNCTION gametracker.tg_touch()         SET search_path = 'pg_catalog', 'public', 'pg_temp';

-- NOTE on `rls_enabled_no_policy`: the gametracker.* tables deliberately have
-- RLS on with no policies. That is the lockdown, not an oversight -- it is the
-- same posture public.teams already uses on this project. All access is through
-- the SECURITY DEFINER functions above, which is where the rules live.

-- ============================================================================
-- End of GameTracker schema.
-- ============================================================================
