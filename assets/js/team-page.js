/* One team's public page. team.html?team=<name> lists its games, newest first, each a link;
   team.html?team=<name>&game=<id> shows that game's photos in the order they were taken. Everything from the service is written with
   textContent / attributes, never as HTML. */
(function () {
  'use strict';
  var CFG = window.REVIEW_CONFIG || {};
  var root = document.getElementById('team-root');
  var albumsRoot = document.getElementById('team-albums');
  var slug = new URLSearchParams(location.search).get('team') || '';
  var all = []; var at = -1;

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function plural(n, w) { return n + ' ' + (n === 1 ? w : w + 's'); }
  function longDate(d) { var p = String(d).split('-').map(Number); return new Date(Date.UTC(p[0], p[1] - 1, p[2])).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }); }
  function httpsOk(u) { try { return new URL(u).protocol === 'https:' || /^(localhost|127\.0\.0\.1)$/.test(location.hostname); } catch (e) { return false; } }
  function message(text) { root.textContent = ''; root.appendChild(el('div', 'tp-box', text)); }

  /* ---- the picture viewer ---- */
  var box = el('div', 'tp-lb'); box.hidden = true; box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', 'Photo viewer');
  var big = el('img', 'tp-big'); big.alt = '';
  var cap = el('div', 'tp-cap');
  var close = el('button', 'tp-x', 'Close'); close.type = 'button';
  var prev = el('button', 'tp-nav tp-prev', '‹'); prev.type = 'button'; prev.setAttribute('aria-label', 'Previous photo');
  var next = el('button', 'tp-nav tp-next', '›'); next.type = 'button'; next.setAttribute('aria-label', 'Next photo');
  box.appendChild(close); box.appendChild(prev); box.appendChild(big); box.appendChild(next); box.appendChild(cap);
  document.body.appendChild(box);
  function show(i) {
    if (i < 0 || i >= all.length) return;
    at = i; var p = all[i];
    big.src = p.web_url; big.alt = p.filename; cap.textContent = p.album + ' · ' + p.filename + ' (' + (i + 1) + ' of ' + all.length + ')';
    box.hidden = false; close.focus();
  }
  function hide() { box.hidden = true; big.removeAttribute('src'); }
  close.addEventListener('click', hide); box.addEventListener('click', function (e) { if (e.target === box) hide(); });
  prev.addEventListener('click', function () { show(at - 1); }); next.addEventListener('click', function () { show(at + 1); });
  document.addEventListener('keydown', function (e) { if (box.hidden) return; if (e.key === 'Escape') hide(); else if (e.key === 'ArrowLeft') show(at - 1); else if (e.key === 'ArrowRight') show(at + 1); });

  if (!slug || !CFG.serviceUrl) { message('That team page was not found.'); return; }
  var gameId = new URLSearchParams(location.search).get('game') || '';
  function teamUrl(id) { return location.pathname + '?team=' + encodeURIComponent(slug) + (id ? '&game=' + encodeURIComponent(id) : ''); }
  function meta(a) { return (a.sport ? a.sport + ' · ' : '') + longDate(a.event_date) + ' · ' + plural(a.photos.length, 'photo'); }

  /* The team's page: a list of its games, each a link. The photos of a game only load when it is opened. */
  function renderGames(j) {
    var total = 0; j.albums.forEach(function (a) { total += a.photos.length; });
    albumsRoot.appendChild(el('h2', 'tp-album-h', 'Games'));
    albumsRoot.appendChild(el('div', 'tp-meta', plural(j.albums.length, 'game') + ' · ' + plural(total, 'photo') + '. Choose a game to see its photos.'));
    var list = el('div', 'tp-games'); list.setAttribute('data-testid', 'games');
    j.albums.forEach(function (a) {
      var link = el('a', 'tp-game'); link.href = teamUrl(a.id); link.setAttribute('data-testid', 'game-link');
      var first = a.photos.filter(function (p) { return httpsOk(p.thumb_url); })[0];
      if (first) { var img = el('img'); img.src = first.thumb_url; img.alt = ''; img.loading = 'lazy'; link.appendChild(img); }
      link.appendChild(el('span', 'tp-game-name', a.name));
      link.appendChild(el('span', 'tp-game-meta', meta(a)));
      list.appendChild(link);
    });
    albumsRoot.appendChild(list);
  }

  /* One game: its photos in the order they were taken, and a way back to the list. */
  function renderGame(j, a) {
    document.title = a.name + ' | ' + j.team.name + ' Photos | 5-Star Sports Media';
    var back = el('a', 'tp-back', '← All ' + j.team.name + ' games'); back.href = teamUrl(''); back.setAttribute('data-testid', 'back-to-games');
    albumsRoot.appendChild(back);
    var sec = el('section', 'tp-album'); sec.setAttribute('data-testid', 'album');
    sec.appendChild(el('h2', 'tp-album-h', a.name));
    sec.appendChild(el('div', 'tp-meta', meta(a)));
    var g = el('div', 'tp-grid');
    a.photos.forEach(function (p) {
      if (!httpsOk(p.thumb_url) || !httpsOk(p.web_url)) return;
      var idx = all.length; all.push({ web_url: p.web_url, filename: p.filename, album: a.name });
      var b = el('button', 'tp-tile'); b.type = 'button'; b.setAttribute('aria-label', 'Open photo ' + p.filename);
      var img = el('img'); img.src = p.thumb_url; img.alt = a.name + ' ' + p.filename; img.loading = 'lazy';
      if (p.width && p.height) { img.width = 320; img.height = Math.round(320 * p.height / p.width); }
      b.appendChild(img); b.addEventListener('click', function () { show(idx); }); g.appendChild(b);
    });
    sec.appendChild(g); albumsRoot.appendChild(sec);
  }

  fetch(CFG.serviceUrl + '/site/team?slug=' + encodeURIComponent(slug))
    .then(function (r) { return r.ok ? r.json() : null; }, function () { return undefined; })
    .then(function (j) {
      if (j === undefined) { message('The photos could not be loaded right now. Please try again in a moment.'); return; }
      if (!j || !j.team) { message('That team page was not found.'); return; }
      document.title = j.team.name + ' Photos | 5-Star Sports Media';
      root.textContent = ''; albumsRoot.textContent = '';
      root.appendChild(el('span', 'section-label', '5-Star Sports Media'));
      root.appendChild(el('div', 'gold-line'));
      var h = el('h1', 'tp-title', j.team.name); h.setAttribute('data-testid', 'team-name'); root.appendChild(h);
      if (!j.albums.length) { albumsRoot.appendChild(el('div', 'tp-box', 'No photos here yet. Check back soon.')); return; }
      if (gameId) {
        var a = j.albums.filter(function (x) { return x.id === gameId; })[0];
        if (a) { renderGame(j, a); return; }
        var lost = el('div', 'tp-box'); lost.setAttribute('data-testid', 'game-missing');
        lost.appendChild(document.createTextNode('That game was not found. '));
        var all2 = el('a', 'tp-back', 'See all games'); all2.href = teamUrl(''); lost.appendChild(all2);
        albumsRoot.appendChild(lost); return;
      }
      renderGames(j);
    });
})();
