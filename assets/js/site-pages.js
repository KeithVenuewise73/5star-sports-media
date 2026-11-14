/* Which pages of the site are switched on. One shared reader for every page.

   The list comes from the review service (GET /site/pages): page names and
   addresses only, public to read. It is remembered for a minute so a visit does
   not ask on every page. If it cannot be read, nothing is guessed: callers get
   null, and the gate treats a switched-off-by-default page as OFF (see page-gate.js).

   Free of any secret. */
(function () {
  'use strict';

  var CFG = window.REVIEW_CONFIG || {};
  var KEY = 'sitePagesV1';

  function cacheSeconds() {
    return typeof CFG.pageCacheSeconds === 'number' ? CFG.pageCacheSeconds : 60;
  }

  /* -> Promise of an array of pages, or null when the list cannot be read. */
  function load() {
    if (!CFG.serviceUrl) return Promise.resolve(null);
    var secs = cacheSeconds();
    if (secs > 0) {
      try {
        var hit = JSON.parse(sessionStorage.getItem(KEY) || 'null');
        if (hit && Date.now() - hit.at < secs * 1000 && Array.isArray(hit.pages)) return Promise.resolve(hit.pages);
      } catch (e) { /* storage unavailable: just ask */ }
    }
    var ctl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctl) ctl.abort(); }, 4000);
    return fetch(CFG.serviceUrl + '/site/pages', { cache: secs > 0 ? 'default' : 'no-store', signal: ctl ? ctl.signal : undefined })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        clearTimeout(timer);
        if (!j || !Array.isArray(j.pages)) return null;
        if (secs > 0) { try { sessionStorage.setItem(KEY, JSON.stringify({ at: Date.now(), pages: j.pages })); } catch (e) { /* fine */ } }
        return j.pages;
      })
      .catch(function () { clearTimeout(timer); return null; });
  }

  /* The page group a file belongs to: an exact file, or anything under a folder ('scores/'). */
  function match(pages, path) {
    if (!pages) return null;
    path = String(path || '').replace(/^\/+/, '');
    for (var i = 0; i < pages.length; i++) {
      var paths = pages[i].paths || [];
      for (var j = 0; j < paths.length; j++) {
        var p = paths[j];
        if (p === path || (p.slice(-1) === '/' && path.indexOf(p) === 0)) return pages[i];
      }
    }
    return null;
  }

  function enabled(pages) {
    return (pages || []).filter(function (p) { return p.enabled; })
      .sort(function (a, b) { return (a.menu_order - b.menu_order) || a.title.localeCompare(b.title); });
  }
  function comingSoon(pages) {
    return (pages || []).filter(function (p) { return p.coming_soon && !p.enabled; })
      .sort(function (a, b) { return (a.menu_order - b.menu_order) || a.title.localeCompare(b.title); });
  }

  /* "I'd like this": count-only. Nothing about the visitor is sent but the page name. */
  function interest(slug) {
    return fetch(CFG.serviceUrl + '/site/interest', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ slug: slug })
    }).then(function (r) { return r.ok; }, function () { return false; });
  }

  window.SitePages = { load: load, match: match, enabled: enabled, comingSoon: comingSoon, interest: interest };
})();
