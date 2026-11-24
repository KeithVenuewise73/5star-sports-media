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
  /* The service takes at most 1,000 photos per action and lists at most 200 per page: a whole folder
     (a combined day can hold 2,000) is ticked 200 at a time and acted on 500 at a time. */
  var FETCH_LIMIT = 200, ID_CHUNK = 500;
  var S = { client: null, session: null, me: null, view: 'folders', folders: [], teams: [], folder: null,
            filter: 'waiting', offset: 0, photos: [], total: 0, pages: [], picked: {}, error: '', busy: false, renaming: false, sent: false,
            large: null, seen: {}, social: { loaded: false, enabled: false, accounts: [] }, compose: null, posts: [] };

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
  function clipLength(d) { d = Math.round(Number(d) || 0); return Math.floor(d / 60) + ':' + (d % 60 < 10 ? '0' : '') + (d % 60); }
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
  function loadLarge() { return api('/owner/large').then(function (j) { S.large = j; }, function () { S.large = null; }); }
  function loadPages() { return api('/owner/pages').then(function (j) { S.pages = j.pages; }); }
  function loadPhotos() {
    return api('/owner/photos', { folder: S.folder, status: S.filter, limit: PAGE, offset: S.offset }).then(function (j) {
      S.photos = j.photos; S.total = j.total;
      j.photos.forEach(function (p) { S.seen[p.id] = p; });   /* so a ticked photo from another page can still be previewed */
    });
  }
  /* Instagram / Facebook: which accounts are connected. With none, none of the posting screens show. */
  function loadSocial() {
    return api('/owner/social/accounts').then(function (j) {
      S.social = { loaded: true, enabled: !!j.enabled, accounts: (j.accounts || []).filter(function (a) { return a.status === 'active'; }) };
    }, function () { S.social.loaded = true; });
  }
  function loadPosts() { return api('/owner/social/recent').then(function (j) { S.posts = j.posts; }); }
  function refresh() {
    var jobs = [loadFolders(), loadTeams()];
    if (S.view === 'folder') jobs.push(loadPhotos());
    if (S.view === 'pages') jobs.push(loadPages());
    if (S.view === 'teams') jobs.push(loadLarge());
    if (!S.social.loaded) jobs.push(loadSocial());
    if (S.view === 'posts') jobs.push(loadPosts());
    return Promise.all(jobs).then(function () { S.error = ''; render(); }, fail);
  }
  function go(view, folder) {
    S.view = view; S.error = ''; S.picked = {}; S.offset = 0; S.renaming = false; S.compose = null;
    if (folder) { S.folder = folder; S.filter = 'waiting'; }
    refresh();
  }
  function current() { return S.folders.filter(function (f) { return f.id === S.folder; })[0]; }

  /* ---- actions ---- */
  function act(route, body, okMsg) {
    /* One action at a time: a second click while one is running is ignored, so a button
       pressed twice never does the thing twice (it once made three copies of a folder). */
    if (S.busy) return Promise.resolve();
    S.busy = true;
    return sendInChunks(route, body).then(function (j) {
      S.busy = false; S.picked = {}; S.clearForm = true;
      toast(typeof okMsg === 'function' ? okMsg(j) : okMsg);
      return refresh().then(function () { return finishPublishing(j && j.public); });
    }, function (e) {
      S.busy = false; S.progress = '';
      if (e && e.partial) { var msg = e.message; return refresh().then(function () { S.error = msg; render(); }); }
      fail(e);
    });
  }
  /* A very large selection is sent in pieces of ID_CHUNK and the answers added up. A new folder made from
     more than one piece is made from the first and the rest are moved into it (never several folders). */
  function sendInChunks(route, body) {
    var ids = body.ids;
    if (!ids || ids.length <= ID_CHUNK) return api(route, body);
    var parts = [], out = {}, done = 0, folderId = null;
    for (var i = 0; i < ids.length; i += ID_CHUNK) parts.push(ids.slice(i, i + ID_CHUNK));
    return parts.reduce(function (chain, part, i) {
      return chain.then(function () {
        var r = route, b = {};
        Object.keys(body).forEach(function (k) { b[k] = body[k]; });
        b.ids = part;
        if (route === '/owner/new-folder' && i > 0) { r = '/owner/move'; b = { ids: part, folder: folderId }; }
        S.progress = 'Working… ' + done.toLocaleString('en-US') + ' of ' + ids.length.toLocaleString('en-US'); render();
        return api(r, b).then(function (j) {
          if (route === '/owner/new-folder' && i === 0) folderId = j.folder;
          ['changed', 'moved', 'deleted', 'kept', 'leftover_files'].forEach(function (k) { if (typeof j[k] === 'number') out[k] = (out[k] || 0) + j[k]; });
          if (j.folder) out.folder = j.folder;
          if (j.public) out.public = j.public;
          done += part.length;
        });
      });
    }, Promise.resolve()).then(function () { S.progress = ''; return out; }, function (e) {
      S.progress = '';
      e.message = 'Stopped after ' + done.toLocaleString('en-US') + ' of ' + ids.length.toLocaleString('en-US') + ' photos: ' + e.message + ' Tick the rest and try again.';
      if (done > 0) e.partial = true;
      throw e;
    });
  }
  /* Tick every photo in this folder under the chosen filter, not only the 60 on this page. */
  function tickWholeFolder() {
    if (S.busy) return;
    S.busy = true;
    var want = S.total;
    function next(offset) {
      S.progress = 'Ticking… ' + Math.min(offset, want).toLocaleString('en-US') + ' of ' + want.toLocaleString('en-US'); render();
      return api('/owner/photos', { folder: S.folder, status: S.filter, limit: FETCH_LIMIT, offset: offset }).then(function (j) {
        j.photos.forEach(function (p) { S.picked[p.id] = true; S.seen[p.id] = p; });
        want = j.total;
        if (j.photos.length && offset + FETCH_LIMIT < want) return next(offset + FETCH_LIMIT);
      });
    }
    return next(0).then(function () { S.busy = false; S.progress = ''; render(); },
      function (e) { S.busy = false; S.progress = ''; S.picked = {}; fail(e); });
  }
  /* A big approval is published 100 photos at a time. Keep asking until none are left
     (or until a round makes no progress, so a real problem never loops forever). */
  function finishPublishing(pub) {
    if (!pub || !pub.remaining) { S.publishing = 0; return Promise.resolve(); }
    S.publishing = pub.remaining;
    var banner = document.getElementById('publishing');
    if (banner) banner.textContent = 'Putting approved photos on the public page: ' + pub.remaining + ' left. Keep this page open.';
    else render();
    return api('/owner/sync', {}).then(function (j) {
      var p = (j && j.public) || {};
      if (!p.remaining) { S.publishing = 0; toast('All approved photos are on the public page.'); return render(); }
      if (!(p.published + p.unpublished > 0)) {
        S.publishing = 0; render();
        return toast('Some approved photos could not be put on the public page yet. They are still approved; open this page again to retry.');
      }
      return finishPublishing(p);
    }, function (e) { S.publishing = 0; fail(e); });
  }
  function pickedIds() { return Object.keys(S.picked); }
  /* "Edit name": ask for the new name, then save it. Cancelling, or an unchanged name, does nothing. */
  function askRename(what, current, route, extra) {
    var next = window.prompt('New name for this ' + what + ':', current);
    if (next === null) return;
    next = next.trim();
    if (!next || next === current) return;
    var body = { name: next };
    Object.keys(extra).forEach(function (k) { body[k] = extra[k]; });
    act(route, body, what.charAt(0).toUpperCase() + what.slice(1) + ' renamed.');
  }

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
    return h('nav', { class: 'pr-nav', 'aria-label': 'Sections' }, tab('folders', 'Folders'), tab('teams', 'Teams'), tab('pages', 'Pages'), S.social.accounts.length ? tab('posts', 'Posts') : null);
  }

  /* The order of the Folders list is remembered on this computer (a convenience only). */
  function setFolderSort(m) { S.folderSort = m; try { localStorage.setItem('pr-folder-sort', m); } catch (e) {} render(); }
  try { S.folderSort = localStorage.getItem('pr-folder-sort') === 'sport' ? 'sport' : 'date'; } catch (e) { S.folderSort = 'date'; }
  function foldersView() {
    var list = h('div', { class: 'pr-list pr-folders' });
    if (!S.folders.length) list.appendChild(h('div', { class: 'pr-empty' }, 'Nothing has been sent for review yet. In DateSort, press "Send for review" on a date and it will appear here.'));
    /* Folders with photos waiting come first, then the rest. Inside each: newest date first, or grouped by sport. */
    function newest(a, b) { return a.event_date < b.event_date ? 1 : a.event_date > b.event_date ? -1 : (a.name < b.name ? -1 : a.name > b.name ? 1 : 0); }
    var mode = S.folderSort === 'sport' ? 'sport' : 'date';
    var waitingFirst = S.folders.filter(function (f) { return f.waiting > 0; });
    var others = S.folders.filter(function (f) { return !(f.waiting > 0); });
    var ordered = [];
    var heads = {};
    function addSection(title, testid, folders) {
      if (!folders.length) return;
      var first = true;
      function put(f, head) { ordered.push(f); var hs = []; if (first && title) hs.push(h('h2', { class: 'pr-sub', 'data-testid': testid }, title)); first = false; if (head) hs.push(head); if (hs.length) heads[f.id] = hs; }
      if (mode === 'sport') {
        var groups = {};
        folders.forEach(function (f) { var k = (f.sport || '').trim() || 'No sport set'; (groups[k] = groups[k] || []).push(f); });
        Object.keys(groups).sort(function (x, y) { return x === 'No sport set' ? 1 : y === 'No sport set' ? -1 : (x.toLowerCase() < y.toLowerCase() ? -1 : 1); }).forEach(function (k) {
          groups[k].sort(newest).forEach(function (f, i) { put(f, i === 0 ? h('h3', { class: 'pr-sub2', 'data-testid': 'sport-head' }, k + ' (' + groups[k].length + ')') : null); });
        });
      } else folders.slice().sort(newest).forEach(function (f) { put(f, null); });
    }
    addSection(waitingFirst.length ? 'Needs review (' + waitingFirst.reduce(function (n, f) { return n + f.waiting; }, 0).toLocaleString('en-US') + ' photos waiting in ' + plural(waitingFirst.length, 'folder') + ')' : '', 'needs-review-head', waitingFirst);
    addSection(waitingFirst.length ? 'Already reviewed' : '', 'reviewed-head', others);
    var sorter = h('div', { class: 'pr-row', style: 'margin:.2rem 0 .6rem', role: 'group', 'aria-label': 'Sort folders' },
      h('span', { class: 'pr-muted' }, 'Sort folders:'),
      h('button', { class: 'pr-chip', 'aria-pressed': String(mode === 'date'), 'data-testid': 'sort-date', onclick: function () { setFolderSort('date'); } }, 'Newest first'),
      h('button', { class: 'pr-chip', 'aria-pressed': String(mode === 'sport'), 'data-testid': 'sort-sport', onclick: function () { setFolderSort('sport'); } }, 'By sport'));
    ordered.forEach(function (f) {
      (heads[f.id] || []).forEach(function (el) { list.appendChild(el); });
      /* A folder with nothing in it (a duplicate, or everything was moved out): it can be deleted.
         A folder that still has photos can never be deleted here, so no photo is ever lost. */
      if (f.waiting + f.approved + f.rejected === 0) {
        list.appendChild(h('div', { class: 'pr-card' }, h('div', { class: 'pr-row' },
          h('div', { class: 'pr-grow' }, h('h2', { class: 'pr-h' }, f.name),
            h('div', { class: 'pr-muted' }, (f.sport ? f.sport + ' · ' : '') + longDate(f.event_date)),
            h('div', { class: 'pr-warn' }, 'Empty: no photos in this folder.')),
          h('button', { class: 'pr-btn', disabled: S.busy, onclick: function () { askRename('folder', f.name, '/owner/rename', { folder: f.id }); } }, 'Edit name'),
          h('button', { class: 'pr-btn bad', disabled: S.busy, onclick: function () {
            if (!window.confirm('Delete the empty folder "' + f.name + '"? It has no photos, and nothing else changes.')) return;
            act('/owner/delete-folder', { folder: f.id }, 'Empty folder deleted.');
          } }, 'Delete this empty folder'))));
        return;
      }
      var sel = h('select', { class: 'pr-sel', 'aria-label': 'Team for ' + f.name, onchange: function (ev) { act('/owner/set-team', { folder: f.id, team: ev.target.value }, 'Filed under that team.'); } },
        h('option', { value: '', selected: !f.team_id }, 'No team yet'),
        S.teams.map(function (t) { return h('option', { value: t.id, selected: t.id === f.team_id }, t.name); }));
      list.appendChild(h('div', { class: 'pr-card' }, h('div', { class: 'pr-row' },
        h('div', { class: 'pr-grow' }, h('h2', { class: 'pr-h' }, f.name),
          h('div', { class: 'pr-muted' }, (f.sport ? f.sport + ' · ' : '') + longDate(f.event_date)),
          f.same_day > 0 ? h('div', { class: 'pr-warn' }, (f.same_day === 1 ? 'Another folder' : f.same_day + ' other folders') + ' on this same day: check the labels.') : null),
        sel,
        h('div', { class: 'pr-muted' }, h('b', { style: f.waiting ? 'color:#e0a23a' : '' }, f.waiting + ' waiting'), ' · ' + f.approved + ' approved · ' + f.rejected + ' rejected'),
        h('div', { class: 'pr-foot' },
          h('button', { class: 'pr-btn', disabled: S.busy, onclick: function () { askRename('folder', f.name, '/owner/rename', { folder: f.id }); } }, 'Edit name'),
          h('button', { class: 'pr-btn gold', onclick: function () { go('folder', f.id); } }, f.waiting ? 'Review' : 'Open')))));
    });
    return h('div', null, h('h1', { class: 'pr-h', style: 'font-size:1.6rem;margin-bottom:.75rem' }, 'Folders'), S.folders.length > 1 ? sorter : null, list);
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
        p.video ? h('span', { class: 'pr-play', 'data-testid': 'clip-badge' }, '▶ ' + clipLength(p.duration)) : null,
        p.video && p.video_url ? h('a', { class: 'pr-big', href: p.video_url, target: '_blank', rel: 'noopener noreferrer', 'data-testid': 'clip-play', onclick: function (ev) { ev.stopPropagation(); } }, 'Play clip') :
        p.web_url ? h('a', { class: 'pr-big', href: p.web_url, target: '_blank', rel: 'noopener noreferrer', onclick: function (ev) { ev.stopPropagation(); } }, 'Larger') : null,
        h('div', { class: 'pr-meta' }, h('div', null, (p.video ? 'Clip · ' : '') + clock(p.taken_at) + ' · ' + p.filename, p.date_estimated ? ' (time estimated)' : ''),
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
    var tickAll = h('button', { class: 'pr-btn', onclick: function () {
      var every = S.photos.length > 0 && S.photos.every(function (p) { return S.picked[p.id]; });
      S.photos.forEach(function (p) { if (every) delete S.picked[p.id]; else S.picked[p.id] = true; });
      render();
    } }, S.photos.length && S.photos.every(function (p) { return S.picked[p.id]; }) ? 'Untick all on this page' : 'Tick all on this page');
    var tickFolder = S.total > PAGE ? h('button', { class: 'pr-btn', disabled: S.busy, 'data-testid': 'tick-folder', onclick: tickWholeFolder },
      'Tick all ' + S.total.toLocaleString('en-US') + (S.filter === 'all' ? '' : ' ' + S.filter) + ' in this folder') : null;
    var untick = n > 0 ? h('button', { class: 'pr-btn', disabled: S.busy, 'data-testid': 'untick-all', onclick: function () { S.picked = {}; render(); } }, 'Untick all') : null;
    var tickCount = h('span', { class: 'pr-muted', 'data-testid': 'tick-count' }, S.progress ? S.progress : n.toLocaleString('en-US') + ' ticked');
    var bar = h('div', { class: 'pr-bar' },
      h('div', { class: 'pr-row' },
        S.social.accounts.length ? h('button', { class: 'pr-btn gold', disabled: S.busy, 'data-testid': 'open-compose', onclick: function () { if (!need()) return; if (pickedIds().some(function (id) { return S.seen[id] && S.seen[id].video; })) { toast('Short clips can\'t be posted to Instagram or Facebook yet. Untick the clips and choose photos.'); return; } openCompose(f); } }, 'Post ticked to social') : null,
        h('button', { class: 'pr-btn gold', disabled: S.busy, onclick: function () { if (need()) act('/owner/decide', { ids: pickedIds(), status: 'approved' }, function (j) { return 'Approved ' + plural(j.changed, 'photo') + '.'; }); } }, 'Approve ticked (' + n + ')'),
        reason,
        h('button', { class: 'pr-btn bad', disabled: S.busy, onclick: function () { if (need()) act('/owner/decide', { ids: pickedIds(), status: 'rejected', reason: reason.value }, function (j) { return 'Rejected ' + plural(j.changed, 'photo') + '. Kept, never published.'; }); } }, 'Reject ticked'),
        h('button', { class: 'pr-btn', disabled: S.busy, onclick: function () { if (need()) act('/owner/decide', { ids: pickedIds(), status: 'waiting' }, 'Back to waiting.'); } }, 'Back to waiting'),
        h('button', { class: 'pr-btn bad', disabled: S.busy, onclick: function () {
          if (!need()) return;
          if (!window.confirm('Permanently delete ' + plural(n, 'ticked photo') + '?\n\nThis removes the photos and their files and cannot be undone. Approved photos are never deleted, even if ticked.')) return;
          act('/owner/delete-photos', { ids: pickedIds() }, function (j) {
            return 'Deleted ' + plural(j.deleted, 'photo') + '.' + (j.kept ? ' ' + plural(j.kept, 'approved photo') + ' kept: approved photos are never deleted.' : '');
          });
        } }, 'Delete ticked (not approved)'),
        f.waiting ? h('button', { class: 'pr-btn', style: 'margin-left:auto', disabled: S.busy, onclick: function () { act('/owner/approve-waiting', { folder: f.id }, function (j) { return 'Approved the remaining ' + plural(j.changed, 'photo') + '. Rejected ones were left alone.'; }); } }, 'Approve all ' + f.waiting + ' waiting') : null),
      h('details', null, h('summary', null, 'Wrong folder? Move or split the ticked photos'),
        h('div', { class: 'pr-row', style: 'margin:.6rem 0' }, moveTo,
          h('button', { class: 'pr-btn', disabled: S.busy, onclick: function () { if (!need()) return; if (!moveTo.value) { toast('Choose the folder to move them to.'); return; } act('/owner/move', { ids: pickedIds(), folder: moveTo.value }, function (j) { return 'Moved ' + plural(j.moved, 'photo') + '. They are waiting for review there.'; }); } }, 'Move')),
        h('div', { class: 'pr-muted' }, 'Or start a new folder from the ticked photos:'),
        h('div', { class: 'pr-row', style: 'margin:.4rem 0' }, nName, nSport,
          h('button', { class: 'pr-btn', disabled: S.busy, onclick: function () { if (!need()) return; if (!nName.value.trim()) { toast('Give the new folder a name first.'); return; } act('/owner/new-folder', { ids: pickedIds(), name: nName.value, sport: nSport.value }, 'New folder created. The photos are waiting for review there.'); } }, 'Create folder')),
        h('p', { class: 'pr-muted' }, 'Moved photos go back to waiting under their new folder. Renaming or splitting here changes the website only: the folders on your laptop are never touched.')));
    return h('div', null, head, h('p', { class: 'pr-muted' }, (f.sport ? f.sport + ' · ' : '') + longDate(f.event_date)), teamRow, chips, h('div', { class: 'pr-row', style: 'margin:.4rem 0' }, tickAll, tickFolder, untick, tickCount), body, pager, S.compose ? composePanel(f) : null, bar);
  }

  function teamsView() {
    var name = h('input', { class: 'pr-in', id: 'teamName', type: 'text', placeholder: 'New team name, e.g. Orchard Park Quakers', maxlength: '120', 'aria-label': 'New team name', style: 'min-width:16rem' });
    var create = h('div', { class: 'pr-card pr-row', style: 'margin-bottom:1rem' }, h('div', { class: 'pr-grow' }, h('b', null, 'Add a team'), h('div', { class: 'pr-muted' }, 'A new client to shoot for. It starts with a public page; you can switch one team to private below.')), name,
      h('button', { class: 'pr-btn gold', disabled: S.busy, onclick: function () { if (!name.value.trim()) { toast('Type the team name first.'); return; } act('/owner/create-team', { name: name.value }, 'Team created.'); } }, 'Create team'));
    /* Download large: one switch for the whole site. Off stops every large download at once. */
    var lg = S.large;
    var largeCard = lg ? h('div', { class: 'pr-card pr-row', style: 'margin-bottom:1rem', 'data-testid': 'large-card' },
      h('div', { class: 'pr-grow' }, h('b', null, 'Download large (3,600 pixels)'),
        h('div', { class: 'pr-muted', 'data-testid': 'large-status' }, (lg.enabled ? 'ON: parents see a free "Download large" button under approved photos that have a large copy. ' : 'OFF: no large downloads are offered. ') + lg.large_photos + ' of ' + lg.public_photos + ' public photos have a large copy.'),
        lg.public_photos > lg.large_photos ? h('div', { class: 'pr-muted' }, 'The rest get one the next time you press Send for review on their day in DateSort.') : null),
      h('button', { class: 'pr-btn ' + (lg.enabled ? 'bad' : 'gold'), disabled: S.busy, 'data-testid': 'large-switch', onclick: function () {
        act('/owner/large-downloads', { enabled: !lg.enabled }, lg.enabled ? 'Large downloads are OFF.' : 'Large downloads are ON.');
      } }, lg.enabled ? 'Switch OFF' : 'Switch ON')) : null;
    var list = h('div', { class: 'pr-list' });
    S.teams.forEach(function (t) {
      list.appendChild(h('div', { class: 'pr-card pr-row' }, h('div', { class: 'pr-grow' }, h('h2', { class: 'pr-h' }, t.name), h('div', { class: 'pr-muted' }, plural(t.folders, 'folder') + ' · page address: ' + t.slug + ' (stays the same if you rename)')),
        h('button', { class: 'pr-btn', disabled: S.busy, onclick: function () { askRename('team', t.name, '/owner/rename-team', { team: t.id }); } }, 'Edit name'),
        h('label', { class: 'pr-muted', for: 'vis-' + t.id }, 'Who can see this team\'s page'),
        h('select', { class: 'pr-sel', id: 'vis-' + t.id, onchange: function (ev) { act('/owner/team-visibility', { team: t.id, visibility: ev.target.value }, 'Saved.'); } },
          h('option', { value: 'public', selected: t.visibility === 'public' }, 'Public: anyone'), h('option', { value: 'private', selected: t.visibility === 'private' }, 'Private: team password'))));
    });
    return h('div', null, h('h1', { class: 'pr-h', style: 'font-size:1.6rem;margin-bottom:.75rem' }, 'Teams'), largeCard, create, list);
  }

  /* ---- Post to Instagram and Facebook ---- */
  function when(t) { return t ? new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''; }
  function resultList(targets) {
    return h('ul', { class: 'pr-res', 'data-testid': 'post-results' }, (targets || []).map(function (t) {
      var ok = t.status === 'published', wait = t.status === 'pending' || t.status === 'publishing';
      return h('li', { class: ok ? 'st-approved' : wait ? 'pr-muted' : 'st-rejected' },
        (ok ? '✓ ' : wait ? '… ' : '✗ ') + t.account + ': ' + (ok ? 'posted' : wait ? 'on its way' : 'did not post. ' + (t.error || '')),
        ok && t.permalink ? [' ', h('a', { href: t.permalink, target: '_blank', rel: 'noopener noreferrer' }, 'View post')] : null);
    }));
  }
  function openCompose(f) {
    var accts = {}; S.social.accounts.forEach(function (a) { accts[a.id] = true; });
    var draft = [(f.team_name ? f.team_name + ' · ' : '') + f.name, longDate(f.event_date), '', 'Photos by 5-Star Sports Media'].join('\n');
    S.compose = { caption: draft, accounts: accts, posted: [], result: null, working: false, status: '' };
    render();
    api('/owner/social/posted', { ids: pickedIds() }).then(function (j) { if (S.compose) { S.compose.posted = j.posted || []; render(); } }, function () {});
  }
  function postNow() {
    var c = S.compose; if (!c || c.working || S.busy) return;
    var accounts = Object.keys(c.accounts).filter(function (k) { return c.accounts[k]; });
    c.working = true; c.result = null; c.status = 'Recording your approval…'; S.busy = true; render();
    function finish(msg) { c.working = false; c.status = msg || ''; S.busy = false; render(); }
    api('/owner/social/post', { photos: pickedIds(), caption: c.caption, accounts: accounts }).then(function (j) {
      c.post = j.post;
      (function loop() {
        c.status = 'Posting…'; render();
        api('/owner/social/publish', { post: c.post }).then(function (r) {
          c.result = r.post;
          if (!r.done) return loop();
          finish('');
        }, function (e) { c.status = ''; finish(); fail(e); });
      })();
    }, function (e) { finish(); fail(e); });
  }
  /* What stops this post right now, in words ('' when nothing does). */
  function composeProblem() {
    var c = S.compose, ids = pickedIds(), n = ids.length;
    var notApproved = ids.filter(function (id) { return S.seen[id] && S.seen[id].status !== 'approved'; }).length;
    var chosen = S.social.accounts.filter(function (a) { return c.accounts[a.id]; });
    return n < 1 ? 'Tick the photos to post first.' : n > 10 ? 'A post takes up to 10 photos. You have ' + n + ' ticked: untick some.' :
      notApproved ? 'Only approved photos can be posted. Approve them first.' : !c.caption.trim() ? 'Write a caption.' : !chosen.length ? 'Choose where to post.' : '';
  }
  /* Typing in the caption updates the warning and the Post button on the spot, without rebuilding the page. */
  function updateComposeUi() {
    var p = composeProblem(), box = document.getElementById('socialProblem'), btn = document.querySelector('[data-testid=post-now]');
    if (box) { box.textContent = p; box.hidden = !p; }
    if (btn) btn.disabled = !!p || !!(S.compose && S.compose.working);
  }
  function composePanel(f) {
    var c = S.compose, ids = pickedIds(), n = ids.length;
    var chosen = S.social.accounts.filter(function (a) { return c.accounts[a.id]; });
    var problem = composeProblem();
    var anyFailed = c.result && c.result.targets.some(function (t) { return t.status === 'failed'; });
    var posted = {};
    c.posted.forEach(function (p) { var k = p.account; posted[k] = posted[k] || { n: {}, at: p.posted_at }; posted[k].n[p.photo_id] = true; });
    var strip = h('div', { class: 'pr-strip', 'aria-label': 'Photos in this post, in the order ticked' }, ids.slice(0, 10).map(function (id, i) {
      var p = S.seen[id];
      return h('span', { class: 'pr-chipimg' }, h('img', { src: p && p.thumb_url || '', alt: p ? p.filename : '' }), h('b', null, String(i + 1)));
    }));
    var ta = h('textarea', { class: 'pr-in pr-ta', id: 'socialCaption', maxlength: '2200', rows: '6', 'aria-label': 'Caption',
      oninput: function (ev) { c.caption = ev.target.value; var m = document.getElementById('socialCount'); if (m) m.textContent = c.caption.length + ' / 2,200'; updateComposeUi(); } });
    ta.value = c.caption;
    return h('div', { class: 'pr-card', style: 'margin:.8rem 0', id: 'socialPanel' },
      h('h2', { class: 'pr-h' }, 'Post to Instagram and Facebook'),
      h('div', { class: 'pr-muted' }, plural(n, 'photo') + ' ticked, in the order you ticked them. Pressing Post is your approval: nothing posts by itself.'),
      strip,
      h('label', { class: 'pr-muted', for: 'socialCaption' }, 'Caption (edit it as you like)'), ta,
      h('div', { class: 'pr-muted', id: 'socialCount' }, c.caption.length + ' / 2,200'),
      h('div', { class: 'pr-row', style: 'margin:.5rem 0' }, h('b', null, 'Post to:'), S.social.accounts.map(function (a) {
        return h('label', { class: 'pr-row pr-acct' }, h('input', { type: 'checkbox', class: 'pr-check', checked: !!c.accounts[a.id], 'data-account': a.id,
          onchange: function (ev) { c.accounts[a.id] = ev.target.checked; render(); } }), a.display_name + (a.platform === 'instagram' ? ' (Instagram)' : ' (Facebook)'));
      })),
      Object.keys(posted).map(function (k) {
        return h('div', { class: 'pr-warn', 'data-testid': 'already-posted' }, plural(Object.keys(posted[k].n).length, 'of these photo') + ' ' + (Object.keys(posted[k].n).length === 1 ? 'was' : 'were') + ' already posted to ' + k + ' on ' + when(posted[k].at) + '. Posting again makes a second post.');
      }),
      h('div', { class: 'pr-warn', id: 'socialProblem', 'data-testid': 'post-problem', hidden: !problem || !!c.result }, problem),
      c.status ? h('div', { class: 'pr-muted', role: 'status', 'data-testid': 'post-status' }, c.status) : null,
      c.result ? resultList(c.result.targets) : null,
      anyFailed && !c.working ? h('div', { class: 'pr-muted' }, 'Something did not post. The reason is shown above. Nothing was posted twice; fix it and start a new post from the folder when you are ready.') : null,
      h('div', { class: 'pr-row', style: 'margin-top:.6rem' },
        /* Once a post has gone out the button goes away: posting again is a deliberate new start from the folder. */
        c.result && !c.working ? null : h('button', { class: 'pr-btn gold', disabled: !!problem || c.working, 'data-testid': 'post-now', onclick: postNow },
          c.working ? 'Posting…' : 'Post now to ' + chosen.map(function (a) { return a.display_name; }).join(' and ')),
        h('button', { class: 'pr-btn', disabled: c.working, onclick: function () { if (c.result) S.picked = {}; S.compose = null; render(); } }, c.result ? 'Done' : 'Close')));
  }
  function postsView() {
    var list = h('div', { class: 'pr-list' });
    if (!S.posts.length) list.appendChild(h('div', { class: 'pr-empty' }, 'Nothing has been posted yet. In a folder, tick approved photos and press "Post ticked to social".'));
    S.posts.forEach(function (p) {
      list.appendChild(h('div', { class: 'pr-card', 'data-testid': 'post-row' },
        h('div', { class: 'pr-muted' }, when(p.approved_at) + ' · ' + (p.folder_name || 'a game') + ' · ' + plural(p.photos, 'photo')),
        h('div', null, p.caption.length > 140 ? p.caption.slice(0, 140) + '…' : p.caption),
        resultList(p.targets)));
    });
    return h('div', null, h('h1', { class: 'pr-h', style: 'font-size:1.6rem;margin-bottom:.75rem' }, 'Posts'), list);
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
    /* The page is rebuilt on every refresh (and while photos are being published). Keep what
       is being typed and which "more" panels are open, as long as the person is still on the
       same screen, so a refresh never wipes a half-written folder name. */
    var formKey = S.view + ':' + S.folder;
    var typed = {}, opened = [];
    if (S.formKey === formKey && !S.clearForm) {
      Array.prototype.forEach.call(app.querySelectorAll('input[id], select#moveTo'), function (el) { typed[el.id] = el.value; });
      Array.prototype.forEach.call(app.querySelectorAll('details'), function (d) { opened.push(d.open); });
    }
    S.formKey = formKey; S.clearForm = false;
    app.textContent = '';
    if (!CFG.serviceUrl || !CFG.anonKey || !window.supabase) {
      app.appendChild(h('div', { class: 'pr-sign' }, h('h1', { class: 'pr-brand' }, 'Photo Review'), h('div', { class: 'pr-empty' }, 'The review area is not connected yet.')));
      return;
    }
    if (!S.session || !S.me) { app.appendChild(signIn()); return; }
    app.appendChild(top()); app.appendChild(tabs());
    if (S.error) app.appendChild(h('div', { class: 'pr-err', role: 'alert' }, S.error));
    if (S.publishing) app.appendChild(h('div', { class: 'pr-warn', role: 'status', id: 'publishing' }, 'Putting approved photos on the public page: ' + S.publishing + ' left. Keep this page open.'));
    app.appendChild(S.view === 'teams' ? teamsView() : S.view === 'pages' ? pagesView() : S.view === 'posts' ? postsView() : S.view === 'folder' ? folderView() : foldersView());
    Object.keys(typed).forEach(function (id) { var f = document.getElementById(id); if (f && f.type !== 'password') f.value = typed[id]; });
    Array.prototype.forEach.call(app.querySelectorAll('details'), function (d, i) { if (opened[i]) d.open = true; });
    if (keepFocus) { var el = document.getElementById(keepFocus); if (el && el.focus) el.focus(); }
  }

  /* On opening the page: finish any approved photos an earlier approval left unpublished. */
  function healPublic() {
    return api('/owner/sync', {}).then(function (j) { return finishPublishing(j && j.public); }, function () {});
  }

  /* ---- start ---- */
  function start() {
    if (!CFG.serviceUrl || !CFG.anonKey || !window.supabase) return render();
    S.client = window.supabase.createClient(CFG.supabaseUrl, CFG.anonKey, { auth: { persistSession: true, detectSessionInUrl: true, autoRefreshToken: true } });
    function onSession(session) {
      S.session = session || null;
      if (!session) { S.me = null; return render(); }
      api('/owner/me').then(function (j) { S.me = j; return refresh().then(healPublic); }, function (e) {
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
