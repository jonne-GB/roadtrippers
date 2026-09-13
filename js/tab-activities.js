/* ============================================================
   tab-activities.js — dingen om te doen
   ============================================================ */
(function (RT) {
  'use strict';

  var el = RT.el, S = RT.store, M = RT.model, UI = RT.ui;

  var STATUS = [
    { value: 'wens', label: 'Wens', badge: '' },
    { value: 'gepland', label: 'Gepland', badge: 'badge--info' },
    { value: 'gedaan', label: 'Gedaan', badge: 'badge--ok' },
    { value: 'geschrapt', label: 'Geschrapt', badge: 'badge--bad' }
  ];

  var view = { filter: 'alle', search: '', sort: 'dag' };

  function statusMeta(v) {
    return STATUS.filter(function (s) { return s.value === v; })[0] || STATUS[0];
  }

  function fields() {
    return [
      { key: 'name', label: 'Wat ga je doen', width: 'full' },
      { key: 'type', label: 'Soort', type: 'select', options: M.ACTIVITY_TYPES },
      { key: 'status', label: 'Status', type: 'select', options: STATUS.map(function (s) { return { value: s.value, label: s.label }; }) },
      { key: 'dayId', label: 'Dag', type: 'select', options: M.dayOptions() },
      { key: 'want', label: 'Wie wil dit', type: 'select', options: UI.personSelect() },
      { key: 'durationMin', label: 'Duur (min)', type: 'number' },
      { key: 'cost', label: 'Kosten p.p. (€)', type: 'number', step: '0.01' },
      { key: 'coord', label: 'Locatie', type: 'latlng' },
      { key: 'url', label: 'Link', placeholder: 'https://…', width: 'full' },
      { key: 'note', label: 'Notities', type: 'textarea', width: 'full', rows: 3 }
    ];
  }

  function add() {
    RT.form({
      title: 'Activiteit toevoegen',
      okLabel: 'Toevoegen',
      values: { name: '', type: 'bezienswaardigheid', status: 'wens', dayId: '', want: 'beide', durationMin: null, cost: null, coord: null, url: '', note: '' },
      fields: fields()
    }).then(function (v) { if (v && v.name) S.put('activity', v); });
  }

  function edit(a) {
    RT.form({ title: 'Activiteit bewerken', values: a, fields: fields() })
      .then(function (v) { if (v) S.patch(a.id, v); });
  }

  function cycleStatus(a) {
    var order = ['wens', 'gepland', 'gedaan'];
    var i = order.indexOf(a.status);
    S.patch(a.id, { status: order[(i + 1) % order.length] });
  }

  function card(a) {
    var st = statusMeta(a.status);
    return el('div.entry', {},
      el('div.entry__top', {},
        el('button.entry__tick', {
          type: 'button', title: 'Status wisselen',
          onClick: function () { cycleStatus(a); }
        }, a.status === 'gedaan' ? el('span', { html: RT.icon('check', 14) }) : null),
        el('div.grow', {},
          el('h3.entry__title', {
            text: a.name,
            style: a.status === 'geschrapt' ? { textDecoration: 'line-through', opacity: .6 } : null
          }),
          el('div.entry__meta', { style: { marginTop: '5px' } },
            el('span.badge' + (st.badge ? '.' + st.badge : ''), { text: st.label }),
            a.type ? el('span.chip', { text: a.type }) : null,
            UI.dayBadge(a.dayId),
            a.want && a.want !== 'beide' ? el('span.badge.' + M.personBadge(a.want), { text: M.personName(a.want) }) : null
          )
        ),
        UI.actions(function () { edit(a); }, function () { UI.confirmDelete(a.name, function () { S.remove(a.id); }); })
      ),
      (a.durationMin || a.cost || M.validCoord(a.coord)) ? el('div.entry__meta', {},
        a.durationMin ? el('span', {}, el('b', { text: RT.fmt.duration(a.durationMin) })) : null,
        a.cost ? el('span', {}, el('b', { text: RT.fmt.money(a.cost) }), ' p.p.') : null,
        M.validCoord(a.coord) ? el('span', {},
          el('button.linkbtn', { type: 'button', onClick: function () { UI.go('kaart'); } },
            el('span', { html: RT.icon('pin', 12) }), 'op de kaart')) : null
      ) : null,
      a.note ? el('div.entry__note', { text: a.note }) : null,
      a.url ? el('a.small', { href: a.url, target: '_blank', rel: 'noopener', text: a.url.replace(/^https?:\/\//, '').slice(0, 48) }) : null
    );
  }

  function render(root) {
    var all = S.all('activity');
    var wrap = el('div.wrap');

    wrap.appendChild(UI.pagehead('Activiteiten', 'Wensen, plannen en wat jullie al gedaan hebben.', [
      el('button.btn.btn--primary', { type: 'button', onClick: add },
        el('span', { html: RT.icon('plus', 15) }), 'Activiteit')
    ]));

    if (all.length) {
      var planned = all.filter(function (a) { return a.status === 'gepland'; }).length;
      var done = all.filter(function (a) { return a.status === 'gedaan'; }).length;
      var cost = all.filter(function (a) { return a.status !== 'geschrapt'; })
        .reduce(function (s, a) { return s + RT.num(a.cost, 0) * 2; }, 0);
      var mins = all.filter(function (a) { return a.status !== 'geschrapt'; })
        .reduce(function (s, a) { return s + RT.num(a.durationMin, 0); }, 0);
      wrap.appendChild(el('div.kpis', {},
        UI.kpi('Op de lijst', String(all.length), all.length - planned - done + ' nog een wens'),
        UI.kpi('Gepland', String(planned), '', 'accent'),
        UI.kpi('Gedaan', String(done), '', 'ok'),
        UI.kpi('Kosten samen', RT.fmt.money0(cost), RT.fmt.duration(mins) + ' aan activiteiten')
      ));

      var bar = el('div.toolbar');
      var seg = el('div.segmented');
      [{ v: 'alle', l: 'Alles' }].concat(STATUS.map(function (s) { return { v: s.value, l: s.label }; })).forEach(function (o) {
        seg.appendChild(el('button', {
          type: 'button', class: view.filter === o.v ? 'is-active' : '',
          text: o.l, onClick: function () { view.filter = o.v; rerender(root); }
        }));
      });
      bar.appendChild(seg);

      var search = el('input.input', {
        type: 'search', placeholder: 'Zoeken…', value: view.search,
        dataset: { keep: 'search' },
        onInput: RT.debounce(function (e) { view.search = e.target.value.trim().toLowerCase(); rerender(root); }, 200)
      });
      bar.appendChild(el('div.searchbox', {}, el('span.ico', { html: RT.icon('search', 14) }), search));

      var sortSel = el('select.input', { style: { width: 'auto' } });
      [{ v: 'dag', l: 'Op dag' }, { v: 'naam', l: 'Op naam' }, { v: 'kosten', l: 'Op kosten' }, { v: 'duur', l: 'Op duur' }].forEach(function (o) {
        sortSel.appendChild(el('option', { value: o.v, text: o.l }));
      });
      sortSel.value = view.sort;
      sortSel.addEventListener('change', function () { view.sort = sortSel.value; rerender(root); });
      bar.appendChild(sortSel);
      wrap.appendChild(bar);
    }

    var list = all.filter(function (a) {
      if (view.filter !== 'alle' && a.status !== view.filter) return false;
      if (!view.search) return true;
      return (a.name + ' ' + (a.note || '') + ' ' + (a.type || '')).toLowerCase().indexOf(view.search) >= 0;
    });

    if (view.sort === 'naam') list = RT.sortBy(list, function (a) { return (a.name || '').toLowerCase(); });
    else if (view.sort === 'kosten') list = RT.sortBy(list, function (a) { return RT.num(a.cost, 0); }, 'desc');
    else if (view.sort === 'duur') list = RT.sortBy(list, function (a) { return RT.num(a.durationMin, 0); }, 'desc');
    else list = RT.sortBy(list, function (a) { var i = M.dayIndex(a.dayId); return i < 0 ? 999 : i; });

    if (!all.length) {
      wrap.appendChild(UI.empty('activity', 'Nog geen activiteiten',
        'Verzamel hier alles wat jullie willen zien en doen. Koppel ze aan een dag zodra het plan vaster wordt.',
        el('button.btn.btn--primary', { type: 'button', onClick: add }, 'Eerste activiteit')));
    } else if (!list.length) {
      wrap.appendChild(UI.empty('search', 'Niets gevonden', 'Pas je filter of zoekterm aan.'));
    } else {
      var grid = el('div.cards');
      list.forEach(function (a) { grid.appendChild(card(a)); });
      wrap.appendChild(grid);
    }

    root.appendChild(wrap);
  }

  function rerender(root) { UI.redraw(root, render); }

  UI.register({
    id: 'activiteiten',
    label: 'Activiteiten',
    icon: 'activity',
    count: function () { return S.count('activity'); },
    render: render
  });

})(window.RT);
