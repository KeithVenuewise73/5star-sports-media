/* ============================================================
   5-Star Sports Media — Analytics Tracker
   assets/js/analytics.js

   Tracks page views, spotlight clicks, and sport interest.
   No PII collected — session ID is random, no cookies.
   Insert-only from the browser; reads require authentication.
   ============================================================ */

(function() {
  // Requires supabase.js to be loaded first (SUPABASE_URL, SUPABASE_ANON)
  if (typeof SUPABASE_URL === 'undefined') return;

  /* ── Session ID (random, per-session, no PII) ──────────── */
  let sessionId = sessionStorage.getItem('5sm_sid');
  if (!sessionId) {
    sessionId = Math.random().toString(36).substr(2, 12) + Date.now().toString(36);
    sessionStorage.setItem('5sm_sid', sessionId);
  }

  /* ── Page name from URL ─────────────────────────────────── */
  function getPageName() {
    const file = location.pathname.split('/').pop() || 'index.html';
    return file.replace('.html', '') || 'home';
  }

  /* ── Track a view ────────────────────────────────────────── */
  async function trackView(data = {}) {
    const payload = {
      page:           getPageName(),
      referrer:       document.referrer || null,
      user_agent:     navigator.userAgent,
      session_id:     sessionId,
      ...data,
    };

    try {
      await fetch(`${SUPABASE_URL}/rest/v1/page_views`, {
        method: 'POST',
        headers: {
          'apikey':        SUPABASE_ANON,
          'Authorization': `Bearer ${SUPABASE_ANON}`,
          'Content-Type':  'application/json',
          'Prefer':        'return=minimal',
        },
        body: JSON.stringify(payload),
      });
    } catch (e) {
      // Silently fail — never break the page
    }
  }

  /* ── Auto-track on page load ─────────────────────────────── */
  document.addEventListener('DOMContentLoaded', () => {
    const page = getPageName();

    // For spotlight-detail: extract id/type/name/sport from URL + DOM
    if (page === 'spotlight-detail') {
      const params = new URLSearchParams(location.search);
      const id = params.get('id');
      // Wait briefly for the page to render the name
      setTimeout(() => {
        const name  = document.querySelector('.detail-name')?.textContent?.trim() || null;
        const type  = document.querySelector('.detail-type')?.textContent?.replace('Spotlight','').trim() || null;
        const sport = document.querySelector('.detail-meta-item span')?.textContent?.trim() || null;
        trackView({ spotlight_id: id, spotlight_type: type, subject_name: name, sport });
      }, 1200);
    } else {
      // Infer sport from page context where possible
      const sportMap = {
        'game-coverage':          null,
        'athlete-spotlight':      null,
        'coach-spotlight':        null,
        'team-spotlight':         null,
        'organization-spotlight': null,
        'legends-spotlight':      null,
      };
      trackView({ sport: sportMap[page] ?? null });
    }
  });

  /* ── Expose for manual tracking from other scripts ──────── */
  window.track5SM = trackView;
})();
