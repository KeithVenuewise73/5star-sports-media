-- ============================================================
-- 5-Star Sports Media — CMS & Interview System Schema
-- /shared/sql/cms-schema.sql
-- Run in Supabase SQL Editor
-- ============================================================

-- ── Athlete Spotlight Submissions ─────────────────────────────
CREATE TABLE IF NOT EXISTS athlete_spotlight_submissions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_name        text NOT NULL,
  age                 text,
  school              text,
  graduation_year     text,
  sports              text,
  position            text,
  team_organization   text,
  parent_name         text,
  parent_email        text,
  parent_phone        text,
  athlete_email       text,
  city                text,
  achievements        text,
  awards              text,
  community_service   text,
  favorite_memory     text,
  future_goals        text,
  photo_url           text,
  additional_photos   text,
  why_feature         text,
  permission_confirmed boolean DEFAULT false,
  status              text DEFAULT 'new',
  assigned_reporter   text,
  interview_date      date,
  notes               text,
  created_at          timestamptz DEFAULT now()
);

-- ── Coach Spotlight Submissions ───────────────────────────────
CREATE TABLE IF NOT EXISTS coach_spotlight_submissions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_name          text NOT NULL,
  organization        text,
  sports_coached      text,
  years_coaching      text,
  email               text,
  phone               text,
  certifications      text,
  biography           text,
  coaching_philosophy text,
  community_impact    text,
  why_feature         text,
  photo_url           text,
  status              text DEFAULT 'new',
  assigned_reporter   text,
  interview_date      date,
  notes               text,
  created_at          timestamptz DEFAULT now()
);

-- ── Team Spotlight Submissions ────────────────────────────────
CREATE TABLE IF NOT EXISTS team_spotlight_submissions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_name           text NOT NULL,
  age_group           text,
  organization        text,
  coach               text,
  season_record       text,
  notable_achievements text,
  why_special         text,
  photo_url           text,
  status              text DEFAULT 'new',
  assigned_reporter   text,
  interview_date      date,
  notes               text,
  created_at          timestamptz DEFAULT now()
);

-- ── Organization Spotlight Submissions ────────────────────────
CREATE TABLE IF NOT EXISTS organization_spotlight_submissions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_name   text NOT NULL,
  sport               text,
  founded             text,
  location            text,
  website             text,
  mission             text,
  number_of_athletes  text,
  why_feature         text,
  logo_url            text,
  photos_url          text,
  status              text DEFAULT 'new',
  assigned_reporter   text,
  interview_date      date,
  notes               text,
  created_at          timestamptz DEFAULT now()
);

-- ── Facility Spotlight Submissions ────────────────────────────
CREATE TABLE IF NOT EXISTS facility_spotlight_submissions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_name       text NOT NULL,
  address             text,
  sports_supported    text,
  website             text,
  description         text,
  community_impact    text,
  programs_offered    text,
  why_feature         text,
  logo_url            text,
  photos_url          text,
  status              text DEFAULT 'new',
  assigned_reporter   text,
  interview_date      date,
  notes               text,
  created_at          timestamptz DEFAULT now()
);

-- ── Legends Spotlight Submissions ────────────────────────────
CREATE TABLE IF NOT EXISTS legends_spotlight_submissions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nominee_name        text NOT NULL,
  business_profession text,
  company             text,
  sports_played       text,
  community_involvement text,
  email               text,
  phone               text,
  why_feature         text,
  community_impact    text,
  photo_url           text,
  status              text DEFAULT 'new',
  assigned_reporter   text,
  interview_date      date,
  notes               text,
  created_at          timestamptz DEFAULT now()
);

-- ── Game Coverage Tips ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS game_coverage_tips (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submitter_name      text,
  submitter_email     text,
  submitter_phone     text,
  sport               text,
  teams               text,
  game_date           text,
  game_time           text,
  location            text,
  why_cover           text,
  contact_coach       text,
  status              text DEFAULT 'new',
  created_at          timestamptz DEFAULT now()
);

-- ── Interview Records ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS interview_records (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_type     text NOT NULL,
  submission_id       uuid NOT NULL,
  subject_name        text,
  reporter_name       text,
  interview_date      date,
  interview_location  text,
  status              text DEFAULT 'scheduled',
  packet_downloaded   boolean DEFAULT false,
  notes_uploaded      boolean DEFAULT false,
  draft_created       boolean DEFAULT false,
  article_id          uuid,
  created_at          timestamptz DEFAULT now()
);

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE athlete_spotlight_submissions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE coach_spotlight_submissions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_spotlight_submissions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_spotlight_submissions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE facility_spotlight_submissions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE legends_spotlight_submissions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_coverage_tips                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE interview_records                   ENABLE ROW LEVEL SECURITY;

-- Anonymous can submit
CREATE POLICY "anon_insert_athlete_subs"   ON athlete_spotlight_submissions      FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_insert_coach_subs"     ON coach_spotlight_submissions        FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_insert_team_subs"      ON team_spotlight_submissions         FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_insert_org_subs"       ON organization_spotlight_submissions FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_insert_facility_subs"  ON facility_spotlight_submissions     FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_insert_legends_subs"   ON legends_spotlight_submissions      FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_insert_game_tips"      ON game_coverage_tips                 FOR INSERT TO anon WITH CHECK (true);

-- Authenticated can read all
CREATE POLICY "auth_read_athlete_subs"    ON athlete_spotlight_submissions      FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read_coach_subs"      ON coach_spotlight_submissions        FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read_team_subs"       ON team_spotlight_submissions         FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read_org_subs"        ON organization_spotlight_submissions FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read_facility_subs"   ON facility_spotlight_submissions     FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read_legends_subs"    ON legends_spotlight_submissions      FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read_game_tips"       ON game_coverage_tips                 FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_all_interviews"       ON interview_records                  FOR ALL    TO authenticated USING (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_athlete_subs_status  ON athlete_spotlight_submissions(status);
CREATE INDEX IF NOT EXISTS idx_coach_subs_status    ON coach_spotlight_submissions(status);
CREATE INDEX IF NOT EXISTS idx_team_subs_status     ON team_spotlight_submissions(status);
CREATE INDEX IF NOT EXISTS idx_org_subs_status      ON organization_spotlight_submissions(status);
CREATE INDEX IF NOT EXISTS idx_facility_subs_status ON facility_spotlight_submissions(status);
CREATE INDEX IF NOT EXISTS idx_legends_subs_status  ON legends_spotlight_submissions(status);
CREATE INDEX IF NOT EXISTS idx_interview_type       ON interview_records(submission_type, status);
