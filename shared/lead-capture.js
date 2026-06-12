/* ============================================================
   Venuewise Ecosystem — Shared Lead Capture
   /shared/lead-capture.js

   All platform forms submit into the same Supabase leads table.
   source_platform and source_page are captured automatically.

   USAGE:
     <script src="/shared/config.js"></script>
     <script src="/shared/supabase-client.js"></script>
     <script src="/shared/lead-capture.js"></script>
   ============================================================ */

const VW_LEADS = (() => {

  /* ── submitLead(data) ────────────────────────────────────── */
  async function submitLead(data) {
    const payload = {
      name:               data.name              || null,
      email:              data.email             || null,
      phone:              data.phone             || null,
      role:               data.role              || null,
      business_name:      data.business_name     || null,
      organization_name:  data.organization_name || null,
      platform_interest:  data.platform_interest || null,
      source_platform:    data.source_platform   || detectPlatform(),
      source_page:        data.source_page       || location.pathname,
      message:            data.message           || null,
      created_at:         new Date().toISOString(),
    };

    /* Remove nulls to keep the record clean */
    Object.keys(payload).forEach(k => { if (payload[k] === null) delete payload[k]; });

    const result = await VW_SB.insert('leads', payload);
    return result;
  }

  /* ── detectPlatform() — infer from hostname ──────────────── */
  function detectPlatform() {
    const h = location.hostname;
    if (h.includes('homehuddle'))         return 'HomeHuddle';
    if (h.includes('athletehuddle'))      return 'AthleteHuddle';
    if (h.includes('coacheshuddle'))      return 'CoachesHuddle';
    if (h.includes('organizationhuddle')) return 'OrganizationHuddle';
    if (h.includes('facilityhuddle'))     return 'FacilityHuddle';
    if (h.includes('5starsportsmedia'))   return '5-Star Sports Media';
    if (h.includes('venuewise'))          return 'Venuewise';
    return 'Unknown';
  }

  /* ── bindLeadForm(formEl, options) ──────────────────────────
     Attach submit handler to any HTML form element.
     Options:
       platform_interest — preset platform interest value
       source_platform   — override platform detection
       onSuccess(data)   — callback on successful submit
       onError(err)      — callback on failure
       successMessage    — string to show inside form on success
  ──────────────────────────────────────────────────────────── */
  function bindLeadForm(formEl, options = {}) {
    if (!formEl) return;
    formEl.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(formEl);
      const data = Object.fromEntries(fd.entries());

      /* Merge in options */
      if (options.platform_interest) data.platform_interest = options.platform_interest;
      if (options.source_platform)   data.source_platform   = options.source_platform;

      /* Disable submit button */
      const btn = formEl.querySelector('[type="submit"]');
      const originalText = btn?.textContent || 'Submit';
      if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }

      const result = await submitLead(data);

      if (result) {
        if (options.successMessage) {
          formEl.innerHTML = `<p class="vw-lead-success">${options.successMessage}</p>`;
        }
        if (options.onSuccess) options.onSuccess(data);
      } else {
        if (btn) { btn.disabled = false; btn.textContent = originalText; }
        if (options.onError) options.onError('Submit failed. Please try again.');
        else {
          const errEl = formEl.querySelector('.vw-lead-error') || document.createElement('p');
          errEl.className = 'vw-lead-error';
          errEl.textContent = 'Something went wrong. Please try again.';
          errEl.style.cssText = 'color:#E24B4A;font-size:.85rem;margin-top:.5rem;';
          if (!formEl.contains(errEl)) formEl.appendChild(errEl);
        }
      }
    });
  }

  /* ── Auto-bind: any form with data-vw-lead="true" ────────── */
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-vw-lead="true"]').forEach(form => {
      bindLeadForm(form, {
        platform_interest: form.dataset.vwPlatform || null,
        successMessage:    form.dataset.vwSuccess  || "Thanks! We'll be in touch soon.",
      });
    });
  });

  /* ── Track sponsor click as lead ────────────────────────────
     Call from sponsor banner click handlers.
  ──────────────────────────────────────────────────────────── */
  async function trackSponsorClick(sponsorName, ctaUrl) {
    return submitLead({
      name:             'Sponsor Click',
      platform_interest:'Sponsor Inquiry',
      message:          `Clicked sponsor: ${sponsorName} → ${ctaUrl}`,
      source_page:      location.pathname,
    });
  }

  return { submitLead, bindLeadForm, trackSponsorClick, detectPlatform };
})();

if (typeof window !== 'undefined') window.VW_LEADS = VW_LEADS;
