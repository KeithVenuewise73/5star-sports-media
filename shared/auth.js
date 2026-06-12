/* ============================================================
   Venuewise Ecosystem — Shared Auth
   /shared/auth.js

   Lightweight auth wrapper over Supabase Auth REST API.
   No SDK required — works with plain HTML across all platforms.

   USAGE:
     <script src="/shared/config.js"></script>
     <script src="/shared/auth.js"></script>
   ============================================================ */

const VW_AUTH = (() => {

  const SESSION_KEY = 'vw_session';

  function cfg() {
    return (typeof VENUEWISE_CONFIG !== 'undefined')
      ? VENUEWISE_CONFIG.supabase
      : { url: '', anonKey: '' };
  }

  /* ── Session helpers ─────────────────────────────────────── */
  function saveSession(data) {
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(data)); } catch {}
  }
  function loadSession() {
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; }
  }
  function clearSession() {
    try { sessionStorage.removeItem(SESSION_KEY); } catch {}
  }

  /* ── getCurrentUser() ────────────────────────────────────── */
  function getCurrentUser() {
    const s = loadSession();
    return s ? s.user : null;
  }

  /* ── loginUser(email, password) ──────────────────────────── */
  async function loginUser(email, password) {
    const { url, anonKey } = cfg();
    try {
      const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
        method:  'POST',
        headers: { 'apikey': anonKey, 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error_description || data.msg || 'Login failed' };
      saveSession({ user: data.user, access_token: data.access_token, expires_at: data.expires_at });
      return { success: true, user: data.user };
    } catch (e) {
      return { success: false, error: 'Network error. Please try again.' };
    }
  }

  /* ── logoutUser() ────────────────────────────────────────── */
  async function logoutUser() {
    const s = loadSession();
    if (s?.access_token) {
      const { url, anonKey } = cfg();
      try {
        await fetch(`${url}/auth/v1/logout`, {
          method:  'POST',
          headers: { 'apikey': anonKey, 'Authorization': `Bearer ${s.access_token}` },
        });
      } catch {}
    }
    clearSession();
    window.location.href = '/';
  }

  /* ── requireLogin(redirectBack) ──────────────────────────── */
  function requireLogin(redirectBack = true) {
    const user = getCurrentUser();
    if (!user) {
      const back = redirectBack ? `?next=${encodeURIComponent(location.href)}` : '';
      window.location.href = `https://homehuddle.com/login${back}`;
      return false;
    }
    return true;
  }

  /* ── getUserRole() ───────────────────────────────────────── */
  function getUserRole() {
    const user = getCurrentUser();
    if (!user) return null;
    return user.user_metadata?.role || user.app_metadata?.role || null;
  }

  /* ── redirectByRole() ────────────────────────────────────── */
  function redirectByRole() {
    const role = getUserRole();
    if (!role) return;
    const redirects = (typeof VENUEWISE_CONFIG !== 'undefined')
      ? VENUEWISE_CONFIG.roleRedirects
      : {};
    const dest = redirects[role];
    if (dest) window.location.href = dest;
  }

  /* ── isLoggedIn() ────────────────────────────────────────── */
  function isLoggedIn() {
    return !!getCurrentUser();
  }

  /* ── updateHeaderUI() — call after DOM ready ─────────────── */
  function updateHeaderUI() {
    const user = getCurrentUser();
    const loginBtn  = document.querySelector('[data-vw="login-btn"]');
    const logoutBtn = document.querySelector('[data-vw="logout-btn"]');
    const userInfo  = document.querySelector('[data-vw="user-info"]');
    const userName  = document.querySelector('[data-vw="user-name"]');

    if (user) {
      if (loginBtn)  loginBtn.style.display  = 'none';
      if (logoutBtn) logoutBtn.style.display = 'inline-flex';
      if (userInfo)  userInfo.style.display  = 'flex';
      if (userName)  userName.textContent    = user.user_metadata?.full_name || user.email?.split('@')[0] || 'My Account';
    } else {
      if (loginBtn)  loginBtn.style.display  = 'inline-flex';
      if (logoutBtn) logoutBtn.style.display = 'none';
      if (userInfo)  userInfo.style.display  = 'none';
    }
  }

  /* Initialize UI on page load */
  document.addEventListener('DOMContentLoaded', updateHeaderUI);

  return {
    getCurrentUser,
    loginUser,
    logoutUser,
    requireLogin,
    getUserRole,
    redirectByRole,
    isLoggedIn,
    updateHeaderUI,
  };
})();

if (typeof window !== 'undefined') window.VW_AUTH = VW_AUTH;
