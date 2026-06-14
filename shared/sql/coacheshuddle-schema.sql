-- ============================================================
-- CoachesHuddle Schema
-- /shared/sql/coacheshuddle-schema.sql
-- Run in Supabase SQL Editor
-- ============================================================

-- ── coaches table (extended from ecosystem schema) ──────────
-- Drop and recreate with full spec fields
-- Safe to run: uses ALTER TABLE ADD COLUMN IF NOT EXISTS

ALTER TABLE coaches ADD COLUMN IF NOT EXISTS business_name text;
ALTER TABLE coaches ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE coaches ADD COLUMN IF NOT EXISTS website_url text;
ALTER TABLE coaches ADD COLUMN IF NOT EXISTS social_links text;
ALTER TABLE coaches ADD COLUMN IF NOT EXISTS specialty text;
ALTER TABLE coaches ADD COLUMN IF NOT EXISTS years_coaching text;
ALTER TABLE coaches ADD COLUMN IF NOT EXISTS certifications text;
ALTER TABLE coaches ADD COLUMN IF NOT EXISTS playing_background text;
ALTER TABLE coaches ADD COLUMN IF NOT EXISTS coaching_background text;
ALTER TABLE coaches ADD COLUMN IF NOT EXISTS coaching_philosophy text;
ALTER TABLE coaches ADD COLUMN IF NOT EXISTS services_offered text;
ALTER TABLE coaches ADD COLUMN IF NOT EXISTS age_groups_served text;
ALTER TABLE coaches ADD COLUMN IF NOT EXISTS locations_served text;
ALTER TABLE coaches ADD COLUMN IF NOT EXISTS pricing_notes text;
ALTER TABLE coaches ADD COLUMN IF NOT EXISTS availability_notes text;
ALTER TABLE coaches ADD COLUMN IF NOT EXISTS gallery_photos text;
ALTER TABLE coaches ADD COLUMN IF NOT EXISTS logo_url text;
ALTER TABLE coaches ADD COLUMN IF NOT EXISTS best_contact_method text;
ALTER TABLE coaches ADD COLUMN IF NOT EXISTS accepting_new_athletes boolean DEFAULT true;
ALTER TABLE coaches ADD COLUMN IF NOT EXISTS coach_spotlight_eligible boolean DEFAULT false;
ALTER TABLE coaches ADD COLUMN IF NOT EXISTS coach_spotlight_status text DEFAULT 'not_submitted';
ALTER TABLE coaches ADD COLUMN IF NOT EXISTS profile_status text DEFAULT 'draft';
ALTER TABLE coaches ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- ── coach_spotlight_submissions ──────────────────────────────
CREATE TABLE IF NOT EXISTS coach_spotlight_submissions (
  id                    uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  coach_id              uuid REFERENCES coaches(id) ON DELETE SET NULL,
  coach_name            text,
  business_name         text,
  email                 text,
  phone                 text,
  sports                text,
  reason_for_feature    text,
  athlete_impact        text,
  coaching_style        text,
  favorite_memory       text,
  advice_to_athletes    text,
  advice_to_parents     text,
  photo_url             text,
  permission_confirmed  boolean DEFAULT false,
  status                text DEFAULT 'new',
  assigned_reporter_id  uuid,
  interview_completed   boolean DEFAULT false,
  article_id            uuid,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);

-- ── coach_leads (extends shared leads with coach_id) ─────────
ALTER TABLE leads ADD COLUMN IF NOT EXISTS coach_id uuid REFERENCES coaches(id) ON DELETE SET NULL;

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE coach_spotlight_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "anon_insert_coach_spotlight"
  ON coach_spotlight_submissions FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "anon_read_coaches_public"
  ON coaches FOR SELECT TO anon USING (profile_status = 'published');

CREATE POLICY IF NOT EXISTS "auth_read_coach_submissions"
  ON coach_spotlight_submissions FOR SELECT TO authenticated USING (true);

-- ── Indexes ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_coaches_spotlight
  ON coaches(coach_spotlight_eligible, coach_spotlight_status);
CREATE INDEX IF NOT EXISTS idx_coaches_sports ON coaches(sports);
CREATE INDEX IF NOT EXISTS idx_coaches_status ON coaches(profile_status);
CREATE INDEX IF NOT EXISTS idx_coach_submissions_status
  ON coach_spotlight_submissions(status);

-- ── updated_at trigger ────────────────────────────────────────
CREATE TRIGGER trg_coaches_updated_at
  BEFORE UPDATE ON coaches
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_coach_spotlight_updated_at
  BEFORE UPDATE ON coach_spotlight_submissions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

