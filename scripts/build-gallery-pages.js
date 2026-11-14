#!/usr/bin/env node
/* ============================================================================
   Generates the public team-gallery pages from what the photographer has
   published (the team-gallery service's /listing):

     photo-galleries.html                       every team and game, grouped
                                                 (and, in the browser, kept
                                                 current between rebuilds by
                                                 assets/js/gallery-listing.js)
     galleries/<team>/<game>/index.html         one searchable page per game:
                                                 its title, date, place, the
                                                 ONE cover photo picked for it
                                                 (or none), and "View the photos"
     galleries/sitemap.xml                      those pages, for search engines

   The photos themselves stay behind the team password, on galleries/view/.
   Pages of games no longer published are removed (only folders this script
   made: they carry a .generated marker).

   If the service cannot be reached or is not switched on, nothing is changed
   and it says so: an outage never wipes the pages.

       node scripts/build-gallery-pages.js
       GALLERY_SERVICE_URL=http://127.0.0.1:54400/functions/v1/team-gallery node scripts/build-gallery-pages.js

   Run by .github/workflows/gallery-pages.yml every 30 minutes.
   ============================================================================ */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SITE = 'https://5starsportsmedia.com';
const SERVICE = (process.env.GALLERY_SERVICE_URL ||
  'https://mvvtngiopdrgiedjmhfb.supabase.co/functions/v1/team-gallery').replace(/\/+$/, '');

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const slugOk = (s) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(String(s)) && String(s).length <= 160;
const tokenOk = (s) => /^[A-Za-z0-9_-]{16,64}$/.test(String(s));
const httpsOk = (u) => { try { return new URL(u).protocol === 'https:' || process.env.GALLERY_ALLOW_HTTP === '1'; } catch (e) { return false; } };

function longDate(d) {
  const [y, m, day] = String(d).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  });
}
const teamName = (g) => (g.group_name ? `${g.group_name} ${g.gallery_name}` : g.gallery_name);
const plural = (n, one) => `${n} ${n === 1 ? one : one + 's'}`;

