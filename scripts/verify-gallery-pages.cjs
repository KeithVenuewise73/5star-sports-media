#!/usr/bin/env node
/* ============================================================================
   End-to-end check of the team-gallery pages, in a real browser, against a
   LOCAL copy of the team-gallery service (hl-bos-platform:
   scripts/local-test/gallery-service-local.ts, the real service code on a
   local PostgreSQL). Never touches the live service.

     1. publishes a gallery to the local service the way JerseySort does
        (register a key fingerprint, upload web-size photos, publish the game)
     2. builds the pages with scripts/build-gallery-pages.js
     3. serves this site locally and checks, as a visitor would:
        the listing, the game page (title, date, cover, search data), the
        password page, the photos, one download and "Download all"; that a
        hostile title is shown as text; that an unpublished game's page goes.

   Usage (needs playwright, sharp, and the local service on :54400):
     SHARP=/path/to/node_modules/sharp node scripts/verify-gallery-pages.cjs
   ============================================================================ */

const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SVC = (process.env.GALLERY_SERVICE_URL || 'http://127.0.0.1:54400/functions/v1/team-gallery').replace(/\/+$/, '');
const PORT = 8088;
const SITE = `http://127.0.0.1:${PORT}`;
const sharp = require(process.env.SHARP || 'sharp');
const SHOTS = process.env.SHOTS || null;
async function shot(page, name) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: true });
}

let failures = 0;
let checks = 0;
function check(name, ok, detail) {
  checks += 1;
  if (ok) console.log(`  OK    ${name}`);
  else { failures += 1; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
}

const KEY = crypto.randomBytes(32).toString('base64url');
const fp = crypto.createHash('sha256').update(KEY).digest('hex');
const svc = async (route, body, key) => {
  const r = await fetch(SVC + route, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(key ? { 'x-gallery-publisher-key': KEY } : {}) },
    body: JSON.stringify(body),
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};
const hash = (pw) => {
  const salt = crypto.randomBytes(16);
  return `scrypt$${salt.toString('base64')}$${crypto.scryptSync(pw, salt, 64).toString('base64')}`;
};
async function jpeg(n, w = 2400, h = 1600) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="#1d4ed8"/><text x="${w / 2}" y="${h / 2}" text-anchor="middle" font-size="${h / 3}" fill="#fff">${n}</text></svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 80 }).toBuffer();
}

function serve() {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.xml': 'application/xml', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg' };
  return http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, SITE).pathname);
    if (p.endsWith('/')) p += 'index.html';
    const file = path.join(ROOT, p);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404); res.end('not found'); return;
    }
    res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  }).listen(PORT, '127.0.0.1');
}

function playwright() {
  try { return require('playwright'); } catch (e) {
    const root = execFileSync('npm', ['root', '-g']).toString().trim();
    return require(path.join(root, 'playwright'));
  }
}

