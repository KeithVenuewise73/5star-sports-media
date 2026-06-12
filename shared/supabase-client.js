/* ============================================================
   Venuewise Ecosystem — Shared Supabase Client
   /shared/supabase-client.js

   Lightweight REST wrapper — no SDK, no build step required.
   Works with plain static HTML across all Huddle platforms.

   USAGE:
     <script src="/shared/config.js"></script>
     <script src="/shared/supabase-client.js"></script>
   ============================================================ */

const VW_SB = (() => {

  function getConfig() {
    const cfg = (typeof VENUEWISE_CONFIG !== 'undefined')
      ? VENUEWISE_CONFIG.supabase
      : { url: '', anonKey: '' };
    if (!cfg.url) console.warn('[Venuewise] supabase URL not configured. Load config.js first.');
    return cfg;
  }

  /* ── Base headers ─────────────────────────────────────────── */
  function headers(extra = {}) {
    const { anonKey } = getConfig();
    return {
      'apikey':        anonKey,
      'Authorization': `Bearer ${anonKey}`,
      'Content-Type':  'application/json',
      ...extra,
    };
  }

  /* ── SELECT ───────────────────────────────────────────────── */
  async function select(table, params = {}) {
    const { url } = getConfig();
    const endpoint = new URL(`${url}/rest/v1/${table}`);
    Object.entries(params).forEach(([k, v]) => endpoint.searchParams.set(k, v));
    try {
      const res = await fetch(endpoint.toString(), { headers: headers() });
      if (!res.ok) { console.error(`[VW_SB] select error [${table}]:`, res.status); return []; }
      return res.json();
    } catch (e) { console.error(`[VW_SB] select fetch failed:`, e); return []; }
  }

  /* ── INSERT ───────────────────────────────────────────────── */
  async function insert(table, data, opts = {}) {
    const { url } = getConfig();
    try {
      const res = await fetch(`${url}/rest/v1/${table}`, {
        method:  'POST',
        headers: headers({ 'Prefer': opts.return ? `return=${opts.return}` : 'return=minimal' }),
        body:    JSON.stringify(data),
      });
      if (!res.ok) { console.error(`[VW_SB] insert error [${table}]:`, res.status, await res.text()); return null; }
      return opts.return === 'representation' ? res.json() : true;
    } catch (e) { console.error(`[VW_SB] insert failed:`, e); return null; }
  }

  /* ── UPDATE ───────────────────────────────────────────────── */
  async function update(table, match, data) {
    const { url } = getConfig();
    const endpoint = new URL(`${url}/rest/v1/${table}`);
    Object.entries(match).forEach(([k, v]) => endpoint.searchParams.set(k, `eq.${v}`));
    try {
      const res = await fetch(endpoint.toString(), {
        method:  'PATCH',
        headers: headers({ 'Prefer': 'return=minimal' }),
        body:    JSON.stringify(data),
      });
      if (!res.ok) { console.error(`[VW_SB] update error [${table}]:`, res.status); return false; }
      return true;
    } catch (e) { console.error(`[VW_SB] update failed:`, e); return false; }
  }

  /* ── UPSERT ───────────────────────────────────────────────── */
  async function upsert(table, data) {
    const { url } = getConfig();
    try {
      const res = await fetch(`${url}/rest/v1/${table}`, {
        method:  'POST',
        headers: headers({ 'Prefer': 'resolution=merge-duplicates,return=minimal' }),
        body:    JSON.stringify(data),
      });
      if (!res.ok) { console.error(`[VW_SB] upsert error [${table}]:`, res.status); return false; }
      return true;
    } catch (e) { console.error(`[VW_SB] upsert failed:`, e); return false; }
  }

  /* ── Convenience: fetch single row by id ─────────────────── */
  async function getById(table, id) {
    const rows = await select(table, { id: `eq.${id}`, limit: 1 });
    return rows[0] || null;
  }

  /* ── Convenience: fetch with published filter ────────────── */
  async function getPublished(table, extra = {}) {
    return select(table, { published: 'eq.true', order: 'created_at.desc', ...extra });
  }

  return { select, insert, update, upsert, getById, getPublished };
})();

/* Backwards compat alias for existing 5-Star pages */
if (typeof window !== 'undefined') window.VW_SB = VW_SB;
