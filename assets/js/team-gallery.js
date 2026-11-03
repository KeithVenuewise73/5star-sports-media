/* ============================================================================
   Team galleries — the browser side of the team-gallery service.

   Photographs are published by the photographer's JerseySort to the
   team-gallery service (HL-BOS). This file talks to it:
     - the team password is checked BY THE SERVICE; this page only keeps the
       access pass it returns (in this browser, for this gallery);
     - photos arrive as signed links that expire after an hour;
     - "Download all" builds a ZIP right here in the browser.

   Nothing here talks to the site's other Supabase project.
   ============================================================================ */

(function () {
  'use strict';

  var LIVE = 'https://mvvtngiopdrgiedjmhfb.supabase.co/functions/v1/team-gallery';

  // Testing on this computer may point the page at a local copy of the
  // service (?svc=...). Only on localhost, so a link cannot send real
  // visitors' passwords elsewhere.
  function serviceUrl() {
    var local = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
    var svc = new URLSearchParams(location.search).get('svc');
    return local && svc ? svc.replace(/\/+$/, '') : LIVE;
  }

  function passKey(link) { return 'tg_pass_' + link; }
  function getPass(link) {
    try { return localStorage.getItem(passKey(link)); } catch (e) { return null; }
  }
  function setPass(link, pass) {
    try { localStorage.setItem(passKey(link), pass); } catch (e) { /* private mode: ask again next time */ }
  }
  function forgetPass(link) {
    try { localStorage.removeItem(passKey(link)); } catch (e) { /* nothing kept */ }
  }

  async function call(path, init) {
    var res;
    try {
      res = await fetch(serviceUrl() + path, init);
    } catch (e) {
      return { status: 0, body: { error: 'Could not reach the galleries. Check your connection and try again.' } };
    }
    var body = {};
    try { body = await res.json(); } catch (e) { /* no body */ }
    return { status: res.status, body: body };
  }

  function unlock(link, password) {
    return call('/unlock', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ link: link, password: password })
    });
  }
  function gallery(link, pass) {
    return call('/gallery?link=' + encodeURIComponent(link), {
      headers: { authorization: 'Bearer ' + pass }
    });
  }
  function game(link, pass, gameId) {
    return call('/game?link=' + encodeURIComponent(link) + '&game=' + encodeURIComponent(gameId), {
      headers: { authorization: 'Bearer ' + pass }
    });
  }

  /* --- a minimal ZIP writer (stored, no compression: JPEGs do not shrink) --- */
  var CRC = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(bytes) {
    var c = 0xffffffff;
    for (var i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }
  function zip(files) {
    var enc = new TextEncoder();
    var parts = [];
    var central = [];
    var offset = 0;
    files.forEach(function (f) {
      var name = enc.encode(f.name);
      var crc = crc32(f.data);
      var size = f.data.length;
      var local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true);
      local.setUint16(4, 20, true);
      local.setUint16(6, 0x0800, true); // UTF-8 names
      local.setUint32(14, crc, true);
      local.setUint32(18, size, true);
      local.setUint32(22, size, true);
      local.setUint16(26, name.length, true);
      parts.push(new Uint8Array(local.buffer), name, f.data);
      var cen = new DataView(new ArrayBuffer(46));
      cen.setUint32(0, 0x02014b50, true);
      cen.setUint16(4, 20, true);
      cen.setUint16(6, 20, true);
      cen.setUint16(8, 0x0800, true);
      cen.setUint32(16, crc, true);
      cen.setUint32(20, size, true);
      cen.setUint32(24, size, true);
      cen.setUint16(28, name.length, true);
      cen.setUint32(42, offset, true);
      central.push(new Uint8Array(cen.buffer), name);
      offset += 30 + name.length + size;
    });
    var centralSize = central.reduce(function (n, p) { return n + p.length; }, 0);
    var end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, files.length, true);
    end.setUint16(10, files.length, true);
    end.setUint32(12, centralSize, true);
    end.setUint32(16, offset, true);
    return new Blob(parts.concat(central, [new Uint8Array(end.buffer)]), { type: 'application/zip' });
  }

  function save(blob, filename) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  }

  window.TeamGallery = {
    serviceUrl: serviceUrl,
    getPass: getPass,
    setPass: setPass,
    forgetPass: forgetPass,
    unlock: unlock,
    gallery: gallery,
    game: game,
    zip: zip,
    save: save
  };
})();
