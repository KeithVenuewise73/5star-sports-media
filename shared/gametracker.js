/* ============================================================================
   GameTracker — client
   /shared/gametracker.js

   The ONLY thing that knows how to talk to the GameTracker data layer.
   5-Star pages, the future mobile app, HuddleSphere, team sites and league
   sites all call these same functions against the same canonical records.

   GameTracker owns the game. This site displays it. Nothing here creates,
   edits or caches a game of its own -- if a score is wrong, it is wrong in
   GameTracker and it gets fixed once, there, for every consumer at the
   same time.

   No SDK, no build step -- the same plain-fetch pattern as
   /shared/supabase-client.js, so any static page can include it.

     <script src="/shared/config.js"></script>
     <script src="/shared/gametracker.js"></script>
     <script>
       GameTracker.events({ region: 'WNY', sport: 'football', status: 'tonight' })
         .then(render);
     </script>
   ============================================================================ */

const GameTracker = (() => {
  'use strict';

  /* ── connection ───────────────────────────────────────────────────────── */
  function conf() {
    const c = (typeof VENUEWISE_CONFIG !== 'undefined')
      ? VENUEWISE_CONFIG.supabase
      : { url: '', anonKey: '' };
    if (!c.url) console.warn('[GameTracker] Supabase not configured — load /shared/config.js first.');
    return c;
  }

  /* Calls a GameTracker API function. Returns { data, error } and NEVER
     throws -- a page that cannot reach the data layer must say so, not blank. */
  async function rpc(fn, params = {}, opts = {}) {
    const { url, anonKey } = conf();
    const headers = {
      'apikey': anonKey,
      'Authorization': `Bearer ${opts.accessToken || anonKey}`,
      'Content-Type': 'application/json',
    };
    try {
      const res = await fetch(`${url}/rest/v1/rpc/${fn}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(params),
      });
      const text = await res.text();
      let body = null;
      try { body = text ? JSON.parse(text) : null; } catch (_) { body = text; }
      if (!res.ok) {
        const msg = (body && body.message) || `Request failed (${res.status})`;
        console.error(`[GameTracker] ${fn}:`, msg);
        return { data: null, error: { status: res.status, message: msg } };
      }
      return { data: body, error: null };
    } catch (e) {
      console.error(`[GameTracker] ${fn} could not reach the data layer:`, e);
      return { data: null, error: { status: 0, message: 'Could not reach GameTracker.' } };
    }
  }

  /* Callers use readable names; the API uses p_ params. One place to map. */
  const PARAM_MAP = {
    region: 'p_region',
    sport: 'p_sport',
    gender: 'p_gender',
    league: 'p_league',
    section: 'p_section',
    school: 'p_school',
    status: 'p_status',
    view: 'p_status',          // alias: view and status mean the same filter
    seasonName: 'p_season_name',
    date: 'p_date',
    dateFrom: 'p_date_from',
    dateTo: 'p_date_to',
    season: 'p_season',
    level: 'p_level',
    limit: 'p_limit',
    offset: 'p_offset',
  };

  function toParams(filters = {}) {
    const out = {};
    for (const [k, v] of Object.entries(filters)) {
      if (v === null || v === undefined || v === '' || v === 'all') continue;
      const key = PARAM_MAP[k];
      if (key) out[key] = v;
    }
    return out;
  }

  /* ── reads ────────────────────────────────────────────────────────────── */

  /* The main one. Returns an array, already sorted live -> upcoming -> final
     by the database, so every consumer gets the same order. */
  async function events(filters = {}) {
    const { data, error } = await rpc('gametracker_events', toParams(filters));
    return { events: Array.isArray(data) ? data : [], error };
  }

  async function event(id) {
    const { data, error } = await rpc('gametracker_event', { p_id: id });
    return { event: data || null, error };
  }

  /* What is actually loaded — sports, leagues, schools, date range, counts.
     Filter bars are built from this so the UI never offers a sport that has
     no events behind it. */
  async function filters(region = 'WNY', season = null) {
    const { data, error } = await rpc('gametracker_filters',
      { p_region: region, p_season: season });
    return { filters: data || null, error };
  }

  /* Everything a school page needs: today, upcoming, results. */
  async function school(slug, season = null) {
    const { data, error } = await rpc('gametracker_school',
      { p_slug: slug, p_season: season });
    return { school: data || null, error };
  }

  /* ── convenience views (same call, common filters) ────────────────────── */
  const live     = (f = {}) => events({ ...f, status: 'live' });
  const tonight  = (f = {}) => events({ ...f, status: 'tonight' });
  const today    = (f = {}) => events({ ...f, status: 'today' });
  const upcoming = (f = {}) => events({ ...f, status: 'upcoming' });
  const finals   = (f = {}) => events({ ...f, status: 'final' });

  /* ── admin / adapter writes (require an admin session) ────────────────── */

  /* Preview an import without saving. Same call, p_dry_run = true. */
  function previewImport(payload, source, accessToken) {
    return rpc('gametracker_import',
      { p_payload: payload, p_dry_run: true, p_source: source || null },
      { accessToken });
  }

  function commitImport(payload, source, accessToken) {
    return rpc('gametracker_import',
      { p_payload: payload, p_dry_run: false, p_source: source || null },
      { accessToken });
  }

  /* Move a game's live state. This is the call a ScoreBird/ScoreStream
     adapter will make; until one exists, an admin makes it by hand. Either
     way it updates the SAME record the schedule created. */
  function updateLive(id, patch = {}, accessToken) {
    return rpc('gametracker_update_live', {
      p_id: id,
      p_status: patch.status ?? null,
      p_home_score: patch.homeScore ?? null,
      p_away_score: patch.awayScore ?? null,
      p_period: patch.period ?? null,
      p_clock: patch.clock ?? null,
      p_result_data: patch.resultData ?? null,
      p_score_source: patch.scoreSource ?? 'manual_admin',
    }, { accessToken });
  }

  const adminEvents = (f = {}, accessToken) => rpc('gametracker_admin_events', {
    p_source: f.source ?? null, p_date: f.date ?? null,
    p_sport: f.sport ?? null, p_limit: f.limit ?? 200,
  }, { accessToken });

  const sources = (accessToken) => rpc('gametracker_sources', {}, { accessToken });

  const saveSource = (s, accessToken) => rpc('gametracker_save_source', {
    p_key: s.key, p_name: s.name ?? null, p_kind: s.kind ?? 'schedule',
    p_adapter: s.adapter ?? 'json', p_publish: s.publish ?? false,
    p_trust_rank: s.trustRank ?? 100, p_notes: s.notes ?? null,
  }, { accessToken });

  const linkAlias = (alias, schoolSlug, accessToken) =>
    rpc('gametracker_link_alias',
      { p_alias: alias, p_school_slug: schoolSlug }, { accessToken });

  const deleteEvent = (id, accessToken) =>
    rpc('gametracker_delete_event', { p_id: id }, { accessToken });

  /* ── CSV -> the canonical payload ─────────────────────────────────────────
     Header names become field names. Both vocabularies work, because the
     importer accepts both: home_team or home_team_name, game_date or
     event_date, source_game_id or source_event_id.

     Handles quoted fields containing commas -- school names do that
     ("Williamsville North, Amherst") and a naive split would silently shift
     every column after it.                                                  */
  function parseCSV(text) {
    const rows = [];
    let row = [], field = '', inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }   // escaped quote
          else inQuotes = false;
        } else field += c;
      } else if (c === '"') {
        inQuotes = true;
      } else if (c === ',') {
        row.push(field); field = '';
      } else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(field); field = '';
        if (row.some(v => v.trim() !== '')) rows.push(row);
        row = [];
      } else field += c;
    }
    row.push(field);
    if (row.some(v => v.trim() !== '')) rows.push(row);

    if (rows.length < 2) return [];

    const headers = rows[0].map(h => h.trim().toLowerCase().replace(/\s+/g, '_'));
    return rows.slice(1).map(cells => {
      const o = {};
      headers.forEach((h, i) => {
        const v = (cells[i] ?? '').trim();
        if (v !== '') o[h] = v;
      });
      // participants may arrive as "Lancaster|Clarence|Orchard Park"
      if (typeof o.participants === 'string') {
        o.participants = o.participants.split('|').map(s => s.trim()).filter(Boolean);
      }
      return o;
    });
  }

  return {
    rpc,
    events, event, filters, school,
    live, tonight, today, upcoming, finals,
    previewImport, commitImport, updateLive,
    adminEvents, sources, saveSource, linkAlias, deleteEvent,
    parseCSV,
  };
})();

if (typeof window !== 'undefined') window.GameTracker = GameTracker;
if (typeof module !== 'undefined') module.exports = GameTracker;
