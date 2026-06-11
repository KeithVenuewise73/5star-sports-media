/* ============================================================
   5-Star Sports Media — Supabase Client
   assets/js/supabase.js

   SETUP:
   1. Go to your Supabase project → Settings → API
   2. Copy "Project URL" and "anon public" key
   3. Replace the two values below
   ============================================================ */

const SUPABASE_URL  = 'https://urwnbskrtoplgnkkxuvl.supabase.co';   // e.g. https://urwnbskrtoplgnkkxuvl.supabase.co
const SUPABASE_ANON = 'sb_publishable_NnATRFU2t1ATOHR07mFLoQ_ptkdjGDT';

/* ── Lightweight fetch wrapper (no SDK needed) ──────────────
   Uses the Supabase REST API directly so no npm or build
   step is required — works with plain static HTML files.     */

async function sbFetch(table, params = {}) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);

  // Build query string from params object
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const res = await fetch(url.toString(), {
    headers: {
      'apikey':        SUPABASE_ANON,
      'Authorization': `Bearer ${SUPABASE_ANON}`,
      'Content-Type':  'application/json',
    }
  });

  if (!res.ok) {
    console.error(`Supabase fetch error [${table}]:`, res.status, await res.text());
    return [];
  }
  return res.json();
}

async function sbInsert(table, data) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method:  'POST',
    headers: {
      'apikey':        SUPABASE_ANON,
      'Authorization': `Bearer ${SUPABASE_ANON}`,
      'Content-Type':  'application/json',
      'Prefer':        'return=minimal',
    },
    body: JSON.stringify(data),
  });
  return res.ok;
}


/* ============================================================
   DATA FUNCTIONS — one per content type
   Each returns an array ready to render.
   ============================================================ */


/* ── SPONSORS ───────────────────────────────────────────────
   Used by: sponsor ticker, sponsor banner, sponsors.html     */
async function fetchSponsors() {
  return sbFetch('sponsors', {
    select:  '*',
    active:  'eq.true',
    order:   'display_order.asc',
  });
}

async function fetchSponsorForPage(page) {
  // Returns the best sponsor for a given page name
  // Falls back to any active non-presenting sponsor
  const all = await fetchSponsors();
  const match = all.find(s =>
    s.banner_pages && s.banner_pages.includes(page) && s.package_level !== 'presenting'
  );
  return match || all.find(s => s.package_level !== 'presenting') || all[0];
}


/* ── GAME SCORES ────────────────────────────────────────────
   Used by: game-coverage.html, homepage score cards          */
async function fetchRecentScores(limit = 6) {
  return sbFetch('game_scores', {
    select:    '*',
    published: 'eq.true',
    status:    'eq.final',
    order:     'game_date.desc',
    limit:     limit,
  });
}

async function fetchUpcomingGames(limit = 4) {
  return sbFetch('game_scores', {
    select:    '*',
    published: 'eq.true',
    status:    'eq.upcoming',
    order:     'game_date.asc',
    limit:     limit,
  });
}

async function fetchScoresBySport(sport, limit = 10) {
  return sbFetch('game_scores', {
    select:    '*',
    published: 'eq.true',
    sport:     `eq.${sport}`,
    order:     'game_date.desc',
    limit:     limit,
  });
}


/* ── ARTICLES ───────────────────────────────────────────────
   Used by: all spotlight pages, homepage featured story      */
async function fetchFeaturedArticle() {
  const rows = await sbFetch('articles', {
    select:   '*',
    published: 'eq.true',
    featured:  'eq.true',
    order:    'published_at.desc',
    limit:    1,
  });
  return rows[0] || null;
}

async function fetchArticlesByType(type, limit = 6) {
  return sbFetch('articles', {
    select:       '*',
    published:    'eq.true',
    article_type: `eq.${type}`,
    order:        'published_at.desc',
    limit:        limit,
  });
}

async function fetchArticleBySlug(slug) {
  const rows = await sbFetch('articles', {
    select:    '*',
    published: 'eq.true',
    slug:      `eq.${slug}`,
    limit:     1,
  });
  return rows[0] || null;
}


/* ── SPOTLIGHTS ─────────────────────────────────────────────
   Used by: athlete-spotlight.html, coach-spotlight.html,
            team-spotlight.html, homepage cards              */
