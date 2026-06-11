/* ============================================
   5-Star Sports Media — Main JS
   Powered by Venuewise
   ============================================ */

// === MOBILE NAV ===
const hamburger = document.getElementById('hamburger');
const mobileNav = document.getElementById('mobileNav');
if (hamburger && mobileNav) {
  hamburger.addEventListener('click', () => {
    mobileNav.classList.toggle('open');
    const isOpen = mobileNav.classList.contains('open');
    hamburger.setAttribute('aria-expanded', isOpen);
  });
}

// === SPONSOR TICKER ===
async function initSponsorTicker() {
  const tickerEl = document.getElementById('sponsorTicker');
  if (!tickerEl) return;

  try {
    // Try to load from the JSON config
    const base = getBasePath();
    const res = await fetch(base + 'assets/data/sponsors.json');
    const data = await res.json();
    const sponsors = data.sponsors.filter(s => s.active);

    // Always-first sponsor goes to position 0
    const sorted = [
      ...sponsors.filter(s => s.alwaysFirst),
      ...sponsors.filter(s => !s.alwaysFirst)
    ];

    buildSponsorSlides(tickerEl, sorted);
    rotateSponsorSlides(sorted.length);
  } catch (e) {
    // If fetch fails (e.g., opened directly from filesystem), show fallback
    tickerEl.innerHTML = buildFallbackSlide();
  }
}

function getBasePath() {
  const path = window.location.pathname;
  const depth = (path.match(/\//g) || []).length;
  // We're always inside /sports-media/, so go up one level from page
  return depth > 2 ? '../' : '';
}

function buildSponsorSlides(container, sponsors) {
  container.innerHTML = sponsors.map((s, i) => `
    <div class="sponsor-slide ${i === 0 ? 'active' : ''}" data-index="${i}">
      <div class="sponsor-info">
        <span class="sponsor-badge ${s.packageLevel}">${s.packageLevel === 'ecosystem' ? '⭐ Partner' : s.packageLevel}</span>
        <span class="sponsor-name">${s.sponsorName}</span>
        <span class="sponsor-text">${s.bannerText}</span>
      </div>
      <a href="${s.ctaLink}" class="sponsor-cta">${s.ctaText}</a>
    </div>
  `).join('');
}

function buildFallbackSlide() {
  return `
    <div class="sponsor-slide active">
      <div class="sponsor-info">
        <span class="sponsor-badge ecosystem">⭐ Partner</span>
        <span class="sponsor-name">Venuewise Ecosystem</span>
        <span class="sponsor-text">Manage your sports life in one place — schedules, profiles, bookings, and more.</span>
      </div>
      <a href="https://venuewise.net" class="sponsor-cta">Explore Venuewise</a>
    </div>`;
}

function rotateSponsorSlides(count) {
  if (count <= 1) return;
  let current = 0;
  setInterval(() => {
    const slides = document.querySelectorAll('.sponsor-slide');
    if (!slides.length) return;
    slides[current].classList.remove('active');
    current = (current + 1) % count;
    slides[current].classList.add('active');
  }, 8000);
}

// === ACTIVE NAV ===
function setActiveNav() {
  const path = window.location.pathname;
  document.querySelectorAll('.site-nav a, .mobile-nav a').forEach(link => {
    if (link.getAttribute('href') && path.endsWith(link.getAttribute('href').replace('../', ''))) {
      link.classList.add('active');
    }
  });
}

// === SCROLL HEADER ===
function initScrollHeader() {
  const header = document.querySelector('.site-header');
  if (!header) return;
  window.addEventListener('scroll', () => {
    if (window.scrollY > 40) {
      header.style.boxShadow = '0 4px 20px rgba(0,0,0,0.5)';
    } else {
      header.style.boxShadow = 'none';
    }
  }, { passive: true });
}

// === FORM SUBMISSION (placeholder) ===
function initForms() {
  document.querySelectorAll('form[data-form]').forEach(form => {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const btn = form.querySelector('[type="submit"]');
      const original = btn.textContent;
      btn.textContent = 'Submitted!';
      btn.disabled = true;
      btn.style.background = '#1A5C2E';
      btn.style.color = '#fff';
      setTimeout(() => {
        btn.textContent = original;
        btn.disabled = false;
        btn.style.background = '';
        btn.style.color = '';
        form.reset();
      }, 3000);
    });
  });
}

// === INIT ===
document.addEventListener('DOMContentLoaded', () => {
  initSponsorTicker();
  setActiveNav();
  initScrollHeader();
  initForms();
});
