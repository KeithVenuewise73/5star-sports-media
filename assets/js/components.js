/* ============================================
   5-Star Sports Media — Shared Components
   Header & Footer injection for static HTML
   ============================================ */

function getSiteHeader() {
  return `
<header class="site-header">
  <div class="header-inner">
    <a href="index.html" class="logo-block">
      <span class="logo-name">5<span style="color:var(--gold)">★</span>Star Sports Media</span>
      <span class="logo-powered">POWERED BY <span style="color:var(--gold);font-weight:700;">VENUEWISE</span></span>
    </a>
    <nav class="site-nav" aria-label="Main navigation">
      <a href="index.html">Home</a>
      <a href="athlete-spotlight.html">Athletes</a>
      <a href="coach-spotlight.html">Coaches</a>
      <a href="team-spotlight.html">Teams</a>
      <a href="organization-spotlight.html">Organizations</a>
      <a href="game-coverage.html">Game Coverage</a>
      <a href="legends-spotlight.html">Legends</a>
      <a href="podcast.html">Podcast</a>
      <a href="videos.html">Videos</a>
      <a href="photo-galleries.html">Photos</a>
      <a href="sports-for-a-cause.html" style="color:#e74c3c">❤️ Cause</a>
      <a href="academy.html" style="color:var(--gold)">Academy</a>
      <a href="sponsors.html">Sponsors</a>
      <a href="submit-story.html" class="nav-cta">Submit a Story</a>
    </nav>
    <button class="hamburger" id="hamburger" aria-label="Toggle navigation" aria-expanded="false">
      <span></span><span></span><span></span>
    </button>
  </div>
  <nav class="mobile-nav" id="mobileNav" aria-label="Mobile navigation">
    <a href="index.html">Home</a>
    <a href="athlete-spotlight.html">Athletes</a>
    <a href="coach-spotlight.html">Coaches</a>
    <a href="team-spotlight.html">Teams</a>
    <a href="organization-spotlight.html">Organizations</a>
    <a href="game-coverage.html">Game Coverage</a>
    <a href="legends-spotlight.html">Legends Spotlight</a>
    <a href="podcast.html">Podcast</a>
    <a href="videos.html">Videos</a>
    <a href="photo-galleries.html">Photos</a>
    <a href="sports-for-a-cause.html">Sports for a Cause</a>
    <a href="academy.html">Academy</a>
    <a href="sponsors.html">Sponsors</a>
    <a href="submit-story.html">Submit a Story</a>
    <a href="contact.html">Contact</a>
    <a href="about.html">About</a>
  </nav>
  <div class="sponsor-ticker" id="sponsorTicker">
    <div class="sponsor-slide active">
      <div class="sponsor-info">
        <span class="sponsor-badge ecosystem">⭐ Partner</span>
        <span class="sponsor-name">Venuewise Ecosystem</span>
        <span class="sponsor-text">Manage your sports life in one place — schedules, profiles, bookings, and more.</span>
      </div>
      <a href="https://venuewise.net" class="sponsor-cta">Explore Venuewise</a>
    </div>
  </div>
</header>`;
}

function getSiteFooter() {
  return `
<footer class="site-footer">
  <div class="container">
    <div class="footer-grid">
      <div class="footer-brand">
        <div class="logo-name" style="font-family:var(--font-display);font-size:1.8rem;margin-bottom:0.25rem;">
          5<span style="color:var(--gold)">★</span>Star Sports Media
        </div>
        <div class="logo-powered" style="font-size:0.65rem;color:var(--gray);letter-spacing:0.12em;text-transform:uppercase;margin-bottom:1rem;">
          Powered by <a href="https://venuewise.net" style="color:var(--gold)">Venuewise</a>
        </div>
        <p>The home of WNY's 5-Star amateur athletes, coaches, teams, organizations, and community success stories.</p>
        <p style="margin-top:0.75rem;font-style:italic;color:var(--gold-dark);font-size:0.8rem;">Sports are not the destination. Sports are the preparation.</p>
      </div>
      <div class="footer-col">
        <h4>Coverage</h4>
        <ul>
          <li><a href="athlete-spotlight.html">Athlete Spotlight</a></li>
          <li><a href="coach-spotlight.html">Coach Spotlight</a></li>
          <li><a href="team-spotlight.html">Team Spotlight</a></li>
          <li><a href="organization-spotlight.html">Organizations</a></li>
          <li><a href="game-coverage.html">Game Coverage</a></li>
          <li><a href="legends-spotlight.html">Legends Spotlight</a></li>
          <li><a href="academy.html">Academy</a></li>
          <li><a href="academy/portal.html">Academy Portal</a></li>
        </ul>
      </div>
      <div class="footer-col">
        <h4>Connect</h4>
        <ul>
          <li><a href="submit-story.html">Submit a Story</a></li>
          <li><a href="media-dashboard.html">Media Dashboard</a></li>
          <li><a href="mailto:info@5starsportsmedia.com">info@5starsportsmedia.com</a></li>
          <li><a href="sponsors.html">Become a Sponsor</a></li>
          <li><a href="about.html">About Us</a></li>
          <li><a href="contact.html">Contact</a></li>
        </ul>
      </div>
      <div class="footer-col">
        <h4>Venuewise</h4>
        <ul>
          <li><a href="https://venuewise.net/homehuddle/">HomeHuddle</a></li>
          <li><a href="https://venuewise.net/homehuddle/family--athlete.html">AthleteHuddle</a></li>
          <li><a href="https://venuewise.net/homehuddle/">CoachesHuddle</a></li>
          <li><a href="https://venuewise.net/homehuddle/">OrganizationHuddle</a></li>
          <li><a href="https://venuewise.net/homehuddle/">FacilityHuddle</a></li>
        </ul>
      </div>
    </div>
    <div class="footer-bottom">
      <p>© 2025 5-Star Sports Media. Powered by Venuewise. All rights reserved.</p>
      <span class="footer-tagline">Recognizing Excellence. Building Futures.</span>
    </div>
  </div>
</footer>`;
}

