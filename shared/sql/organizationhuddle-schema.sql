-- ============================================================
-- OrganizationHuddle Schema
-- /shared/sql/organizationhuddle-schema.sql
-- ============================================================

CREATE TABLE organizations (
  id                              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_user_id                   uuid,
  organization_name               text,
  sports                          text,
  organization_type               text,
  primary_contact_name            text,
  contact_email                   text,
  contact_phone                   text,
  website_url                     text,
  registration_url                text,
  social_links                    text,
  city                            text,
  state                           text,
  service_area                    text,
  founded_year                    text,
  athletes_served                 text,
  age_groups_served               text,
  teams_programs_offered          text,
  mission_statement               text,
  organization_description        text,
  values_development_philosophy   text,
  notable_achievements            text,
  community_impact                text,
  tryout_information              text,
  pricing_notes                   text,
  facilities_used                 text,
  coaches_staff                   text,
  logo_url                        text,
  gallery_photos                  text,
  accepting_new_athletes          boolean DEFAULT true,
  organization_spotlight_eligible boolean DEFAULT false,
  organization_spotlight_status   text DEFAULT 'not_submitted',
  profile_status                  text DEFAULT 'draft',
  created_at                      timestamptz DEFAULT now(),
  updated_at                      timestamptz DEFAULT now()
);

CREATE TABLE organization_spotlight_submissions (
  id                      uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id         uuid,
  organization_name       text,
  primary_contact_name    text,
  email                   text,
  phone                   text,
  sports                  text,
  reason_for_feature      text,
  unique_value            text,
  athlete_family_impact   text,
  development_philosophy  text,
  proudest_accomplishments text,
  future_goals            text,
  logo_url                text,
  photos_url              text,
  permission_confirmed    boolean DEFAULT false,
  status                  text DEFAULT 'new',
  assigned_reporter_id    uuid,
  interview_completed     boolean DEFAULT false,
  article_id              uuid,
  created_at              timestamptz DEFAULT now(),
  updated_at              timestamptz DEFAULT now()
);

-- Add org_id to leads
ALTER TABLE leads ADD COLUMN IF NOT EXISTS organization_id uuid;

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_spotlight_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_insert_orgs" ON organizations FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_read_orgs" ON organizations FOR SELECT TO anon USING (true);
CREATE POLICY "anon_update_orgs" ON organizations FOR UPDATE TO anon USING (true);
CREATE POLICY "anon_insert_org_spotlight" ON organization_spotlight_submissions FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_read_org_spotlight" ON organization_spotlight_submissions FOR SELECT TO anon USING (true);

CREATE INDEX IF NOT EXISTS idx_orgs_sport ON organizations(sports);
CREATE INDEX IF NOT EXISTS idx_orgs_type ON organizations(organization_type);
CREATE INDEX IF NOT EXISTS idx_orgs_status ON organizations(profile_status);
CREATE INDEX IF NOT EXISTS idx_orgs_spotlight ON organizations(organization_spotlight_eligible, organization_spotlight_status);
CREATE INDEX IF NOT EXISTS idx_org_submissions_status ON organization_spotlight_submissions(status);