async function fetchFeaturedSpotlight(type) {
  const rows = await sbFetch('spotlights', {
    select:         '*',
    published:      'eq.true',
    featured:       'eq.true',
    spotlight_type: `eq.${type}`,
    order:          'display_order.asc',
    limit:          1,
  });
  return rows[0] || null;
}

async function fetchSpotlights(type, limit = 6) {
  return sbFetch('spotlights', {
    select:         '*',
    published:      'eq.true',
    spotlight_type: `eq.${type}`,
    order:          'display_order.asc,created_at.desc',
    limit:          limit,
  });
}


/* ── LEGENDS ────────────────────────────────────────────────
   Used by: legends-spotlight.html, homepage                  */
async function fetchLegends(limit = 6) {
  return sbFetch('legends', {
    select:    '*',
    published: 'eq.true',
    order:     'display_order.asc,created_at.desc',
    limit:     limit,
  });
}

async function fetchFeaturedLegend() {
  const rows = await sbFetch('legends', {
    select:    '*',
    published: 'eq.true',
    featured:  'eq.true',
    order:     'display_order.asc',
    limit:     1,
  });
  return rows[0] || null;
}


/* ── ORGANIZATIONS ──────────────────────────────────────────
   Used by: organization-spotlight.html                       */
async function fetchOrganizations(limit = 6) {
  return sbFetch('organizations', {
    select:    '*',
    published: 'eq.true',
    order:     'featured.desc,name.asc',
    limit:     limit,
  });
}


/* ── ATHLETES (from existing table) ────────────────────────
   Reads from your existing HomeHuddle athletes table         */
async function fetchAthleteById(id) {
  const rows = await sbFetch('athletes', {
    select: 'id,name,sport,position,school,grad_year,bio,photo_url',
    id:     `eq.${id}`,
    limit:  1,
  });
  return rows[0] || null;
}

async function fetchAthleteWithStats(athleteId) {
  const [athlete, sports, stats] = await Promise.all([
    fetchAthleteById(athleteId),
    sbFetch('athlete_sports', { athlete_id: `eq.${athleteId}`, select: '*' }),
    sbFetch('athlete_stats',  { athlete_id: `eq.${athleteId}`, select: '*', order: 'season.desc', limit: 3 }),
  ]);
  return { ...athlete, sports, stats };
}


/* ============================================================
   RENDER HELPERS
   Drop-in functions that generate HTML strings from data.
   Call these inside your page scripts.
   ============================================================ */

function renderScoreCard(score) {
  const date = new Date(score.game_date).toLocaleDateString('en-US', { month:'short', day:'numeric' });
  const winner = score.home_score > score.away_score ? 'home' : score.away_score > score.home_score ? 'away' : 'tie';
  return `
<div class="score-card">
  <div class="score-sport">${score.sport}${score.age_group ? ' · ' + score.age_group : ''}</div>
  <div class="score-teams">
    <div class="score-team ${winner === 'home' ? 'score-winner' : ''}">
      <span class="score-team-name">${score.home_team}</span>
      <span class="score-num">${score.home_score ?? '–'}</span>
    </div>
    <div class="score-team ${winner === 'away' ? 'score-winner' : ''}">
      <span class="score-team-name">${score.away_team}</span>
      <span class="score-num">${score.away_score ?? '–'}</span>
    </div>
  </div>
  ${score.location ? `<div class="score-meta">${score.location}</div>` : ''}
  <div class="score-meta">${date} · <span class="score-status">${score.status}</span></div>
  ${score.recap ? `<div class="score-recap">${score.recap}</div>` : ''}
</div>`;
}

function renderSpotlightCard(s) {
  return `
<div class="spotlight-card">
  <div class="spotlight-photo">
    ${s.photo_url
      ? `<img src="${s.photo_url}" alt="${s.subject_name}" loading="lazy">`
      : imgPlaceholder(s.subject_name)}
  </div>
  <div class="spotlight-body">
    <div class="card-sport">${s.sport || ''}${s.school_or_org ? ' · ' + s.school_or_org : ''}</div>
    <div class="card-name">${s.subject_name}</div>
    ${s.subject_title ? `<div class="card-detail" style="color:var(--gold);font-size:0.78rem;margin-bottom:0.4rem;">${s.subject_title}</div>` : ''}
    ${s.quote ? `<div class="card-detail">"${s.quote}"</div>` : ''}
    ${s.article_id ? `<a href="article.html?id=${s.article_id}" class="btn-sm" style="margin-top:0.75rem;display:inline-block;">Read Story →</a>` : ''}
  </div>
</div>`;
}

