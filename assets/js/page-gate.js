/* The gate. Loaded in the <head> of every page that can be switched off.

   A page that is not switched ON sends the visitor to the home page (with a note
   saying it is coming soon, when it is listed that way). It fails CLOSED: if the
   list of pages cannot be read, the page is treated as off, so a switched-off page
   can never show just because something was down. Pages are hidden until the
   answer is in (a few milliseconds when the list is remembered).

   Staff tools (admin, media dashboard, academy portal, photo review) and the
   pages that are always on do not load this. */
(function () {
  'use strict';
  var root = document.documentElement;
  root.style.visibility = 'hidden';

  var path = location.pathname.replace(/^\/+/, '');
  if (path === '' || path.slice(-1) === '/') path += 'index.html';

  function leave(slug) {
    location.replace('/index.html?soon=' + encodeURIComponent(slug || ''));
  }

  if (!window.SitePages) { leave(''); return; }
  window.SitePages.load().then(function (pages) {
    var page = window.SitePages.match(pages, path);
    if (page && page.enabled) { root.style.visibility = ''; return; }
    leave(page && page.coming_soon ? page.slug : '');
  });
})();
