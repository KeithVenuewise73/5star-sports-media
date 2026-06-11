/* ============================================================
   5-Star Sports Media — Page Loaders
   assets/js/loaders.js

   Each loader checks if Supabase is configured before running.
   If SUPABASE_URL is still the placeholder, it silently skips
   and the existing static HTML remains visible.
   ============================================================ */

const SB_READY = typeof SUPABASE_URL !== 'undefined' && !SUPABASE_URL.includes('YOUR_');

function sbReady() {
  if (!SB_READY) {
    console.info('5-Star: Supabase not yet configured — showing static content.');
    return false;
  }
  return true;
}

/* ── Shared: load live sponsor ticker ──────────────────────── */
async function loadSponsorTicker() {
  if (!sbReady()) return;
  const sponsors = await fetchSponsors();
  if (sponsors.length) renderSponsorTicker(sponsors);
}

/* ── Shared: update sponsor banner ─────────────────────────── */
async function loadSponsorBanner(pageName) {
  if (!sbReady()) return;
  const sponsor = await fetchSponsorForPage(pageName);
  if (!sponsor) return;
  const el = document.getElementById('sponsor-banner');
  if (!el) return;
  el.innerHTML = getSponsorBanner({
    tier: sponsor.package_level + ' Sponsor',
    name: sponsor.sponsor_name,
    copy: sponsor.tagline || '',
    cta:  sponsor.cta_text || 'Learn More',
    url:  sponsor.cta_url  || '#',
  });
}


/* ============================================================
   GAME COVERAGE PAGE — game-coverage.html
   ============================================================ */
async function loadGameCoverage() {
  if (!sbReady()) return;

  const [scores, upcoming] = await Promise.all([
    fetchRecentScores(6),
    fetchUpcomingGames(4),
  ]);

  // Render recent scores
  const grid = document.getElementById('scores-grid');
  if (grid && scores.length) {
    grid.innerHTML = scores.map(s => {
      const date = new Date(s.game_date).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
      const homeWin = s.home_score > s.away_score;
      const awayWin = s.away_score > s.home_score;
      return `
<div class="score-card">
  <div class="score-card-header">
    <span>${s.sport}${s.age_group ? ' · ' + s.age_group : ''}</span>
    <span>${date}</span>
  </div>
  <div class="score-body">
    <div class="score-teams">
      <div class="score-row">
        <span class="team-name">${s.home_team}</span>
        <span class="team-score ${homeWin ? 'winner' : 'loser'}">${s.home_score ?? '–'}</span>
      </div>
      <div class="score-row">
        <span class="team-name">${s.away_team}</span>
        <span class="team-score ${awayWin ? 'winner' : 'loser'}">${s.away_score ?? '–'}</span>
      </div>
    </div>
    ${s.location ? `<div style="font-size:0.75rem;color:var(--gray);margin-bottom:0.75rem;">${s.location}</div>` : ''}
    ${s.recap ? `<p class="card-excerpt" style="font-size:0.82rem;">${s.recap}</p>` : ''}
  </div>
</div>`;
    }).join('');
  }

  // Render upcoming games
  const upcomingGrid = document.getElementById('upcoming-grid');
  if (upcomingGrid && upcoming.length) {
    upcomingGrid.innerHTML = upcoming.map(g => {
      const date = new Date(g.game_date).toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' });
      return `
<div class="upcoming-card card">
  <div class="upcoming-date-badge">${date}</div>
  <div class="card-sport">${g.sport}${g.age_group ? ' · ' + g.age_group : ''}</div>
  <div class="card-name">${g.home_team} vs ${g.away_team}</div>
  ${g.location ? `<div class="card-detail">${g.location}</div>` : ''}
</div>`;
    }).join('');
  }

  await Promise.all([loadSponsorTicker(), loadSponsorBanner('game-coverage')]);
}


/* ============================================================
   ATHLETE SPOTLIGHT PAGE — athlete-spotlight.html
   ============================================================ */
