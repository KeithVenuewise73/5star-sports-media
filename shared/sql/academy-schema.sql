-- ============================================================
-- 5-Star Sports Media Academy — Database Schema
-- /shared/sql/academy-schema.sql
--
-- Run this in Supabase SQL Editor after the main ecosystem schema.
-- Safe to re-run — uses CREATE TABLE IF NOT EXISTS throughout.
-- ============================================================

-- ── Academy Applications ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS academy_applications (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_first_name   text NOT NULL,
  student_last_name    text NOT NULL,
  student_age          integer,
  grade_level          text,
  school               text,
  student_email        text,
  student_phone        text,
  parent_name          text,
  parent_email         text,
  parent_phone         text,
  interest_area        text,
  sports_interested    text,
  prior_experience     text,
  reason_for_joining   text,
  availability         text,
  transportation       text,
  camera_access        text,
  consent_acknowledged boolean DEFAULT false,
  status               text DEFAULT 'new',
  created_at           timestamptz DEFAULT now()
);

-- ── Parent/Guardian Permissions ───────────────────────────────
CREATE TABLE IF NOT EXISTS academy_parent_permissions (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_name                text NOT NULL,
  student_name               text NOT NULL,
  email                      text,
  phone                      text,
  permission_confirmed       boolean DEFAULT false,
  media_permission_confirmed boolean DEFAULT false,
  emergency_contact          text,
  notes                      text,
  created_at                 timestamptz DEFAULT now()
);

-- ── Mentor Inquiries ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS academy_mentor_inquiries (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text NOT NULL,
  email          text,
  phone          text,
  background     text,
  expertise_area text,
  help_interest  text,
  availability   text,
  message        text,
  status         text DEFAULT 'new',
  created_at     timestamptz DEFAULT now()
);

-- ── Assignments ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS academy_assignments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title               text NOT NULL,
  assignment_type     text,
  sport               text,
  event_name          text,
  location            text,
  assignment_date     date,
  assigned_student_id uuid,
  mentor_id           uuid,
  status              text DEFAULT 'assigned',
  notes               text,
  created_at          timestamptz DEFAULT now()
);

-- ── Submissions ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS academy_submissions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id      uuid REFERENCES academy_assignments(id) ON DELETE SET NULL,
  student_name       text,
  submission_type    text,
  title              text,
  body               text,
  photo_url          text,
  video_url          text,
  status             text DEFAULT 'submitted',
  mentor_feedback    text,
  published_article_id uuid,
  created_at         timestamptz DEFAULT now()
);

-- ── RLS ───────────────────────────────────────────────────────
ALTER TABLE academy_applications         ENABLE ROW LEVEL SECURITY;
ALTER TABLE academy_parent_permissions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE academy_mentor_inquiries     ENABLE ROW LEVEL SECURITY;
ALTER TABLE academy_assignments          ENABLE ROW LEVEL SECURITY;
ALTER TABLE academy_submissions          ENABLE ROW LEVEL SECURITY;

-- Anonymous can submit applications, permissions, and mentor inquiries
CREATE POLICY "anon_insert_applications"  ON academy_applications       FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_insert_permissions"   ON academy_parent_permissions  FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_insert_mentors"       ON academy_mentor_inquiries    FOR INSERT TO anon WITH CHECK (true);

-- Authenticated (admin) can read everything
CREATE POLICY "auth_read_applications"    ON academy_applications       FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read_permissions"     ON academy_parent_permissions  FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read_mentors"         ON academy_mentor_inquiries    FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read_assignments"     ON academy_assignments         FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_all_submissions"      ON academy_submissions         FOR ALL    TO authenticated USING (true);

-- Students can read their own assignments (once auth is implemented)
CREATE POLICY "anon_read_assignments"     ON academy_assignments         FOR SELECT TO anon USING (true);

-- ── Indexes ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_academy_apps_status    ON academy_applications(status);
CREATE INDEX IF NOT EXISTS idx_academy_apps_created   ON academy_applications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_academy_mentors_status ON academy_mentor_inquiries(status);
CREATE INDEX IF NOT EXISTS idx_academy_assign_date    ON academy_assignments(assignment_date);
CREATE INDEX IF NOT EXISTS idx_academy_sub_status     ON academy_submissions(status);