function renderLegendCard(l) {
  return `
<div class="legend-card card">
  <div class="card-sport">${l.sport_played} → ${l.career_now}</div>
  ${l.photo_url ? `<img src="${l.photo_url}" alt="${l.name}" loading="lazy" style="width:100%;height:80px;object-fit:cover;border-radius:3px;margin-bottom:8px;">` : ''}
  <div class="card-name">${l.name}</div>
  ${l.career_detail ? `<div class="card-detail">${l.career_detail}</div>` : ''}
  ${l.quote ? `<div class="card-detail" style="font-style:italic;margin-top:6px;">"${l.quote}"</div>` : ''}
  ${l.article_id ? `<a href="article.html?id=${l.article_id}" class="btn-sm" style="margin-top:0.75rem;display:inline-block;">Read Story →</a>` : ''}
</div>`;
}

function renderArticleCard(a) {
  const date = a.published_at
    ? new Date(a.published_at).toLocaleDateString('en-US', { month:'long', day:'numeric', year:'numeric' })
    : '';
  return `
<div class="featured-card card">
  ${a.cover_photo_url
    ? `<img src="${a.cover_photo_url}" alt="${a.title}" loading="lazy" style="width:100%;height:140px;object-fit:cover;border-radius:3px;margin-bottom:10px;">`
    : `<div class="img-placeholder" style="height:100px;">${imgPlaceholder()}</div>`}
  <div class="card-sport">${(a.article_type || '').replace(/_/g,' ')}${a.sport ? ' · ' + a.sport : ''}</div>
  <div class="card-name" style="font-family:var(--font-display);font-size:1.1rem;">${a.title}</div>
  ${a.excerpt ? `<div class="card-detail">${a.excerpt}</div>` : ''}
  ${date ? `<div class="card-detail" style="margin-top:6px;font-size:0.75rem;">${date}</div>` : ''}
  <a href="article.html?slug=${a.slug}" class="btn-sm" style="margin-top:0.75rem;display:inline-block;">Read Story →</a>
</div>`;
}

function renderSponsorTicker(sponsors) {
  if (!sponsors.length) return;
  const ticker = document.getElementById('sponsorTicker');
  if (!ticker) return;
  let current = 0;
  const slides = sponsors.map(s => {
    const div = document.createElement('div');
    div.className = 'sponsor-slide';
    div.innerHTML = `
      <div class="sponsor-info">
        <span class="sponsor-badge ${s.package_level}">${s.package_level}</span>
        <span class="sponsor-name">${s.sponsor_name}</span>
        <span class="sponsor-text">${s.ticker_text || s.tagline || ''}</span>
      </div>
      <a href="${s.cta_url || '#'}" class="sponsor-cta" target="_blank">${s.cta_text || 'Learn More'}</a>`;
    return div;
  });
  ticker.innerHTML = '';
  ticker.append(...slides);
  slides[0].classList.add('active');
  setInterval(() => {
    slides[current].classList.remove('active');
    current = (current + 1) % slides.length;
    slides[current].classList.add('active');
  }, 7000);
}


/* ============================================================
   FORM SUBMISSION
   Called by submit-story.html and contact.html
   ============================================================ */

async function submitStoryForm(formData) {
  const ok = await sbInsert('story_submissions', {
    submitter_name:  formData.get('name'),
    submitter_email: formData.get('email'),
    submitter_phone: formData.get('phone') || null,
    story_type:      formData.get('storyType') || formData.get('reason') || 'other',
    subject_name:    formData.get('subjectName') || null,
    sport:           formData.get('sport') || null,
    school_or_org:   formData.get('schoolOrg') || null,
    story_details:   formData.get('storyDetails') || formData.get('message'),
    has_photos:      formData.get('hasPhotos') === 'on',
    permission:      formData.get('permission') === 'on',
  });
  return ok;
}