(async () => {
  console.log('\n1. Publish a gallery to the local service, as JerseySort does');
  const reg = await svc('/publish/register', { key_sha256: fp });
  check('the test publisher connects by fingerprint (reset the local service first if this fails)', reg.status === 200, JSON.stringify(reg.body));
  const G = crypto.randomUUID(); const GAME = crypto.randomUUID(); const GAME2 = crypto.randomUUID();
  const P = [crypto.randomUUID(), crypto.randomUUID()];
  const P2 = crypto.randomUUID();
  const link = crypto.randomBytes(16).toString('base64url');
  await svc('/publish/gallery', { gallery_id: G, gallery: { slug: 'cazenovia-hockey-varsity', link_token: link, password_hash: hash('goblue26'), brand: '5 Star Sports Media', group_name: 'Cazenovia Hockey', name: 'Varsity' }, keep_games: [GAME, GAME2] }, true);
  const upload = async (gameId, files) => {
    const r = await svc('/publish/uploads', { gallery_id: G, game_id: gameId, files: files.map(([id, kind]) => ({ photo_id: id, kind })) }, true);
    for (let i = 0; i < files.length; i++) {
      await fetch(r.body.uploads[i].url, { method: 'PUT', headers: { 'content-type': 'image/jpeg' }, body: await jpeg(i + 1) });
    }
  };
  await upload(GAME, [[P[0], 'web'], [P[0], 'thumb'], [P[1], 'web'], [P[1], 'thumb'], [P[0], 'cover']]);
  await upload(GAME2, [[P2, 'web'], [P2, 'thumb']]);
  const g1 = await svc('/publish/game', { gallery_id: G, game: { id: GAME, slug: '2026-10-24-varsity-vs-wheatfield', title: 'Varsity vs Wheatfield', sport: 'Hockey', opponent: 'Wheatfield', location: 'Cazenovia Ice Rink', event_date: '2026-10-24', cover_photo_id: P[0] }, photos: [{ id: P[0], filename: 'IMG_0001.JPG', web_bytes: 1000 }, { id: P[1], filename: 'IMG_0002.JPG', web_bytes: 1000 }] }, true);
  const g2 = await svc('/publish/game', { gallery_id: G, game: { id: GAME2, slug: '2026-10-31-varsity-vs-lockport', title: 'Varsity <img src=x onerror=alert(1)> vs "Lockport" & Co', sport: 'Hockey', event_date: '2026-10-31' }, photos: [{ id: P2, filename: 'IMG_0100.JPG', web_bytes: 1000 }] }, true);
  check('two games published', g1.status === 200 && g2.status === 200);

  console.log('\n2. Build the pages');
  const out = execFileSync('node', [path.join(ROOT, 'scripts/build-gallery-pages.js')], { env: { ...process.env, GALLERY_SERVICE_URL: SVC, GALLERY_ALLOW_HTTP: '1' } }).toString();
  check('the builder made two game pages', out.includes('2 game pages published'), out.trim());
  const pageFile = path.join(ROOT, 'galleries/cazenovia-hockey-varsity/2026-10-24-varsity-vs-wheatfield/index.html');
  const html = fs.readFileSync(pageFile, 'utf8');
  check('the game page has a searchable title and description', html.includes('<title>Varsity vs Wheatfield, October 24, 2026 — Cazenovia Hockey Varsity Photos | 5 Star Sports Media</title>') && html.includes('Cazenovia Ice Rink'));
  check('it carries search data (schema.org ImageGallery + SportsEvent) and the cover as og:image', html.includes('"@type":"ImageGallery"') && html.includes('"@type":"SportsEvent"') && html.includes('og:image'));
  const hostile = fs.readFileSync(path.join(ROOT, 'galleries/cazenovia-hockey-varsity/2026-10-31-varsity-vs-lockport/index.html'), 'utf8');
  check('a hostile title is escaped, never markup', !hostile.includes('<img src=x') && hostile.includes('&lt;img src=x onerror=alert(1)&gt;'));
  check('a game without a chosen cover shows no photo publicly', !hostile.includes('og:image') && !hostile.includes('class="gx-cover"'));
  const sitemap = fs.readFileSync(path.join(ROOT, 'galleries/sitemap.xml'), 'utf8');
  check('the sitemap lists both game pages', (sitemap.match(/<loc>/g) || []).length === 3);

  console.log('\n3. In a browser, as a parent');
  const server = serve();
  const { chromium } = playwright();
  const linux = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  const browser = await chromium.launch(fs.existsSync(linux) ? { executablePath: linux } : {});
  const dl = fs.mkdtempSync(path.join(os.tmpdir(), 'gallery-dl-'));
  try {
    const page = await (await browser.newContext({ acceptDownloads: true })).newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(`${SITE}/photo-galleries.html`);
    const cards = await page.$$('[data-testid=gallery-card]');
    check('the Photos page lists the team\'s two games', cards.length === 2);
    check('the site header is there', ((await page.textContent('#site-header')) || '').includes('Photos'));
    const coverOk = await page.evaluate(() => [...document.querySelectorAll('.gx-img')].every((i) => i.complete && i.naturalWidth > 0));
    check('the chosen cover shows', coverOk);
    await shot(page, '1-listing');
    await page.click('[data-testid=gallery-card] >> nth=1');
    await page.waitForURL(/2026-10-24-varsity-vs-wheatfield\/$/);
    check('the game page opens from the listing', ((await page.textContent('h1')) || '').includes('Varsity vs Wheatfield'));
    const homeHref = await page.$eval('#site-header a[href="index.html"]', (a) => a.href).catch(() => '');
    check('header links work from inside galleries/ (base href)', homeHref === `${SITE}/index.html`, homeHref);
    await shot(page, '2-game-page');
    const view = await page.getAttribute('[data-testid=view-photos]', 'href');
    check('"View the photos" goes to the viewer with this team\'s link and game', view === `galleries/view/#${link}/2026-10-24-varsity-vs-wheatfield`, view);
    await page.goto(`${SITE}/galleries/view/?svc=${encodeURIComponent(SVC)}#${link}/2026-10-24-varsity-vs-wheatfield`);
    await page.waitForSelector('[data-testid=tg-password-form]');
    check('the viewer asks for the team password, under the brand', ((await page.textContent('#tg-title')) || '').includes('Cazenovia Hockey · Varsity'));
    await shot(page, '3-password');
    await page.fill('#tg-pass', 'wrong-password');
    await page.click('[data-testid=tg-password-form] button');
    await page.waitForSelector('[role=alert]');
    check('a wrong password is refused', ((await page.textContent('[role=alert]')) || '').includes('not right'));
    await page.fill('#tg-pass', 'goblue26');
    await page.click('[data-testid=tg-password-form] button');
    await page.waitForSelector('[data-testid=tg-photo]');
    check('the right password opens straight to that game\'s photos', (await page.$$('[data-testid=tg-photo]')).length === 2);
    const thumbs = await page.waitForFunction(() => [...document.querySelectorAll('[data-testid=tg-photo] img')].every((i) => i.complete && i.naturalWidth > 0), null, { timeout: 15000 }).then(() => true, () => false);
    check('the thumbnails load', thumbs);
    await shot(page, '4-photos');
    const [one] = await Promise.all([page.waitForEvent('download'), page.click('[data-testid=tg-download-one] >> nth=0')]);
    const oneFile = path.join(dl, one.suggestedFilename());
    await one.saveAs(oneFile);
    const meta = await sharp(fs.readFileSync(oneFile)).metadata();
    check('a photo downloads at web size, under its own name', one.suggestedFilename() === 'IMG_0001.JPG' && meta.width === 2400, `${one.suggestedFilename()} ${meta.width}`);
    const [all] = await Promise.all([page.waitForEvent('download'), page.click('[data-testid=tg-download-all]')]);
    const zipFile = path.join(dl, all.suggestedFilename());
    await all.saveAs(zipFile);
    const zip = fs.readFileSync(zipFile);
    const listed = execFileSync('python3', ['-c', 'import sys,zipfile;z=zipfile.ZipFile(sys.argv[1]);print(z.testzip() or "ok", sorted(z.namelist()))', zipFile]).toString();
    check('"Download all" gives a valid ZIP of both photos', all.suggestedFilename() === '2026-10-24-varsity-vs-wheatfield.zip' && listed.startsWith("ok ['IMG_0001.JPG', 'IMG_0002.JPG']") && zip.length > 0, listed.trim());
    await page.reload();
    await page.waitForSelector('[data-testid=tg-photo]');
    check('coming back the same day needs no password again (this browser)', true);
    check('no script errors on the pages', errors.length === 0, errors.join(' | '));

    console.log('\n4. A game taken off is taken off the website');
    await svc('/publish/gallery', { gallery_id: G, gallery: { slug: 'cazenovia-hockey-varsity', link_token: link, password_hash: hash('goblue26'), brand: '5 Star Sports Media', group_name: 'Cazenovia Hockey', name: 'Varsity' }, keep_games: [GAME] }, true);
    execFileSync('node', [path.join(ROOT, 'scripts/build-gallery-pages.js')], { env: { ...process.env, GALLERY_SERVICE_URL: SVC, GALLERY_ALLOW_HTTP: '1' } });
    check('its page is removed', !fs.existsSync(path.join(ROOT, 'galleries/cazenovia-hockey-varsity/2026-10-31-varsity-vs-lockport')));
    await svc('/publish/remove', { gallery_id: G }, true);
    execFileSync('node', [path.join(ROOT, 'scripts/build-gallery-pages.js')], { env: { ...process.env, GALLERY_SERVICE_URL: SVC, GALLERY_ALLOW_HTTP: '1' } });
    check('with nothing published, the Photos page says galleries are coming soon', fs.readFileSync(path.join(ROOT, 'photo-galleries.html'), 'utf8').includes('coming soon') && !fs.existsSync(path.join(ROOT, 'galleries/cazenovia-hockey-varsity')));
  } finally {
    await browser.close();
    server.close();
    fs.rmSync(dl, { recursive: true, force: true });
  }
  console.log(`\n${failures === 0 ? 'ALL' : checks - failures} OF ${checks} CHECK(S) ${failures === 0 ? 'PASSED' : `PASSED; ${failures} FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
