/* ============================================================
   Venuewise Ecosystem — Shared Configuration
   /shared/config.js

   PUBLIC configuration only. Never store secrets here.
   This file is safe to commit to GitHub.
   ============================================================ */

const VENUEWISE_CONFIG = {

  /* ── Supabase (public/anon key only) ─────────────────────── */
  supabase: {
    url:     'https://urwnbskrtoplgnkkxuvl.supabase.co',
    anonKey: 'sb_publishable_NnATRFU2t1ATOHR07mFLoQ_ptkdjGDT',
  },

  /* ── Platform registry ───────────────────────────────────── */
  platforms: [
    {
      id:          'homehuddle',
      name:        'HomeHuddle',
      tagline:     'Family scheduling and calendar management.',
      url:         'https://homehuddle.com',
      color:       '#2563EB',
      icon:        '🏠',
      ctaLabel:    'Join HomeHuddle',
      ctaUrl:      'https://homehuddle.com/signup',
    },
    {
      id:          'athletehuddle',
      name:        'AthleteHuddle',
      tagline:     'Athlete profiles, achievements, and spotlight nominations.',
      url:         'https://athletehuddle.com',
      color:       '#D4AF37',
      icon:        '🏆',
      ctaLabel:    'Create Athlete Profile',
      ctaUrl:      'https://athletehuddle.com/signup',
    },
    {
      id:          'coacheshuddle',
      name:        'CoachesHuddle',
      tagline:     'Coach, trainer, and clinic promotion.',
      url:         'https://coacheshuddle.com',
      color:       '#059669',
      icon:        '📋',
      ctaLabel:    'Join CoachesHuddle',
      ctaUrl:      'https://coacheshuddle.com/signup',
    },
    {
      id:          'organizationhuddle',
      name:        'OrganizationHuddle',
      tagline:     'Team and organization management.',
      url:         'https://organizationhuddle.com',
      color:       '#7C3AED',
      icon:        '🏢',
      ctaLabel:    'Request Demo',
      ctaUrl:      'https://organizationhuddle.com/demo',
    },
    {
      id:          'facilityhuddle',
      name:        'FacilityHuddle',
      tagline:     'Facility promotion and open-slot visibility.',
      url:         'https://facilityhuddle.com',
      color:       '#DC2626',
      icon:        '🏟️',
      ctaLabel:    'Promote Your Facility',
      ctaUrl:      'https://facilityhuddle.com/signup',
    },
    {
      id:          '5starsportsmedia',
      name:        '5-Star Sports Media',
      tagline:     'Stories, scores, photos, and community recognition.',
      url:         'https://5starsportsmedia.com',
      color:       '#D4AF37',
      icon:        '⭐',
      ctaLabel:    'Read Stories',
      ctaUrl:      'https://5starsportsmedia.com',
    },
  ],

  /* ── User roles ──────────────────────────────────────────── */
  roles: [
    'parent',
    'athlete',
    'coach',
    'organization_admin',
    'facility_admin',
    'media_contributor',
    'sponsor',
    'admin',
  ],

  /* ── Role → redirect map ─────────────────────────────────── */
  roleRedirects: {
    parent:             'https://homehuddle.com/dashboard',
    athlete:            'https://athletehuddle.com/dashboard',
    coach:              'https://coacheshuddle.com/dashboard',
    organization_admin: 'https://organizationhuddle.com/dashboard',
    facility_admin:     'https://facilityhuddle.com/dashboard',
    media_contributor:  'https://5starsportsmedia.com/admin.html',
    sponsor:            'https://5starsportsmedia.com/sponsors.html',
    admin:              'https://5starsportsmedia.com/admin.html',
  },

  /* ── Platform interest options (for lead forms) ─────────── */
  platformInterests: [
    'HomeHuddle',
    'AthleteHuddle',
    'CoachesHuddle',
    'OrganizationHuddle',
    'FacilityHuddle',
    '5-Star Sports Media',
    '5-Star Growth Solutions',
    'Sponsor Inquiry',
  ],

  /* ── Branding ────────────────────────────────────────────── */
  brand: {
    name:       'Venuewise',
    url:        'https://venuewise.net',
    tagline:    'One connected ecosystem for sports families, athletes, coaches, organizations, facilities, and communities.',
    gold:       '#D4AF37',
    black:      '#0A0A0A',
    white:      '#FFFFFF',
  },
};

/* Make available globally */
if (typeof window !== 'undefined') window.VENUEWISE_CONFIG = VENUEWISE_CONFIG;
if (typeof module !== 'undefined') module.exports = VENUEWISE_CONFIG;