async function loadAthleteSpotlight() {
  if (!sbReady()) return;

  const [featured, spotlights] = await Promise.all([
    fetchFeaturedSpotlight('athlete'),
    fetchSpotlights('athlete', 8),
  ]);

  // Featured athlete block
  if (featured) {
    const featEl = document.getElementById('featured-athlete');
    if (featEl) {
      const stats = featured.stats ? Object.entries(featured.stats).map(([k,v]) =>
        `<div class="stat-item"><span class="stat-num">${v}</span><span class="stat-lbl">${k}</span></div>`
      ).join('') : '';
      featEl.innerHTML = `
<div class="featured-card card">
  <div class="featured-layout">
    <div class="featured-photo">
      ${featured.photo_url
        ? `<img src="${featured.photo_url}" alt="${featured.subject_name}" loading="lazy">`
        : imgPlaceholder(featured.subject_name)}
    </div>
    <div class="featured-body">
      <div class="card-sport">${featured.sport || ''}${featured.school_or_org ? ' · ' + featured.school_or_org : ''}</div>
      <h2 class="featured-title">${featured.subject_name}</h2>
      ${featured.subject_title ? `<p style="color:var(--gold);font-family:var(--font-headline);font-size:0.85rem;letter-spacing:0.06em;text-transform:uppercase;margin-bottom:1rem;">${featured.subject_title}</p>` : ''}
      ${featured.quote ? `<blockquote class="featured-quote">"${featured.quote}"</blockquote>` : ''}
      ${stats ? `<div class="stats-row">${stats}</div>` : ''}
      ${featured.article_id ? `<a href="article.html?id=${featured.article_id}" class="btn btn-gold">Read Full Story</a>` : ''}
    </div>
  </div>
</div>`;
    }
  }

  // Spotlight grid
  const grid = document.getElementById('spotlight-grid');
  if (grid && spotlights.length) {
    grid.innerHTML = spotlights.map(s => renderSpotlightCard(s)).join('');
  }

  await Promise.all([loadSponsorTicker(), loadSponsorBanner('athlete-spotlight')]);
}


/* ============================================================
   LEGENDS SPOTLIGHT PAGE — legends-spotlight.html
   ============================================================ */
async function loadLegendsSpotlight() {
  if (!sbReady()) return;

  const [featured, legends] = await Promise.all([
    fetchFeaturedLegend(),
    fetchLegends(9),
  ]);

  if (featured) {
    const featEl = document.getElementById('featured-legend');
    if (featEl) {
      featEl.innerHTML = `
<div class="featured-card card">
  <div class="featured-layout">
    <div class="featured-photo">
      ${featured.photo_url ? `<img src="${featured.photo_url}" alt="${featured.name}" loading="lazy">` : imgPlaceholder(featured.name)}
    </div>
    <div class="featured-body">
      <div class="card-sport">${featured.sport_played} → ${featured.career_now}</div>
      <h2 class="featured-title">${featured.name}</h2>
      ${featured.career_detail ? `<p class="card-detail">${featured.career_detail}</p>` : ''}
      ${featured.sports_lesson ? `<p class="card-detail" style="color:var(--gold-light);margin-top:0.75rem;font-style:italic;">"${featured.sports_lesson}"</p>` : ''}
      ${featured.article_id ? `<a href="article.html?id=${featured.article_id}" class="btn btn-gold" style="margin-top:1rem;">Read Their Story</a>` : ''}
    </div>
  </div>
</div>`;
    }
  }

  const grid = document.getElementById('legend-grid');
  if (grid && legends.length) {
    grid.innerHTML = legends.map(l => renderLegendCard(l)).join('');
  }

  await Promise.all([loadSponsorTicker(), loadSponsorBanner('legends-spotlight')]);
}


/* ============================================================
   SPONSORS PAGE — sponsors.html
   ============================================================ */
