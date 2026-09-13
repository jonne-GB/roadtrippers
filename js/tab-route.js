/* ============================================================
   tab-route.js — dag-voor-dag planning
   ============================================================ */
(function (RT) {
  'use strict';

  var el = RT.el, S = RT.store, M = RT.model, UI = RT.ui;

  function dayFields() {
    return [
      { key: 'date', label: 'Datum', type: 'date' },
      { key: 'km', label: 'Afstand (km)', type: 'number' },
      { key: 'from', label: 'Van', placeholder: 'vertrekpunt' },
      { key: 'to', label: 'Naar', placeholder: 'bestemming' },
      { key: 'driveMin', label: 'Rijtijd (min)', type: 'number' },
      { key: 'coord', label: 'Coördinaten bestemming', type: 'latlng', help: 'Nodig om de dag op de kaart te tonen. Zoek op naam met de loep.' },
      { key: 'note', label: 'Notities', type: 'textarea', width: 'full', rows: 3 }
    ];
  }

  function addDay() {
    var days = M.days();
    var last = days[days.length - 1];
    RT.form({
      title: 'Dag toevoegen',
      okLabel: 'Toevoegen',
      values: {
        date: last && last.date ? RT.addDaysISO(last.date, 1) : (M.settings().startDate || RT.todayISO()),
        from: last ? (last.to || '') : '',
        to: '', km: null, driveMin: null, coord: null, note: ''
      },
      fields: dayFields()
    }).then(function (v) {
      if (!v) return;
      v.order = days.length;
      S.put('day', v);
    });
  }

  function editDay(d) {
    RT.form({ title: 'Dag bewerken', values: d, fields: dayFields() })
      .then(function (v) { if (v) S.patch(d.id, v); });
  }

  function move(index, dir) {
    var days = M.days();
    var j = index + dir;
    if (j < 0 || j >= days.length) return;
    S.batch(function () {
      days.forEach(function (d, i) {
        var order = i;
        if (i === index) order = j;
        else if (i === j) order = index;
        S.patch(d.id, { order: order });
      });
    });
  }

  function dayCard(d, i, total) {
    var camp = S.all('campsite').filter(function (c) { return c.dayId === d.id; });
    var acts = S.all('activity').filter(function (a) { return a.dayId === d.id; });
    var meals = S.all('meal').filter(function (x) { return x.dayId === d.id; });

    var costs = camp.reduce(function (a, c) { return a + RT.num(c.price, 0) * Math.max(1, RT.num(c.nights, 1)); }, 0) +
      acts.reduce(function (a, x) { return a + RT.num(x.cost, 0); }, 0);

    return el('div.dayrow', {},
      el('div.dayrow__rail', {},
        el('div.dayrow__num', { text: String(i + 1) }),
        i < total - 1 ? el('div.dayrow__line') : null
      ),
      el('div.entry.dayrow__body', {},
        el('div.entry__top', {},
          el('div.grow', {},
            el('h3.entry__title', { text: (d.from ? d.from + ' → ' : '') + (d.to || 'Nog te bepalen') }),
            el('div.entry__meta', { style: { marginTop: '4px' } },
              d.date ? el('span', {}, RT.fmt.weekday(d.date) + ' ' + RT.fmt.date(d.date)) : el('span.mute2', { text: 'geen datum' }),
              d.km ? el('span', {}, el('b', { text: RT.fmt.km(d.km) })) : null,
              d.driveMin ? el('span', { text: RT.fmt.duration(d.driveMin) }) : null,
              costs ? el('span', { text: RT.fmt.money(costs) }) : null
            )
          ),
          UI.actions(
            function () { editDay(d); },
            function () {
              UI.confirmDelete('Dag ' + (i + 1), function () {
                S.batch(function () {
                  S.remove(d.id);
                  M.days().forEach(function (x, k) { if (x.id !== d.id) S.patch(x.id, { order: k }); });
                });
              });
            },
            el('span.row', { style: { gap: '0' } },
              el('button.iconbtn', { type: 'button', title: 'Omhoog', html: RT.icon('up', 15), disabled: i === 0, onClick: function () { move(i, -1); } }),
              el('button.iconbtn', { type: 'button', title: 'Omlaag', html: RT.icon('down', 15), disabled: i === total - 1, onClick: function () { move(i, 1); } })
            )
          )
        ),

        (camp.length || acts.length || meals.length) ? el('div.dayrow__links', {},
          camp.map(function (c) {
            return el('button.linkchip', { type: 'button', onClick: function () { UI.go('campsites'); } },
              el('span', { html: RT.icon('tent', 13) }), c.name,
              c.booked ? el('span.linkchip__ok', { text: '✔' }) : null);
          }),
          acts.map(function (a) {
            return el('button.linkchip', { type: 'button', onClick: function () { UI.go('activiteiten'); } },
              el('span', { html: RT.icon('activity', 13) }), a.name);
          }),
          meals.map(function (x) {
            return el('button.linkchip', { type: 'button', onClick: function () { UI.go('eten'); } },
              el('span', { html: RT.icon('food', 13) }), x.name);
          })
        ) : null,

        d.note ? el('div.entry__note', { text: d.note }) : null,

        el('div.row.row--wrap', { style: { marginTop: '2px' } },
          M.validCoord(d.coord)
            ? el('button.btn.btn--ghost.btn--sm', { type: 'button', onClick: function () { UI.go('kaart'); } },
              el('span', { html: RT.icon('map', 13) }), RT.fmt.coord(d.coord[0], d.coord[1]))
            : el('button.btn.btn--ghost.btn--sm', {
              type: 'button',
              onClick: function () {
                RT.geoPick().then(function (r) { if (r) S.patch(d.id, { coord: [r.lat, r.lng], to: d.to || r.name.split(',')[0] }); });
              }
            }, el('span', { html: RT.icon('pin', 13) }), 'Locatie koppelen')
        )
      )
    );
  }

  function render(root) {
    var days = M.days();
    var wrap = el('div.wrap');

    wrap.appendChild(UI.pagehead('Route', 'De ruggengraat van de reis — alles kan aan een dag gekoppeld worden.', [
      el('button.btn.btn--primary', { type: 'button', onClick: addDay },
        el('span', { html: RT.icon('plus', 15) }), 'Dag toevoegen')
    ]));

    if (days.length) {
      var totalKm = M.totalKm();
      var totalMin = days.reduce(function (a, d) { return a + RT.num(d.driveMin, 0); }, 0);
      var nights = S.all('campsite').reduce(function (a, c) { return a + Math.max(1, RT.num(c.nights, 1)); }, 0);
      wrap.appendChild(el('div.kpis', {},
        UI.kpi('Dagen', String(days.length), days[0] && days[0].date ? 'vanaf ' + RT.fmt.date(days[0].date) : ''),
        UI.kpi('Totale afstand', RT.fmt.km(totalKm), totalKm && days.length ? Math.round(totalKm / days.length) + ' km per dag' : '', 'accent'),
        UI.kpi('Rijtijd', RT.fmt.duration(totalMin), totalMin ? Math.round(totalMin / days.length) + ' min per dag' : ''),
        UI.kpi('Overnachtingen', String(nights), nights ? '' : 'nog niets geboekt')
      ));
    }

    if (!days.length) {
      wrap.appendChild(UI.empty('route', 'Nog geen route',
        'Voeg je eerste dag toe, of klik op de kaart om een route-stop te plaatsen.',
        el('button.btn.btn--primary', { type: 'button', onClick: addDay }, 'Eerste dag toevoegen')));
    } else {
      var list = el('div.daylist');
      days.forEach(function (d, i) { list.appendChild(dayCard(d, i, days.length)); });
      wrap.appendChild(list);
      wrap.appendChild(el('button.btn.btn--ghost.btn--block', {
        type: 'button', style: { marginTop: '12px' }, onClick: addDay
      }, el('span', { html: RT.icon('plus', 15) }), 'Nog een dag'));
    }

    root.appendChild(wrap);
  }

  UI.register({
    id: 'route',
    label: 'Route',
    icon: 'route',
    count: function () { return S.count('day'); },
    render: render
  });

})(window.RT);
