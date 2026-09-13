/* ============================================================
   tab-log.js — reisdagboek met foto's
   ============================================================ */
(function (RT) {
  'use strict';

  var el = RT.el, S = RT.store, M = RT.model, UI = RT.ui;

  var WEATHER = ['zonnig', 'bewolkt', 'regen', 'storm', 'sneeuw', 'mist', 'wisselvallig'];
  var WEATHER_GLYPH = { zonnig: '☀️', bewolkt: '☁️', regen: '🌧️', storm: '⛈️', sneeuw: '❄️', mist: '🌫️', wisselvallig: '🌤️' };

  function fields() {
    return [
      { key: 'title', label: 'Titel', width: 'full' },
      { key: 'date', label: 'Datum', type: 'date' },
      { key: 'dayId', label: 'Dag', type: 'select', options: M.dayOptions() },
      { key: 'weather', label: 'Weer', type: 'select', options: [''].concat(WEATHER) },
      { key: 'odo', label: 'Kilometerstand', type: 'number' },
      { key: 'mood', label: 'Hoogtepunt van de dag', width: 'full', placeholder: 'in één zin' },
      { key: 'text', label: 'Verhaal', type: 'textarea', width: 'full', rows: 6 }
    ];
  }

  function add() {
    var days = M.days();
    var today = RT.todayISO();
    var match = days.filter(function (d) { return d.date === today; })[0];
    RT.form({
      title: 'Logboek-item',
      okLabel: 'Opslaan',
      values: { title: '', date: today, dayId: match ? match.id : '', weather: '', odo: null, mood: '', text: '', photos: [] },
      fields: fields()
    }).then(function (v) { if (v && (v.title || v.text)) S.put('log', v); });
  }

  function edit(e) {
    RT.form({ title: 'Logboek-item bewerken', values: e, fields: fields() })
      .then(function (v) { if (v) S.patch(e.id, v); });
  }

  function addPhotos(entry) {
    RT.pickFile('image/*').then(function (file) {
      if (!file) return;
      RT.toast('Foto verkleinen…');
      RT.shrinkImage(file, 1000, 0.7).then(function (dataUrl) {
        var photos = (entry.photos || []).slice();
        if (photos.length >= 12) { RT.toast('Maximaal 12 foto\'s per item', 'error'); return; }
        photos.push(dataUrl);
        S.patch(entry.id, { photos: photos });
        RT.toast('Foto toegevoegd', 'ok');
      }).catch(function () { RT.toast('Foto verwerken mislukt', 'error'); });
    });
  }

  function viewPhoto(src, entry, index) {
    var img = el('img', { src: src, style: { width: '100%', borderRadius: '8px', display: 'block' } });
    var m = RT.modal({
      title: entry.title || 'Foto',
      wide: true,
      body: img,
      buttons: [{
        label: 'Foto verwijderen', danger: true, onClick: function (close) {
          var photos = (entry.photos || []).slice();
          photos.splice(index, 1);
          S.patch(entry.id, { photos: photos });
          close(true);
        }
      }]
    });
    return m;
  }

  function entryCard(e) {
    var dayIdx = M.dayIndex(e.dayId);
    var photos = e.photos || [];

    return el('div.logentry', {},
      el('div.logentry__date', {},
        el('div.logentry__d', { text: e.date ? new Date(e.date).getDate() : '–' }),
        el('div.logentry__m', { text: e.date ? new Date(e.date).toLocaleDateString('nl-NL', { month: 'short' }) : '' }),
        e.weather ? el('div.logentry__w', { title: e.weather, text: WEATHER_GLYPH[e.weather] || '' }) : null
      ),
      el('div.entry.grow', {},
        el('div.entry__top', {},
          el('div.grow', {},
            el('h3.entry__title', { text: e.title || 'Zonder titel' }),
            el('div.entry__meta', { style: { marginTop: '4px' } },
              e.date ? el('span', { text: RT.fmt.weekday(e.date) + ' ' + RT.fmt.date(e.date) }) : null,
              dayIdx >= 0 ? el('span.badge.badge--info', { text: 'Dag ' + (dayIdx + 1) }) : null,
              e.odo ? el('span', { text: RT.fmt.km(e.odo) + ' op de teller' }) : null
            )
          ),
          UI.actions(function () { edit(e); }, function () { UI.confirmDelete(e.title || 'dit item', function () { S.remove(e.id); }); },
            el('button.iconbtn', { type: 'button', title: 'Foto toevoegen', html: RT.icon('plus', 15), onClick: function () { addPhotos(e); } })
          )
        ),
        e.mood ? el('div.logentry__mood', { text: '“' + e.mood + '”' }) : null,
        e.text ? el('div.entry__note', { text: e.text }) : null,
        photos.length ? el('div.photos', {}, photos.map(function (p, i) {
          return el('button.photo', {
            type: 'button', onClick: function () { viewPhoto(p, e, i); }
          }, el('img', { src: p, alt: '', loading: 'lazy' }));
        })) : null,
        el('button.btn.btn--ghost.btn--sm', {
          type: 'button', style: { alignSelf: 'flex-start' }, onClick: function () { addPhotos(e); }
        }, el('span', { html: RT.icon('plus', 13) }), photos.length ? 'Nog een foto' : 'Foto toevoegen')
      )
    );
  }

  function render(root) {
    var all = RT.sortBy(S.all('log'), function (e) { return e.date || ''; }, 'desc');
    var wrap = el('div.wrap');

    wrap.appendChild(UI.pagehead('Logboek', 'Wat er onderweg gebeurde — voor later.', [
      el('button.btn.btn--primary', { type: 'button', onClick: add },
        el('span', { html: RT.icon('plus', 15) }), 'Nieuw item')
    ]));

    if (all.length) {
      var photos = all.reduce(function (a, e) { return a + (e.photos || []).length; }, 0);
      var odos = all.filter(function (e) { return RT.num(e.odo, 0) > 0; }).map(function (e) { return RT.num(e.odo, 0); });
      var driven = odos.length > 1 ? Math.max.apply(null, odos) - Math.min.apply(null, odos) : 0;
      wrap.appendChild(el('div.kpis', {},
        UI.kpi('Dagboek-items', String(all.length), ''),
        UI.kpi('Foto\'s', String(photos), ''),
        driven ? UI.kpi('Gereden', RT.fmt.km(driven), 'volgens kilometerstand', 'accent') : null,
        UI.kpi('Laatste item', all[0].date ? RT.fmt.date(all[0].date) : '—', '')
      ));
    }

    if (!all.length) {
      wrap.appendChild(UI.empty('book', 'Het logboek is nog leeg',
        'Schrijf elke avond kort op wat jullie meegemaakt hebben en plak er een foto bij. Over een jaar ben je er blij mee.',
        el('button.btn.btn--primary', { type: 'button', onClick: add }, 'Eerste stukje schrijven')));
    } else {
      var list = el('div.loglist');
      all.forEach(function (e) { list.appendChild(entryCard(e)); });
      wrap.appendChild(list);
    }

    root.appendChild(wrap);
  }

  UI.register({
    id: 'logboek',
    label: 'Logboek',
    icon: 'book',
    count: function () { return S.count('log'); },
    render: render
  });

})(window.RT);
