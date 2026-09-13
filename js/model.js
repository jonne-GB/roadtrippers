/* ============================================================
   model.js — domeinmodel, constanten en voorbeelddata
   ============================================================ */
(function (RT) {
  'use strict';

  var S = RT.store;
  var M = {};

  /* ---------- instellingen ---------- */

  var DEFAULT_SETTINGS = {
    tripName: 'Onze roadtrip',
    personA: 'Persoon A',
    personB: 'Persoon B',
    capacityA: 15,
    capacityB: 15,
    currency: '€',
    budgetTotal: 0,
    startDate: null,
    mapCenter: [52.1, 5.3],
    mapZoom: 5
  };

  M.SETTINGS_ID = 'settings';

  M.settings = function () {
    var r = S.get(M.SETTINGS_ID);
    return Object.assign({}, DEFAULT_SETTINGS, r || {});
  };

  M.saveSettings = function (partial) {
    var cur = M.settings();
    delete cur.id; delete cur.kind; delete cur.updated_at;
    S.put('settings', Object.assign(cur, partial), M.SETTINGS_ID);
  };

  M.personName = function (slot) {
    var s = M.settings();
    return slot === 'a' ? s.personA : slot === 'b' ? s.personB : 'Samen';
  };

  M.personBadge = function (slot) {
    return slot === 'a' ? 'badge--a' : slot === 'b' ? 'badge--b' : '';
  };

  /* ---------- gear-categorieën ---------- */

  M.GEAR_CATS = {
    slapen:       { label: 'Slapen',       bg: '#3c3350', line: '#6a5a8c', glyph: '🛏️' },
    shelter:      { label: 'Shelter',      bg: '#33414d', line: '#4e6577', glyph: '⛺' },
    koken:        { label: 'Koken',        bg: '#4a3526', line: '#7a573c', glyph: '🍳' },
    eten:         { label: 'Eten',         bg: '#4a4226', line: '#786a3c', glyph: '🥫' },
    water:        { label: 'Water',        bg: '#26424c', line: '#3d6a78', glyph: '💧' },
    kleding:      { label: 'Kleding',      bg: '#35422c', line: '#546844', glyph: '🧥' },
    elektronica:  { label: 'Elektronica',  bg: '#26384c', line: '#3e5a78', glyph: '🔌' },
    medisch:      { label: 'Medisch',      bg: '#46282a', line: '#743f43', glyph: '🩹' },
    gereedschap:  { label: 'Gereedschap',  bg: '#383d43', line: '#575f68', glyph: '🔧' },
    hygiene:      { label: 'Hygiëne',      bg: '#2a4444', line: '#416a6a', glyph: '🧼' },
    navigatie:    { label: 'Navigatie',    bg: '#2f3f4a', line: '#496372', glyph: '🧭' },
    documenten:   { label: 'Documenten',   bg: '#40382a', line: '#675940', glyph: '📄' },
    auto:         { label: 'Auto',         bg: '#3b2f3d', line: '#5e4c61', glyph: '🚗' },
    overig:       { label: 'Overig',       bg: '#32373d', line: '#4d545c', glyph: '📦' }
  };

  M.catList = function () {
    return Object.keys(M.GEAR_CATS).map(function (k) {
      return { value: k, label: M.GEAR_CATS[k].label };
    });
  };

  M.cat = function (key) { return M.GEAR_CATS[key] || M.GEAR_CATS.overig; };

  /* ---------- uitrustingsslots ---------- */

  M.SLOTS = [
    { key: 'hoofd',    label: 'Hoofd' },
    { key: 'jas',      label: 'Jas' },
    { key: 'schoenen', label: 'Schoenen' },
    { key: 'rig',      label: 'Heuptas' },
    { key: 'rugzak',   label: 'Rugzak' }
  ];

  /* ---------- gear-helpers ---------- */

  M.containers = function () {
    return RT.sortBy(S.all('container'), function (c) {
      return (c.owner === 'a' ? 0 : c.owner === 'b' ? 1 : 2) + '_' + (c.order || 0);
    });
  };

  M.containersFor = function (owner) {
    return M.containers().filter(function (c) { return c.owner === owner; });
  };

  M.gear = function () { return S.all('gear'); };

  M.gearIn = function (containerId) {
    return M.gear().filter(function (g) {
      return g.loc && g.loc.type === 'grid' && g.loc.containerId === containerId;
    });
  };

  M.gearInSlot = function (person, slot) {
    var found = null;
    M.gear().forEach(function (g) {
      if (g.loc && g.loc.type === 'slot' && g.loc.person === person && g.loc.slot === slot) found = g;
    });
    return found;
  };

  M.gearInStash = function () {
    return M.gear().filter(function (g) { return !g.loc || g.loc.type === 'stash'; });
  };

  // Totaal gewicht dat één persoon draagt (containers van die persoon + eigen slots)
  M.personWeight = function (slot) {
    var ids = {};
    M.containersFor(slot).forEach(function (c) { ids[c.id] = true; });
    var total = 0;
    M.gear().forEach(function (g) {
      if (!g.loc) return;
      var hit = (g.loc.type === 'grid' && ids[g.loc.containerId]) ||
                (g.loc.type === 'slot' && g.loc.person === slot);
      if (hit) total += RT.num(g.weight, 0) * Math.max(1, RT.num(g.qty, 1));
    });
    return total;
  };

  M.containerWeight = function (containerId) {
    return M.gearIn(containerId).reduce(function (a, g) {
      return a + RT.num(g.weight, 0) * Math.max(1, RT.num(g.qty, 1));
    }, 0);
  };

  M.capacity = function (slot) {
    var s = M.settings();
    return RT.num(slot === 'a' ? s.capacityA : s.capacityB, 15);
  };

  /* ---------- route / dagen ---------- */

  M.days = function () {
    return RT.sortBy(S.all('day'), function (d) { return (d.order !== undefined ? d.order : 999); });
  };

  M.dayLabel = function (day, index) {
    if (!day) return '—';
    return 'Dag ' + (index !== undefined ? index + 1 : (day.order || 0) + 1) +
      (day.date ? ' · ' + RT.fmt.dateShort(day.date) : '');
  };

  M.dayOptions = function (includeEmpty) {
    var opts = includeEmpty === false ? [] : [{ value: '', label: '— geen dag —' }];
    M.days().forEach(function (d, i) {
      opts.push({ value: d.id, label: 'Dag ' + (i + 1) + (d.date ? ' (' + RT.fmt.dateShort(d.date) + ')' : '') + (d.to ? ' · ' + d.to : '') });
    });
    return opts;
  };

  M.dayById = function (id) {
    if (!id) return null;
    var days = M.days();
    for (var i = 0; i < days.length; i++) if (days[i].id === id) return days[i];
    return null;
  };

  M.dayIndex = function (id) {
    var days = M.days();
    for (var i = 0; i < days.length; i++) if (days[i].id === id) return i;
    return -1;
  };

  /* ---------- alle punten met coördinaten (voor de kaart) ---------- */

  M.ACTIVITY_TYPES = ['wandeling', 'bezienswaardigheid', 'water', 'uitzicht', 'stad', 'eten', 'avontuur', 'rust', 'overig'];

  M.mapPoints = function () {
    var pts = [];
    S.all('activity').forEach(function (a) {
      if (validCoord(a.coord)) pts.push({ id: a.id, kind: 'activity', name: a.name, coord: a.coord, entity: a });
    });
    S.all('campsite').forEach(function (c) {
      if (validCoord(c.coord)) pts.push({ id: c.id, kind: 'campsite', name: c.name, coord: c.coord, entity: c });
    });
    S.all('waypoint').forEach(function (w) {
      if (validCoord(w.coord)) pts.push({ id: w.id, kind: 'waypoint', name: w.name, coord: w.coord, entity: w });
    });
    M.days().forEach(function (d, i) {
      if (validCoord(d.coord)) pts.push({ id: d.id, kind: 'day', name: 'Dag ' + (i + 1) + (d.to ? ' · ' + d.to : ''), coord: d.coord, entity: d, index: i });
    });
    return pts;
  };

  function validCoord(c) {
    return Array.isArray(c) && c.length === 2 && isFinite(c[0]) && isFinite(c[1]) && (c[0] !== 0 || c[1] !== 0);
  }
  M.validCoord = validCoord;

  M.routeLine = function () {
    return M.days().filter(function (d) { return validCoord(d.coord); }).map(function (d) { return d.coord; });
  };

  M.totalKm = function () {
    return M.days().reduce(function (a, d) { return a + RT.num(d.km, 0); }, 0);
  };

  /* ---------- budget ---------- */

  M.EXPENSE_CATS = ['brandstof', 'camping', 'eten', 'boodschappen', 'activiteit', 'tol/veerboot', 'auto', 'overig'];

  M.expenses = function () {
    return RT.sortBy(S.all('expense'), function (e) { return e.date || ''; }, 'desc');
  };

  M.expenseTotal = function () {
    return M.expenses().reduce(function (a, e) { return a + RT.num(e.amount, 0); }, 0);
  };

  // Wie moet wie nog wat betalen?
  M.settleUp = function () {
    var paid = { a: 0, b: 0 }, owed = { a: 0, b: 0 };
    M.expenses().forEach(function (e) {
      var amt = RT.num(e.amount, 0);
      if (!amt) return;
      var by = e.paidBy === 'b' ? 'b' : 'a';
      paid[by] += amt;
      var split = e.split || '50/50';
      if (split === 'a') owed.a += amt;
      else if (split === 'b') owed.b += amt;
      else { owed.a += amt / 2; owed.b += amt / 2; }
    });
    var balA = paid.a - owed.a;   // > 0: A heeft voorgeschoten
    return {
      paid: paid, owed: owed,
      balance: balA,
      from: balA > 0 ? 'b' : 'a',
      to: balA > 0 ? 'a' : 'b',
      amount: Math.abs(balA)
    };
  };

  /* ---------- boodschappen ---------- */

  M.GROCERY_CATS = ['groente & fruit', 'vlees & vis', 'zuivel', 'droogwaren', 'conserven', 'drinken', 'snacks', 'non-food'];
  M.MEAL_TYPES = ['ontbijt', 'lunch', 'diner', 'snack'];

  /* ---------- voorbeelddata ---------- */

  M.seed = function () {
    S.batch(function () {
      M.saveSettings({ tripName: 'Onze roadtrip' });

      // containers
      var ra = S.put('container', { name: 'Rugzak', owner: 'a', cols: 5, rows: 7, order: 0 });
      var ha = S.put('container', { name: 'Heuptas', owner: 'a', cols: 4, rows: 2, order: 1 });
      var rb = S.put('container', { name: 'Rugzak', owner: 'b', cols: 5, rows: 7, order: 0 });
      var hb = S.put('container', { name: 'Heuptas', owner: 'b', cols: 4, rows: 2, order: 1 });
      var car = S.put('container', { name: 'Kofferbak', owner: 'shared', cols: 8, rows: 5, order: 0 });

      function g(name, cat, w, h, kg, loc, extra) {
        S.put('gear', Object.assign({
          name: name, cat: cat, w: w, h: h, weight: kg, qty: 1,
          loc: loc, packed: false, note: ''
        }, extra || {}));
      }

      g('Slaapzak -5°',  'slapen',      2, 3, 1.35, { type: 'grid', containerId: ra, x: 0, y: 0 }, { packed: true });
      g('Slaapmat',      'slapen',      2, 2, 0.48, { type: 'grid', containerId: ra, x: 2, y: 0 });
      g('Hoofdlamp',     'elektronica', 1, 1, 0.09, { type: 'grid', containerId: ha, x: 0, y: 0 }, { packed: true });
      g('Slaapzak +0°',  'slapen',      2, 3, 1.20, { type: 'grid', containerId: rb, x: 0, y: 0 });
      g('EHBO-kit',      'medisch',     2, 1, 0.42, { type: 'grid', containerId: rb, x: 2, y: 0 }, { packed: true });
      g('Koepeltent 2p', 'shelter',     4, 2, 3.10, { type: 'grid', containerId: car, x: 0, y: 0 }, { packed: true });
      g('Kookset + gas', 'koken',       2, 2, 1.05, { type: 'grid', containerId: car, x: 4, y: 0 });
      g('Jerrycan 10L',  'water',       2, 2, 10.2, { type: 'grid', containerId: car, x: 6, y: 0 });
      g('Powerbank 20k', 'elektronica', 1, 2, 0.36, { type: 'stash' });
      g('Waterfilter',   'water',       1, 2, 0.31, { type: 'stash' });

      // route
      var d1 = S.put('day', { order: 0, date: RT.todayISO(), from: 'Thuis', to: 'Eerste stop', km: 320, driveMin: 240, coord: null, note: 'Vroeg weg, onderweg lunchen.' });
      var d2 = S.put('day', { order: 1, date: RT.addDaysISO(RT.todayISO(), 1), from: 'Eerste stop', to: 'Tweede stop', km: 180, driveMin: 150, coord: null, note: '' });

      // activiteiten
      S.put('activity', { name: 'Wandeling naar het uitzichtpunt', type: 'wandeling', dayId: d1, durationMin: 180, cost: 0, status: 'gepland', want: 'beide', coord: null, note: 'Goede schoenen aan.' });
      S.put('activity', { name: 'Lokale markt', type: 'stad', dayId: d2, durationMin: 90, cost: 15, status: 'wens', want: 'a', coord: null, note: '' });

      // campsite
      S.put('campsite', { name: 'Voorbeeldcamping', dayId: d1, price: 24, nights: 1, rating: 4, booked: false, coord: null, facilities: ['douche', 'stroom'], url: '', note: 'Bellen voor reservering.' });

      // eten
      S.put('meal', { dayId: d1, type: 'diner', name: 'Pasta pesto', servings: 2, note: '', ingredients: ['pasta', 'pesto', 'parmezaan'] });
      S.put('meal', { dayId: d2, type: 'ontbijt', name: 'Havermout', servings: 2, note: '', ingredients: ['havermout', 'melk', 'banaan'] });
      S.put('grocery', { name: 'Pasta 500g', qty: '2 pak', cat: 'droogwaren', done: false });
      S.put('grocery', { name: 'Koffie', qty: '1 pak', cat: 'drinken', done: true });

      // budget
      S.put('expense', { date: RT.todayISO(), desc: 'Tanken', cat: 'brandstof', amount: 78.4, paidBy: 'a', split: '50/50' });
      S.put('expense', { date: RT.todayISO(), desc: 'Boodschappen', cat: 'boodschappen', amount: 42.15, paidBy: 'b', split: '50/50' });

      // logboek
      S.put('log', { date: RT.todayISO(), title: 'Vertrek', text: 'Auto ingeladen, alles past net.\nEerste koffie bij de grens.', weather: 'zonnig', odo: null, photos: [] });
    });
  };

  M.isEmpty = function () {
    return S.count('day') + S.count('activity') + S.count('campsite') + S.count('gear') + S.count('container') === 0;
  };

  M.wipeDemo = function () {
    S.batch(function () {
      ['day', 'activity', 'campsite', 'gear', 'container', 'meal', 'grocery', 'expense', 'log', 'waypoint'].forEach(function (k) {
        S.all(k).forEach(function (e) { S.remove(e.id); });
      });
    });
  };

  RT.model = M;
})(window.RT);
