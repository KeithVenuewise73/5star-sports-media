-- ============================================================
-- 5-Star Sports Media V2 Schema
-- Podcast, Video, Photo Gallery
-- ============================================================

-- ── PODCAST ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS podcast_episodes (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  title               text,
  slug                text UNIQUE,
  guest_name          text,
  guest_photo_url     text,
  category            text DEFAULT 'general',
  episode_number      integer,
  duration            text,
  publish_date        date,
  summary             text,
  key_takeaways       text,
  audio_url           text,
  youtube_url         text,
  video_thumbnail     text,
  spotify_url         text,
  apple_url           text,
  athlete_id          uuid,
  coach_id            uuid,
  organization_id     uuid,
  spotlight_id        uuid,
  featured            boolean DEFAULT false,
  status              text DEFAULT 'draft',
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

-- ── VIDEOS ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS videos (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  title               text,
  slug                text,
  description         text,
  youtube_url         text,
  video_thumbnail     text,
  video_duration      text,
  video_category      text DEFAULT 'interview',
  video_views         integer DEFAULT 0,
  featured            boolean DEFAULT false,
  athlete_id          uuid,
  coach_id            uuid,
  organization_id     uuid,
  spotlight_id        uuid,
  episode_id          uuid,
  publish_date        date,
  status              text DEFAULT 'published',
  created_at          timestamptz DEFAULT now()
);

-- ── PHOTO GALLERIES ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS photo_galleries (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  title               text,
  sport               text,
  event_name          text,
  team_1              text,
  team_2              text,
  final_score         text,
  event_date          date,
  location_name       text,
  organization_id     uuid,
  photographer_name   text,
  photographer_user_id uuid,
  description         text,
  cover_photo_url     text,
  photo_count         integer DEFAULT 0,
  status              text DEFAULT 'pending',
  tags                text,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS game_day_photos (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  gallery_id          uuid REFERENCES photo_galleries(id) ON DELETE CASCADE,
  photo_url           text,
  caption             text,
  athlete_tags        text,
  coach_tags          text,
  organization_tags   text,
  team_tags           text,
  game_event_tags     text,
  photographer_credit text,
  approval_status     text DEFAULT 'pending',
  featured            boolean DEFAULT false,
  created_at          timestamptz DEFAULT now()
);

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE podcast_episodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE photo_galleries ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_day_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_read_podcast" ON podcast_episodes FOR SELECT TO anon USING (status = 'published');
CREATE POLICY "anon_read_videos" ON videos FOR SELECT TO anon USING (status = 'published');
CREATE POLICY "anon_read_galleries" ON photo_galleries FOR SELECT TO anon USING (status = 'published');
CREATE POLICY "anon_read_photos" ON game_day_photos FOR SELECT TO anon USING (approval_status = 'approved');
CREATE POLICY "anon_insert_galleries" ON photo_galleries FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_insert_photos" ON game_day_photos FOR INSERT TO anon WITH CHECK (true);

-- ── Indexes ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_podcast_status ON podcast_episodes(status, publish_date);
CREATE INDEX IF NOT EXISTS idx_podcast_featured ON podcast_episodes(featured);
CREATE INDEX IF NOT EXISTS idx_podcast_category ON podcast_episodes(category);
CREATE INDEX IF NOT EXISTS idx_videos_status ON videos(status);
CREATE INDEX IF NOT EXISTS idx_videos_featured ON videos(featured);
CREATE INDEX IF NOT EXISTS idx_galleries_status ON photo_galleries(status);
CREATE INDEX IF NOT EXISTS idx_galleries_sport ON photo_galleries(sport);
CREATE INDEX IF NOT EXISTS idx_photos_gallery ON game_day_photos(gallery_id);
CREATE INDEX IF NOT EXISTS idx_photos_approval ON game_day_photos(approval_status);