async function loadSponsorsPage() {
  if (!sbReady()) return;

  const sponsors = await fetchSponsors();
  const grid = document.getElementById('sponsors-directory');
  if (grid && sponsors.length) {
    grid.innerHTML = sponsors.filter(s => s.package_level !== 'presenting').map(s => `
<div class="sponsor-dir-card card">
  ${s.logo_url ? `<img src="${s.logo_url}" alt="${s.sponsor_name}" style="height:48px;object-fit:contain;margin-bottom:0.75rem;">` : ''}
  <div style="font-family:var(--font-headline);font-size:1rem;letter-spacing:0.06em;color:var(--white);margin-bottom:4px;">${s.sponsor_name}</div>
  <div class="package-badge ${s.package_level}">${s.package_level}</div>
  ${s.tagline ? `<p class="card-detail" style="margin-top:0.5rem;">${s.tagline}</p>` : ''}
  ${s.cta_url ? `<a href="${s.cta_url}" class="btn-sm" style="margin-top:0.75rem;display:inline-block;" target="_blank">${s.cta_text || 'Learn More'} →</a>` : ''}
</div>`).join('');
  }

  await loadSponsorTicker();
}


/* ============================================================
   SUBMIT STORY FORM — submit-story.html + contact.html
   ============================================================ */
function initSubmitForm() {
  const form = document.getElementById('storyForm') || document.getElementById('contactForm');
  if (!form) return;

  form.addEventListener('submit', async function(e) {
    e.preventDefault();
    const btn = this.querySelector('button[type="submit"]');
    const original = btn.textContent;
    btn.textContent = 'Submitting…';
    btn.disabled = true;

    if (sbReady()) {
      const ok = await submitStoryForm(new FormData(this));
      if (ok) {
        btn.textContent = '✓ Submitted — Thank You!';
        btn.style.background = '#1D9E75';
        this.reset();
      } else {
        btn.textContent = 'Error — Please Try Again';
        btn.style.background = '#E24B4A';
        btn.disabled = false;
        setTimeout(() => {
          btn.textContent = original;
          btn.style.background = '';
        }, 3000);
      }
    } else {
      // Fallback when Supabase not configured
      btn.textContent = '✓ Message Sent!';
      this.reset();
      setTimeout(() => { btn.textContent = original; btn.disabled = false; }, 3000);
    }
  });
}


/* ============================================================
   INDEX / HOMEPAGE
   ============================================================ */
async function loadHomepage() {
  if (!sbReady()) return;

  const [featured, scores, athletes, legends] = await Promise.all([
    fetchFeaturedArticle(),
    fetchRecentScores(3),
    fetchSpotlights('athlete', 4),
    fetchLegends(3),
  ]);

  // Featured story
  if (featured) {
    const el = document.getElementById('featured-story');
    if (el) el.innerHTML = renderArticleCard(featured);
  }

  // Score cards
  const scoresEl = document.getElementById('home-scores');
  if (scoresEl && scores.length) {
    scoresEl.innerHTML = scores.map(s => {
      const homeWin = s.home_score > s.away_score;
      return `
<div class="score-card">
  <div class="score-card-header"><span>${s.sport}</span><span>${new Date(s.game_date).toLocaleDateString('en-US',{month:'short',day:'numeric'})}</span></div>
  <div class="score-body">
    <div class="score-teams">
      <div class="score-row"><span class="team-name">${s.home_team}</span><span class="team-score ${homeWin?'winner':'loser'}">${s.home_score??'–'}</span></div>
      <div class="score-row"><span class="team-name">${s.away_team}</span><span class="team-score ${!homeWin&&s.home_score!==s.away_score?'winner':'loser'}">${s.away_score??'–'}</span></div>
    </div>
  </div>
</div>`;
    }).join('');
  }

  await loadSponsorTicker();
}


/* ============================================================
   AUTO-INIT — detect current page and run the right loader
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  const page = location.pathname.split('/').pop() || 'index.html';

  initSubmitForm();

  if (page === 'index.html' || page === '')          loadHomepage();
  if (page === 'game-coverage.html')                 loadGameCoverage();
  if (page === 'athlete-spotlight.html')             loadAthleteSpotlight();
  if (page === 'legends-spotlight.html')             loadLegendsSpotlight();
  if (page === 'sponsors.html')                      loadSponsorsPage();
  if (page === 'coach-spotlight.html')               loadCoachSpotlight();
  if (page === 'team-spotlight.html')                loadTeamSpotlight();
  if (page === 'organization-spotlight.html')        loadOrgSpotlight();
});


/* ============================================================
   COACH SPOTLIGHT
   ============================================================ */
