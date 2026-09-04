/* ============================================================================
   Section visibility
   assets/js/section-visibility.js

   One rule, applied site-wide: a section appears only when it has something
   real to show.

   This is the rule the GameTracker modules already follow -- "Tonight in WNY"
   deletes itself when no games are scheduled -- generalised to the rest of the
   site. Before this, a visitor met eighteen headings on the homepage and found
   content behind two of them. Featured Story, Coach Spotlight, Legends,
   Podcast, Videos and Photos were announcements of things that did not exist,
   several of them still showing placeholder cards because their loader only
   overwrote the placeholder IF data arrived.

   How to use it: mark a section with what it needs.

       <section data-needs="articles">          ... Featured Story ...
       <section data-needs="spotlights_athlete"> ... Athlete Spotlight ...
       <section data-needs="podcast,videos">     ... shown if EITHER exists ...

   Nothing is deleted. Every section keeps its markup and switches itself on
   the day its first item is published -- no deploy, no edit, nothing to
   remember. That is the point: the page can never again promise something the
   site does not have.
   ============================================================================ */

(function () {
  'use strict';

  var COUNTS_FN = 'site_content_counts';

  function conf() {
    return (typeof VENUEWISE_CONFIG !== 'undefined')
      ? VENUEWISE_CONFIG.supabase : { url: '', anonKey: '' };
  }

  async function fetchCounts() {
    var c = conf();
    if (!c.url) return null;
    try {
      var res = await fetch(c.url + '/rest/v1/rpc/' + COUNTS_FN, {
        method: 'POST',
        headers: {
          'apikey': c.anonKey,
          'Authorization': 'Bearer ' + c.anonKey,
          'Content-Type': 'application/json',
        },
        body: '{}',
      });
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      return null;
    }
  }

  function apply(counts) {
    var sections = document.querySelectorAll('[data-needs]');
    for (var i = 0; i < sections.length; i++) {
      var el = sections[i];
      var keys = el.getAttribute('data-needs').split(',');
      var has = false;
      for (var k = 0; k < keys.length; k++) {
        var key = keys[k].trim();
        if (key && Number(counts[key]) > 0) { has = true; break; }
      }
      if (has) {
        el.hidden = false;
        el.removeAttribute('data-empty');
      } else {
        el.hidden = true;
        el.setAttribute('data-empty', '');
      }
    }
  }

  /* Sections carry `hidden` in the markup and are REVEALED by this script, so
     that an empty heading never flashes on screen before being removed.

     The cost of that choice, stated plainly: if the counts call fails, the
     sections stay hidden rather than reverting to visible. A reader gets a
     shorter page for one load and the next load recovers. The trade is
     deliberate -- a brief flash of "Featured Story" above nothing looks
     broken on every single visit, whereas this only bites during an outage. */
  async function run() {
    var counts = await fetchCounts();
    if (!counts) return;
    apply(counts);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }

  window.SectionVisibility = { run: run, apply: apply };
})();
