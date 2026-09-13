/* ============================================================
   tab-map.js — Leaflet-kaart met route, activiteiten en campings
   ============================================================ */
(function (RT) {
  'use strict';

  var el = RT.el, S = RT.store, M = RT.model, UI = RT.ui;

  var map = null, layers = null, host = null, routeLine = null, tilesOk = false;
  var visible = { day: true, campsite: true, activity: true, waypoint: true, route: true };

  /* ---------- Leaflet laden ---------- */

  var leafletPromise = null;
  function loadLeaflet() {
    if (window.L) return Promise.resolve(window.L);
    if (leafletPromise) return leafletPromise;
    leafletPromise = new Promise(function (resolve, reject) {
      var css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
      document.head.appendChild(css);

      var s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
      s.onload = function () { resolve(window.L); };
      s.onerror = function () { reject(new Error('Leaflet kon niet geladen worden')); };
      document.head.appendChild(s);
    });
    return leafletPromise;
  }

  /* ---------- markers ---------- */

  var STYLES = {
    day:      { cls: 'mk--day',      glyph: '', label: 'Route-stops' },
    campsite: { cls: 'mk--campsite', glyph: '⛺', label: 'Campings' },
    activity: { cls: 'mk--activity', glyph: '★', label: 'Activiteiten' },
    waypoint: { cls: 'mk--waypoint', glyph: '•', label: 'Eigen punten' }
  };

  function makeIcon(pt) {
    var st = STYLES[pt.kind] || STYLES.waypoint;
    var inner = pt.kind === 'day' ? String((pt.index || 0) + 1) : st.glyph;
    return window.L.divIcon({
      className: '',
      html: '<div class="mk ' + st.cls + '"><span>' + inner + '</span></div>',
      iconSize: [26, 26],
      iconAnchor: [13, 13],
      popupAnchor: [0, -14]
    });
  }

  function popupHtml(pt) {
    var e = pt.entity;
    var rows = [];
    if (pt.kind === 'campsite') {
      if (e.price) rows.push(RT.fmt.money(e.price) + ' p/nacht');
      if (e.nights) rows.push(e.nights + ' nacht(en)');
      rows.push(e.booked ? '✔ geboekt' : '○ nog boeken');
    } else if (pt.kind === 'activity') {
      if (e.durationMin) rows.push(RT.fmt.duration(e.durationMin));
      if (e.type) rows.push(e.type);
      if (e.cost) rows.push(RT.fmt.money(e.cost));
    } else if (pt.kind === 'day') {
      if (e.km) rows.push(RT.fmt.km(e.km));
      if (e.driveMin) rows.push(RT.fmt.duration(e.driveMin));
      if (e.date) rows.push(RT.fmt.date(e.date));
    }
    var di = e.dayId ? M.dayIndex(e.dayId) : -1;
    if (di >= 0) rows.push('Dag ' + (di + 1));
    return '<div class="mapop">' +
      '<strong>' + RT.escapeHtml(pt.name) + '</strong>' +
      (rows.length ? '<div class="mapop__meta">' + RT.escapeHtml(rows.join(' · ')) + '</div>' : '') +
      (e.note ? '<div class="mapop__note">' + RT.escapeHtml(e.note) + '</div>' : '') +
      '<button class="mapop__btn" data-goto="' + pt.kind + '" data-id="' + pt.id + '">Openen</button>' +
      '</div>';
  }

  function refreshMarkers() {
    if (!map || !layers) return;
    Object.keys(layers).forEach(function (k) { layers[k].clearLayers(); });

    M.mapPoints().forEach(function (pt) {
      var mk = window.L.marker(pt.coord, { icon: makeIcon(pt), title: pt.name });
      mk.bindPopup(popupHtml(pt));
      mk.on('popupopen', function (e) {
        var btn = e.popup.getElement().querySelector('[data-goto]');
        if (btn) btn.addEventListener('click', function () {
          map.closePopup();
          var tabFor = { campsite: 'campsites', activity: 'activiteiten', day: 'route', waypoint: 'kaart' };
          var target = tabFor[btn.dataset.goto];
          if (target && target !== 'kaart') UI.go(target, { focus: btn.dataset.id });
        });
      });
      if (layers[pt.kind]) mk.addTo(layers[pt.kind]);
    });

    if (routeLine) { map.removeLayer(routeLine); routeLine = null; }
    var line = M.routeLine();
    if (line.length > 1 && visible.route) {
      routeLine = window.L.polyline(line, {
        color: '#c89b3c', weight: 3, opacity: .85, dashArray: '6 6'
      }).addTo(map);
    }
  }

  function fitAll() {
    if (!map) return;
    var pts = M.mapPoints().map(function (p) { return p.coord; });
    if (!pts.length) return;
    if (pts.length === 1) { map.setView(pts[0], 10); return; }
    map.fitBounds(window.L.latLngBounds(pts).pad(0.15));
  }

  /* ---------- toevoegen via klik ---------- */

  function addAt(latlng) {
    var coord = [
      Math.round(latlng.lat * 1e6) / 1e6,
      Math.round(latlng.lng * 1e6) / 1e6
    ];
    var m = RT.modal({
      title: 'Toevoegen op ' + RT.fmt.coord(coord[0], coord[1]),
      body: el('div.triplist', {},
        opt('activity', 'Activiteit', 'Iets om te doen op deze plek'),
        opt('campsite', 'Camping', 'Overnachtingsplek'),
        opt('day', 'Route-stop', 'Nieuwe dag in de dagplanning'),
        opt('waypoint', 'Eigen punt', 'Losse markering, bv. tankstation of uitzicht')
      )
    });

    function opt(kind, label, sub) {
      return el('button.tripitem', {
        type: 'button',
        onClick: function () { m.close(); create(kind, coord); }
      }, el('span.grow', {}, el('strong', { text: label }), el('div.code', { text: sub })));
    }
  }

  function create(kind, coord) {
    if (kind === 'waypoint') {
      RT.form({
        title: 'Eigen punt',
        okLabel: 'Toevoegen',
        values: { name: '', note: '' },
        fields: [
          { key: 'name', label: 'Naam', width: 'full' },
          { key: 'note', label: 'Notitie', type: 'textarea', width: 'full', rows: 2 }
        ]
      }).then(function (v) {
        if (!v || !v.name) return;
        v.coord = coord;
        S.put('waypoint', v);
        RT.toast('Punt toegevoegd', 'ok');
      });
      return;
    }
    if (kind === 'day') {
      var days = M.days();
      RT.form({
        title: 'Route-stop',
        okLabel: 'Toevoegen',
        values: { to: '', date: RT.addDaysISO(RT.todayISO(), days.length), km: null },
        fields: [
          { key: 'to', label: 'Bestemming', width: 'full' },
          { key: 'date', label: 'Datum', type: 'date' },
          { key: 'km', label: 'Afstand (km)', type: 'number' }
        ]
      }).then(function (v) {
        if (!v || !v.to) return;
        v.coord = coord;
        v.order = days.length;
        v.from = days.length ? (days[days.length - 1].to || '') : '';
        S.put('day', v);
        RT.toast('Route-stop toegevoegd', 'ok');
      });
      return;
    }
    if (kind === 'campsite') {
      RT.form({
        title: 'Camping',
        okLabel: 'Toevoegen',
        values: { name: '', price: null, nights: 1, dayId: '', booked: false },
        fields: [
          { key: 'name', label: 'Naam', width: 'full' },
          { key: 'price', label: 'Prijs p/nacht (€)', type: 'number' },
          { key: 'nights', label: 'Nachten', type: 'number', min: 1, step: '1' },
          { key: 'dayId', label: 'Dag', type: 'select', options: M.dayOptions() },
          { key: 'booked', label: 'Al geboekt', type: 'check' }
        ]
      }).then(function (v) {
        if (!v || !v.name) return;
        v.coord = coord; v.facilities = []; v.rating = 0;
        S.put('campsite', v);
        RT.toast('Camping toegevoegd', 'ok');
      });
      return;
    }
    RT.form({
      title: 'Activiteit',
      okLabel: 'Toevoegen',
      values: { name: '', type: 'bezienswaardigheid', dayId: '', durationMin: null, cost: null, status: 'wens', want: 'beide' },
      fields: [
        { key: 'name', label: 'Naam', width: 'full' },
        { key: 'type', label: 'Soort', type: 'select', options: M.ACTIVITY_TYPES },
        { key: 'dayId', label: 'Dag', type: 'select', options: M.dayOptions() },
        { key: 'durationMin', label: 'Duur (min)', type: 'number' },
        { key: 'cost', label: 'Kosten (€)', type: 'number' },
        { key: 'want', label: 'Wie wil dit', type: 'select', options: UI.personSelect() }
      ]
    }).then(function (v) {
      if (!v || !v.name) return;
      v.coord = coord;
      S.put('activity', v);
      RT.toast('Activiteit toegevoegd', 'ok');
    });
  }

  /* ---------- render ---------- */

  function render(root) {
    var s = M.settings();

    // Een eerder opgebouwde kaart hoort netjes opgeruimd te worden,
    // anders blijven er losse Leaflet-instanties en listeners hangen.
    if (map) {
      try { map.remove(); } catch (e) { }
      map = null; layers = null; routeLine = null;
    }

    host = el('div.map-host');
    var banner = el('div.map-banner.hidden');

    var legend = el('div.map-legend');
    Object.keys(STYLES).forEach(function (k) {
      var st = STYLES[k];
      var cb = el('input', { type: 'checkbox', checked: visible[k] });
      cb.addEventListener('change', function () {
        visible[k] = cb.checked;
        if (!map) return;
        if (cb.checked) layers[k].addTo(map); else map.removeLayer(layers[k]);
      });
      legend.appendChild(el('label.map-legend__row', {}, cb,
        el('span.mk.mk--mini.' + st.cls, { text: k === 'day' ? '1' : st.glyph }),
        el('span', { text: st.label })
      ));
    });
    var routeCb = el('input', { type: 'checkbox', checked: visible.route });
    routeCb.addEventListener('change', function () { visible.route = routeCb.checked; refreshMarkers(); });
    legend.appendChild(el('label.map-legend__row', {}, routeCb,
      el('span.map-legend__line'), el('span', { text: 'Route' })));

    var wrap = el('div.map-wrap', {}, host, legend, banner,
      el('div.map-tools', {},
        el('button.btn.btn--sm', { type: 'button', title: 'Alles in beeld', onClick: fitAll },
          el('span', { html: RT.icon('search', 14) }), 'Alles in beeld'),
        el('button.btn.btn--sm', {
          type: 'button', onClick: function () {
            RT.geoPick().then(function (r) {
              if (r && map) { map.setView([r.lat, r.lng], 11); }
            });
          }
        }, el('span', { html: RT.icon('pin', 14) }), 'Zoek plaats'),
        el('button.btn.btn--sm', {
          type: 'button', onClick: function () {
            if (!navigator.geolocation) return RT.toast('Geen locatie beschikbaar', 'error');
            navigator.geolocation.getCurrentPosition(function (p) {
              if (map) map.setView([p.coords.latitude, p.coords.longitude], 12);
            }, function () { RT.toast('Locatie ophalen mislukt', 'error'); });
          }
        }, 'Mijn locatie')
      )
    );

    root.appendChild(el('div.wrap.wrap--map', {},
      UI.pagehead('Kaart', 'Klik ergens op de kaart om daar iets toe te voegen.', [
        el('button.btn.btn--ghost', {
          type: 'button', onClick: function () {
            RT.alert('Dagen uit de route-tab worden als genummerde stops getekend en met een gestippelde lijn verbonden. Activiteiten en campings verschijnen zodra je er coördinaten aan hangt — dat gaat het snelst door hier op de kaart te klikken.', 'Hoe werkt de kaart?');
          }
        }, 'Uitleg')
      ]),
      wrap
    ));

    loadLeaflet().then(function (L) {
      map = L.map(host, { zoomControl: true, attributionControl: true })
        .setView(s.mapCenter || [52.1, 5.3], s.mapZoom || 5);

      var tiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap'
      });
      tiles.on('tileload', function () { tilesOk = true; banner.classList.add('hidden'); });
      tiles.on('tileerror', function () {
        if (!tilesOk) {
          banner.textContent = 'Kaarttegels laden niet. Je hebt internet nodig voor de achtergrondkaart — markers en route werken verder gewoon.';
          banner.classList.remove('hidden');
        }
      });
      tiles.addTo(map);

      layers = {};
      Object.keys(STYLES).forEach(function (k) {
        layers[k] = L.layerGroup();
        if (visible[k]) layers[k].addTo(map);
      });

      map.on('click', function (e) { addAt(e.latlng); });
      map.on('moveend', RT.debounce(function () {
        var c = map.getCenter();
        M.saveSettings({ mapCenter: [c.lat, c.lng], mapZoom: map.getZoom() });
      }, 1200));

      refreshMarkers();
      if (!s.mapCenter || (s.mapCenter[0] === 52.1 && s.mapCenter[1] === 5.3)) fitAll();
      setTimeout(function () { map.invalidateSize(); }, 120);
    }).catch(function (e) {
      banner.textContent = 'De kaartbibliotheek kon niet geladen worden (' + e.message + '). Controleer je internetverbinding.';
      banner.classList.remove('hidden');
    });
  }

  UI.register({
    id: 'kaart',
    label: 'Kaart',
    icon: 'map',
    count: function () { return M.mapPoints().length; },
    render: render,
    onChange: function () { refreshMarkers(); },
    onShow: function () { if (map) setTimeout(function () { map.invalidateSize(); }, 60); }
  });

})(window.RT);
