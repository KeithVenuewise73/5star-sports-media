# Venuewise Ecosystem — Shared Layer

This `/shared/` folder is the connective tissue of the Venuewise Ecosystem.
Every platform — HomeHuddle, AthleteHuddle, CoachesHuddle, OrganizationHuddle,
FacilityHuddle, and 5-Star Sports Media — uses these shared files to look, feel,
and behave like one connected product.

---

## Folder Structure

```
/shared/
├── config.js               Platform registry, roles, branding tokens
├── supabase-client.js      Lightweight REST wrapper (no SDK required)
├── auth.js                 Login, logout, role detection, redirect by role
├── lead-capture.js         Universal lead form submission to Supabase
├── ecosystem-nav.js        Renders ecosystem bar, platform cards, CTA block
├── shared.css              All shared UI styles (ecosystem bar, cards, buttons)
├── venuewise-header.html   Copy-paste universal header template
├── venuewise-footer.html   Copy-paste universal footer template
├── README.md               This file
│
├── components/
│   ├── ecosystem-bar.html  Standalone ecosystem platform cards section
│   ├── lead-form.html      Copy-paste lead capture form
│   ├── sponsor-banner.html Rotating sponsor banner with Supabase or JSON fallback
│   └── spotlight-card.html JS functions: renderVWSpotlightCard(), renderVWCoachCard()
│
└── sql/
    └── venuewise-ecosystem-schema.sql   Full Supabase schema for all platforms
```

---

## How to Add the Universal Header

### Option A — Copy HTML snippet
1. Open `/shared/venuewise-header.html`
2. Copy the entire block
3. Paste it at the top of `<body>` on your page
4. Customize the logo name and nav links for your platform
5. Make sure `shared.css` is loaded in `<head>`

### Option B — Script injection (for existing pages)
```html
<head>
  <link rel="stylesheet" href="/shared/shared.css">
</head>
<body>
  <div id="vw-header-slot"></div>
  <script src="/shared/config.js"></script>
  <script src="/shared/ecosystem-nav.js"></script>
  <!-- ecosystem-nav.js auto-renders the ecosystem bar into #vw-ecosystem-bar -->
</body>
```

---

## How to Add the Universal Footer

Copy `/shared/venuewise-footer.html` and paste before `</body>`.
Update the logo name for your platform. The ecosystem links stay the same.

---

## How Lead Capture Works

All platform forms submit into the same `leads` Supabase table.
The `source_platform` field is auto-detected from the hostname.

### Quick form setup
```html
<form data-vw-lead="true"
      data-vw-platform="AthleteHuddle"
      data-vw-success="Thanks! We'll be in touch.">
  <input type="text"  name="name"  placeholder="Name" required>
  <input type="email" name="email" placeholder="Email" required>
  <select name="platform_interest">
    <option value="AthleteHuddle">AthleteHuddle</option>
  </select>
  <button type="submit">Submit</button>
</form>
```

Include these scripts:
```html
<script src="/shared/config.js"></script>
<script src="/shared/supabase-client.js"></script>
<script src="/shared/lead-capture.js"></script>
```

The `lead-capture.js` auto-binds any form with `data-vw-lead="true"`.

### Manual submission
```javascript
const result = await VW_LEADS.submitLead({
  name:              'Jane Smith',
  email:             'jane@example.com',
  role:              'parent',
  platform_interest: 'HomeHuddle',
  source_platform:   'HomeHuddle',
  source_page:       '/signup',
});
```

---

## How Supabase Tables Connect

```
auth.users
    └── users_profile (role, full_name, phone)
            ├── families (HomeHuddle)
            │       └── athletes (AthleteHuddle)
            │               └── spotlights (5-Star Sports Media)
            │               └── articles  (5-Star Sports Media)
            ├── coaches (CoachesHuddle)
            │       └── spotlights (5-Star Sports Media)
            ├── organizations (OrganizationHuddle)
            │       └── events (cross-platform)
            └── facilities (FacilityHuddle)
                    └── events (cross-platform)

leads          ← all platforms write here
page_views     ← all platforms write here
sponsors       ← shared across all platforms
```

---

## How AthleteHuddle Feeds 5-Star Sports Media

**Workflow:**
1. Family signs up on HomeHuddle → `families` record created
2. Parent creates athlete profile on AthleteHuddle → `athletes` record created
3. Media admin reviews eligible athletes: `SELECT * FROM v_spotlight_eligible_athletes`
4. Admin marks `spotlight_eligible = true` on the athlete record
5. Admin creates a `spotlights` record with `related_athlete_id` pointing to the athlete
6. Spotlight appears on 5-Star Sports Media athlete spotlight page

