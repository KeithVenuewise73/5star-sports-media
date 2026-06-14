-- ============================================================
-- OrganizationHuddle Phase 1 — Relationship Tables
-- ============================================================

-- Link coaches to organizations
CREATE TABLE IF NOT EXISTS organization_coaches (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id uuid,
  coach_id        uuid,
  position        text,
  sport           text,
  display_order   integer DEFAULT 0,
  created_at      timestamptz DEFAULT now()
);

-- Link athletes to organizations  
CREATE TABLE IF NOT EXISTS organization_athletes (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id uuid,
  athlete_name    text,
  athlete_age     text,
  sport           text,
  position        text,
  team            text,
  accomplishments text,
  photo_url       text,
  athlete_id      uuid,
  display_order   integer DEFAULT 0,
  created_at      timestamptz DEFAULT now()
);

-- Organization events
CREATE TABLE IF NOT EXISTS organization_events (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id uuid,
  title           text,
  event_type      text DEFAULT 'event',
  description     text,
  event_date      date,
  event_time      text,
  end_time        text,
  location_name   text,
  location_address text,
  registration_url text,
  capacity        integer,
  price           numeric(10,2),
  status          text DEFAULT 'active',
  created_at      timestamptz DEFAULT now()
);

-- Add org_id to coaches table for automatic linking
ALTER TABLE coaches ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE coaches ADD COLUMN IF NOT EXISTS organization_name text;

-- RLS
ALTER TABLE organization_coaches ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_athletes ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_read_org_coaches" ON organization_coaches FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert_org_coaches" ON organization_coaches FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_read_org_athletes" ON organization_athletes FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert_org_athletes" ON organization_athletes FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_read_org_events" ON organization_events FOR SELECT TO anon USING (status = 'active');
CREATE POLICY "anon_insert_org_events" ON organization_events FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_update_org_events" ON organization_events FOR UPDATE TO anon USING (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_org_coaches_org ON organization_coaches(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_athletes_org ON organization_athletes(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_events_org ON organization_events(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_events_date ON organization_events(event_date);
CREATE INDEX IF NOT EXISTS idx_coaches_org ON coaches(organization_id);
