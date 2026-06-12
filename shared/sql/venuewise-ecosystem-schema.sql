-- ============================================================
-- Venuewise Ecosystem — Full Database Schema
-- /shared/sql/venuewise-ecosystem-schema.sql
--
-- Run this in your Supabase SQL Editor.
-- Tables are created with IF NOT EXISTS — safe to re-run.
-- RLS policies are applied at the bottom.
-- ============================================================


-- ── Enable UUID extension ────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- ============================================================
-- CORE IDENTITY TABLES
-- ============================================================

-- users_profile: extends Supabase auth.users with platform data
CREATE TABLE IF NOT EXISTS users_profile (
  id              uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  full_name       text,
  email           text,
  phone           text,
  role            text CHECK (role IN (
                    'parent','athlete','coach','organization_admin',
                    'facility_admin','media_contributor','sponsor','admin'
                  )),
  avatar_url      text,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

-- families: HomeHuddle family units
CREATE TABLE IF NOT EXISTS families (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  parent_user_id      uuid REFERENCES users_profile(id) ON DELETE SET NULL,
  family_name         text NOT NULL,
  subscription_status text DEFAULT 'free' CHECK (subscription_status IN ('free','active','expired','cancelled')),
  created_at          timestamptz DEFAULT now()
);

-- athletes: AthleteHuddle profiles
CREATE TABLE IF NOT EXISTS athletes (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  family_id           uuid REFERENCES families(id) ON DELETE SET NULL,
  user_id             uuid REFERENCES users_profile(id) ON DELETE SET NULL,
  athlete_name        text NOT NULL,
  sport               text,
  school              text,
  graduation_year     text,
  position            text,
  bio                 text,
  achievements        text,
  profile_photo_url   text,
  spotlight_eligible  boolean DEFAULT false,
  created_at          timestamptz DEFAULT now()
);

-- coaches: CoachesHuddle profiles
CREATE TABLE IF NOT EXISTS coaches (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id             uuid REFERENCES users_profile(id) ON DELETE SET NULL,
  coach_name          text NOT NULL,
  sports              text,
  organization        text,
  bio                 text,
  services_offered    text,
  contact_email       text,
  profile_photo_url   text,
  created_at          timestamptz DEFAULT now()
);

-- organizations: OrganizationHuddle profiles
CREATE TABLE IF NOT EXISTS organizations (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_user_id       uuid REFERENCES users_profile(id) ON DELETE SET NULL,
  organization_name   text NOT NULL,
  sport               text,
  website_url         text,
  contact_email       text,
  description         text,
  logo_url            text,
  created_at          timestamptz DEFAULT now()
);

-- facilities: FacilityHuddle profiles
CREATE TABLE IF NOT EXISTS facilities (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_user_id       uuid REFERENCES users_profile(id) ON DELETE SET NULL,
  facility_name       text NOT NULL,
  address             text,
  sports_supported    text,
  booking_url         text,
  contact_email       text,
  description         text,
  logo_url            text,
  created_at          timestamptz DEFAULT now()
);


-- ============================================================
-- CONTENT TABLES (5-Star Sports Media)
-- ============================================================

-- articles: full editorial articles
CREATE TABLE IF NOT EXISTS articles (
  id                      uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  title                   text NOT NULL,
  slug                    text UNIQUE,
  category                text,
  related_athlete_id      uuid REFERENCES athletes(id) ON DELETE SET NULL,
  related_coach_id        uuid REFERENCES coaches(id) ON DELETE SET NULL,
  related_organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  related_facility_id     uuid REFERENCES facilities(id) ON DELETE SET NULL,
  author_user_id          uuid REFERENCES users_profile(id) ON DELETE SET NULL,
  hero_image_url          text,
  excerpt                 text,
  body                    text,
  status                  text DEFAULT 'draft' CHECK (status IN ('draft','review','published','archived')),
  published_at            timestamptz,
  created_at              timestamptz DEFAULT now()
);

-- spotlights: existing 5-Star spotlight records
-- (already exists in production — this extends it)
CREATE TABLE IF NOT EXISTS spotlights (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  subject_name    text NOT NULL,
  spotlight_type  text CHECK (spotlight_type IN ('Athlete','Coach','Team','Organization','Legend','Facility')),
  school_or_org   text,
  sport           text,
  grade           text,
  subject_title   text,
  bio             text,
  quote           text,
  photo_url       text,
  photo_focus     text DEFAULT 'center 30%',
  stats           jsonb,
  article_id      uuid REFERENCES articles(id) ON DELETE SET NULL,
  related_athlete_id uuid REFERENCES athletes(id) ON DELETE SET NULL,
  featured        boolean DEFAULT false,
  published       boolean DEFAULT false,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

-- spotlight_submissions: public story submissions
CREATE TABLE IF NOT EXISTS spotlight_submissions (
  id                      uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  submitter_name          text,
  submitter_email         text,
  submitter_phone         text,
  story_type              text,
  nominee_name            text,
  sport                   text,
  school_or_organization  text,
  story_details           text,
  photo_url               text,
  permission_confirmed    boolean DEFAULT false,
  status                  text DEFAULT 'new' CHECK (status IN ('new','reviewing','approved','published','rejected')),
  created_at              timestamptz DEFAULT now()
);

-- game_scores: game results and coverage
CREATE TABLE IF NOT EXISTS game_scores (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  sport           text NOT NULL,
  age_group       text,
  home_team       text NOT NULL,
  away_team       text NOT NULL,
  home_score      integer,
  away_score      integer,
  game_date       date,
  location        text,
  recap           text,
  photo_url       text,
  related_org_id  uuid REFERENCES organizations(id) ON DELETE SET NULL,
  published       boolean DEFAULT false,
  created_at      timestamptz DEFAULT now()
);


-- ============================================================
-- EVENTS (cross-platform)
-- ============================================================

CREATE TABLE IF NOT EXISTS events (
  id                      uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  title                   text NOT NULL,
  sport                   text,
  event_type              text,
  organization_id         uuid REFERENCES organizations(id) ON DELETE SET NULL,
  facility_id             uuid REFERENCES facilities(id) ON DELETE SET NULL,
  start_datetime          timestamptz,
  end_datetime            timestamptz,
  location                text,
  description             text,
  homehuddle_visible      boolean DEFAULT true,
  sports_media_visible    boolean DEFAULT true,
  created_at              timestamptz DEFAULT now()
);


-- ============================================================
-- MONETIZATION TABLES
-- ============================================================

-- sponsors: active sponsor records
CREATE TABLE IF NOT EXISTS sponsors (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  sponsor_name    text NOT NULL,
  package_level   text DEFAULT 'standard' CHECK (package_level IN ('presenting','gold','silver','standard','ecosystem')),
  website_url     text,
  logo_url        text,
  banner_text     text,
  cta_text        text,
  cta_link        text,
  platform        text DEFAULT 'all',  -- 'all' or specific platform name
  active          boolean DEFAULT true,
  created_at      timestamptz DEFAULT now()
);

-- leads: all platform lead captures (shared across ecosystem)
CREATE TABLE IF NOT EXISTS leads (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name                text,
  email               text,
  phone               text,
  role                text,
  business_name       text,
  organization_name   text,
  platform_interest   text,
  source_platform     text,
  source_page         text,
  message             text,
  status              text DEFAULT 'new' CHECK (status IN ('new','contacted','qualified','converted','closed')),
  created_at          timestamptz DEFAULT now()
);

-- page_views: analytics (already in production — safe to skip if exists)
CREATE TABLE IF NOT EXISTS page_views (
  id              bigserial PRIMARY KEY,
  viewed_at       timestamptz DEFAULT now(),
  page            text,
  spotlight_id    text,
  spotlight_type  text,
  subject_name    text,
  sport           text,
  referrer        text,
  user_agent      text,
  session_id      text,
  city            text,
  region          text,
  country         text
);


-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_spotlights_published     ON spotlights(published) WHERE published = true;
CREATE INDEX IF NOT EXISTS idx_spotlights_type          ON spotlights(spotlight_type);
CREATE INDEX IF NOT EXISTS idx_spotlights_featured      ON spotlights(featured) WHERE featured = true;
CREATE INDEX IF NOT EXISTS idx_athletes_eligible        ON athletes(spotlight_eligible) WHERE spotlight_eligible = true;
CREATE INDEX IF NOT EXISTS idx_athletes_family          ON athletes(family_id);
CREATE INDEX IF NOT EXISTS idx_game_scores_published    ON game_scores(published, game_date DESC);
CREATE INDEX IF NOT EXISTS idx_articles_status          ON articles(status, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_created            ON leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_platform           ON leads(source_platform);
CREATE INDEX IF NOT EXISTS idx_page_views_viewed_at     ON page_views(viewed_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_start             ON events(start_datetime);
CREATE INDEX IF NOT EXISTS idx_sponsors_active          ON sponsors(active) WHERE active = true;


-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE users_profile           ENABLE ROW LEVEL SECURITY;
ALTER TABLE families                ENABLE ROW LEVEL SECURITY;
ALTER TABLE athletes                ENABLE ROW LEVEL SECURITY;
ALTER TABLE coaches                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations           ENABLE ROW LEVEL SECURITY;
ALTER TABLE facilities              ENABLE ROW LEVEL SECURITY;
ALTER TABLE articles                ENABLE ROW LEVEL SECURITY;
ALTER TABLE spotlights              ENABLE ROW LEVEL SECURITY;
ALTER TABLE spotlight_submissions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_scores             ENABLE ROW LEVEL SECURITY;
ALTER TABLE events                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE sponsors                ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE page_views              ENABLE ROW LEVEL SECURITY;

-- ── Public read access (published/active records) ────────────
CREATE POLICY "public_read_spotlights"  ON spotlights  FOR SELECT TO anon USING (published = true);
CREATE POLICY "public_read_articles"    ON articles    FOR SELECT TO anon USING (status = 'published');
CREATE POLICY "public_read_game_scores" ON game_scores FOR SELECT TO anon USING (published = true);
CREATE POLICY "public_read_sponsors"    ON sponsors    FOR SELECT TO anon USING (active = true);
CREATE POLICY "public_read_events"      ON events      FOR SELECT TO anon USING (sports_media_visible = true);
CREATE POLICY "public_read_athletes"    ON athletes    FOR SELECT TO anon USING (spotlight_eligible = true);
CREATE POLICY "public_read_coaches"     ON coaches     FOR SELECT TO anon;
CREATE POLICY "public_read_orgs"        ON organizations FOR SELECT TO anon;
CREATE POLICY "public_read_facilities"  ON facilities  FOR SELECT TO anon;

-- ── Anonymous inserts (lead capture, page views, submissions) ─
CREATE POLICY "anon_insert_leads"          ON leads                 FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_insert_page_views"     ON page_views            FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_insert_submissions"    ON spotlight_submissions  FOR INSERT TO anon WITH CHECK (true);

-- ── Authenticated users: read own data ───────────────────────
CREATE POLICY "auth_read_own_profile"   ON users_profile  FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "auth_update_own_profile" ON users_profile  FOR UPDATE TO authenticated USING (id = auth.uid());
CREATE POLICY "auth_read_own_family"    ON families       FOR SELECT TO authenticated USING (parent_user_id = auth.uid());
CREATE POLICY "auth_read_all_leads"     ON leads          FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read_all_views"     ON page_views     FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read_submissions"   ON spotlight_submissions FOR SELECT TO authenticated USING (true);

-- ── Admins: full access (set role in auth.users app_metadata) ─
CREATE POLICY "admin_all_spotlights"    ON spotlights     FOR ALL TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role') = 'admin');
CREATE POLICY "admin_all_articles"      ON articles       FOR ALL TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role') = 'admin');
CREATE POLICY "admin_all_game_scores"   ON game_scores    FOR ALL TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role') = 'admin');
CREATE POLICY "admin_all_sponsors"      ON sponsors       FOR ALL TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role') = 'admin');


-- ============================================================
-- HELPER VIEWS
-- ============================================================

-- v_published_spotlights: quick access for 5-Star pages
CREATE OR REPLACE VIEW v_published_spotlights AS
SELECT
  s.*,
  a.athlete_name,
  a.achievements,
  a.graduation_year
FROM spotlights s
LEFT JOIN athletes a ON a.id = s.related_athlete_id
WHERE s.published = true
ORDER BY s.created_at DESC;

-- v_spotlight_eligible_athletes: athletes ready for media coverage
CREATE OR REPLACE VIEW v_spotlight_eligible_athletes AS
SELECT
  a.*,
  f.family_name,
  up.email AS parent_email
FROM athletes a
LEFT JOIN families f ON f.id = a.family_id
LEFT JOIN users_profile up ON up.id = f.parent_user_id
WHERE a.spotlight_eligible = true
ORDER BY a.created_at DESC;

-- v_active_sponsors: sponsors ready to display
CREATE OR REPLACE VIEW v_active_sponsors AS
SELECT * FROM sponsors WHERE active = true ORDER BY
  CASE package_level
    WHEN 'presenting' THEN 1
    WHEN 'ecosystem'  THEN 2
    WHEN 'gold'       THEN 3
    WHEN 'silver'     THEN 4
    ELSE 5
  END,
  created_at ASC;

-- v_recent_leads: lead dashboard view
CREATE OR REPLACE VIEW v_recent_leads AS
SELECT
  id, name, email, phone, role,
  platform_interest, source_platform, source_page,
  status, created_at
FROM leads
ORDER BY created_at DESC;


-- ============================================================
-- TRIGGERS: updated_at auto-maintenance
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_profile_updated_at
  BEFORE UPDATE ON users_profile
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_spotlights_updated_at
  BEFORE UPDATE ON spotlights
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ============================================================
-- SEED DATA: Default Venuewise sponsor slot
-- ============================================================

INSERT INTO sponsors (sponsor_name, package_level, website_url, banner_text, cta_text, cta_link, platform, active)
VALUES (
  'Venuewise Ecosystem',
  'ecosystem',
  'https://venuewise.net',
  'Manage your sports life in one place — schedules, profiles, bookings, and more.',
  'Explore Venuewise',
  'https://venuewise.net',
  'all',
  true
) ON CONFLICT DO NOTHING;