// Inject header and footer
document.addEventListener('DOMContentLoaded', () => {
  const headerEl = document.getElementById('site-header');
  const footerEl = document.getElementById('site-footer');
  if (headerEl) headerEl.innerHTML = getSiteHeader();
  if (footerEl) footerEl.innerHTML = getSiteFooter();

  // Wire hamburger AFTER header is injected into DOM
  const hamburger = document.getElementById('hamburger');
  const mobileNav = document.getElementById('mobileNav');
  if (hamburger && mobileNav) {
    hamburger.addEventListener('click', function () {
      const isOpen = mobileNav.classList.toggle('open');
      hamburger.setAttribute('aria-expanded', isOpen);
      hamburger.classList.toggle('is-active', isOpen);
    });
    // Close on outside tap (mobile)
    document.addEventListener('click', function (e) {
      if (!headerEl.contains(e.target)) {
        mobileNav.classList.remove('open');
        hamburger.setAttribute('aria-expanded', 'false');
        hamburger.classList.remove('is-active');
      }
    });
    // Close when a nav link is tapped
    mobileNav.querySelectorAll('a').forEach(a => {
      a.addEventListener('click', () => {
        mobileNav.classList.remove('open');
        hamburger.setAttribute('aria-expanded', 'false');
        hamburger.classList.remove('is-active');
      });
    });
  }

  // Re-run after injection
  if (typeof initSponsorTicker === 'function') initSponsorTicker();
  if (typeof setActiveNav === 'function') setActiveNav();
  if (typeof initScrollHeader === 'function') initScrollHeader();
});

// Helper: image placeholder SVG
function imgPlaceholder(label = 'Photo') {
  return `<div class="img-placeholder">
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
      <polyline points="21 15 16 10 5 21"/>
    </svg>
    <span>${label}</span>
  </div>`;
}

// Helper: stars
function starRating(n = 5) {
  return '<div class="stars">' + Array(n).fill('<svg viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>').join('') + '</div>';
}

/* ============================================
   ECOSYSTEM BANNER
   Call getEcoBanner(activeHuddle) where activeHuddle
   is one of: 'home','athlete','coaches','tournament','facility'
   ============================================ */
function getEcoBanner(activeHuddle) {
  const huddles = [
    { key: 'home',       icon: '🏠', name: 'HomeHuddle',       desc: 'Family sports calendar',  url: 'https://venuewise.net/homehuddle/' },
    { key: 'athlete',    icon: '🏃', name: 'AthleteHuddle',    desc: 'Build your profile',      url: 'https://venuewise.net/homehuddle/family--athlete.html' },
    { key: 'coaches',    icon: '📣', name: 'CoachesHuddle',    desc: 'Clinics &amp; lessons',   url: 'https://venuewise.net/homehuddle/' },
    { key: 'tournament', icon: '🏆', name: 'TournamentHuddle', desc: 'Register &amp; bracket',  url: 'https://venuewise.net' },
    { key: 'facility',   icon: '🏟️', name: 'FacilityHuddle',  desc: 'Venues &amp; open slots', url: 'https://venuewise.net' },
  ];
  const tiles = huddles.map(h => `
    <a href="${h.url}" class="hud-tile${h.key === activeHuddle ? ' active' : ''}" target="_blank">
      <span class="hud-icon">${h.icon}</span>
      <div class="hud-name">${h.name}</div>
      <div class="hud-desc">${h.desc}</div>
    </a>`).join('');
  return `
<div class="eco-banner">
  <div class="eco-banner-label">Powered by the Venuewise Ecosystem</div>
  <div class="eco-hud-row">${tiles}</div>
</div>`;
}

/* ============================================
   SPONSOR BANNER
   Call getSponsorBanner({ tier, name, copy, cta, url })
   ============================================ */
function getSponsorBanner({ tier, name, copy, cta, url }) {
  return `
<div class="sponsor-banner">
  <span class="spb-tier">${tier}</span>
  <span class="spb-name">${name}</span>
  <span class="spb-sep">|</span>
  <span class="spb-copy">${copy}</span>
  <a href="${url || '#'}" class="spb-cta" target="_blank">${cta}</a>
</div>`;
}

/* ============================================
   INJECT BANNERS
   Pages call this after DOMContentLoaded.
   Usage:
     injectBanners('athlete', {
       tier: 'Gold Sponsor', name: 'Elite Edge Sports Performance',
       copy: 'Speed · Strength · Agility ...', cta: 'Book Free Eval', url: '#'
     });
   ============================================ */
function injectBanners(activeHuddle, sponsorData) {
  const ecoEl = document.getElementById('eco-banner');
  const spEl  = document.getElementById('sponsor-banner');
  if (ecoEl) ecoEl.innerHTML = getEcoBanner(activeHuddle);
  if (spEl)  spEl.innerHTML  = getSponsorBanner(sponsorData);
}


