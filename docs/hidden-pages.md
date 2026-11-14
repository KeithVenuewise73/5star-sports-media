# Pages switched off in the lean site

On 2026-11-13 the site was scaled down to Home, Photos, Contact and About, because
nothing else had real content yet. **Nothing was deleted.** Every original page is
still in this project, only unlinked. This file is the map for turning them back on,
so nothing has to be rebuilt.

## The original site, whole

The complete site as it was before the lean version is permanently saved in this
project's history as commit `3d3bb96` ("Galleries page: list newly published games
at once (#7)"). To look at any original file:

    git show 3d3bb96:index.html

The old home page (826 lines: hero, tonight's games, featured athlete, coaches,
legends, calendar, teams, organizations, podcast, videos, cause, academy) is
`index.html` at that commit. To bring the whole original site back, check that
commit out; to bring back one page, copy that file from it.

## Page switches (replaces turning a page on by hand)

Each page group has an on/off switch the owner flips on the Photo Review page (Pages tab),
reached from the five stars at the bottom of the site, then Staff Access. The list of groups
and their switches lives in the HL-BOS database (`site.pages`); the website reads it live.

- **Off:** a visitor who reaches the page is sent to the home page, with a note when the page is
  listed as coming soon. This also holds with JavaScript off, and if the list cannot be read
  (it fails closed: a page that could be off is never shown by accident).
- **On:** the page opens and is added to the menu and footer.
- **Coming soon:** a page that is off can be listed on the home page with a count-only "I'd like
  this" button. The count is anonymous (a one-way fingerprint per visitor, page and day; no address,
  name or email) and is visible only to the owner.
- **A new switchable page:** add it to `site.pages` (migration), then run
  `node scripts/add-page-gate.js` to put the gate in its `<head>`. `--check` lists any page missing it.
- **Always on, never switched:** Home, Photos, Contact, About, the team galleries, and the staff
  tools (each has its own login). The generated sport pages only redirect to the Scores page, which
  is gated.
- A switch takes effect within about a minute (browsers remember the list for 60 seconds).

Before switching a page on, look at what a visitor would see: several of these pages read from the
old database or have script errors of their own (for example, Athlete Spotlight loads an HTML file
as a script). The switch controls whether the page shows, not whether it is ready.

## Turning a page back on (by hand, if the switches are not available)

1. Add its link back to the menu and footer in `assets/js/components.js`.
2. Make sure it has something real to show (see "What each page needs").
3. Check it in a browser at desktop and phone width.

A later change will replace step 1 with an on/off switch the owner flips, with a
"coming soon" note for switched-off pages. Until then, ask Claude.

## What each page needs

"Reads" lists the database tables, functions or feeds the page asks for directly in
its own file. Pages marked *not checked* may also use the shared loaders
(`assets/js/loaders.js`, `calendar-loader.js`); that has not been traced yet.
The `public_*` tables and the admin sign-in live in the **legacy** database
(`urwnbskrtoplgnkkxuvl`), which needs an approved plan before anything touches it.

| Page | Reads | Status |
|---|---|---|
| `coach-spotlight.html` | `public_featured_coach` | needs featured coaches entered |
| `team-spotlight.html` | `public_featured_team` | needs featured teams entered |
| `legends-spotlight.html` | `public_featured_legend` | needs featured legends entered |
| `podcast.html` | `podcast_episodes` | needs episodes |
| `games-board.html` | `public_games_board` | needs games |
| `spotlight-detail.html` | `spotlights` | detail page for the spotlights above |
| `scores.html`, `school.html`, `scores/<sport>/` (44 sport pages) | GameTracker feed | works only when GameTracker has games; `docs/gametracker.md` explains the model |
| `wny-sports-calendar.html` | `public_this_week`, `public_upcoming` (calendar loader) | needs events |
| `media-dashboard.html` | submission tables, `is_media_member` | staff page, behind sign-in |
| `admin.html`, `admin-gametracker.html` | `is_admin`, GameTracker | staff pages; sign-in is in the legacy database |
| `players.html`, `athlete-spotlight.html`, `organization-spotlight.html`, `game-coverage.html`, `videos.html`, `sports-for-a-cause.html`, `academy*.html`, `sponsors.html`, `submit-story.html`, `player-card.html`, `photo-upload.html`, `analytics-dashboard.html`, `staff.html` | *not checked* | review the content before switching on |

`photo-galleries.html`, `galleries/` and the contact, about and home pages stay on.
