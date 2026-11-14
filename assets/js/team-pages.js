/* The Photos page: a card for every team that has public photos, each linking to that team's
   own page (team.html?team=<name>). Written with textContent only. If the list cannot be read,
   or no team has photos yet, the section stays hidden and the rest of the page is unchanged. */
(function () {
  'use strict';
  var CFG = window.REVIEW_CONFIG || {};
  var section = document.getElementById('team-pages-section');
  var grid = document.getElementById('team-pages');
  if (!section || !grid || !CFG.serviceUrl) return;

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function plural(n, w) { return n + ' ' + (n === 1 ? w : w + 's'); }
  function httpsOk(u) { try { return new URL(u).protocol === 'https:' || /^(localhost|127\.0\.0\.1)$/.test(location.hostname); } catch (e) { return false; } }

  fetch(CFG.serviceUrl + '/site/teams')
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (j) {
      if (!j || !Array.isArray(j.teams) || j.teams.length === 0) return;
      j.teams.forEach(function (t) {
        var a = el('a', 'gx-card');
        a.href = 'team.html?team=' + encodeURIComponent(t.slug);
        a.setAttribute('data-testid', 'team-card');
        if (t.cover_url && httpsOk(t.cover_url)) { var img = el('img', 'gx-img'); img.src = t.cover_url; img.alt = t.name; img.loading = 'lazy'; a.appendChild(img); }
        else a.appendChild(el('div', 'gx-ph', '5★'));
        var body = el('div', 'gx-body');
        body.appendChild(el('div', 'gx-name', t.name));
        body.appendChild(el('div', 'gx-meta', plural(t.albums, 'album') + ' · ' + plural(t.photos, 'photo')));
        a.appendChild(body);
        grid.appendChild(a);
      });
      section.hidden = false;
    })
    .catch(function () { /* the rest of the page stands on its own */ });
})();
