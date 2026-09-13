/* ============================================================
   store.js — offline-first datalaag met optionele cloud-sync
   Elk record: { id, kind, data, deleted, updated_at, dirty }
   ============================================================ */
(function (RT) {
  'use strict';

  var LS_PREFIX = 'roadtrippers.v1.';
  var bus = RT.emitter();

  var store = {
    tripId: null,
    items: {},          // id -> record
    sync: null,         // cloud adapter (zie cloud.js)
    lastPull: null,
    status: 'local',    // local | syncing | synced | error | offline
    statusText: 'Lokaal opgeslagen',
    on: bus.on,
    off: bus.off
  };

  /* ---------- persistentie (altijd lokaal, ook in cloud-modus) ---------- */

  function lsKey() { return LS_PREFIX + (store.tripId || 'default'); }

  var saveLocal = RT.debounce(function () {
    try {
      localStorage.setItem(lsKey(), JSON.stringify({
        tripId: store.tripId,
        lastPull: store.lastPull,
        items: store.items
      }));
    } catch (e) {
      console.warn('[store] lokaal opslaan mislukt', e);
      RT.toast('Lokaal opslaan mislukt (opslag vol?)', 'error');
    }
  }, 250);

  function loadLocal() {
    try {
      var raw = localStorage.getItem(lsKey());
      if (!raw) return false;
      var parsed = JSON.parse(raw);
      store.items = parsed.items || {};
      store.lastPull = parsed.lastPull || null;
      return true;
    } catch (e) {
      console.warn('[store] lokaal laden mislukt', e);
      return false;
    }
  }

  /* ---------- lifecycle ---------- */

  store.open = function (tripId) {
    store.tripId = tripId || 'default';
    store.items = {};
    store.lastPull = null;
    var had = loadLocal();
    bus.emit('change', { reason: 'open' });
    return had;
  };

  store.close = function () {
    stopPolling();
    store.tripId = null;
    store.items = {};
    store.sync = null;
    setStatus('local', 'Lokaal opgeslagen');
    bus.emit('change', { reason: 'close' });
  };

  /* ---------- lezen ---------- */

  store.all = function (kind) {
    var out = [];
    for (var id in store.items) {
      var r = store.items[id];
      if (r.deleted) continue;
      if (kind && r.kind !== kind) continue;
      out.push(r);
    }
    return out.map(toEntity);
  };

  store.get = function (id) {
    var r = store.items[id];
    return r && !r.deleted ? toEntity(r) : null;
  };

  store.count = function (kind) {
    var n = 0;
    for (var id in store.items) {
      var r = store.items[id];
      if (!r.deleted && (!kind || r.kind === kind)) n++;
    }
    return n;
  };

  function toEntity(r) {
    var e = Object.assign({}, r.data);
    e.id = r.id;
    e.kind = r.kind;
    e.updated_at = r.updated_at;
    return e;
  }

  /* ---------- schrijven ---------- */

  function stamp() { return new Date().toISOString(); }

  store.put = function (kind, data, id) {
    var rid = id || data.id || RT.uid(kind.slice(0, 3));
    var body = Object.assign({}, data);
    delete body.id; delete body.kind; delete body.updated_at;
    store.items[rid] = {
      id: rid, kind: kind, data: body,
      deleted: false, updated_at: stamp(), dirty: true
    };
    touched();
    return rid;
  };

  store.patch = function (id, partial) {
    var r = store.items[id];
    if (!r) return null;
    var body = Object.assign({}, r.data, partial);
    delete body.id; delete body.kind; delete body.updated_at;
    r.data = body;
    r.updated_at = stamp();
    r.dirty = true;
    r.deleted = false;
    touched();
    return id;
  };

  // Meerdere wijzigingen zonder tussentijdse rerenders
  store.batch = function (fn) {
    batching = true;
    try { fn(); } finally {
      batching = false;
      touched();
    }
  };

  store.remove = function (id) {
    var r = store.items[id];
    if (!r) return;
    r.deleted = true;
    r.updated_at = stamp();
    r.dirty = true;
    touched();
  };

  store.removeWhere = function (kind, pred) {
    store.batch(function () {
      store.all(kind).forEach(function (e) { if (pred(e)) store.remove(e.id); });
    });
  };

  var batching = false;
  function touched() {
    if (batching) return;
    saveLocal();
    bus.emit('change', { reason: 'write' });
    schedulePush();
  }

  /* ---------- import / export ---------- */

  store.exportJSON = function () {
    return JSON.stringify({
      app: 'roadtrippers', version: 1,
      exported_at: stamp(),
      tripId: store.tripId,
      items: store.items
    }, null, 2);
  };

  store.importJSON = function (text, mode) {
    var parsed = JSON.parse(text);
    if (!parsed || !parsed.items) throw new Error('Onbekend bestandsformaat');
    if (mode === 'replace') store.items = {};
    Object.keys(parsed.items).forEach(function (id) {
      var inc = parsed.items[id];
      var cur = store.items[id];
      if (!cur || new Date(inc.updated_at || 0) >= new Date(cur.updated_at || 0)) {
        store.items[id] = Object.assign({}, inc, { dirty: true });
      }
    });
    touched();
    return Object.keys(parsed.items).length;
  };

  /* ---------- status ---------- */

  function setStatus(s, text) {
    store.status = s;
    store.statusText = text;
    bus.emit('status', s, text);
  }
  store.setStatus = setStatus;

  /* ---------- cloud-sync ----------
     adapter: { pull(sinceIso) -> Promise<rows>, push(rows) -> Promise<void> }
     row: { id, kind, data, deleted, updated_at }
  */

  var pushTimer = null, pollTimer = null, pushing = false, pullingNow = false;

  store.attachSync = function (adapter) {
    store.sync = adapter;
    if (!adapter) { stopPolling(); setStatus('local', 'Lokaal opgeslagen'); return; }
    setStatus('syncing', 'Verbinden…');
    store.pull(true).then(function () {
      return pushNow();
    }).then(function () {
      startPolling();
      setStatus('synced', 'Gesynchroniseerd');
    }).catch(function (e) {
      console.error('[sync] init mislukt', e);
      setStatus('error', 'Sync-fout: ' + (e && e.message ? e.message : e));
    });
  };

  store.detachSync = function () {
    stopPolling();
    store.sync = null;
    setStatus('local', 'Lokaal opgeslagen');
  };

  function dirtyRows() {
    var rows = [];
    for (var id in store.items) {
      var r = store.items[id];
      if (r.dirty) rows.push({ id: r.id, kind: r.kind, data: r.data, deleted: !!r.deleted, updated_at: r.updated_at });
    }
    return rows;
  }

  function schedulePush() {
    if (!store.sync) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(function () { pushNow(); }, 900);
  }

  function pushNow() {
    if (!store.sync || pushing) return Promise.resolve();
    var rows = dirtyRows();
    if (!rows.length) return Promise.resolve();
    pushing = true;
    setStatus('syncing', 'Opslaan…');
    return store.sync.push(rows).then(function () {
      rows.forEach(function (row) {
        var r = store.items[row.id];
        // alleen schoonvegen als er intussen niets nieuwers is
        if (r && r.updated_at === row.updated_at) r.dirty = false;
      });
      saveLocal();
      setStatus('synced', 'Gesynchroniseerd');
    }).catch(function (e) {
      console.error('[sync] push mislukt', e);
      setStatus('error', 'Opslaan mislukt — lokaal bewaard');
    }).then(function () {
      pushing = false;
      if (dirtyRows().length) schedulePush();
    });
  }
  store.pushNow = pushNow;

  store.pull = function (full) {
    if (!store.sync || pullingNow) return Promise.resolve(0);
    pullingNow = true;
    var since = full ? null : store.lastPull;
    return store.sync.pull(since).then(function (rows) {
      var applied = 0;
      (rows || []).forEach(function (row) {
        var cur = store.items[row.id];
        var incTs = new Date(row.updated_at || 0).getTime();
        var curTs = cur ? new Date(cur.updated_at || 0).getTime() : -1;
        if (cur && cur.dirty && curTs >= incTs) return;   // lokale wijziging wint
        if (curTs >= incTs && !full) return;
        store.items[row.id] = {
          id: row.id, kind: row.kind, data: row.data || {},
          deleted: !!row.deleted, updated_at: row.updated_at, dirty: false
        };
        applied++;
      });
      store.lastPull = stamp();
      if (applied) { saveLocal(); bus.emit('change', { reason: 'pull' }); }
      else saveLocal();
      pullingNow = false;
      return applied;
    }).catch(function (e) {
      pullingNow = false;
      console.error('[sync] pull mislukt', e);
      setStatus('error', 'Ophalen mislukt');
      return 0;
    });
  };

  function startPolling() {
    stopPolling();
    pollTimer = setInterval(function () {
      if (document.hidden) return;
      store.pull(false).then(function (n) {
        if (store.status !== 'error') setStatus('synced', 'Gesynchroniseerd');
        if (n) RT.toast(n + ' wijziging' + (n > 1 ? 'en' : '') + ' opgehaald');
      });
    }, 12000);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
  }

  function stopPolling() {
    clearInterval(pollTimer); pollTimer = null;
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('online', onOnline);
    window.removeEventListener('offline', onOffline);
  }

  function onVisible() { if (!document.hidden && store.sync) { store.pull(false); pushNow(); } }
  function onOnline() { if (store.sync) { setStatus('syncing', 'Weer online…'); store.pull(false).then(pushNow); } }
  function onOffline() { setStatus('offline', 'Offline — lokaal bewaard'); }

  store.forceSync = function () {
    if (!store.sync) { RT.toast('Niet ingelogd — data staat lokaal'); return Promise.resolve(); }
    setStatus('syncing', 'Synchroniseren…');
    return store.pull(false).then(pushNow).then(function () {
      if (store.status !== 'error') { setStatus('synced', 'Gesynchroniseerd'); RT.toast('Gesynchroniseerd', 'ok'); }
    });
  };

  RT.store = store;
})(window.RT);