function head({ title, description, canonical, image, noindex }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<base href="/"/>
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}"/>
<link rel="canonical" href="${esc(canonical)}"/>
${noindex ? '<meta name="robots" content="noindex"/>\n' : ''}<meta property="og:type" content="website"/>
<meta property="og:title" content="${esc(title)}"/>
<meta property="og:description" content="${esc(description)}"/>
<meta property="og:url" content="${esc(canonical)}"/>
${image ? `<meta property="og:image" content="${esc(image)}"/>\n<meta name="twitter:card" content="summary_large_image"/>\n` : ''}<link rel="icon" type="image/svg+xml" href="assets/images/favicon.svg"/>
<link rel="stylesheet" href="assets/css/style.css"/>
<link rel="stylesheet" href="shared/shared.css"/>
<style>
.gx-hero{background:linear-gradient(135deg,#0a0a0a,#0d0d1a);border-bottom:1px solid var(--dark-border);padding:3.5rem 0 2.5rem}
.gx-title{font-family:var(--font-display);font-size:clamp(2.6rem,6vw,5rem);line-height:.95;margin:.4rem 0 .6rem}
.gx-sub{font-size:1rem;color:var(--gray-light);line-height:1.7;max-width:640px}
.gx-team{margin-bottom:2.5rem}
.gx-team h2{font-family:var(--font-headline);font-size:1.3rem;margin-bottom:12px}
.gx-teams-h{font-family:var(--font-headline);font-size:1.3rem;margin-bottom:12px}
.gx-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}
@media(max-width:960px){.gx-grid{grid-template-columns:1fr 1fr}}
@media(max-width:600px){.gx-grid{grid-template-columns:1fr}}
.gx-card{display:block;background:var(--dark-card);border:1px solid var(--dark-border);border-radius:var(--radius-lg);overflow:hidden;color:inherit;text-decoration:none}
.gx-card:hover{border-color:rgba(212,175,55,.4)}
.gx-img{aspect-ratio:16/9;width:100%;object-fit:cover;display:block;background:var(--dark)}
.gx-ph{aspect-ratio:16/9;display:flex;align-items:center;justify-content:center;background:var(--dark);color:var(--gold);font-family:var(--font-display);font-size:2rem;letter-spacing:.05em}
.gx-body{padding:14px}
.gx-name{font-family:var(--font-headline);font-weight:700}
.gx-meta{font-size:.75rem;color:var(--gold);font-family:var(--font-headline);letter-spacing:.5px;text-transform:uppercase;margin-top:4px}
.gx-cover{max-width:960px;width:100%;border-radius:var(--radius-lg);border:1px solid var(--dark-border);display:block;margin-bottom:1.5rem}
.gx-box{background:var(--dark-card);border:1px solid var(--dark-border);border-radius:var(--radius-lg);padding:22px;max-width:640px}
.gx-muted{color:var(--gray);font-size:.9rem;line-height:1.6}
</style>
</head>
<body>
<div id="site-header"></div>
`;
}
const foot = `<div id="site-footer"></div>
<script src="assets/js/main.js"></script>
<script src="assets/js/components.js"></script>
</body>
</html>
`;

function gamePage(g) {
  const url = `${SITE}/galleries/${g.gallery_slug}/${g.game_slug}/`;
  const team = teamName(g);
  const date = longDate(g.event_date);
  const title = `${g.title}, ${date} — ${team} Photos | ${g.brand}`;
  const description = `${plural(g.photo_count, 'photo')} from ${g.title} (${team}${g.sport ? `, ${g.sport}` : ''}) on ${date}${g.location ? ` at ${g.location}` : ''}, by ${g.brand}. Team families can view and download them with the team password.`;
  const cover = g.cover_url && httpsOk(g.cover_url) ? g.cover_url : null;
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'ImageGallery',
    name: `${g.title} — ${team}`,
    description,
    url,
    creator: { '@type': 'Organization', name: g.brand, url: SITE },
    about: {
      '@type': 'SportsEvent',
      name: g.title,
      startDate: g.event_date,
      ...(g.sport ? { sport: g.sport } : {}),
      ...(g.location ? { location: { '@type': 'Place', name: g.location } } : {}),
    },
    ...(cover ? { image: cover } : {}),
  };
  return head({ title, description, canonical: url, image: cover }) + `
<div class="gx-hero">
  <div class="container">
    <span class="section-label">${esc(g.brand)} · Team Photos</span>
    <div class="gold-line"></div>
    <h1 class="gx-title">${esc(g.title)}</h1>
    <p class="gx-sub">${esc(team)}${g.sport ? ` · ${esc(g.sport)}` : ''} · ${esc(date)}${g.location ? ` · ${esc(g.location)}` : ''}</p>
  </div>
</div>
<section class="section section-dark">
  <div class="container">
${cover ? `    <img class="gx-cover" src="${esc(cover)}" alt="${esc(`${g.title} — ${team}`)}"/>\n` : ''}    <div class="gx-box">
      <p style="font-size:1.05rem;margin-bottom:14px"><strong>${esc(plural(g.photo_count, 'photo'))}</strong> from this game, by ${esc(g.brand)}.</p>
      <a class="btn btn-gold" href="galleries/view/#${esc(g.link_token)}/${esc(g.game_slug)}" data-testid="view-photos">View &amp; download the photos</a>
      <p class="gx-muted" style="margin-top:14px">The photos are private to the team. Ask your coach for the team password.</p>
      <p class="gx-muted">Want your team photographed? <a href="contact.html" style="color:var(--gold)">Contact ${esc(g.brand)}</a>.</p>
    </div>
    <p style="margin-top:2rem"><a href="photo-galleries.html" style="color:var(--gold)">‹ All team galleries</a></p>
  </div>
</section>
<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>
` + foot;
}

function listingPage(games) {
  const teams = new Map();
  for (const g of games) {
    const key = g.gallery_slug;
    if (!teams.has(key)) teams.set(key, { name: teamName(g), games: [] });
    teams.get(key).games.push(g);
  }
  const sections = [...teams.values()]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((t) => `    <div class="gx-team">
      <h2>${esc(t.name)}</h2>
      <div class="gx-grid">
${t.games
  .sort((a, b) => (a.event_date < b.event_date ? 1 : -1))
  .map((g) => `        <a class="gx-card" href="galleries/${esc(g.gallery_slug)}/${esc(g.game_slug)}/" data-testid="gallery-card">
          ${g.cover_url && httpsOk(g.cover_url)
            ? `<img class="gx-img" src="${esc(g.cover_url)}" alt="${esc(g.title)}" loading="lazy"/>`
            : '<div class="gx-ph">5★</div>'}
          <div class="gx-body"><div class="gx-name">${esc(g.title)}</div><div class="gx-meta">${esc(longDate(g.event_date))} · ${esc(plural(g.photo_count, 'photo'))}</div></div>
        </a>`).join('\n')}
      </div>
    </div>`).join('\n');
  const empty = `    <div class="gx-box"><p style="margin-bottom:8px"><strong>Team galleries are coming soon.</strong></p><p class="gx-muted">Game photos for the teams we cover will appear here. Want your team photographed? <a href="contact.html" style="color:var(--gold)">Contact us</a>.</p></div>`;
  return head({
    title: 'Team Photo Galleries — 5-Star Sports Media | WNY Sports',
    description: 'Game photos of the Western New York teams 5-Star Sports Media covers. See the albums for each team, or open a private team gallery with its password.',
    canonical: `${SITE}/photo-galleries.html`,
  }) + `
<div class="gx-hero">
  <div class="container">
    <span class="section-label">5-Star Sports Media</span>
    <div class="gold-line"></div>
    <h1 class="gx-title">Team <span style="color:var(--gold)">Galleries</span></h1>
    <p class="gx-sub">Game photos of the teams we cover. Open a team's page to see its albums. Some galleries are private to a team and open with the team password.</p>
  </div>
</div>
<section class="section" id="team-pages-section" hidden>
  <div class="container">
    <h2 class="gx-teams-h">Team pages</h2>
    <div class="gx-grid" id="team-pages"></div>
  </div>
</section>
<section class="section section-dark">
  <div class="container" id="gx-listing" data-pages="${esc(JSON.stringify(games.map((g) => `${g.gallery_slug}/${g.game_slug}`)))}">
${games.length ? sections : empty}
  </div>
</section>
<script src="assets/js/team-gallery.js"></script>
<script src="assets/js/gallery-listing.js"></script>
<script src="assets/js/review-config.js"></script>
<script src="assets/js/team-pages.js"></script>
` + foot;
}

function sitemap(games) {
  const urls = [`${SITE}/photo-galleries.html`, ...games.map((g) => `${SITE}/galleries/${g.gallery_slug}/${g.game_slug}/`)];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${esc(u)}</loc></url>`).join('\n')}