async function loadCoachSpotlight() {
  if (!sbReady()) return;
  const [featured, coaches] = await Promise.all([
    fetchFeaturedSpotlight('coach'),
    fetchSpotlights('coach', 6),
  ]);
  if (featured) {
    const el = document.getElementById('featured-coach');
    if (el) el.innerHTML = `
<div class="featured-card card">
  <div class="featured-layout">
    <div class="featured-photo">${featured.photo_url ? `<img src="${featured.photo_url}" alt="${featured.subject_name}" loading="lazy">` : imgPlaceholder(featured.subject_name)}</div>
    <div class="featured-body">
      <div class="card-sport">${featured.sport || ''}${featured.subject_title ? ' · ' + featured.subject_title : ''}</div>
      <h2 class="featured-title">${featured.subject_name}</h2>
      ${featured.quote ? `<blockquote class="featured-quote">"${featured.quote}"</blockquote>` : ''}
      ${featured.article_id ? `<a href="article.html?id=${featured.article_id}" class="btn btn-gold">Read Full Feature</a>` : ''}
    </div>
  </div>
</div>`;
  }
  const grid = document.getElementById('coaches-grid');
  if (grid && coaches.length) grid.innerHTML = coaches.map(s => renderSpotlightCard(s)).join('');
  await Promise.all([loadSponsorTicker(), loadSponsorBanner('coach-spotlight')]);
}


/* ============================================================
   TEAM SPOTLIGHT
   ============================================================ */
async function loadTeamSpotlight() {
  if (!sbReady()) return;
  const [featured, teams] = await Promise.all([
    fetchFeaturedSpotlight('team'),
    fetchSpotlights('team', 6),
  ]);
  if (featured) {
    const el = document.getElementById('featured-team');
    if (el) el.innerHTML = `
<div class="featured-card card">
  <div class="featured-layout">
    <div class="featured-photo">${featured.photo_url ? `<img src="${featured.photo_url}" alt="${featured.subject_name}" loading="lazy">` : imgPlaceholder('Team Photo')}</div>
    <div class="featured-body">
      <div class="card-sport">${featured.sport || ''}${featured.subject_title ? ' · ' + featured.subject_title : ''}</div>
      <h2 class="featured-title">${featured.subject_name}</h2>
      ${featured.quote ? `<blockquote class="featured-quote">"${featured.quote}"</blockquote>` : ''}
      ${featured.article_id ? `<a href="article.html?id=${featured.article_id}" class="btn btn-gold">Read Their Story</a>` : ''}
    </div>
  </div>
</div>`;
  }
  const grid = document.getElementById('teams-grid');
  if (grid && teams.length) grid.innerHTML = teams.map(s => renderSpotlightCard(s)).join('');
  await Promise.all([loadSponsorTicker(), loadSponsorBanner('team-spotlight')]);
}


/* ============================================================
   ORGANIZATION SPOTLIGHT
   ============================================================ */
async function loadOrgSpotlight() {
  if (!sbReady()) return;
  const orgs = await fetchOrganizations(6);
  const grid = document.getElementById('orgs-grid');
  if (grid && orgs.length) {
    grid.innerHTML = orgs.map(o => `
<div class="spotlight-card card">
  ${o.logo_url ? `<img src="${o.logo_url}" alt="${o.name}" loading="lazy" style="height:56px;object-fit:contain;margin-bottom:10px;">` : ''}
  <div class="card-sport">${o.sport || ''}${o.org_type ? ' · ' + o.org_type : ''}</div>
  <div class="card-name">${o.name}</div>
  ${o.description ? `<div class="card-detail">${o.description}</div>` : ''}
  ${o.website ? `<a href="${o.website}" class="btn-sm" style="margin-top:0.75rem;display:inline-block;" target="_blank">Visit Site →</a>` : ''}
</div>`).join('');
  }
  await Promise.all([loadSponsorTicker(), loadSponsorBanner('organization-spotlight')]);
}
