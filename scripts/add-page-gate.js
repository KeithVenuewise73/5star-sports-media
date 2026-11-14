#!/usr/bin/env node
/* Put the gate in the <head> of every page that can be switched off.
   Safe to run again: a page that already has it is left alone.

     node scripts/add-page-gate.js          do it
     node scripts/add-page-gate.js --check  only list pages that are missing the gate (exit 1 if any)

   Pages that never get the gate: the pages that are always on, the staff tools (each has its
   own login), the generated sport redirects (they land on the Scores page, which is gated),
   the team galleries, and shared page fragments. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const EXEMPT_FILES = new Set([
  'index.html', 'about.html', 'contact.html', 'photo-galleries.html', 'staff.html', 'photo-review.html',
  'admin.html', 'admin-gametracker.html', 'media-dashboard.html', 'analytics-dashboard.html', 'academy/portal.html',
]);
const EXEMPT_DIRS = ['galleries/', 'shared/', 'scores/', 'node_modules/', '.git/', 'docs/'];

const BLOCK = `<!-- page-gate: a page that is switched off sends the visitor home -->
<script src="/assets/js/review-config.js"></script>
<script src="/assets/js/site-pages.js"></script>
<script src="/assets/js/page-gate.js"></script>
<noscript><meta http-equiv="refresh" content="0;url=/index.html"></noscript>`;

function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    const rel = path.relative(ROOT, full).split(path.sep).join('/');
    if (e.isDirectory()) { if (!EXEMPT_DIRS.some((d) => (rel + '/').startsWith(d))) walk(full, out); }
    else if (e.name.endsWith('.html') && !EXEMPT_FILES.has(rel)) out.push(rel);
  }
  return out;
}

const check = process.argv.includes('--check');
const missing = [];
let changed = 0;
for (const rel of walk(ROOT, []).sort()) {
  const file = path.join(ROOT, rel);
  let html = fs.readFileSync(file, 'utf8');
  if (html.includes('page-gate.js')) continue;
  missing.push(rel);
  if (check) continue;
  // Insert right after the charset line (or the <head> tag), leaving every other character as it was.
  const charset = /<meta\s+charset=[^>]*>/i.exec(html);
  const head = /<head[^>]*>/i.exec(html);
  const at = charset ? charset.index + charset[0].length : head ? head.index + head[0].length : -1;
  if (at < 0) { console.log('NO <head>, skipped: ' + rel); continue; }
  html = html.slice(0, at) + '\n' + BLOCK + html.slice(at);
  fs.writeFileSync(file, html);
  changed++;
}
if (check) { console.log(missing.length ? 'Missing the gate:\n' + missing.join('\n') : 'Every switchable page has the gate.'); process.exit(missing.length ? 1 : 0); }
console.log(`Gate added to ${changed} page(s).`);
