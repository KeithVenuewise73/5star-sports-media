/* ============================================================================
   Team galleries listing — keeps photo-galleries.html current between
   rebuilds.

   The page is generated from the team-gallery service's /listing (so search
   engines see every team and game). The rebuild runs on GitHub's schedule,
   which can lag by hours; this script asks the service directly when the
   page opens, so a game published a minute ago is listed straight away and
   one taken offline disappears straight away.

     - a game that already has its own page links to it;
     - a game newer than the last rebuild links straight to the viewer;
     - if the service cannot be reached, the generated page stays as it is.

   Everything is written with textContent / attributes: nothing from the
   service is ever inserted as HTML.
   ============================================================================ */

(function () {
  'use strict';

  var box = document.getElementById('gx-listing');
  if (!box || !window.TeamGallery) return;

  var slugOk = function (s) { return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(String(s)) && String(s).length <= 160; };
  var tokenOk = function (s) { return /^[A-Za-z0-9_-]{16,64}$/.test(String(s)); };
  var dateOk = function (s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s)); };
  var httpsOk = function (u) {
    try { return new URL(u).protocol === 'https:' || /^(localhost|127\.0\.0\.1)$/.test(location.hostname); }
    catch (e) { return false; }
  };
  var teamName = function (g) { return g.group_name ? g.group_name + ' ' + g.gallery_name : g.gallery_name; };
  var plural = function (n, one) { return n + ' ' + (n === 1 ? one : one + 's'); };
  function longDate(d) {
    var p = String(d).split('-').map(Number);
    return new Date(Date.UTC(p[0], p[1] - 1, p[2])).toLocaleDateString('en-US', {
      month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC'
    });
  }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  var pages = {};
  try { JSON.parse(box.getAttribute('data-pages') || '[]').forEach(function (p) { pages[p] = true; }); }
  catch (e) { /* no generated pages known */ }

  function card(g) {
    var own = g.gallery_slug + '/' + g.game_slug;
    var a = el('a', 'gx-card');
    a.setAttribute('data-testid', 'gallery-card');
    a.href = pages[own]
      ? 'galleries/' + own + '/'
      : 'galleries/view/#' + g.link_token + '/' + g.game_slug;
    if (g.cover_url && httpsOk(g.cover_url)) {
      var img = el('img', 'gx-img');
      img.src = g.cover_url;
      img.alt = g.title;
      img.loading = 'lazy';
      a.appendChild(img);
    } else {
      a.appendChild(el('div', 'gx-ph', '5★'));
    }
    var body = el('div', 'gx-body');
    body.appendChild(el('div', 'gx-name', g.title));
    body.appendChild(el('div', 'gx-meta', longDate(g.event_date) + ' · ' + plural(Number(g.photo_count) || 0, 'photo')));
    a.appendChild(body);
    return a;
  }

  function render(games) {
    var teams = {};
    games.forEach(function (g) {
      (teams[g.gallery_slug] = teams[g.gallery_slug] || { name: teamName(g), games: [] }).games.push(g);
    });
    var list = Object.keys(teams).map(function (k) { return teams[k]; })
      .sort(function (a, b) { return a.name.localeCompare(b.name); });
    var frag = document.createDocumentFragment();
    if (list.length === 0) {
      var empty = el('div', 'gx-box');
      var p1 = el('p'); p1.style.marginBottom = '8px';
      p1.appendChild(el('strong', null, 'Team galleries are coming soon.'));
      var p2 = el('p', 'gx-muted', 'Game photos for the teams we cover will appear here. Want your team photographed? ');
      var c = el('a', null, 'Contact us'); c.href = 'contact.html'; c.style.color = 'var(--gold)';
      p2.appendChild(c); p2.appendChild(document.createTextNode('.'));
      empty.appendChild(p1); empty.appendChild(p2);
      frag.appendChild(empty);
    }
    list.forEach(function (t) {
      var sec = el('div', 'gx-team');
      sec.appendChild(el('h2', null, t.name));
      var grid = el('div', 'gx-grid');
      t.games.sort(function (a, b) { return a.event_date < b.event_date ? 1 : -1; })
        .forEach(function (g) { grid.appendChild(card(g)); });
      sec.appendChild(grid);
      frag.appendChild(sec);
    });
    box.replaceChildren(frag);
    box.setAttribute('data-live', 'yes');
  }

  window.TeamGallery.listing().then(function (r) {
    if (r.status !== 200 || !r.body || !Array.isArray(r.body.games)) return; // keep the generated page
    render(r.body.games.filter(function (g) {
      return g && slugOk(g.gallery_slug) && slugOk(g.game_slug) && tokenOk(g.link_token) &&
        dateOk(g.event_date) && g.title && g.brand && g.gallery_name;
    }));
  });
})();
