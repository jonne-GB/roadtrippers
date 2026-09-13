/* ============================================================
   tab-food.js — maaltijdplanning + boodschappenlijst
   ============================================================ */
(function (RT) {
  'use strict';

  var el = RT.el, S = RT.store, M = RT.model, UI = RT.ui;

  var view = { hideDone: false };

  /* ---------- maaltijden ---------- */

  function mealFields() {
    return [
      { key: 'name', label: 'Gerecht', width: 'full' },
      { key: 'type', label: 'Moment', type: 'select', options: M.MEAL_TYPES },
      { key: 'dayId', label: 'Dag', type: 'select', options: M.dayOptions() },
      { key: 'servings', label: 'Porties', type: 'number', min: 1, step: '1' },
      { key: 'cook', label: 'Wie kookt', type: 'select', options: UI.personSelect() },
      { key: 'ingredients', label: 'Ingrediënten', type: 'tags', width: 'full', placeholder: 'pasta, pesto, parmezaan' },
      { key: 'note', label: 'Bereiding / notitie', type: 'textarea', width: 'full', rows: 3 }
    ];
  }

  function addMeal(dayId) {
    RT.form({
      title: 'Maaltijd toevoegen',
      okLabel: 'Toevoegen',
      values: { name: '', type: 'diner', dayId: dayId || '', servings: 2, cook: 'beide', ingredients: [], note: '' },
      fields: mealFields()
    }).then(function (v) { if (v && v.name) S.put('meal', v); });
  }

  function editMeal(m) {
    RT.form({ title: 'Maaltijd bewerken', values: m, fields: mealFields() })
      .then(function (v) { if (v) S.patch(m.id, v); });
  }

  function mealNode(m) {
    return el('div.meal', {},
      el('span.meal__type', { text: m.type }),
      el('div.grow', {},
        el('div.meal__name', { text: m.name }),
        (m.ingredients && m.ingredients.length)
          ? el('div.small.mute2', { text: m.ingredients.join(' · ') })
          : null,
        m.note ? el('div.entry__note', { text: m.note }) : null
      ),
      m.cook && m.cook !== 'beide' ? el('span.badge.' + M.personBadge(m.cook), { text: M.personName(m.cook) }) : null,
      el('div.entry__actions', { style: { opacity: 1 } },
        el('button.iconbtn', { type: 'button', title: 'Bewerken', html: RT.icon('edit', 14), onClick: function () { editMeal(m); } }),
        el('button.iconbtn.iconbtn--danger', { type: 'button', title: 'Verwijderen', html: RT.icon('trash', 14), onClick: function () { UI.confirmDelete(m.name, function () { S.remove(m.id); }); } })
      )
    );
  }

  /* ---------- boodschappen ---------- */

  function addGrocery(prefill) {
    RT.form({
      title: 'Boodschap toevoegen',
      okLabel: 'Toevoegen',
      values: Object.assign({ name: '', qty: '', cat: 'droogwaren', done: false, who: 'beide' }, prefill || {}),
      fields: [
        { key: 'name', label: 'Wat', width: 'full' },
        { key: 'qty', label: 'Hoeveelheid', placeholder: 'bv. 2 pak' },
        { key: 'cat', label: 'Schap', type: 'select', options: M.GROCERY_CATS },
        { key: 'who', label: 'Wie haalt het', type: 'select', options: UI.personSelect() }
      ]
    }).then(function (v) { if (v && v.name) S.put('grocery', v); });
  }

  function quickAdd(input) {
    var txt = input.value.trim();
    if (!txt) return;
    // "2 pak pasta" → qty "2 pak", name "pasta"
    var m = txt.match(/^([\d.,]+\s*\S*)\s+(.+)$/);
    S.put('grocery', {
      name: m ? m[2] : txt,
      qty: m ? m[1] : '',
      cat: 'droogwaren', done: false, who: 'beide'
    });
    input.value = '';
    input.focus();
  }

  function generateList() {
    var meals = S.all('meal');
    var have = {};
    S.all('grocery').forEach(function (g) { have[(g.name || '').toLowerCase().trim()] = true; });

    var added = 0;
    S.batch(function () {
      meals.forEach(function (m) {
        (m.ingredients || []).forEach(function (ing) {
          var key = String(ing).toLowerCase().trim();
          if (!key || have[key]) return;
          have[key] = true;
          S.put('grocery', { name: ing, qty: '', cat: 'droogwaren', done: false, who: 'beide', fromMeal: m.name });
          added++;
        });
      });
    });
    RT.toast(added ? added + ' ingrediënt(en) toegevoegd' : 'Alles stond er al op', added ? 'ok' : undefined);
  }

  function groceryRow(g) {
    var box = el('input', { type: 'checkbox', checked: !!g.done });
    box.addEventListener('change', function () { S.patch(g.id, { done: box.checked }); });
    return el('label.groc' + (g.done ? '.is-done' : ''), {},
      box,
      el('span.groc__name', { text: g.name }),
      g.qty ? el('span.groc__qty', { text: g.qty }) : null,
      g.fromMeal ? el('span.chip', { title: 'Uit maaltijd', text: g.fromMeal }) : null,
      el('div.grow'),
      el('button.iconbtn', {
        type: 'button', title: 'Bewerken', html: RT.icon('edit', 13),
        onClick: function (e) {
          e.preventDefault();
          RT.form({
            title: 'Boodschap', values: g, fields: [
              { key: 'name', label: 'Wat', width: 'full' },
              { key: 'qty', label: 'Hoeveelheid' },
              { key: 'cat', label: 'Schap', type: 'select', options: M.GROCERY_CATS },
              { key: 'who', label: 'Wie haalt het', type: 'select', options: UI.personSelect() }
            ]
          }).then(function (v) { if (v) S.patch(g.id, v); });
        }
      }),
      el('button.iconbtn.iconbtn--danger', {
        type: 'button', title: 'Verwijderen', html: RT.icon('trash', 13),
        onClick: function (e) { e.preventDefault(); S.remove(g.id); }
      })
    );
  }

  /* ---------- render ---------- */

  function render(root) {
    var meals = S.all('meal');
    var groceries = S.all('grocery');
    var wrap = el('div.wrap');

    wrap.appendChild(UI.pagehead('Eten', 'Wat eten jullie, en wat moet er mee uit de supermarkt?', [
      el('button.btn', { type: 'button', onClick: function () { addMeal(null); } },
        el('span', { html: RT.icon('plus', 15) }), 'Maaltijd'),
      el('button.btn.btn--primary', { type: 'button', onClick: function () { addGrocery(); } },
        el('span', { html: RT.icon('plus', 15) }), 'Boodschap')
    ]));

    var open = groceries.filter(function (g) { return !g.done; }).length;
    wrap.appendChild(el('div.kpis', {},
      UI.kpi('Maaltijden', String(meals.length), meals.length ? '' : 'nog niets gepland'),
      UI.kpi('Boodschappen', String(groceries.length), open + ' nog te halen', open ? 'accent' : 'ok'),
      UI.kpi('Afgevinkt', (groceries.length - open) + '/' + groceries.length, '', 'ok')
    ));

    /* --- maaltijden per dag --- */
    var mealCol = el('div.stack');
    var days = M.days();
    var byDay = RT.groupBy(meals, function (m) { return m.dayId || ''; });

    days.forEach(function (d, i) {
      var list = byDay[d.id] || [];
      mealCol.appendChild(el('div.card.card--pad0', {},
        el('div.card__head', {},
          el('h3.card__title', { text: 'Dag ' + (i + 1) + (d.to ? ' · ' + d.to : '') }),
          el('div.grow'),
          d.date ? el('span.small.mute2', { text: RT.fmt.date(d.date) }) : null,
          el('button.iconbtn', { type: 'button', title: 'Maaltijd toevoegen', html: RT.icon('plus', 15), onClick: function () { addMeal(d.id); } })
        ),
        list.length
          ? el('div', {}, RT.sortBy(list, function (m) { return M.MEAL_TYPES.indexOf(m.type); }).map(mealNode))
          : el('div.card__body', {}, el('p.small.mute2', { style: { margin: 0 }, text: 'Nog niets gepland voor deze dag.' }))
      ));
    });

    if (byDay['']) {
      mealCol.appendChild(el('div.card.card--pad0', {},
        el('div.card__head', {}, el('h3.card__title', { text: 'Zonder dag' })),
        el('div', {}, byDay[''].map(mealNode))
      ));
    }

    if (!meals.length && !days.length) {
      mealCol.appendChild(UI.empty('food', 'Nog geen maaltijden',
        'Maak eerst dagen aan in de route-tab, of voeg hier los een maaltijd toe.',
        el('button.btn.btn--primary', { type: 'button', onClick: function () { addMeal(null); } }, 'Maaltijd toevoegen')));
    }

    /* --- boodschappen --- */
    var quick = el('input.input', {
      type: 'text', placeholder: 'Snel toevoegen… (bv. "2 pak pasta") en enter',
      onKeydown: function (e) { if (e.key === 'Enter') { e.preventDefault(); quickAdd(e.target); } }
    });

    var grocBody = el('div');
    var shown = groceries.filter(function (g) { return !(view.hideDone && g.done); });
    var byCat = RT.groupBy(shown, function (g) { return g.cat || 'overig'; });

    if (!groceries.length) {
      grocBody.appendChild(el('div.card__body', {},
        el('p.small.mute2', { style: { margin: 0 }, text: 'Nog niets op de lijst. Typ hierboven, of genereer de lijst uit je maaltijden.' })));
    } else {
      Object.keys(byCat).sort().forEach(function (cat) {
        grocBody.appendChild(el('div.groc-cat', { text: cat }));
        RT.sortBy(byCat[cat], function (g) { return (g.done ? '1' : '0') + (g.name || '').toLowerCase(); })
          .forEach(function (g) { grocBody.appendChild(groceryRow(g)); });
      });
    }

    var grocCol = el('div.card.card--pad0', {},
      el('div.card__head', {},
        el('span.ico', { html: RT.icon('cart', 16) }),
        el('h3.card__title', { text: 'Boodschappen' }),
        el('div.grow'),
        el('button.btn.btn--ghost.btn--sm', {
          type: 'button', title: 'Ingrediënten uit alle maaltijden op de lijst zetten',
          onClick: generateList
        }, 'Uit maaltijden'),
        el('button.btn.btn--ghost.btn--sm', {
          type: 'button',
          onClick: function () { view.hideDone = !view.hideDone; rerender(root); }
        }, view.hideDone ? 'Toon afgevinkt' : 'Verberg afgevinkt')
      ),
      el('div.card__body', { style: { paddingBottom: '8px' } }, quick),
      grocBody,
      groceries.some(function (g) { return g.done; })
        ? el('div.card__body', {},
          el('button.btn.btn--ghost.btn--sm.btn--block', {
            type: 'button',
            onClick: function () {
              RT.confirm('Alle afgevinkte boodschappen verwijderen?').then(function (ok) {
                if (ok) S.removeWhere('grocery', function (g) { return g.done; });
              });
            }
          }, 'Afgevinkte wissen'))
        : null
    );

    wrap.appendChild(el('div.split', {}, mealCol, grocCol));
    root.appendChild(wrap);
  }

  function rerender(root) { UI.redraw(root, render); }

  UI.register({
    id: 'eten',
    label: 'Eten',
    icon: 'food',
    count: function () { return S.all('grocery').filter(function (g) { return !g.done; }).length; },
    render: render
  });

})(window.RT);
