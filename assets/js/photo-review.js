/* Photo Review: the owner's page. Signs in with an email link, then talks to the
   review service (supabase/functions/media-review in the hl-bos-platform project).
   Everything from the service is written with textContent / attributes, never as HTML.
   Who may do anything is decided by the service, not by this page. */
(function () {
  'use strict';

  var CFG = window.REVIEW_CONFIG || {};
  var app = document.getElementById('app');
  var HINTS = { soft: 'Possibly soft', dark: 'Very dark', bright: 'Very bright', small: 'Low resolution' };
  var PAGE = 60, PAUSE_MIN = 30;
  var S = { client: null, session: null, me: null, view: 'folders', folders: [], teams: [], folder: null,
            filter: 'waiting', offset: 0, photos: [], total: 0, pages: [], picked: {}, error: '', busy: false, renaming: false, sent: false };

  /* ---- tiny helpers ---- */
  function h(tag, attrs) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v);
      else if (v === true) e.setAttribute(k, '');
      else e.setAttribute(k, v);
    });
    (function add(list) {
      for (var i = 0; i < list.length; i++) {
        var c = list[i];
        if (c === null || c === undefined || c === false) continue;
        if (Array.isArray(c)) add(c);
        else e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
      }
    })(Array.prototype.slice.call(arguments, 2));
    return e;
  }
  function toast(msg) {
    var t = document.getElementById('toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast.h); toast.h = setTimeout(function () { t.hidden = true; }, 3200);
  }
  function longDate(d) {
    var p = String(d).split('-').map(Number);
    return new Date(Date.UTC(p[0], p[1] - 1, p[2])).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  }
  function clock(t) { return t ? String(t).slice(11, 16) : 'no time'; }
  function mins(t) { var m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(t || ''); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) / 60000 : null; }
  function plural(n, w) { return n.toLocaleString('en-US') + ' ' + w + (n === 1 ? '' : 's'); }

  /* ---- the service ---- */
  function api(route, body) {
    return S.client.auth.getSession().then(function (r) {
      var token = r && r.data && r.data.session ? r.data.session.access_token : '';
      return fetch(CFG.serviceUrl + route, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
        body: JSON.stringify(body || {})
      });
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (j) {
        if (!res.ok) { var e = new Error(j.error || 'Something went wrong (' + res.status + ').'); e.status = res.status; throw e; }
        return j;
      });
    }, function () { throw new Error('Could not reach the review service. Check the internet and try again.'); });
  }
  function fail(e) {
    if (e && e.status === 401) { S.me = null; S.session = null; S.error = 'Please sign in again.'; return render(); }
    S.error = e && e.message ? e.message : 'Something went wrong.'; render();
  }

  /* ---- loading ---- */
  function loadFolders() { return api('/owner/folders').then(function (j) { S.folders = j.folders; }); }
  function loadTeams() { return api('/owner/teams').then(function (j) { S.teams = j.teams; }); }
  function loadPages() { return api('/owner/pages').then(function (j) { S.pages = j.pages; }); }
  function loadPhotos() {
    return api('/owner/photos', { folder: S.folder, status: S.filter, limit: PAGE, offset: S.offset }).then(function (j) {
      S.photos = j.photos; S.total = j.total;
    });
  }
  function refresh() {
    var jobs = [loadFolders(), loadTeams()];
    if (S.view === 'folder') jobs.push(loadPhotos());
    if (S.view === 'pages') jobs.push(loadPages());
    return Promise.all(jobs).then(function () { S.error = ''; render(); }, fail);
  }
  function go(view, folder) {
    S.view = view; S.error = ''; S.picked = {}; S.offset = 0; S.renaming = false;
    if (folder) { S.folder = folder; S.filter = 'waiting'; }
    refresh();
  }
  function current() { return S.folders.filter(function (f) { return f.id === S.folder; })[0]; }

  /* ---- actions ---- */
  function act(route, body, okMsg) {
    S.busy = true;
    return api(route, body).then(function (j) {
      S.busy = false; S.picked = {};
      toast(typeof okMsg === 'function' ? okMsg(j) : okMsg);
      return refresh();
    }, function (e) { S.busy = false; fail(e); });
  }
  function pickedIds() { return Object.keys(S.picked); }

  /* ---- views ---- */
  function signIn() {
    var email = h('input', { class: 'pr-in', type: 'email', id: 'email', autocomplete: 'email', placeholder: 'you@example.com', 'aria-label': 'Email address', required: true });
    var msg = h('p', { class: 'pr-muted', id: 'sign-msg' }, S.sent ? 'Check your email for the sign-in link, then open it on this device.' : 'Only the owner can use this page.');
    var btn = h('button', { class: 'pr-btn gold', type: 'submit' }, 'Email me a sign-in link');
    var form = h('form', { class: 'pr-card', onsubmit: function (ev) {
      ev.preventDefault();
      btn.disabled = true;
      S.client.auth.signInWithOtp({ email: email.value.trim(), options: { emailRedirectTo: location.origin + location.pathname, shouldCreateUser: false } })
        .then(function (r) {
          btn.disabled = false;
          /* Existing accounts only: this page never creates an account. The reason is not
             spelled out, so it does not tell a stranger which addresses have accounts. */
          if (r.error) { msg.textContent = 'A sign-in link could not be sent to that address. Only the owner\'s account can sign in here.'; return; }
          S.sent = true; msg.textContent = 'Check your email for the sign-in link, then open it on this device.';
        }, function () { btn.disabled = false; msg.textContent = 'Could not reach the sign-in service. Check the internet and try again.'; });
    } }, h('label', { class: 'pr-muted', for: 'email' }, 'Your email address'), h('div', { class: 'pr-row', style: 'margin:.5rem 0 .75rem' }, email, btn), msg);
    return h('div', { class: 'pr-sign' }, h('div', { style: 'font-size:2rem;color:var(--gold,#D4AF37);letter-spacing:.3em' }, '★★★★★'),
      h('h1', { class: 'pr-brand', style: 'margin:.3rem 0 1.2rem' }, 'Photo Review'), S.error ? h('div', { class: 'pr-err', role: 'alert' }, S.error) : null, form);
  }

  function top() {
    return h('div', { class: 'pr-top' },
      h('div', { class: 'pr-brand' }, '5-Star Sports Media', h('small', null, 'Photo Review')),
      h('div', { class: 'pr-who' }, h('span', null, S.me ? S.me.email : ''),
        h('button', { class: 'pr-btn', onclick: function () { S.client.auth.signOut().then(function () { S.session = null; S.me = null; render(); }); } }, 'Sign out'),
        h('a', { href: 'staff.html', class: 'pr-muted' }, '← Staff')));
  }
  function tabs() {
    function tab(id, label) { return h('button', { class: 'pr-tab', 'aria-pressed': String(S.view === id || (id === 'folders' && S.view === 'folder')), onclick: function () { go(id); } }, label); }
    return h('nav', { class: 'pr-nav', 'aria-label': 'Sections' }, tab('folders', 'Folders'), tab('teams', 'Teams'), tab('pages', 'Pages'));
  }

  function foldersView() {
    var list = h('div', { class: 'pr-list' });
    if (!S.folders.length) list.appendChild(h('div', { class: 'pr-empty' }, 'Nothing has been sent for review yet. In DateSort, press "Send for review" on a date and it will appear here.'));
    S.folders.forEach(function (f) {
      var sel = h('select', { class: 'pr-sel', 'aria-label': 'Team for ' + f.name, onchange: function (ev) { act('/owner/set-team', { folder: f.id, team: ev.target.value }, 'Filed under that team.'); } },
        h('option', { value: '', selected: !f.team_id }, 'No team yet'),
        S.teams.map(function (t) { return h('option', { value: t.id, selected: t.id === f.team_id }, t.name); }));
      list.appendChild(h('div', { class: 'pr-card' }, h('div', { class: 'pr-row' },
        h('div', { class: 'pr-grow' }, h('h2', { class: 'pr-h' }, f.name),
          h('div', { class: 'pr-muted' }, (f.sport ? f.sport + ' · ' : '') + longDate(f.event_date)),
          f.same_day > 0 ? h('div', { class: 'pr-warn' }, (f.same_day === 1 ? 'Another folder' : f.same_day + ' other folders') + ' on this same day: check the labels.') : null),
        sel,
        h('div', { class: 'pr-muted' }, h('b', { style: f.waiting ? 'color:#e0a23a' : '' }, f.waiting + ' waiting'), ' · ' + f.approved + ' approved · ' + f.rejected + ' rejected'),
        h('button', { class: 'pr-btn gold', onclick: function () { go('folder', f.id); } }, f.waiting ? 'Review' : 'Open'))));
    });
    return h('div', null, h('h1', { class: 'pr-h', style: 'font-size:1.6rem;margin-bottom:.75rem' }, 'Folders'), list);
  }

  function folderView() {
    var f = current();
    if (!f) return h('div', { class: 'pr-empty' }, 'That folder is gone.');
    var others = S.folders.filter(function (x) { return x.id !== f.id; });
    var name = h('input', { class: 'pr-in', id: 'rename', type: 'text', value: f.name, maxlength: '200', 'aria-label': 'Folder name' });
    var head = h('div', { class: 'pr-row', style: 'margin-bottom:.4rem' },
      h('button', { class: 'pr-btn', onclick: function () { go('folders'); } }, '← All folders'),
      S.renaming ? name : h('h1', { class: 'pr-h', style: 'font-size:1.6rem;margin:0' }, f.name),
      S.renaming
        ? [h('button', { class: 'pr-btn gold', onclick: function () { S.renaming = false; act('/owner/rename', { folder: f.id, name: name.value }, 'Folder renamed.'); } }, 'Save name'),
           h('button', { class: 'pr-btn', onclick: function () { S.renaming = false; render(); } }, 'Cancel')]
        : h('button', { class: 'pr-btn', onclick: function () { S.renaming = true; render(); } }, 'Rename this folder'));
    var teamSel = h('select', { class: 'pr-sel', id: 'folderTeam', 'aria-label': 'Team page for this folder', onchange: function (ev) { act('/owner/set-team', { folder: f.id, team: ev.target.value }, 'Filed under that team.'); } },
      h('option', { value: '', selected: !f.team_id }, 'No team yet'),
      S.teams.map(function (t) { return h('option', { value: t.id, selected: t.id === f.team_id }, t.name); }));
    var teamRow = h('div', { class: 'pr-card', style: 'margin:.6rem 0' },
      h('div', { class: 'pr-row' }, h('b', null, 'Team page:'), teamSel,
        h('button', { class: 'pr-btn', onclick: function () { go('teams'); } }, 'Create a new team')),
      f.team_id
        ? h('div', { class: 'pr-muted' }, 'Approved photos here appear on ' + f.team_name + "'s page (unless that team is set to private).")
        : h('div', { class: 'pr-warn' }, 'No team yet: approved photos stay private until you pick a team for this folder.'));
    var counts = { waiting: f.waiting, approved: f.approved, rejected: f.rejected, all: f.waiting + f.approved + f.rejected };
    var chips = h('div', { class: 'pr-nav' }, [['waiting', 'Waiting'], ['approved', 'Approved'], ['rejected', 'Rejected'], ['all', 'All']].map(function (p) {
      return h('button', { class: 'pr-chip', 'aria-pressed': String(S.filter === p[0]), onclick: function () { S.filter = p[0]; S.offset = 0; S.picked = {}; refresh(); } }, p[1] + ' ' + counts[p[0]]);
    }));

    var grid = h('div', { class: 'pr-grid' });
    var prev = null;
    S.photos.forEach(function (p) {
      var a = mins(prev && prev.taken_at), b = mins(p.taken_at);
      if (a !== null && b !== null && b - a >= PAUSE_MIN) grid.appendChild(h('p', { class: 'pr-pause' }, 'Long pause before ' + clock(p.taken_at) + ': possibly a different game.'));
      prev = p;
      grid.appendChild(h('button', { class: 'pr-tile', type: 'button', 'aria-pressed': String(!!S.picked[p.id]), 'aria-label': p.filename + ', ' + p.status,
        onclick: function () { if (S.picked[p.id]) delete S.picked[p.id]; else S.picked[p.id] = true; render(); } },
        h('img', { src: p.thumb_url || '', alt: p.filename, loading: 'lazy' }),
        p.web_url ? h('a', { class: 'pr-big', href: p.web_url, target: '_blank', rel: 'noopener noreferrer', onclick: function (ev) { ev.stopPropagation(); } }, 'Larger') : null,
        h('div', { class: 'pr-meta' }, h('div', null, clock(p.taken_at) + ' · ' + p.filename, p.date_estimated ? ' (time estimated)' : ''),
          h('div', { class: 'st-' + p.status }, p.status === 'waiting' ? 'waiting' : p.status),
          p.flags && p.flags.length ? h('div', { class: 'pr-hint' }, p.flags.map(function (x) { return HINTS[x] || x; }).join(' · ')) : null,
          p.reason ? h('div', { class: 'pr-muted' }, p.reason) : null)));
    });
    var body = S.photos.length ? grid : h('div', { class: 'pr-empty' }, S.filter === 'waiting' ? 'Nothing waiting in this folder.' : 'Nothing here.');

    var pages = Math.max(1, Math.ceil(S.total / PAGE)), page = Math.floor(S.offset / PAGE) + 1;
    var pager = S.total > PAGE ? h('div', { class: 'pr-row' },
      h('button', { class: 'pr-btn', disabled: page <= 1, onclick: function () { S.offset -= PAGE; S.picked = {}; refresh(); } }, '← Previous'),
      h('span', { class: 'pr-muted' }, 'Page ' + page + ' of ' + pages + ' · ' + plural(S.total, 'photo')),
      h('button', { class: 'pr-btn', disabled: page >= pages, onclick: function () { S.offset += PAGE; S.picked = {}; refresh(); } }, 'Next →')) : h('p', { class: 'pr-muted' }, plural(S.total, 'photo'));

    var n = pickedIds().length;
    var reason = h('input', { class: 'pr-in', id: 'reason', type: 'text', placeholder: 'Why (optional)', maxlength: '200', 'aria-label': 'Reason for rejecting' });
    var moveTo = h('select', { class: 'pr-sel', id: 'moveTo', 'aria-label': 'Move to folder' }, h('option', { value: '' }, 'Move to an existing folder…'),
      others.map(function (x) { return h('option', { value: x.id }, x.event_date + ' · ' + x.name); }));
    var nName = h('input', { class: 'pr-in', id: 'newName', type: 'text', placeholder: 'New folder name, e.g. JV vs Lockport', maxlength: '200', 'aria-label': 'New folder name' });
    var nSport = h('input', { class: 'pr-in', id: 'newSport', type: 'text', placeholder: 'Sport', value: f.sport || '', style: 'width:9rem', 'aria-label': 'Sport' });
    function need() { if (!n) { toast('Tick some photos first.'); return false; } return true; }
    var bar = h('div', { class: 'pr-bar' },
      h('div', { class: 'pr-row' },
        h('button', { class: 'pr-btn gold', disabled: S.busy, onclick: function () { if (need()) act('/owner/decide', { ids: pickedIds(), status: 'approved' }, function (j) { return 'Approved ' + plural(j.changed, 'photo') + '.'; }); } }, 'Approve ticked (' + n + ')'),
        reason,
        h('button', { class: 'pr-btn bad', disabled: S.busy, onclick: function () { if (need()) act('/owner/decide', { ids: pickedIds(), status: 'rejected', reason: reason.value }, function (j) { return 'Rejected ' + plural(j.changed, 'photo') + '. Kept, never published.'; }); } }, 'Reject ticked'),
        h('button', { class: 'pr-btn', disabled: S.busy, onclick: function () { if (need()) act('/owner/decide', { ids: pickedIds(), status: 'waiting' }, 'Back to waiting.'); } }, 'Back to waiting'),
        f.waiting ? h('button', { class: 'pr-btn', style: 'margin-left:auto', disabled: S.busy, onclick: function () { act('/owner/approve-waiting', { folder: f.id }, function (j) { return 'Approved the remaining ' + plural(j.changed, 'photo') + '. Rejected ones were left alone.'; }); } }, 'Approve all ' + f.waiting + ' waiting') : null),
      h('details', null, h('summary', null, 'Wrong folder? Move or split the ticked photos'),
        h('div', { class: 'pr-row', style: 'margin:.6rem 0' }, moveTo,
          h('button', { class: 'pr-btn', disabled: S.busy, onclick: function () { if (!need()) return; if (!moveTo.value) { toast('Choose the folder to move them to.'); return; } act('/owner/move', { ids: pickedIds(), folder: moveTo.value }, function (j) { return 'Moved ' + plural(j.moved, 'photo') + '. They are waiting for review there.'; }); } }, 'Move')),
        h('div', { class: 'pr-muted' }, 'Or start a new folder from the ticked photos:'),
        h('div', { class: 'pr-row', style: 'margin:.4rem 0' }, nName, nSport,
          h('button', { class: 'pr-btn', disabled: S.busy, onclick: function () { if (!need()) return; if (!nName.value.trim()) { toast('Give the new folder a name first.'); return; } act('/owner/new-folder', { ids: pickedIds(), name: nName.value, sport: nSport.value }, 'New folder created. The photos are waiting for review there.'); } }, 'Create folder')),
        h('p', { class: 'pr-muted' }, 'Moved photos go back to waiting under their new folder. Renaming or splitting here changes the website only: the folders on your laptop are never touched.')));
    return h('div', null, head, h('p', { class: 'pr-muted' }, (f.sport ? f.sport + ' · ' : '') + longDate(f.event_date)), teamRow, chips, body, pager, bar);
  }

  function teamsView() {
    var name = h('input', { class: 'pr-in', id: 'teamName', type: 'text', placeholder: 'New team name, e.g. Orchard Park Quakers', maxlength: '120', 'aria-label': 'New team name', style: 'min-width:16rem' });
    var create = h('div', { class: 'pr-card pr-row', style: 'margin-bottom:1rem' }, h('div', { class: 'pr-grow' }, h('b', null, 'Add a team'), h('div', { class: 'pr-muted' }, 'A new client to shoot for. It starts with a public page; you can switch one team to private below.')), name,
      h('button', { class: 'pr-btn gold', disabled: S.busy, onclick: function () { if (!name.value.trim()) { toast('Type the team name first.'); return; } act('/owner/create-team', { name: name.value }, 'Team created.'); } }, 'Create team'));
    var list = h('div', { class: 'pr-list' });
    S.teams.forEach(function (t) {
      list.appendChild(h('div', { class: 'pr-card pr-row' }, h('div', { class: 'pr-grow' }, h('h2', { class: 'pr-h' }, t.name), h('div', { class: 'pr-muted' }, plural(t.folders, 'folder') + ' · page address: ' + t.slug)),
        h('label', { class: 'pr-muted', for: 'vis-' + t.id }, 'Who can see this team\'s page'),
        h('select', { class: 'pr-sel', id: 'vis-' + t.id, onchange: function (ev) { act('/owner/team-visibility', { team: t.id, visibility: ev.target.value }, 'Saved.'); } },
          h('option', { value: 'public', selected: t.visibility === 'public' }, 'Public: anyone'), h('option', { value: 'private', selected: t.visibility === 'private' }, 'Private: team password'))));
    });
    return h('div', null, h('h1', { class: 'pr-h', style: 'font-size:1.6rem;margin-bottom:.75rem' }, 'Teams'), create, list);
  }

  function pagesView() {
    var list = h('div', { class: 'pr-list' });
    S.pages.forEach(function (p) {
      var on = h('input', { type: 'checkbox', id: 'on-' + p.slug, checked: p.enabled,
        onchange: function (ev) { act('/owner/page-set', { slug: p.slug, enabled: ev.target.checked }, ev.target.checked ? p.title + ' is on.' : p.title + ' is off.'); } });
      var soon = h('input', { type: 'checkbox', id: 'soon-' + p.slug, checked: p.coming_soon, disabled: p.enabled,
        onchange: function (ev) { act('/owner/page-set', { slug: p.slug, coming_soon: ev.target.checked }, ev.target.checked ? p.title + ' is listed as coming soon.' : p.title + ' is no longer listed.'); } });
      list.appendChild(h('div', { class: 'pr-card pr-row' },
        h('div', { class: 'pr-grow' }, h('h2', { class: 'pr-h' }, p.title), h('div', { class: 'pr-muted' }, p.blurb)),
        h('label', { class: 'pr-row', for: 'on-' + p.slug }, on, h('span', null, 'On the site')),
        h('label', { class: 'pr-row', for: 'soon-' + p.slug, title: p.enabled ? 'A page that is on is not coming soon.' : '' }, soon, h('span', null, 'List as coming soon')),
        h('div', { class: 'pr-muted', style: 'min-width:9rem;text-align:right' }, p.enabled ? 'On' : p.interest + (p.interest === 1 ? ' person' : ' people') + ' asked')));
    });
    return h('div', null, h('h1', { class: 'pr-h', style: 'font-size:1.6rem;margin-bottom:.25rem' }, 'Pages'),
      h('p', { class: 'pr-muted', style: 'margin-bottom:.75rem' }, 'A page that is off sends visitors to the home page. Listing it as coming soon puts it on the home page with an "I\'d like this" button; the count is anonymous. A change shows within about a minute.'), list);
  }

  function render() {
    var keepFocus = document.activeElement && document.activeElement.id;
    app.textContent = '';
    if (!CFG.serviceUrl || !CFG.anonKey || !window.supabase) {
      app.appendChild(h('div', { class: 'pr-sign' }, h('h1', { class: 'pr-brand' }, 'Photo Review'), h('div', { class: 'pr-empty' }, 'The review area is not connected yet.')));
      return;
    }
    if (!S.session || !S.me) { app.appendChild(signIn()); return; }
    app.appendChild(top()); app.appendChild(tabs());
    if (S.error) app.appendChild(h('div', { class: 'pr-err', role: 'alert' }, S.error));
    app.appendChild(S.view === 'teams' ? teamsView() : S.view === 'pages' ? pagesView() : S.view === 'folder' ? folderView() : foldersView());
    if (keepFocus) { var el = document.getElementById(keepFocus); if (el && el.focus) el.focus(); }
  }

  /* ---- start ---- */
  function start() {
    if (!CFG.serviceUrl || !CFG.anonKey || !window.supabase) return render();
    S.client = window.supabase.createClient(CFG.supabaseUrl, CFG.anonKey, { auth: { persistSession: true, detectSessionInUrl: true, autoRefreshToken: true } });
    function onSession(session) {
      S.session = session || null;
      if (!session) { S.me = null; return render(); }
      api('/owner/me').then(function (j) { S.me = j; return refresh(); }, function (e) {
        if (e.status === 403) { S.error = 'This account is not the owner, so it cannot use this page.'; S.client.auth.signOut(); S.session = null; S.me = null; return render(); }
        if (e.status === 503) { S.error = 'The review area is not switched on yet.'; S.session = null; S.me = null; return render(); }
        fail(e);
      });
    }
    S.client.auth.getSession().then(function (r) { onSession(r && r.data ? r.data.session : null); });
    S.client.auth.onAuthStateChange(function (event, session) { if (event === 'SIGNED_IN' && !S.me) onSession(session); });
  }
  start();
})();