</urlset>
`;
}

function writeIfChanged(file, content) {
  const before = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  if (before === content) return false;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return true;
}

async function main() {
  let res;
  try {
    res = await fetch(`${SERVICE}/listing`);
  } catch (e) {
    console.log(`The galleries service could not be reached (${e.message}). Pages left as they are.`);
    return 0;
  }
  if (!res.ok) {
    console.log(`The galleries service answered ${res.status} (not switched on yet?). Pages left as they are.`);
    return 0;
  }
  const body = await res.json();
  // Only what is well formed becomes a page; anything else is skipped and named.
  const games = (Array.isArray(body.games) ? body.games : []).filter((g) => {
    const ok = slugOk(g.gallery_slug) && slugOk(g.game_slug) && tokenOk(g.link_token) &&
      /^\d{4}-\d{2}-\d{2}$/.test(String(g.event_date)) && g.title && g.brand && g.gallery_name;
    if (!ok) console.log(`Skipped a malformed listing entry: ${JSON.stringify(g).slice(0, 200)}`);
    return ok;
  });

  let changed = 0;
  const keep = new Set();
  for (const g of games) {
    const dir = path.join(ROOT, 'galleries', g.gallery_slug, g.game_slug);
    keep.add(dir);
    if (writeIfChanged(path.join(dir, 'index.html'), gamePage(g))) changed += 1;
    writeIfChanged(path.join(dir, '.generated'), 'Made by scripts/build-gallery-pages.js\n');
  }
  // Remove pages of games no longer published (only folders this script made).
  const galleriesDir = path.join(ROOT, 'galleries');
  for (const team of fs.existsSync(galleriesDir) ? fs.readdirSync(galleriesDir) : []) {
    const teamDir = path.join(galleriesDir, team);
    if (team === 'view' || !fs.statSync(teamDir).isDirectory()) continue;
    for (const game of fs.readdirSync(teamDir)) {
      const dir = path.join(teamDir, game);
      if (!keep.has(dir) && fs.existsSync(path.join(dir, '.generated'))) {
        fs.rmSync(dir, { recursive: true, force: true });
        changed += 1;
      }
    }
    if (fs.readdirSync(teamDir).length === 0) fs.rmdirSync(teamDir);
  }
  if (writeIfChanged(path.join(ROOT, 'photo-galleries.html'), listingPage(games))) changed += 1;
  writeIfChanged(path.join(ROOT, 'galleries', 'sitemap.xml'), sitemap(games));
  console.log(`${plural(games.length, 'game page')} published; ${changed} file(s) changed.`);
  return 0;
}

main().then((code) => process.exit(code), (e) => {
  console.error(e);
  process.exit(1);
});
