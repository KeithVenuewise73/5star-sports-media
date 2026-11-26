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
  /* A save-as name a parent will recognise: team, game, then the camera's own file name. */
  function saveName(team, game, file) {
    var clean = function (t) { return String(t || '').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, ''); };
    var f = clean(file); if (!/\.jpe?g$/i.test(f)) f += '.jpg';
    return [clean(team), clean(game), f].filter(Boolean).join('_').slice(0, 150);
  }
  /* A clip is saved as an .mp4 (that is what it is, whatever the phone called the original). */
  function clipName(team, game, file) { return saveName(team, game, String(file || '').replace(/\.[^.]+$/, '')).replace(/\.jpg$/i, '.mp4'); }
  function seconds(d) { d = Math.round(Number(d) || 0); return Math.floor(d / 60) + ':' + (d % 60 < 10 ? '0' : '') + (d % 60); }
  /* The photo's own address plus ?download=<name>: the storage service then sends it as a download. */
  function downloadUrl(u, name) { return u + (u.indexOf('?') === -1 ? '?' : '&') + 'download=' + encodeURIComponent(name); }
  function message(text) { root.textContent = ''; root.appendChild(el('div', 'tp-box', text)); }

  /* ---- the picture viewer ---- */
  var box = el('div', 'tp-lb'); box.hidden = true; box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', 'Photo viewer');
  var big = el('img', 'tp-big'); big.alt = '';
  /* A clip plays in this player instead of the picture. */
  var vid = el('video', 'tp-vid'); vid.controls = true; vid.playsInline = true; vid.setAttribute('playsinline', ''); vid.preload = 'metadata'; vid.hidden = true; vid.setAttribute('data-testid', 'viewer-video');
  var cap = el('div', 'tp-cap');
  var close = el('button', 'tp-x', 'Close'); close.type = 'button';
  var acts = el('div', 'tp-actions');
  var dl = el('a', 'tp-dl-big', 'Download'); dl.setAttribute('data-testid', 'viewer-download'); dl.rel = 'noopener';
  var large = el('a', 'tp-dl-big', 'Download large'); large.setAttribute('data-testid', 'viewer-download-large'); large.rel = 'noopener'; large.hidden = true; large.title = 'A bigger copy (3,600 pixels), good for printing';
  var share = el('button', 'tp-dl-big', 'Share'); share.type = 'button'; share.hidden = true; share.setAttribute('data-testid', 'viewer-share');
  var copy = el('button', 'tp-dl-big', 'Copy link'); copy.type = 'button'; copy.setAttribute('data-testid', 'viewer-copy');
  var note = el('div', 'tp-note'); note.setAttribute('role', 'status'); note.setAttribute('data-testid', 'viewer-note');
  acts.appendChild(dl); acts.appendChild(large); acts.appendChild(share); acts.appendChild(copy);
  var prev = el('button', 'tp-nav tp-prev', '‹'); prev.type = 'button'; prev.setAttribute('aria-label', 'Previous photo');
  var next = el('button', 'tp-nav tp-next', '›'); next.type = 'button'; next.setAttribute('aria-label', 'Next photo');
  box.appendChild(close); box.appendChild(prev); box.appendChild(big); box.appendChild(vid); box.appendChild(next); box.appendChild(cap); box.appendChild(note); box.appendChild(acts);
  /* Share: on a phone the share menu sends the picture itself (Messages, WhatsApp, Mail, Photos...) with nothing saved first.
     A browser that can share but not a file shares the link instead. Where there is no share menu the button is hidden. */
  function canShareFiles() { try { return !!(navigator.share && navigator.canShare && navigator.canShare({ files: [new File([''], 'x.jpg', { type: 'image/jpeg' })] })); } catch (e) { return false; } }
  function say(t) { note.textContent = t; clearTimeout(say.h); say.h = setTimeout(function () { note.textContent = ''; }, 2600); }
  share.addEventListener('click', function () {
    var p = all[at]; if (!p) return;
    var link = photoLink(p);
    share.disabled = true;
    var done = function () { share.disabled = false; };
    if (canShareFiles() && !p.video) {
      fetch(p.web_url).then(function (r) { return r.blob(); }).then(function (b) {
        return navigator.share({ files: [new File([b], p.saveName, { type: 'image/jpeg' })], title: p.album, text: p.album + ' · 5-Star Sports Media' });
      }).catch(function () { /* cancelled, or not allowed: Copy link and Download are still there */ }).then(done);
    } else {
      navigator.share({ title: p.album, text: p.album + ' · 5-Star Sports Media', url: link }).catch(function () {}).then(done);
    }
  });
  /* Copy link: the address of this very photo on this site, to paste into a text or an email. */
  copy.addEventListener('click', function () {
    var p = all[at]; if (!p) return;
    var link = photoLink(p);
    var ok = function () { say('Link copied. Paste it into a text or an email.'); };
    var manual = function () { window.prompt('Copy this link:', link); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(link).then(ok, manual); else manual();
  });
  document.body.appendChild(box);
  /* The big picture: says it is loading, tries again if the storage service is busy, and if it still
     cannot load shows the small version with a plain message (Download still works). */
  var bigTry = 0, bigFor = null;
  function loadBig(p) {
    bigTry = 0; bigFor = p; big.style.opacity = '.55'; note.textContent = 'Loading the picture…';
    big.fetchPriority = 'high'; big.src = p.web_url;
  }
  big.addEventListener('load', function () {
    if (big.src.indexOf('-web.jpg') === -1) return;   /* the small stand-in, not the real picture */
    big.style.opacity = ''; note.textContent = '';
  });
  big.addEventListener('error', function () {
    var p = bigFor; if (!p || box.hidden) return;
    if (bigTry < 3) {
      bigTry += 1; var n = bigTry;
      setTimeout(function () { if (bigFor === p && !box.hidden) big.src = p.web_url + (p.web_url.indexOf('?') === -1 ? '?' : '&') + 'try=' + n; }, 1200 * n);
      return;
    }
    big.style.opacity = ''; note.textContent = 'The full picture could not load right now. Try again in a moment, or use Download.';
    if (p.thumb_url && big.src.indexOf(p.thumb_url) === -1) big.src = p.thumb_url;
  });
  function show(i) {
    if (i < 0 || i >= all.length) return;
    at = i; var p = all[i];
    dl.href = downloadUrl(p.video ? p.video_url : p.web_url, p.saveName); dl.setAttribute('download', p.saveName); share.hidden = !navigator.share; note.textContent = '';
    /* The large copy is offered only when the owner has it switched on and this photo has one. */
    large.hidden = !p.large;
    if (p.large) { large.href = CFG.serviceUrl + '/site/large?photo=' + encodeURIComponent(p.id) + '&name=' + encodeURIComponent(p.saveName); large.setAttribute('download', p.saveName); }
    /* the address bar now names this photo, so it can be copied from there too */
    try { history.replaceState(null, '', photoLink(p).replace(location.origin, '')); } catch (e) {}
    /* a clip shows the player; a photo shows the picture */
    big.hidden = !!p.video; vid.hidden = !p.video;
    if (p.video) { vid.pause(); big.removeAttribute('src'); vid.poster = p.web_url; vid.src = p.video_url; note.textContent = ''; bigFor = null; }
    else { try { vid.pause(); } catch (e) {} vid.removeAttribute('src'); loadBig(p); }
    big.alt = p.filename; cap.textContent = p.album + ' · ' + (p.video ? 'Clip ' + seconds(p.duration) + ' · ' : '') + p.filename + ' (' + (i + 1) + ' of ' + all.length + ')';
    box.hidden = false; close.focus();
  }
  function hide() { box.hidden = true; big.removeAttribute('src'); try { vid.pause(); } catch (e) {} vid.removeAttribute('src'); vid.load(); try { history.replaceState(null, '', teamUrl(gameId)); } catch (e) {} }
  close.addEventListener('click', hide); box.addEventListener('click', function (e) { if (e.target === box) hide(); });
  prev.addEventListener('click', function () { show(at - 1); }); next.addEventListener('click', function () { show(at + 1); });
  document.addEventListener('keydown', function (e) { if (box.hidden) return; if (e.key === 'Escape') hide(); else if (e.key === 'ArrowLeft') show(at - 1); else if (e.key === 'ArrowRight') show(at + 1); });

  if (!slug || !CFG.serviceUrl) { message('That team page was not found.'); return; }
  var gameId = new URLSearchParams(location.search).get('game') || '';
  function photoLink(p) { return location.origin + teamUrl(gameId) + '&photo=' + encodeURIComponent(p.id); }
  function teamUrl(id) { return location.pathname + '?team=' + encodeURIComponent(slug) + (id ? '&game=' + encodeURIComponent(id) : ''); }
  function counts(photos) {
    var clips = photos.filter(function (p) { return p.video; }).length;
    return plural(photos.length - clips, 'photo') + (clips ? ' · ' + plural(clips, 'clip') : '');
  }
  function meta(a) { return (a.sport ? a.sport + ' · ' : '') + longDate(a.event_date) + ' · ' + counts(a.photos); }

  /* The team's page: a list of its games, each a link. The photos of a game only load when it is opened. */
  function renderGames(j) {
    var allPhotos = []; j.albums.forEach(function (a) { allPhotos = allPhotos.concat(a.photos); });
    albumsRoot.appendChild(el('h2', 'tp-album-h', 'Games'));
    albumsRoot.appendChild(el('div', 'tp-meta', plural(j.albums.length, 'game') + ' · ' + counts(allPhotos) + '. Choose a game to see its photos and clips.'));
    var list = el('div', 'tp-games'); list.setAttribute('data-testid', 'games');
    j.albums.forEach(function (a) {
      var link = el('a', 'tp-game'); link.href = teamUrl(a.id); link.setAttribute('data-testid', 'game-link');
      var first = a.photos.filter(function (p) { return httpsOk(p.thumb_url); })[0];
      if (first) { var img = el('img'); img.loading = 'lazy'; img.src = first.thumb_url; img.alt = ''; link.appendChild(img); }
      link.appendChild(el('span', 'tp-game-name', a.name));
      link.appendChild(el('span', 'tp-game-meta', meta(a)));
      list.appendChild(link);
    });
    albumsRoot.appendChild(list);
  }

  /* One game: its photos in the order they were taken, and a way back to the list. */
  var seen = ('IntersectionObserver' in window) ? new IntersectionObserver(function (entries) {
    entries.forEach(function (e) { if (e.isIntersecting) { seen.unobserve(e.target); e.target.src = e.target.dataset.src; } });
  }, { rootMargin: '900px 0px' }) : null;
  function renderGame(j, a) {
    document.title = a.name + ' | ' + j.team.name + ' Photos | 5-Star Sports Media';
    var back = el('a', 'tp-back', '← All ' + j.team.name + ' games'); back.href = teamUrl(''); back.setAttribute('data-testid', 'back-to-games');
    albumsRoot.appendChild(back);
    var sec = el('section', 'tp-album'); sec.setAttribute('data-testid', 'album');
    sec.appendChild(el('h2', 'tp-album-h', a.name));
    sec.appendChild(el('div', 'tp-meta', meta(a)));
    /* Clips are listed first, then photos, each in its own section with numbered pages (not one long scroll).
       The viewer steps through the same order: all the clips, then all the photos. */
    var items = [];
    a.photos.forEach(function (p) {
      if (!httpsOk(p.thumb_url) || !httpsOk(p.web_url)) return;
      var isClip = !!(p.video && p.video_url && httpsOk(p.video_url));
      var name = isClip ? clipName(j.team.name, a.name, p.filename) : saveName(j.team.name, a.name, p.filename);
      items.push({ src: p, isClip: isClip, name: name, rec: { id: p.id, web_url: p.web_url, thumb_url: p.thumb_url, filename: p.filename, album: a.name, saveName: name, large: !isClip && !!(j.large_downloads && p.large), video: isClip, video_url: isClip ? p.video_url : null, duration: p.duration } });
    });
    var ordered = items.filter(function (x) { return x.isClip; }).concat(items.filter(function (x) { return !x.isClip; }));
    ordered.forEach(function (x, i) { x.idx = i; all.push(x.rec); });
    var groups = [
      { key: 'clips', label: 'Videos', list: ordered.filter(function (x) { return x.isClip; }), size: 24, page: 0 },
      { key: 'photos', label: 'Photos', list: ordered.filter(function (x) { return !x.isClip; }), size: 60, page: 0 }
    ].filter(function (gr) { return gr.list.length; });
    function tile(x, g) {
      var p = x.src, isClip = x.isClip, name = x.name;
      var cell = el('div', 'tp-cell');
      var b = el('button', 'tp-tile'); b.type = 'button'; b.setAttribute('aria-label', (isClip ? 'Play clip ' : 'Open photo ') + p.filename);
      var img = el('img'); img.decoding = 'async'; img.alt = a.name + ' ' + p.filename;
      if (seen) { img.dataset.src = p.thumb_url; seen.observe(img); } else { img.loading = 'lazy'; img.src = p.thumb_url; }
      img.addEventListener('error', function () { if (img.dataset.retry) return; img.dataset.retry = '1'; setTimeout(function () { img.src = p.thumb_url + (p.thumb_url.indexOf('?') === -1 ? '?' : '&') + 'try=1'; }, 1500); });
      if (p.width && p.height) { img.width = 320; img.height = Math.round(320 * p.height / p.width); }
      b.appendChild(img); b.addEventListener('click', function () { show(x.idx); }); cell.appendChild(b);
      if (isClip) { var pl = el('span', 'tp-play', '▶ ' + seconds(p.duration)); pl.setAttribute('data-testid', 'clip-badge'); b.appendChild(pl); }
      var d = el('a', 'tp-dl', 'Download'); d.href = downloadUrl(isClip ? p.video_url : p.web_url, name); d.setAttribute('download', name); d.rel = 'noopener';
      d.setAttribute('aria-label', (isClip ? 'Download clip ' : 'Download photo ') + p.filename); d.setAttribute('data-testid', 'tile-download');
      cell.appendChild(d); g.appendChild(cell);
    }
    function pager(gr, draw) {
      var pages = Math.ceil(gr.list.length / gr.size), nav = el('nav', 'tp-pager'); nav.setAttribute('aria-label', gr.label + ' pages'); nav.setAttribute('data-testid', 'pager-' + gr.key);
      if (pages < 2) return nav;
      function btn(t, pg, on, label) {
        var bt = el('button', 'tp-pg' + (on ? ' tp-pg-on' : ''), t); bt.type = 'button'; if (label) bt.setAttribute('aria-label', label);
        if (on) bt.setAttribute('aria-current', 'page');
        bt.disabled = pg < 0 || pg >= pages; bt.addEventListener('click', function () { gr.page = pg; draw(true); }); nav.appendChild(bt);
      }
      btn('‹ Prev', gr.page - 1, false, 'Previous page');
      for (var n = 0; n < pages; n++) btn(String(n + 1), n, n === gr.page, 'Page ' + (n + 1));
      btn('Next ›', gr.page + 1, false, 'Next page');
      return nav;
    }
    groups.forEach(function (gr) {
      var wrap = el('div', 'tp-group'); wrap.setAttribute('data-testid', 'group-' + gr.key);
      var head = el('h3', 'tp-group-h', gr.label + ' (' + gr.list.length + ')'); wrap.appendChild(head);
      var holder = el('div'); wrap.appendChild(holder);
      function draw(scroll) {
        holder.textContent = '';
        var g = el('div', 'tp-grid'); g.setAttribute('data-testid', 'grid-' + gr.key);
        gr.list.slice(gr.page * gr.size, (gr.page + 1) * gr.size).forEach(function (x) { tile(x, g); });
        holder.appendChild(pager(gr, draw)); holder.appendChild(g);
        var bottom = pager(gr, draw); bottom.setAttribute('data-testid', 'pager-' + gr.key + '-bottom'); holder.appendChild(bottom);
        if (scroll) { try { head.scrollIntoView({ block: 'start' }); } catch (e) {} }
      }
      gr.draw = draw; draw(false); sec.appendChild(wrap);
    });
    albumsRoot.appendChild(sec);
    /* A link to one photo (…&photo=<id>) opens it straight away. */
    var want = new URLSearchParams(location.search).get('photo');
    if (want) { for (var k = 0; k < all.length; k++) if (all[k].id === want) {
      groups.forEach(function (gr) { for (var q = 0; q < gr.list.length; q++) if (gr.list[q].idx === k) { gr.page = Math.floor(q / gr.size); gr.draw(false); } });
      show(k); break; } }
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
