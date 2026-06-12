/* ============================================================
   Venuewise Ecosystem — Ecosystem Navigation
   /shared/ecosystem-nav.js

   Renders the cross-platform ecosystem bar and nav on any page.
   Drop-in: just include this script and call initEcosystemNav().
   ============================================================ */

const VW_NAV = (() => {

  /* ── renderEcosystemBar(containerId) ─────────────────────── */
  function renderEcosystemBar(containerId = 'vw-ecosystem-bar') {
    const el = document.getElementById(containerId);
    if (!el) return;
    const cfg = (typeof VENUEWISE_CONFIG !== 'undefined') ? VENUEWISE_CONFIG : null;
    const platforms = cfg?.platforms || [];

    el.innerHTML = `
<div class="vw-eco-bar">
  <div class="vw-eco-bar-inner">
    <div class="vw-eco-bar-brand">
      <span class="vw-eco-star">★</span>
      <span>The <strong>Venuewise Ecosystem</strong> connects families, athletes, coaches, organizations, facilities, and sports media into one platform.</span>
    </div>
    <div class="vw-eco-bar-links">
      ${platforms.map(p => `<a href="${p.url}" class="vw-eco-link" title="${p.tagline}">${p.name}</a>`).join('')}
    </div>
  </div>
</div>`;
  }

  /* ── renderEcosystemCards(containerId) ───────────────────── */
  function renderEcosystemCards(containerId = 'vw-ecosystem-cards') {
    const el = document.getElementById(containerId);
    if (!el) return;
    const cfg = (typeof VENUEWISE_CONFIG !== 'undefined') ? VENUEWISE_CONFIG : null;
    const platforms = cfg?.platforms || [];

    el.innerHTML = `
<div class="vw-eco-cards">
  ${platforms.map(p => `
  <a href="${p.url}" class="vw-eco-card">
    <div class="vw-eco-card-icon" style="background:${p.color}20;color:${p.color}">${p.icon}</div>
    <div class="vw-eco-card-name">${p.name}</div>
    <div class="vw-eco-card-tag">${p.tagline}</div>
    <div class="vw-eco-card-cta">${p.ctaLabel} →</div>
  </a>`).join('')}
</div>`;
  }

  /* ── renderCTABlock(containerId) ─────────────────────────── */
  function renderCTABlock(containerId = 'vw-cta-block') {
    const el = document.getElementById(containerId);
    if (!el) return;

    el.innerHTML = `
<div class="vw-cta-block">
  <div class="vw-cta-inner">
    <div class="vw-cta-label">Powered by Venuewise</div>
    <h2 class="vw-cta-title">Ready to connect your sports life?</h2>
    <p class="vw-cta-text">Join the Venuewise Ecosystem and connect your family schedule, athlete profile, coach programs, organization tools, facility events, and sports media stories.</p>
    <div class="vw-cta-btns">
      <a href="https://homehuddle.com/signup" class="vw-btn-gold">Join HomeHuddle</a>
      <a href="https://venuewise.net" class="vw-btn-outline">Explore the Ecosystem</a>
    </div>
  </div>
</div>`;
  }

  /* ── injectStyles() ──────────────────────────────────────── */
  function injectStyles() {
    if (document.getElementById('vw-nav-styles')) return;
    const s = document.createElement('link');
    s.id   = 'vw-nav-styles';
    s.rel  = 'stylesheet';
    /* Resolve path relative to this script's location */
    const scripts = document.querySelectorAll('script[src]');
    let base = '/shared/';
    scripts.forEach(sc => { if (sc.src.includes('ecosystem-nav')) base = sc.src.replace('ecosystem-nav.js', ''); });
    s.href = base + 'shared.css';
    document.head.appendChild(s);
  }

  /* ── init() ──────────────────────────────────────────────── */
  function init() {
    injectStyles();
    renderEcosystemBar();
    renderEcosystemCards();
    renderCTABlock();
  }

  document.addEventListener('DOMContentLoaded', init);

  return { init, renderEcosystemBar, renderEcosystemCards, renderCTABlock };
})();

if (typeof window !== 'undefined') window.VW_NAV = VW_NAV;
