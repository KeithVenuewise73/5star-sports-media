/* ============================================================
   5-Star Sports Media — Calendar Loader
   assets/js/calendar-loader.js

   Reads the privacy-safe Supabase VIEWS:
     • public_this_week  → homepage "This Week in WNY Sports" preview
     • public_upcoming   → full wny-sports-calendar.html page

   These views expose ONLY:
     - synced sports events from the `events` table, PLUS
     - manual `family_events` rows where visibility = 'public'.
   Personal/family events (dentist, etc.) default to visibility='family'
   and are structurally excluded — they can never appear here.
   Because they are live views, family edits/deletes in HomeHuddle
   propagate automatically on next load.

   Depends on sbFetch() from assets/js/supabase.js (already loaded).
   If a view returns nothing, the static fallback cards already in
   the HTML are left untouched — same pattern as #featured-story.

   USAGE:
     Homepage:        add  <script src="assets/js/calendar-loader.js"></script>
                      after supabase.js, and give the preview grid id="this-week-grid".
     Calendar page:   same script; give the events wrapper id="calendar-events".
   ============================================================ */

(function () {
  'use strict';

  /* ---- column → card mapping ----------------------------------
     Views expose: uid, name, kid, platform, sport, start, end,
                   location, description, conflict, is_duplicate, synced_at
     We render with your existing .cal-event markup + .badge system. */

  var SPORT_FILTERS = {
    hockey: 'hockey', baseball: 'baseball', basketball: 'basketball',
    lacrosse: 'lacrosse', soccer: 'soccer', clinic: 'clinic',
    facility: 'facility', community: 'community'
  };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function fmtDate(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d)) return '';
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }
  function fmtTime(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d)) return '';
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }

  // Map a free-text sport to one of our filter buckets (for the data-sport attr)
  function sportKey(sport) {
    var s = (sport || '').toLowerCase();
    if (s.indexOf('hockey') > -1) return 'hockey';
    if (s.indexOf('baseball') > -1 || s.indexOf('softball') > -1) return 'baseball';
    if (s.indexOf('basketball') > -1) return 'basketball';
    if (s.indexOf('lacrosse') > -1) return 'lacrosse';
    if (s.indexOf('soccer') > -1) return 'soccer';
    return s.replace(/[^a-z]/g, '') || 'event';
  }

  // Clean up the location field — views sometimes store "EMPTY"
  function cleanLoc(loc) {
    if (!loc || /^empty$/i.test(loc)) return 'Location TBA';
    return loc;
  }

  // Derive a coverage badge. The synced platforms don't know about
  // 5-Star coverage, so every synced event defaults to "Coverage Available".
  // (Later: join to a 5-Star-side table to mark covered events.)
  function badge() {
    return '<span class="badge badge--available">Coverage Available</span>';
  }

  function renderEventCard(ev, withDate) {
    var sport = ev.sport || 'Event';
    var key   = sportKey(sport);
    var date  = fmtDate(ev.start);
    var time  = fmtTime(ev.start);
    var loc   = cleanLoc(ev.location);
    var org   = ev.platform ? (ev.platform === 'leagueapps' ? 'LeagueApps' :
                ev.platform === 'gamechanger' ? 'GameChanger' : ev.platform) : '';

    var rows = '';
    if (withDate && date) rows += '<div class="cal-row"><span class="k">Date</span><span>' + esc(date) + '</span></div>';
    if (time)             rows += '<div class="cal-row"><span class="k">Time</span><span>' + esc(time) + '</span></div>';
    rows += '<div class="cal-row"><span class="k">Where</span><span>' + esc(loc) + '</span></div>';
    if (org)              rows += '<div class="cal-row"><span class="k">Org</span><span>' + esc(org) + '</span></div>';

    return '' +
      '<article class="cal-event" data-sport="' + esc(key) + '">' +
        '<div class="cal-event-top">' +
          '<span class="cal-event-sport">' + esc(sport) + '</span>' + badge() +
        '</div>' +
        '<h3>' + esc(ev.name || 'Event') + '</h3>' +
        rows +
        '<div class="cal-event-btn"><a href="wny-sports-calendar.html">View Event →</a></div>' +
      '</article>';
  }

  /* ---- HOMEPAGE: "This Week in WNY Sports" preview ------------- */
  async function loadThisWeek() {
    var grid = document.getElementById('this-week-grid');
    if (!grid || typeof sbFetch !== 'function') return;

    var rows = await sbFetch('public_this_week', {
      select: '*',
      order:  'start.asc',
      limit:  5
    });

    if (!rows || !rows.length) return; // keep static fallback cards
    grid.innerHTML = rows.map(function (ev) { return renderEventCard(ev, true); }).join('');
  }

  /* ---- CALENDAR PAGE: full upcoming list, grouped by day ------- */
  async function loadCalendar() {
    var wrap = document.getElementById('calendar-events');
    if (!wrap || typeof sbFetch !== 'function') return;

    var rows = await sbFetch('public_upcoming', {
      select: '*',
      order:  'start.asc',
      limit:  100
    });

    if (!rows || !rows.length) return; // keep static fallback cards

    // group by calendar day
    var groups = {};
    rows.forEach(function (ev) {
      var d = new Date(ev.start);
      if (isNaN(d)) return;
      var key = d.toISOString().slice(0, 10);
      (groups[key] = groups[key] || []).push(ev);
    });

    var html = Object.keys(groups).sort().map(function (key) {
      var d = new Date(key + 'T00:00:00');
      var num = d.toLocaleDateString('en-US', { day: 'numeric' });
      var dow = d.toLocaleDateString('en-US', { weekday: 'long' });
      var mon = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      var cards = groups[key].map(function (ev) { return renderEventCard(ev, false); }).join('');
      return '' +
        '<div class="cal-day">' +
          '<div class="cal-day-head"><span class="cal-day-num">' + esc(num) + '</span>' +
            '<div><span class="cal-day-dow">' + esc(dow) + '</span> ' +
            '<span class="cal-day-mon">' + esc(mon) + '</span></div></div>' +
          '<div class="cal-grid cols-3">' + cards + '</div>' +
        '</div>';
    }).join('');

    wrap.innerHTML = html;

    // re-bind the sport filter chips to the freshly rendered events
    if (typeof window.rebindCalendarFilters === 'function') window.rebindCalendarFilters();
  }

  document.addEventListener('DOMContentLoaded', function () {
    loadThisWeek();
    loadCalendar();
  });
})();
