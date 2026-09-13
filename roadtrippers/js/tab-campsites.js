/* ============================================================
   tab-campsites.js — slaapplekken
   ============================================================ */
(function (RT) {
  'use strict';

  var el = RT.el, S = RT.store, M = RT.model, UI = RT.ui;

  var FACILITIES = ['douche', 'toilet', 'stroom', 'drinkwater', 'wifi', 'wasmachine', 'winkel', 'zwembad', 'chemisch toilet', 'huisdieren ok'];
  var view = { filter: 'alle', search: '' };

  function fields() {
    return [
      { key: 'name', label: 'Naam', width: 'full' },
      { key: 'dayId', label: 'Dag', type: 'select', options: M.dayOptions() },
      { key: 'nights', label: 'Nachten', type: 'number', min: 1, step: '1' },
      { key: 'price', label: 'Prijs per nacht (€)', type: 'number', step: '0.01' },
      { key: 'rating', label: 'Beoordeling (0-5)', type: 'number', min: 0, max: 5, step: '1' },
      { key: 'booked', label: 'Geboekt', type: 'check' },
      { key: 'facilities', label: 'Voorzieningen', type: 'tags', width: 'full', placeholder: FACILITIES.slice(0, 4).join(', ') },
      { key: 'coord', label: 'Locatie', type: 'latlng' },
      { key: 'url', label: 'Website / reservering', placeholder: 'https://…', width: 'full' },
      { key: 'phone', label: 'Telefoon' },
      { key: 'note', label: 'Notities', type: 'textarea', width: 'full', rows: 3 }
    ];
  }

  function add() {
    RT.form({
      title: 'Camping toevoegen',
      okLabel: 'Toevoegen',
      values: { name: '', dayId: '', nights: 1, price: null, rating: 0, booked: false, facilities: [], coord: null, url: '', phone: '', note: '' },
      fields: fields()
    }).then(function (v) { if (v && v.name) S.put('campsite', v); });
  }

  function edit(c) {
    RT.form({ title: 'Camping bewerken', values: c, fields: fields() })
      .then(function (v) { if (v) S.patch(c.id, v); });
  }

  function stars(c) {
    var row = el('div.stars', { title: 'Klik om te beoordelen' });
    for (var i = 1; i <= 5; i++) {
      (function (n) {
        row.appendChild(el('button.star' + (n <= RT.num(c.rating, 0) ? '.is-on' : ''), {
          type: 'button', html: RT.icon('star', 14),
          onClick: function () { S.patch(c.id, { rating: RT.num(c.rating, 0) === n ? 0 : n }); }
        }));
      })(i);
    }
    return row;
  }

  function card(c) {
    var nights = Math.max(1, RT.num(c.nights, 1));
    var total = RT.num(c.price, 0) * nights;

    return el('div.entry' + (c.booked ? '.entry--ok' : ''), {},
      el('div.entry__top', {},
        el('div.grow', {},
          el('h3.entry__title', { text: c.name }),
          el('div.entry__meta', { style: { marginTop: '5px' } },
            c.booked ? el('span.badge.badge--ok', { text: '✔ Geboekt' }) : el('span.badge.badge--warn', { text: 'Nog boeken' }),
            UI.dayBadge(c.dayId),
            el('span.chip', { text: nights + ' nacht' + (nights > 1 ? 'en' : '') })
          )
        ),
        UI.actions(function () { edit(c); }, function () { UI.confirmDelete(c.name, function () { S.remove(c.id); }); })
      ),

      el('div.row.row--wrap', {},
        stars(c),
        el('div.grow'),
        c.price ? el('div.right', {},
          el('div', { class: 'mono', style: { fontSize: '16px' }, text: RT.fmt.money(total) }),
          nights > 1 ? el('div.small.mute2', { text: RT.fmt.money(c.price) + ' × ' + nights }) : null
        ) : null
      ),

      (c.facilities && c.facilities.length) ? el('div.chips', {},
        c.facilities.map(function (f) { return el('span.chip', { text: f }); })
      ) : null,

      c.note ? el('div.entry__note', { text: c.note }) : null,

      el('div.row.row--wrap', {},
        el('button.btn.btn--ghost.btn--sm', {
          type: 'button', onClick: function () { S.patch(c.id, { booked: !c.booked }); }
        }, c.booked ? 'Boeking intrekken' : 'Markeer als geboekt'),
        M.validCoord(c.coord)
          ? el('button.btn.btn--ghost.btn--sm', { type: 'button', onClick: function () { UI.go('kaart'); } },
            el('span', { html: RT.icon('map', 13) }), 'Kaart')
          : el('button.btn.btn--ghost.btn--sm', {
            type: 'button',
            onClick: function () { RT.geoPick().then(function (r) { if (r) S.patch(c.id, { coord: [r.lat, r.lng] }); }); }
          }, el('span', { html: RT.icon('pin', 13) }), 'Locatie'),
        c.url ? el('a.btn.btn--ghost.btn--sm', { href: c.url, target: '_blank', rel: 'noopener' }, 'Website') : null,
        c.phone ? el('a.btn.btn--ghost.btn--sm', { href: 'tel:' + c.phone }, c.phone) : null
      )
    );
  }

  function render(root) {
    var all = S.all('campsite');
    var wrap = el('div.wrap');

    wrap.appendChild(UI.pagehead('Campsites', 'Waar slapen jullie, en wat kost het?', [
      el('button.btn.btn--primary', { type: 'button', onClick: add },
        el('span', { html: RT.icon('plus', 15) }), 'Camping')
    ]));

    if (all.length) {
      var nights = all.reduce(function (a, c) { return a + Math.max(1, RT.num(c.nights, 1)); }, 0);
      var total = all.reduce(function (a, c) { return a + RT.num(c.price, 0) * Math.max(1, RT.num(c.nights, 1)); }, 0);
      var booked = all.filter(function (c) { return c.booked; }).length;
      wrap.appendChild(el('div.kpis', {},
        UI.kpi('Campings', String(all.length), booked + ' geboekt'),
        UI.kpi('Nachten', String(nights), ''),
        UI.kpi('Totale kosten', RT.fmt.money0(total), nights ? RT.fmt.money(total / nights) + ' gemiddeld' : '', 'accent'),
        UI.kpi('Nog te boeken', String(all.length - booked), '', all.length - booked ? 'bad' : 'ok')
      ));

      var bar = el('div.toolbar');
      var seg = el('div.segmented');
      [{ v: 'alle', l: 'Alles' }, { v: 'booked', l: 'Geboekt' }, { v: 'todo', l: 'Nog boeken' }].forEach(function (o) {
        seg.appendChild(el('button', {
          type: 'button', class: view.filter === o.v ? 'is-active' : '', text: o.l,
          onClick: function () { view.filter = o.v; rerender(root); }
        }));
      });
      bar.appendChild(seg);
      bar.appendChild(el('div.searchbox', {},
        el('span.ico', { html: RT.icon('search', 14) }),
        el('input.input', {
          type: 'search', placeholder: 'Zoeken…', value: view.search,
          dataset: { keep: 'search' },
          onInput: RT.debounce(function (e) { view.search = e.target.value.trim().toLowerCase(); rerender(root); }, 200)
        })
      ));
      wrap.appendChild(bar);
    }

    var list = all.filter(function (c) {
      if (view.filter === 'booked' && !c.booked) return false;
      if (view.filter === 'todo' && c.booked) return false;
      if (!view.search) return true;
      return (c.name + ' ' + (c.note || '') + ' ' + (c.facilities || []).join(' ')).toLowerCase().indexOf(view.search) >= 0;
    });
    list = RT.sortBy(list, function (c) { var i = M.dayIndex(c.dayId); return i < 0 ? 999 : i; });

    if (!all.length) {
      wrap.appendChild(UI.empty('tent', 'Nog geen slaapplekken',
        'Verzamel campings, hostels of wildkamp-spots. Koppel ze aan een dag zodat je route en overnachtingen kloppen.',
        el('button.btn.btn--primary', { type: 'button', onClick: add }, 'Eerste camping')));
    } else if (!list.length) {
      wrap.appendChild(UI.empty('search', 'Niets gevonden', 'Pas je filter of zoekterm aan.'));
    } else {
      var grid = el('div.cards.cards--wide');
      list.forEach(function (c) { grid.appendChild(card(c)); });
      wrap.appendChild(grid);
    }

    root.appendChild(wrap);
  }

  function rerender(root) { UI.redraw(root, render); }

  UI.register({
    id: 'campsites',
    label: 'Campsites',
    icon: 'tent',
    count: function () { return S.count('campsite'); },
    render: render
  });

})(window.RT);
