/* ============================================================================
   GameTracker — shared UI
   assets/js/gametracker-ui.js

   ONE event card, used by every sport, every page and every module:
   the scoreboard, the homepage "Tonight in WNY", school pages and sport pages
   all render through GTUI.card(). There is deliberately no football card and
   no basketball card -- a sport differs by its data (period label, scoring
   model), not by its own copy of the markup.

   Sports that are not home-vs-away (cross country, track, swimming, golf,
   bowling meets) render as a meet card instead, decided from the event's
   scoring_model, not from a hard-coded list of sport names.
   ============================================================================ */

const GTUI = (() => {
  'use strict';

  /* ── helpers ──────────────────────────────────────────────────────────── */

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  /* Dates come back as plain YYYY-MM-DD. Parsing that with new Date() would
     read it as UTC and show Thursday's game on Wednesday night for anyone in
     Buffalo. Build the date in local time instead. */
  function localDate(ymd) {
    if (!ymd) return null;
    const [y, m, d] = String(ymd).split('-').map(Number);
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d);
  }

  function dayLabel(ymd) {
    const d = localDate(ymd);
    if (!d) return '';
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const diff = Math.round((d - today) / 86400000);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    if (diff === -1) return 'Yesterday';
    if (diff > 1 && diff < 7) return d.toLocaleDateString('en-US', { weekday: 'long' });
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }

  function fullDayLabel(ymd) {
    const d = localDate(ymd);
    if (!d) return '';
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const diff = Math.round((d - today) / 86400000);
    const base = d.toLocaleDateString('en-US',
      { weekday: 'long', month: 'long', day: 'numeric' });
    if (diff === 0) return `Today · ${base}`;
    if (diff === 1) return `Tomorrow · ${base}`;
    return base;
  }

  /* The status badge. 'live' is the only one that gets the pulse. */
  function badge(ev) {
    const s = ev.status;
    if (s === 'live')      return '<span class="gt-badge gt-badge--live"><i></i>Live</span>';
    if (s === 'final')     return '<span class="gt-badge gt-badge--final">Final</span>';
    if (s === 'postponed') return '<span class="gt-badge gt-badge--warn">Postponed</span>';
    if (s === 'suspended') return '<span class="gt-badge gt-badge--warn">Suspended</span>';
    if (s === 'cancelled') return '<span class="gt-badge gt-badge--off">Cancelled</span>';
    return `<span class="gt-badge gt-badge--soon">${esc(ev.start_time || 'TBD')}</span>`;
  }

  /* Period + clock, in the vocabulary of the sport being played. Football says
     Q3, hockey says P2, baseball says Inn 5, volleyball says Set 3 -- all from
     the event's own period field, never assumed. */
  function periodLine(ev) {
    if (ev.status !== 'live') return '';
    const bits = [];
    if (ev.period) bits.push(esc(ev.period));
    if (ev.clock)  bits.push(esc(ev.clock));
    return bits.length ? `<div class="gt-clock">${bits.join(' · ')}</div>` : '';
  }

  function scoreOf(v) {
    return (v === null || v === undefined) ? '&ndash;' : esc(v);
  }

  /* ── the card ─────────────────────────────────────────────────────────── */

  function card(ev, opts = {}) {
    const meet   = ev.scoring_model === 'meet' || !ev.away_team_name;
    const scored = ev.status === 'live' || ev.status === 'final';
    const href   = opts.href !== undefined ? opts.href : null;

    const meta = [];
    if (opts.showSport !== false && ev.sport_name) meta.push(esc(ev.sport_name));
    if (ev.level && ev.level !== 'varsity') meta.push(esc(ev.level.toUpperCase()));
    if (ev.league_name) meta.push(esc(ev.league_name));

    const head = `
      <div class="gt-card-head">
        <span class="gt-meta">${meta.join('<span class="gt-dot">·</span>')}</span>
        ${badge(ev)}
      </div>`;

    /* A meet has a field, not an opponent. Showing "TBD @ Section VI" for the
       cross country championships would be worse than useless. */
    const body = meet
      ? `<div class="gt-meet">
           <div class="gt-meet-name">${esc(ev.event_name || ev.home_team_name)}</div>
           ${Array.isArray(ev.participants) && ev.participants.length
             ? `<div class="gt-meet-field">${ev.participants.map(esc).join(' · ')}</div>` : ''}
         </div>`
      : scored
        /* Live or final: a scoreboard. The team in front is marked -- while a
           game is live that is who is leading, and at full time it is who won. */
        ? `<div class="gt-score">
             ${teamRow(ev.away_team_name, ev.away_score, ev.away_team_slug,
                       ev.away_score > ev.home_score)}
             ${teamRow(ev.home_team_name, ev.home_score, ev.home_team_slug,
                       ev.home_score > ev.away_score)}
           </div>`
        /* Upcoming: a matchup, read the way people say it out loud. */
        : `<div class="gt-matchup">
             ${teamLink(ev.away_team_name, ev.away_team_slug)}
             <span class="gt-at">@</span>
             ${teamLink(ev.home_team_name, ev.home_team_slug)}
           </div>`;

    const when = ev.status === 'upcoming' || ev.status === 'postponed'
      ? `<div class="gt-when">${esc(dayLabel(ev.event_date))}${
           ev.start_time ? ` <span class="gt-dot">·</span> ${esc(ev.start_time)}` : ''}</div>`
      : '';

    const foot = [
      periodLine(ev),
      when,
      ev.venue ? `<div class="gt-venue">${esc(ev.venue)}</div>` : '',
    ].filter(Boolean).join('');

    const inner = head + body + (foot ? `<div class="gt-card-foot">${foot}</div>` : '');
    const cls = `gt-card gt-card--${esc(ev.status)}`;

    return href
      ? `<a class="${cls}" href="${esc(href)}">${inner}</a>`
      : `<article class="${cls}">${inner}</article>`;
  }

  function teamLink(name, slug) {
    if (!name) return '<span class="gt-team">TBD</span>';
    return slug
      ? `<a class="gt-team gt-team--link" href="school.html?school=${encodeURIComponent(slug)}">${esc(name)}</a>`
      : `<span class="gt-team">${esc(name)}</span>`;
  }

  function teamRow(name, score, slug, leading) {
    return `
      <div class="gt-score-row${leading ? ' is-leading' : ''}">
        ${teamLink(name, slug)}
        <span class="gt-num">${scoreOf(score)}</span>
      </div>`;
  }

  /* ── lists ────────────────────────────────────────────────────────────── */

  function list(events, opts = {}) {
    if (!events || !events.length) return empty(opts.emptyMessage, opts.emptyDetail);
    return `<div class="gt-grid">${events.map(e => card(e, opts)).join('')}</div>`;
  }

  /* Grouped by day — the scoreboard and school pages read better this way. */
  function listByDay(events, opts = {}) {
    if (!events || !events.length) return empty(opts.emptyMessage, opts.emptyDetail);
    const groups = new Map();
    for (const e of events) {
      if (!groups.has(e.event_date)) groups.set(e.event_date, []);
      groups.get(e.event_date).push(e);
    }
    return [...groups.entries()].map(([date, evs]) => `
      <section class="gt-day">
        <h3 class="gt-day-label">${esc(fullDayLabel(date))}</h3>
        <div class="gt-grid">${evs.map(e => card(e, opts)).join('')}</div>
      </section>`).join('');
  }

  /* Grouped by sport — "Tonight in WNY Sports" and school pages.
     One module, every sport, exactly as specified. */
  function listBySport(events, opts = {}) {
    if (!events || !events.length) return empty(opts.emptyMessage, opts.emptyDetail);
    const groups = new Map();
    for (const e of events) {
      const k = e.sport_name || e.sport;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(e);
    }
    return [...groups.entries()].map(([sport, evs]) => `
      <section class="gt-sport-group">
        <h3 class="gt-sport-label">${esc(sport)}</h3>
        <div class="gt-grid">${evs.map(e => card(e, { ...opts, showSport: false })).join('')}</div>
      </section>`).join('');
  }

  /* ── honest states ────────────────────────────────────────────────────────
     An empty scoreboard says why it is empty. It never shows a placeholder
     game, a sample score, or a spinner that never resolves. */

  function empty(message, detail) {
    return `
      <div class="gt-state">
        <div class="gt-state-title">${esc(message || 'Nothing scheduled')}</div>
        <p class="gt-state-detail">${esc(detail ||
          'No events match these filters yet.')}</p>
      </div>`;
  }

  function loading(what) {
    return `<div class="gt-state gt-state--loading">
              <div class="gt-state-title">Loading ${esc(what || 'events')}…</div>
            </div>`;
  }

  function error(detail) {
    return `
      <div class="gt-state gt-state--error">
        <div class="gt-state-title">Scores are temporarily unavailable</div>
        <p class="gt-state-detail">${esc(detail ||
          'We could not reach GameTracker just now. Nothing is wrong with the games — please try again in a moment.')}</p>
      </div>`;
  }

  /* A footer that tells the reader where the data came from and how fresh it
     is. Provenance is a feature, not a detail. */
  function provenance(events) {
    if (!events || !events.length) return '';
    const stamps = events.map(e => e.last_synced_at).filter(Boolean).sort();
    if (!stamps.length) return '';
    const when = new Date(stamps[stamps.length - 1]);
    return `<p class="gt-provenance">Schedules and scores from GameTracker · last updated ${
      esc(when.toLocaleString('en-US', {
        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
      }))}</p>`;
  }

  return {
    esc, card, list, listByDay, listBySport,
    empty, loading, error, provenance,
    dayLabel, fullDayLabel, localDate,
  };
})();

if (typeof window !== 'undefined') window.GTUI = GTUI;
if (typeof module !== 'undefined') module.exports = GTUI;
