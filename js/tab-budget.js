/* ============================================================
   tab-budget.js — uitgaven, verdeling en wie wie nog wat schuldig is
   ============================================================ */
(function (RT) {
  'use strict';

  var el = RT.el, S = RT.store, M = RT.model, UI = RT.ui;

  var view = { filter: 'alle' };

  function fields() {
    return [
      { key: 'desc', label: 'Waarvoor', width: 'full' },
      { key: 'amount', label: 'Bedrag (€)', type: 'number', step: '0.01' },
      { key: 'date', label: 'Datum', type: 'date' },
      { key: 'cat', label: 'Categorie', type: 'select', options: M.EXPENSE_CATS },
      {
        key: 'paidBy', label: 'Betaald door', type: 'select', options: [
          { value: 'a', label: M.personName('a') },
          { value: 'b', label: M.personName('b') }
        ]
      },
      {
        key: 'split', label: 'Verdeling', type: 'select', options: [
          { value: '50/50', label: 'Samen delen (50/50)' },
          { value: 'a', label: 'Volledig voor ' + M.personName('a') },
          { value: 'b', label: 'Volledig voor ' + M.personName('b') }
        ]
      },
      { key: 'dayId', label: 'Dag', type: 'select', options: M.dayOptions() },
      { key: 'note', label: 'Notitie', type: 'textarea', width: 'full', rows: 2 }
    ];
  }

  function add() {
    RT.form({
      title: 'Uitgave toevoegen',
      okLabel: 'Toevoegen',
      values: { desc: '', amount: null, date: RT.todayISO(), cat: 'eten', paidBy: 'a', split: '50/50', dayId: '', note: '' },
      fields: fields()
    }).then(function (v) { if (v && v.amount) S.put('expense', v); });
  }

  function edit(e) {
    RT.form({ title: 'Uitgave bewerken', values: e, fields: fields() })
      .then(function (v) { if (v) S.patch(e.id, v); });
  }

  function catBars(list) {
    var byCat = RT.groupBy(list, function (e) { return e.cat || 'overig'; });
    var totals = Object.keys(byCat).map(function (c) {
      return { cat: c, sum: byCat[c].reduce(function (a, e) { return a + RT.num(e.amount, 0); }, 0), n: byCat[c].length };
    });
    totals = RT.sortBy(totals, function (t) { return t.sum; }, 'desc');
    var max = totals.length ? totals[0].sum : 1;

    var box = el('div.card.card--pad0', {},
      el('div.card__head', {}, el('span.ico', { html: RT.icon('chart', 16) }), el('h3.card__title', { text: 'Per categorie' })));
    var body = el('div.card__body.stack', { style: { gap: '10px' } });
    if (!totals.length) {
      body.appendChild(el('p.small.mute2', { style: { margin: 0 }, text: 'Nog geen uitgaven.' }));
    }
    totals.forEach(function (t) {
      var fill = el('div.bar__fill');
      fill.style.width = (max ? (t.sum / max) * 100 : 0) + '%';
      body.appendChild(el('div', {},
        el('div.row', { style: { marginBottom: '4px' } },
          el('span.small', { text: t.cat }),
          el('div.grow'),
          el('span.small.mono', { text: RT.fmt.money(t.sum) }),
          el('span.small.mute2', { text: '(' + t.n + ')' })
        ),
        el('div.bar', {}, fill)
      ));
    });
    box.appendChild(body);
    return box;
  }

  function settleCard() {
    var s = M.settleUp();
    var even = Math.abs(s.amount) < 0.01;
    return el('div.card.settle' + (even ? '' : '.settle--open'), {},
      el('div.row', {},
        el('span.ico', { html: RT.icon('wallet', 18), style: { opacity: .7 } }),
        el('h3.card__title', { text: 'Verrekening' })
      ),
      even
        ? el('p', { style: { margin: '12px 0 0', fontSize: '15px' }, text: 'Jullie staan quitte. ✔' })
        : el('div', { style: { marginTop: '12px' } },
          el('div', { style: { fontSize: '15px', lineHeight: '1.5' } },
            el('b', { text: M.personName(s.from) }), ' moet ',
            el('b', { text: M.personName(s.to) }), ' nog ',
            el('b', { class: 'mono', style: { color: 'var(--accent-2)', fontSize: '18px' }, text: RT.fmt.money(s.amount) }),
            ' betalen.'
          ),
          el('div.small.mute2', { style: { marginTop: '8px' } },
            M.personName('a') + ' betaalde ' + RT.fmt.money(s.paid.a) + ' · ' +
            M.personName('b') + ' betaalde ' + RT.fmt.money(s.paid.b)
          ),
          el('button.btn.btn--ghost.btn--sm', {
            type: 'button', style: { marginTop: '12px' },
            onClick: function () {
              RT.confirm('Een verrekening van ' + RT.fmt.money(s.amount) + ' vastleggen? Er wordt een uitgave toegevoegd zodat de stand weer op nul komt.',
                { okLabel: 'Vastleggen', danger: false }).then(function (ok) {
                  if (!ok) return;
                  S.put('expense', {
                    desc: 'Verrekening', amount: s.amount, date: RT.todayISO(),
                    cat: 'overig', paidBy: s.from, split: s.to, dayId: '',
                    note: M.personName(s.from) + ' → ' + M.personName(s.to)
                  });
                });
            }
          }, 'Verrekening vastleggen')
        )
    );
  }

  function table(list) {
    var rows = list.map(function (e) {
      return el('tr', {},
        el('td.nowrap', { text: RT.fmt.dateShort(e.date) }),
        el('td', {},
          el('div', { text: e.desc || '—' }),
          e.note ? el('div.small.mute2', { text: e.note }) : null
        ),
        el('td', {}, el('span.chip', { text: e.cat || 'overig' })),
        el('td', {}, el('span.badge.' + M.personBadge(e.paidBy === 'b' ? 'b' : 'a'), { text: M.personName(e.paidBy === 'b' ? 'b' : 'a') })),
        el('td.small.mute2.nowrap', { text: e.split === '50/50' ? 'samen' : 'alleen ' + M.personName(e.split) }),
        el('td.num', { text: RT.fmt.money(e.amount) }),
        el('td', { style: { width: '1%' } },
          el('div.row', { style: { gap: '0' } },
            el('button.iconbtn', { type: 'button', title: 'Bewerken', html: RT.icon('edit', 14), onClick: function () { edit(e); } }),
            el('button.iconbtn.iconbtn--danger', { type: 'button', title: 'Verwijderen', html: RT.icon('trash', 14), onClick: function () { UI.confirmDelete(e.desc || 'uitgave', function () { S.remove(e.id); }); } })
          )
        )
      );
    });

    return el('div.card.card--pad0', {},
      el('div.card__head', {},
        el('h3.card__title', { text: 'Uitgaven' }),
        el('div.grow'),
        el('button.btn.btn--sm', { type: 'button', onClick: add }, el('span', { html: RT.icon('plus', 14) }), 'Toevoegen')
      ),
      el('div.tblwrap', {},
        el('table.tbl', {},
          el('thead', {}, el('tr', {},
            el('th', { text: 'Datum' }), el('th', { text: 'Waarvoor' }), el('th', { text: 'Categorie' }),
            el('th', { text: 'Betaald door' }), el('th', { text: 'Verdeling' }),
            el('th.num', { text: 'Bedrag' }), el('th', {})
          )),
          el('tbody', {}, rows)
        )
      )
    );
  }

  function render(root) {
    var all = M.expenses();
    var s = M.settings();
    var wrap = el('div.wrap');

    wrap.appendChild(UI.pagehead('Budget', 'Wat gaat eruit, en wie heeft wat voorgeschoten?', [
      el('button.btn.btn--ghost', {
        type: 'button',
        onClick: function () {
          RT.form({
            title: 'Budget instellen',
            values: s,
            fields: [{ key: 'budgetTotal', label: 'Totaalbudget (€)', type: 'number', width: 'full', help: 'Laat leeg of 0 om geen budget te tonen.' }]
          }).then(function (v) { if (v) M.saveSettings({ budgetTotal: v.budgetTotal }); });
        }
      }, 'Budget'),
      el('button.btn.btn--primary', { type: 'button', onClick: add },
        el('span', { html: RT.icon('plus', 15) }), 'Uitgave')
    ]));

    var total = M.expenseTotal();
    var budget = RT.num(s.budgetTotal, 0);
    var settle = M.settleUp();
    var kpis = el('div.kpis', {},
      UI.kpi('Totaal uitgegeven', RT.fmt.money0(total), all.length + ' uitgaven', 'accent'),
      UI.kpi(M.personName('a') + ' betaalde', RT.fmt.money0(settle.paid.a), ''),
      UI.kpi(M.personName('b') + ' betaalde', RT.fmt.money0(settle.paid.b), ''),
      budget
        ? UI.kpi('Over van budget', RT.fmt.money0(budget - total), Math.round((total / budget) * 100) + '% gebruikt', budget - total < 0 ? 'bad' : 'ok')
        : UI.kpi('Per persoon', RT.fmt.money0(total / 2), 'bij 50/50')
    );
    wrap.appendChild(kpis);

    if (budget) {
      var pct = Math.min(100, (total / budget) * 100);
      var fill = el('div.bar__fill' + (pct > 100 ? '.bar__fill--bad' : pct > 80 ? '.bar__fill--warn' : '.bar__fill--ok'));
      fill.style.width = pct + '%';
      wrap.appendChild(el('div', { style: { marginBottom: '16px' } },
        el('div.row.small.mute2', { style: { marginBottom: '5px' } },
          el('span', { text: RT.fmt.money(total) + ' van ' + RT.fmt.money(budget) }),
          el('div.grow'),
          el('span', { text: Math.round(pct) + '%' })
        ),
        el('div.bar', { style: { height: '9px' } }, fill)
      ));
    }

    if (!all.length) {
      wrap.appendChild(UI.empty('wallet', 'Nog geen uitgaven',
        'Noteer onderweg wat je uitgeeft en wie betaalde. De app rekent daarna uit wie wie nog wat schuldig is.',
        el('button.btn.btn--primary', { type: 'button', onClick: add }, 'Eerste uitgave')));
    } else {
      wrap.appendChild(el('div.split', {},
        table(all),
        el('div.stack', {}, settleCard(), catBars(all))
      ));
    }

    root.appendChild(wrap);
  }

  UI.register({
    id: 'budget',
    label: 'Budget',
    icon: 'wallet',
    count: function () { return S.count('expense'); },
    render: render
  });

})(window.RT);
