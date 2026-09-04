/* ============================================================================
   GameTracker — top scores strip
   assets/js/gametracker-strip.js

   The thin band across the very top of every page: today's WNY games, live
   scores first, scrolling sideways on a phone. It sits ABOVE the sponsor
   ticker and never takes a sponsor rotation slot.

   Reads the same GameTracker API as everything else -- no second data path,
   no cached copy of a score.

   It removes itself when there is nothing on today. A permanently empty black
   bar at the top of every page is worse than no bar, and a bar that shows a
   placeholder game would be a lie on 29 pages at once.

   Loaded by components.js right after the header is injected, so it appears
   on every page that has a header without editing 29 HTML files.
   ============================================================================ */

(function () {
  'use strict';

  /* The site is served from the domain root (CNAME 5starsportsmedia.com), so
     root-absolute paths work from any depth -- including /scores/football/. */

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      if (document.querySelector('script[data-gt-dep="' + src + '"]')) return resolve();
      var s = document.createElement('script');
      s.src = src;
      s.async = false;                 // keep config before client
      s.dataset.gtDep = src;
      s.onload = resolve;
      s.onerror = function () { reject(new Error('could not load ' + src)); };
      document.head.appendChild(s);
    });
  }

  /* Check each dependency SEPARATELY. Pages vary in what they already load --
     index.html has both, players.html has config.js only, about.html has
     neither. Re-running config.js throws "VENUEWISE_CONFIG has already been
     declared" (top-level const), so a page must never be given one it has. */
  async function ensureClient() {
    try {
      if (!window.VENUEWISE_CONFIG) await loadScript('/shared/config.js');
      if (!window.GameTracker)      await loadScript('/shared/gametracker.js');
      return !!(window.GameTracker && window.VENUEWISE_CONFIG);
    } catch (e) {
      return false;                    // stay silent; the page is still fine
    }
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* Short team labels -- a 40-character school name does not belong in a
     ticker chip. Keeps the first two words, which is how people say them. */
  function shortName(name) {
    if (!name) return 'TBD';
    var n = String(name).replace(/\s+(High School|HS|Senior High|Central School)$/i, '').trim();
    var parts = n.split(/\s+/);
    return parts.length > 2 ? parts.slice(0, 2).join(' ') : n;
  }

  function chip(ev) {
    var href = '/scores.html?sport=' + encodeURIComponent(ev.sport);
    var away = esc(shortName(ev.away_team_name));
    var home = esc(shortName(ev.home_team_name));

    /* A meet has no opponent -- show what it actually is. */
    if (ev.scoring_model === 'meet' || !ev.away_team_name) {
      return '<a class="gt-strip-chip" href="' + href + '">' +
        '<span class="gt-strip-when">' + esc(ev.start_time || 'TBD') + '</span>' +
        '<span class="gt-strip-teams">' + esc(ev.event_name || shortName(ev.home_team_name)) + '</span>' +
      '</a>';
    }

    var lead;
    if (ev.status === 'live') {
      lead = '<span class="gt-strip-live"><i></i>Live</span>';
    } else if (ev.status === 'final') {
      lead = '<span class="gt-strip-final">Final</span>';
    } else if (ev.status === 'postponed' || ev.status === 'cancelled') {
      lead = '<span class="gt-strip-final">' + esc(ev.status === 'postponed' ? 'Ppd' : 'Canc') + '</span>';
    } else {
      lead = '<span class="gt-strip-when">' + esc(ev.start_time || 'TBD') + '</span>';
    }

    var body;
    if (ev.status === 'live' || ev.status === 'final') {
      var aw = ev.away_score == null ? '-' : esc(ev.away_score);
      var hm = ev.home_score == null ? '-' : esc(ev.home_score);
      var awWin = ev.away_score > ev.home_score ? ' is-up' : '';
      var hmWin = ev.home_score > ev.away_score ? ' is-up' : '';
      body = '<span class="gt-strip-teams">' +
               '<span class="gt-strip-t' + awWin + '">' + away + ' <b>' + aw + '</b></span>' +
               '<span class="gt-strip-t' + hmWin + '">' + home + ' <b>' + hm + '</b></span>' +
             '</span>';
    } else {
      /* Stack away over home exactly like a score chip, so every chip in the
         rail is the same height. A single run with an inline "@" wraps to
         three lines on a phone and makes the strip ragged. */
      body = '<span class="gt-strip-teams">' +
               '<span class="gt-strip-t">' + away + '</span>' +
               '<span class="gt-strip-t"><em>at</em> ' + home + '</span>' +
             '</span>';
    }

    var tail = (ev.status === 'live' && ev.period)
      ? '<span class="gt-strip-per">' + esc(ev.period) + (ev.clock ? ' ' + esc(ev.clock) : '') + '</span>'
      : '';

    return '<a class="gt-strip-chip" href="' + href + '">' + lead + body + tail + '</a>';
  }


  /* ── the marquee ──────────────────────────────────────────────────────────
     Scrolls continuously, but STOPS the moment anyone tries to use it. A
     ticker that keeps sliding while a parent hunts for their kid's game is
     worse than a static one, so it pauses on hover, on touch, on keyboard
     focus, and whenever the tab is in the background.

     Driven by scrollLeft rather than a CSS transform, because a transform
     would fight manual swiping -- this way the reader can still flick through
     it themselves and the marquee simply picks up from wherever they left it. */

  var raf = null, lastT = 0, paused = false, resumeTimer = null;
  var offset = 0;                 // see below: must be tracked as a float
  var SPEED = 34;                 // px per second -- readable, not urgent

  function reduceMotion() {
    return window.matchMedia &&
           window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function step(t) {
    var rail = document.getElementById('gtRail');
    if (!rail) { raf = null; return; }
    var dt = lastT ? Math.min((t - lastT) / 1000, 0.1) : 0;   // clamp after a stall
    lastT = t;

    if (!paused && !document.hidden) {
      // scrollLeft is rounded to whole pixels, so `scrollLeft += 0.54` every
      // frame rounds straight back to zero and the ticker never moves at all.
      // Accumulate the true position here and assign it; read scrollLeft back
      // only to notice a manual swipe.
      if (Math.abs(rail.scrollLeft - offset) > 2) offset = rail.scrollLeft;
      offset += SPEED * dt;

      // One run's width behind us: jump back by exactly that. The identical
      // second copy means nothing appears to move.
      var run = rail.firstElementChild;
      if (run && offset >= run.offsetWidth) offset -= run.offsetWidth;

      rail.scrollLeft = offset;
    }
    raf = requestAnimationFrame(step);
  }

  function pause()  { paused = true; if (resumeTimer) { clearTimeout(resumeTimer); resumeTimer = null; } }
  function resume() { if (resumeTimer) clearTimeout(resumeTimer);
                      resumeTimer = setTimeout(function () { paused = false; }, 1200); }

  function startMarquee() {
    var rail = document.getElementById('gtRail');
    if (!rail) return;

    if (raf) { cancelAnimationFrame(raf); raf = null; }
    lastT = 0; paused = false; offset = 0;

    // Nothing to scroll, or the reader has asked for less motion: leave it
    // static and swipeable. Still perfectly usable, just not moving.
    var run = rail.firstElementChild;
    if (reduceMotion() || !run || run.offsetWidth <= rail.clientWidth) {
      rail.classList.add('is-static');
      return;
    }
    rail.classList.remove('is-static');

    rail.addEventListener('pointerenter', pause);
    rail.addEventListener('pointerleave', resume);
    rail.addEventListener('pointerdown', pause);
    rail.addEventListener('pointerup', resume);
    rail.addEventListener('pointercancel', resume);
    rail.addEventListener('touchstart', pause, { passive: true });
    rail.addEventListener('touchend', resume, { passive: true });
    rail.addEventListener('focusin', pause);     // keyboard tabbing through games
    rail.addEventListener('focusout', resume);

    raf = requestAnimationFrame(step);
  }

  var timer = null;

  async function render() {
    var strip = document.getElementById('gtStrip');
    if (!strip) return;

    var res = await window.GameTracker.events({ region: 'WNY', status: 'today', limit: 30 });

    // Unreachable, or nothing on today: take the bar away entirely.
    if (res.error || !res.events.length) {
      strip.hidden = true;
      strip.innerHTML = '';
      if (timer) { clearTimeout(timer); timer = null; }
      if (raf) { cancelAnimationFrame(raf); raf = null; }
      return;
    }

    // The chip list is rendered TWICE. The marquee wraps by subtracting one
    // list-width from scrollLeft, which is invisible only if an identical copy
    // is already sitting there. The copy is aria-hidden so a screen reader
    // reads tonight's games once, not twice.
    var chips = res.events.map(chip).join('');
    strip.innerHTML =
      '<div class="gt-strip-inner">' +
        '<span class="gt-strip-label">Tonight in WNY</span>' +
        '<div class="gt-strip-rail" id="gtRail">' +
          '<div class="gt-strip-run">' + chips + '</div>' +
          '<div class="gt-strip-run" aria-hidden="true">' + chips + '</div>' +
        '</div>' +
        '<a class="gt-strip-all" href="/scores.html">All scores →</a>' +
      '</div>';
    strip.hidden = false;
    startMarquee();

    // Only poll while something is actually live.
    if (timer) { clearTimeout(timer); timer = null; }
    if (res.events.some(function (e) { return e.status === 'live'; })) {
      timer = setTimeout(render, 60000);
    }
  }

  async function init() {
    if (!document.getElementById('gtStrip')) return;
    if (!(await ensureClient())) return;
    render();
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { if (timer) { clearTimeout(timer); timer = null; } }
      else { render(); }
    });
  }

  window.GTStrip = { init: init, render: render };
})();