**Visitor workflow (5-Star → AthleteHuddle):**
```
Visitor reads spotlight on 5starsportsmedia.com
  → Clicks "Create AthleteHuddle Profile"
  → If logged in: goes to athletehuddle.com/profile/create?ref={spotlight_id}
  → If not logged in: goes to homehuddle.com/login?next=athletehuddle.com/...
```

---

## How Sponsor Banners Work

1. Sponsors are stored in the `sponsors` Supabase table
2. The first rotation slot is **always** the Venuewise Ecosystem (not paid)
3. Active sponsors rotate every 8 seconds
4. Falls back to `/assets/data/sponsors.json` if Supabase is unavailable
5. All sponsor CTA clicks are tracked in the `leads` table via `VW_LEADS.trackSponsorClick()`

**Important:** 5-Star Sports Media editorial coverage is **never** for sale.
The disclaimer "Editorial coverage is earned, not purchased." must appear on all
sponsor banners shown on 5-Star pages. This is enforced in `sponsor-banner.html`.

**Adding a sponsor:**
```sql
INSERT INTO sponsors (sponsor_name, package_level, website_url, banner_text, cta_text, cta_link, active)
VALUES ('Cornerstone Pizza Co.', 'gold', 'https://cornerstonepizza.com',
        'Feeding WNY sports families since 2008.', 'Order Online', 'https://cornerstonepizza.com', true);
```

---

## How Future Platforms Should Use the Shared Layer

When building a new Huddle platform or microsite:

1. **Load shared scripts** in this order:
   ```html
   <script src="/shared/config.js"></script>
   <script src="/shared/supabase-client.js"></script>
   <script src="/shared/auth.js"></script>
   <script src="/shared/lead-capture.js"></script>
   ```

2. **Add the platform to `config.js`** — add an entry to the `platforms` array with:
   - `id`, `name`, `tagline`, `url`, `color`, `icon`, `ctaLabel`, `ctaUrl`

3. **Add the role redirect** — add to `roleRedirects` in `config.js`

4. **Use shared CSS classes** — all ecosystem UI (buttons, cards, forms) are styled
   in `shared.css`. The `--vw-*` CSS variables work alongside any platform's own
   design system without conflicts.

5. **Write leads into `leads` table** — use `VW_LEADS.submitLead()` or `data-vw-lead="true"` forms.
   Always set `source_platform` to your platform's name.

6. **Show cross-platform CTAs** — use `VW_WORKFLOW_CTAS` from `spotlight-card.html`
   to show ecosystem links at relevant moments:
   - After athlete content → `VW_WORKFLOW_CTAS.athleteProfile`
   - After coach content  → `VW_WORKFLOW_CTAS.coachSpotlight`
   - After org content    → `VW_WORKFLOW_CTAS.orgSpotlight`
   - After facility content → `VW_WORKFLOW_CTAS.facilitySpotlight`

---

## Cross-Platform Workflow Summary

| Trigger | Source Platform | Destination | CTA |
|---------|----------------|-------------|-----|
| Athlete spotlight viewed | 5-Star Sports Media | AthleteHuddle | Create Athlete Profile |
| Coach spotlight viewed | 5-Star Sports Media | CoachesHuddle | Join CoachesHuddle |
| Org spotlight viewed | 5-Star Sports Media | OrganizationHuddle | Request Demo |
| Facility coverage viewed | 5-Star Sports Media | FacilityHuddle | Promote Your Facility |
| New signup (any platform) | Any | HomeHuddle | Join HomeHuddle |
| Sponsor banner clicked | Any | leads table | tracked automatically |

---

## Supabase SQL Setup

Run `/shared/sql/venuewise-ecosystem-schema.sql` in Supabase SQL Editor.
This is safe to re-run — all tables use `CREATE TABLE IF NOT EXISTS`.

For the `page_views` table: if it already exists from the analytics build,
the schema will skip it safely.

---

## Admin Password

The admin dashboard at `/admin.html` uses a simple password (`5star2025!` by default).
Change it by editing line ~298 of `admin.html`:
```javascript
const ADMIN_PASSWORD = 'your-new-password-here';
```

For production: move this to a proper auth flow using `VW_AUTH.loginUser()`.

---

*One ecosystem. Multiple platforms. Powered by Venuewise.*
