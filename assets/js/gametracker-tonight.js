/* ============================================================================
   "Tonight in WNY Sports" — homepage module
   assets/js/gametracker-tonight.js

   ONE reusable module for every sport, per the build spec: there is no
   football module and no soccer module, because the sport is data.

   Drop this anywhere on any page:
       <div id="gt-tonight"></div>
   and include this script. It renders itself, or removes itself entirely when
   there is nothing on tonight -- an empty "Tonight in WNY Sports" heading with
   nothing under it is worse than no section at all.
   ============================================================================ */
(function () {
  'use strict';

  var mount = document.getElementById('gt-tonight');
  if (!mount || typeof GameTracker === 'undefined' || typeof GTUI === 'undefined') return;

  var limit = parseInt(mount.dataset.limit || '12', 10);

  function shell(inner, count) {
    return '' +
      '<div class="gt gt-tonight">' +
        '<div class="gt-head">' +
          '<div class="gt-kicker">Western New York</div>' +
          '<h2>Tonight in WNY Sports</h2>' +
        '</div>' +
        inner +
        (count ? '<a class="gt-tonight-more" href="scores.html">Full scoreboard →</a>' : '') +
      '</div>';
  }

  (async function () {
    var res = await GameTracker.events({
      region: 'WNY', status: 'tonight', limit: limit,
    });

    // A homepage is not the place to explain an outage. Stay silent and let
    // the rest of the page be right.
    if (res.error) { mount.remove(); return; }
    if (!res.events.length) { mount.remove(); return; }

    mount.innerHTML = shell(
      GTUI.listBySport(res.events, { showSport: false }),
      res.events.length);
  })();
})();
