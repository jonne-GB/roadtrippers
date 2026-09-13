/* ============================================================
   ui.js — app-shell, tabbeheer, inlogscherm, reis-kiezer
   ============================================================ */
(function (RT) {
  'use strict';

  var el = RT.el, S = RT.store, M = RT.model;
  var UI = { tabs: [], active: null };

  var panes = {};      // tabId -> {root, rendered, dirty}
  var refs = {};

  /* ============================================================
     Tabregistratie
     ============================================================ */

  UI.register = function (tab) {
    UI.tabs.push(tab);
    return tab;
  };

  UI.go = function (id, opts) {
    var tab = UI.tabs.filter(function (t) { return t.id === id; })[0];
    if (!tab) return;
    UI.active = id;
    try { localStorage.setItem('roadtrippers.tab', id); } catch (e) { }

    RT.$$('.tab', refs.tabbar).forEach(function (b) {
      b.classList.toggle('is-active', b.dataset.tab === id);
    });

    UI.tabs.forEach(function (t) {
      var p = panes[t.id];
      if (p) p.root.classList.toggle('hidden', t.id !== id);
    });

    var p = panes[id];
    if (!p) {
      p = panes[id] = { root: el('div.tabpane'), rendered: false, dirty: false };
      refs.view.appendChild(p.root);
    }
    if (!p.rendered || p.dirty) {
      RT.clear(p.root);
      tab.render(p.root);
      p.rendered = true; p.dirty = false;
    } else if (tab.onShow) {
      tab.onShow(p.root);
    }
    if (opts && opts.focus && tab.onFocus) tab.onFocus(p.root, opts.focus);

    var btn = RT.$('.tab[data-tab="' + id + '"]', refs.tabbar);
    if (btn && btn.scrollIntoView) btn.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  };

  UI.refresh = RT.debounce(function () {
    UI.tabs.forEach(function (t) {
      var p = panes[t.id];
      if (!p) return;
      if (t.onChange && p.rendered) {
        // Tabs met onChange werken zichzelf ter plekke bij — ook als ze
        // niet zichtbaar zijn. Ze mogen nooit opnieuw opgebouwd worden,
        // anders raken we bijvoorbeeld de Leaflet-instantie kwijt.
        t.onChange(p.root);
        p.dirty = false;
      } else if (t.id === UI.active) {
        RT.clear(p.root);
        t.render(p.root);
        p.rendered = true;
        p.dirty = false;
      } else {
        p.dirty = true;
      }
    });
    updateCounts();
    updateTripChip();
  }, 60);

  UI.invalidate = function (tabId) {
    if (panes[tabId]) panes[tabId].dirty = true;
  };

  function updateCounts() {
    UI.tabs.forEach(function (t) {
      if (!t.count) return;
      var node = RT.$('.tab[data-tab="' + t.id + '"] .tab__count', refs.tabbar);
      if (!node) return;
      var n = t.count();
      node.textContent = n;
      node.classList.toggle('hidden', !n);
    });
  }

  /* ============================================================
     Shell
     ============================================================ */

  var listenersBound = false;

  UI.mount = function () {
    var app = RT.clear(RT.$('#app'));
    app.classList.remove('hidden');
    panes = {};

    refs.tripName = el('span.tripchip__name', { text: M.settings().tripName });
    refs.tripBtn = el('button.tripchip', {
      type: 'button', title: 'Reis & instellingen',
      onClick: openTripMenu
    }, el('span', { html: RT.icon('pin', 14) }), refs.tripName, el('span', { html: RT.icon('down', 13) }));

    refs.sync = el('button.syncpill', {
      type: 'button', dataset: { status: S.status }, title: 'Klik om nu te synchroniseren',
      onClick: function () { S.forceSync(); }
    }, el('span.dot'), el('span.txt', { text: S.statusText }));

    refs.user = el('button.userbtn', { type: 'button', onClick: openUserMenu },
      el('span.avatar', { text: initials() }),
      el('span.txt', { text: userLabel() })
    );

    refs.tabbar = el('nav.tabbar');
    UI.tabs.forEach(function (t) {
      refs.tabbar.appendChild(el('button.tab', {
        type: 'button', dataset: { tab: t.id },
        onClick: function () { UI.go(t.id); }
      },
        el('span.ico', { html: RT.icon(t.icon, 16) }),
        el('span', { text: t.label }),
        t.count ? el('span.tab__count') : null
      ));
    });

    refs.view = el('main.view');

    app.appendChild(el('header.topbar', {},
      el('div.brand', {},
        el('div.brand__mark', { text: 'RT' }),
        el('div.brand__name', { html: 'ROAD<span>TRIPPERS</span>' })
      ),
      refs.tripBtn,
      el('div.grow'),
      refs.sync,
      refs.user
    ));
    app.appendChild(refs.tabbar);
    app.appendChild(refs.view);

    if (!listenersBound) {
      listenersBound = true;
      S.on('change', function () { UI.refresh(); });
      S.on('status', function (status, text) {
        if (!refs.sync) return;
        refs.sync.dataset.status = status;
        RT.$('.txt', refs.sync).textContent = text;
      });
      document.addEventListener('keydown', function (e) {
        if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
        if (e.altKey || e.ctrlKey || e.metaKey) return;
        if (document.body.classList.contains('modal-open')) return;
        var n = parseInt(e.key, 10);
        if (n >= 1 && n <= UI.tabs.length) UI.go(UI.tabs[n - 1].id);
      });
    }

    var last = null;
    try { last = localStorage.getItem('roadtrippers.tab'); } catch (e) { }
    var exists = UI.tabs.some(function (t) { return t.id === last; });
    UI.go(exists ? last : UI.tabs[0].id);
    updateCounts();
  };

  /* Opnieuw tekenen zonder dat de cursor uit een zoekveld springt.
     Markeer zulke velden met data-keep="<naam>". */
  UI.redraw = function (root, renderFn) {
    var act = document.activeElement;
    var keep = null;
    if (act && act.dataset && act.dataset.keep && root.contains(act)) {
      keep = { name: act.dataset.keep, pos: null };
      try { keep.pos = act.selectionStart; } catch (e) { }
    }
    RT.clear(root);
    renderFn(root);
    if (keep) {
      var next = RT.$('[data-keep="' + keep.name + '"]', root);
      if (next) {
        try {
          next.focus();
          if (keep.pos !== null && next.setSelectionRange) next.setSelectionRange(keep.pos, keep.pos);
        } catch (e) { }
      }
    }
  };

  function updateTripChip() {
    if (refs.tripName) refs.tripName.textContent = M.settings().tripName;
  }

  function initials() {
    var u = RT.cloud.user;
    var n = u ? (u.name || u.email || '?') : 'LO';
    return n.slice(0, 2).toUpperCase();
  }
  function userLabel() {
    var u = RT.cloud.user;
    return u ? (u.name || u.email) : 'Lokaal';
  }

  /* ============================================================
     Menus
     ============================================================ */

  function menuButton(icon, label, fn, danger) {
    return el('button.tripitem' + (danger ? '.tripitem--danger' : ''), { type: 'button', onClick: fn },
      el('span.ico', { html: RT.icon(icon, 16), style: { opacity: .7 } }),
      el('span.grow', {}, el('strong', { text: label }))
    );
  }

  function openTripMenu() {
    var m = RT.modal({
      title: M.settings().tripName,
      body: el('div.triplist', {},
        menuButton('edit', 'Reis-instellingen', function () { m.close(); openSettings(); }),
        menuButton('user', 'Namen & draagvermogen', function () { m.close(); openSettings(true); }),
        RT.cloud.user ? menuButton('copy', 'Uitnodigingscode delen', function () { m.close(); showInvite(); }) : null,
        RT.cloud.user ? menuButton('route', 'Andere reis openen', function () { m.close(); UI.tripPicker(true); }) : null,
        menuButton('down', 'Exporteren (JSON)', function () {
          m.close();
          RT.download('roadtrip-' + RT.todayISO() + '.json', S.exportJSON());
        }),
        menuButton('up', 'Importeren (JSON)', function () { m.close(); doImport(); }),
        menuButton('trash', 'Alle reisdata wissen', function () {
          m.close();
          RT.confirm('Hiermee verdwijnen alle dagen, activiteiten, campings, gear, maaltijden, uitgaven en logboekitems van deze reis. Dit kan niet ongedaan worden gemaakt.', { okLabel: 'Alles wissen' })
            .then(function (ok) { if (ok) { M.wipeDemo(); RT.toast('Reisdata gewist'); } });
        }, true)
      )
    });
  }

  function openUserMenu() {
    var u = RT.cloud.user;
    var body = el('div', {});
    if (u) {
      body.appendChild(el('p.muted.small', { style: { margin: '0 0 14px' } },
        'Ingelogd als ', el('b', { text: u.email || u.name })));
    } else {
      body.appendChild(el('div.gate__info', { style: { marginBottom: '14px' } },
        RT.cloud.unavailableReason() || 'Je werkt lokaal. Data staat alleen in deze browser.'));
    }
    var list = el('div.triplist');
    if (u) {
      list.appendChild(menuButton('sync', 'Nu synchroniseren', function () { m.close(); S.forceSync(); }));
      list.appendChild(menuButton('logout', 'Uitloggen', function () {
        m.close();
        RT.cloud.signOut().then(function () { location.reload(); });
      }, true));
    } else if (RT.cloud.available()) {
      list.appendChild(menuButton('cloud', 'Inloggen voor sync', function () { m.close(); UI.gate(); }));
    }
    body.appendChild(list);
    var m = RT.modal({ title: 'Account', body: body });
  }

  function showInvite() {
    var code = UI.currentTrip && UI.currentTrip.join_code;
    RT.modal({
      title: 'Reisgenoot uitnodigen',
      body: el('div', {},
        el('p.muted.small', { text: 'Laat je reisgenoot een account maken en deze code invullen bij "Deelnemen aan een reis". Daarna zien jullie dezelfde data.' }),
        el('div', {
          style: {
            fontFamily: 'var(--mono)', fontSize: '26px', letterSpacing: '6px',
            textAlign: 'center', padding: '16px', margin: '14px 0',
            background: 'var(--bg-2)', border: '1px solid var(--line-2)', borderRadius: '8px',
            color: 'var(--accent-2)'
          }, text: code || '—'
        }),
        el('button.btn.btn--primary.btn--block', {
          type: 'button', onClick: function () { RT.copy(code || ''); }
        }, el('span', { html: RT.icon('copy', 15) }), 'Code kopiëren')
      )
    });
  }

  function doImport() {
    RT.pickFile('.json,application/json').then(function (f) {
      if (!f) return;
      return RT.readText(f).then(function (txt) {
        return RT.modal({
          title: 'Importeren',
          body: el('p.muted', { text: 'Wil je de import samenvoegen met je huidige data, of alles vervangen?' }),
          buttons: [
            { label: 'Samenvoegen', value: 'merge', primary: true },
            { label: 'Vervangen', value: 'replace', danger: true }
          ]
        }).then(function (mode) {
          if (!mode) return;
          try {
            var n = S.importJSON(txt, mode);
            RT.toast(n + ' records geïmporteerd', 'ok');
          } catch (e) {
            RT.alert('Importeren mislukt: ' + e.message);
          }
        });
      });
    });
  }

  UI.openSettings = openSettings;
  function openSettings(focusPeople) {
    var s = M.settings();
    RT.form({
      title: 'Reis-instellingen',
      values: s,
      fields: [
        { key: 'tripName', label: 'Naam van de reis', width: 'full' },
        { key: 'startDate', label: 'Startdatum', type: 'date' },
        { key: 'budgetTotal', label: 'Budget totaal (€)', type: 'number' },
        { type: 'divider', label: 'De twee reizigers' },
        { key: 'personA', label: 'Persoon A' },
        { key: 'personB', label: 'Persoon B' },
        { key: 'capacityA', label: 'Draagvermogen A (kg)', type: 'number', help: 'Grens voor de gewichtsbalk in de gear-tab.' },
        { key: 'capacityB', label: 'Draagvermogen B (kg)', type: 'number' }
      ]
    }).then(function (v) {
      if (!v) return;
      M.saveSettings(v);
      updateTripChip();
      RT.toast('Opgeslagen', 'ok');
    });
  }

  /* ============================================================
     Inlogscherm
     ============================================================ */

  UI.gate = function () {
    var mode = 'signin';
    var errBox = el('div.gate__err.hidden');
    var infoBox = el('div.gate__info.hidden');
    var email = el('input.input', { type: 'email', placeholder: 'jij@voorbeeld.nl', autocomplete: 'email' });
    var pass = el('input.input', { type: 'password', placeholder: 'Minimaal 8 tekens', autocomplete: 'current-password' });
    var name = el('input.input', { type: 'text', placeholder: 'Hoe heet je?' });
    var nameField = el('label.field', {}, el('span.field__label', { text: 'Naam' }), name);
    var submit = el('button.btn.btn--primary.btn--block', { type: 'submit' }, 'Inloggen');

    var available = RT.cloud.available();
    var reason = RT.cloud.unavailableReason();

    function setMode(m) {
      mode = m;
      nameField.classList.toggle('hidden', m !== 'signup');
      submit.textContent = m === 'signup' ? 'Account aanmaken' : 'Inloggen';
      pass.autocomplete = m === 'signup' ? 'new-password' : 'current-password';
      RT.$$('.gate__tabs button', box).forEach(function (b) {
        b.classList.toggle('is-active', b.dataset.mode === m);
      });
      errBox.classList.add('hidden');
    }

    function fail(msg) {
      errBox.textContent = msg;
      errBox.classList.remove('hidden');
      submit.disabled = false;
      submit.textContent = mode === 'signup' ? 'Account aanmaken' : 'Inloggen';
    }

    function onSubmit(e) {
      e.preventDefault();
      if (!available) return;
      errBox.classList.add('hidden');
      if (!email.value.trim() || !pass.value) return fail('Vul je e-mailadres en wachtwoord in.');
      if (mode === 'signup' && pass.value.length < 8) return fail('Kies een wachtwoord van minimaal 8 tekens.');
      submit.disabled = true;
      submit.textContent = 'Bezig…';
      var p = mode === 'signup'
        ? RT.cloud.signUp(email.value.trim(), pass.value, name.value.trim())
        : RT.cloud.signIn(email.value.trim(), pass.value);
      p.then(function (user) {
        if (!user) {
          infoBox.textContent = 'Account aangemaakt. Bevestig eventueel je e-mailadres en log daarna in.';
          infoBox.classList.remove('hidden');
          setMode('signin');
          submit.disabled = false;
          return;
        }
        UI.tripPicker();
      }).catch(function (err) {
        fail(err && err.message ? err.message : String(err));
      });
    }

    var form = el('form.gate__form', { onSubmit: onSubmit },
      el('label.field', {}, el('span.field__label', { text: 'E-mail' }), email),
      nameField,
      el('label.field', {}, el('span.field__label', { text: 'Wachtwoord' }), pass),
      errBox, infoBox, submit
    );

    var box = el('div.gate__box', {},
      el('div.gate__brand', {}, el('div.brand__mark', { text: 'RT' })),
      el('h1.gate__title', { text: 'Roadtrippers' }),
      el('p.gate__sub', { text: available
        ? 'Log in zodat jullie allebei dezelfde reis zien, op elk apparaat.'
        : 'Plan je roadtrip. Zonder login wordt alles in deze browser bewaard.' }),
      available ? el('div.gate__tabs', {},
        el('button', { type: 'button', dataset: { mode: 'signin' }, class: 'is-active', text: 'Inloggen', onClick: function () { setMode('signin'); } }),
        el('button', { type: 'button', dataset: { mode: 'signup' }, text: 'Registreren', onClick: function () { setMode('signup'); } })
      ) : null,
      available ? form : el('div.gate__info', { text: reason || 'Cloud-sync is niet beschikbaar.' }),
      el('div.gate__divider', { text: 'of' }),
      el('button.btn.btn--ghost.btn--block', {
        type: 'button',
        onClick: function () { UI.startLocal(); }
      }, 'Verder zonder account (lokaal)'),
      el('p.field__help', { style: { marginTop: '12px', textAlign: 'center' }, text: 'Lokale data blijft in deze browser staan. Je kunt hem later exporteren en in je account importeren.' })
    );

    nameField.classList.add('hidden');
    showGate(box);
    setTimeout(function () { try { email.focus(); } catch (e) { } }, 40);
  };

  function showGate(box) {
    var app = RT.clear(RT.$('#app'));
    app.appendChild(el('div.gate', {}, box));
  }

  /* ============================================================
     Reis-kiezer
     ============================================================ */

  UI.currentTrip = null;

  UI.tripPicker = function (asModal) {
    if (!RT.cloud.user) return UI.startLocal();

    var list = el('div.triplist', {}, el('p.muted.small', { text: 'Reizen ophalen…' }));
    var box = el('div.gate__box', {},
      el('div.gate__brand', {}, el('div.brand__mark', { text: 'RT' })),
      el('h1.gate__title', { text: 'Kies je reis' }),
      el('p.gate__sub', { text: 'Elke reis heeft z\'n eigen route, gear en budget.' }),
      list
    );

    var modalRef = null;
    if (asModal) modalRef = RT.modal({ title: 'Reis openen', body: list });
    else showGate(box);

    function close() { if (modalRef) modalRef.close(); }

    function render(trips) {
      RT.clear(list);
      if (!trips.length) {
        list.appendChild(el('p.muted.small', { text: 'Je hebt nog geen reis. Maak er een aan, of vul de code van je reisgenoot in.' }));
      }
      trips.forEach(function (t) {
        list.appendChild(el('button.tripitem', {
          type: 'button',
          onClick: function () { close(); UI.openTrip(t); }
        },
          el('span.ico', { html: RT.icon('pin', 16), style: { opacity: .6 } }),
          el('span.grow', {}, el('strong', { text: t.name }), el('div.code', { text: 'code ' + t.join_code })),
          el('span', { html: RT.icon('down', 15), style: { transform: 'rotate(-90deg)', opacity: .5 } })
        ));
      });

      list.appendChild(el('div.gate__divider', { text: 'nieuw' }));
      list.appendChild(el('button.btn.btn--primary.btn--block', {
        type: 'button',
        onClick: function () {
          RT.form({
            title: 'Nieuwe reis',
            okLabel: 'Aanmaken',
            fields: [{ key: 'name', label: 'Naam van de reis', width: 'full', placeholder: 'bv. Noorwegen zomer' }],
            values: { name: '' }
          }).then(function (v) {
            if (!v || !v.name) return;
            RT.toast('Reis aanmaken…');
            RT.cloud.createTrip(v.name).then(function (t) {
              close(); UI.openTrip(t, true);
            }).catch(function (e) { RT.alert('Aanmaken mislukt: ' + e.message); });
          });
        }
      }, el('span', { html: RT.icon('plus', 15) }), 'Nieuwe reis maken'));

      list.appendChild(el('button.btn.btn--ghost.btn--block', {
        type: 'button', style: { marginTop: '8px' },
        onClick: function () {
          RT.form({
            title: 'Deelnemen aan een reis',
            okLabel: 'Deelnemen',
            fields: [{ key: 'code', label: 'Uitnodigingscode', width: 'full', placeholder: 'bv. 7K3F91' }],
            values: { code: '' }
          }).then(function (v) {
            if (!v || !v.code) return;
            RT.cloud.joinTrip(v.code).then(function (t) {
              close(); UI.openTrip(t, false);
            }).catch(function (e) { RT.alert('Deelnemen mislukt: ' + e.message); });
          });
        }
      }, 'Deelnemen met een code'));

      list.appendChild(el('button.btn.btn--ghost.btn--block', {
        type: 'button', style: { marginTop: '8px' },
        onClick: function () { close(); UI.startLocal(); }
      }, 'Alleen lokaal werken'));
    }

    RT.cloud.listTrips()
      .then(render)
      .catch(function (e) {
        RT.clear(list);
        list.appendChild(el('div.gate__err', { text: 'Reizen ophalen mislukt: ' + e.message }));
        list.appendChild(el('button.btn.btn--ghost.btn--block', {
          type: 'button', style: { marginTop: '10px' },
          onClick: function () { close(); UI.startLocal(); }
        }, 'Verder zonder account'));
      });
  };

  UI.openTrip = function (trip, isNew) {
    UI.currentTrip = trip;
    try { localStorage.setItem('roadtrippers.lastTrip', JSON.stringify(trip)); } catch (e) { }
    S.open('cloud:' + trip.id);
    S.attachSync(RT.cloud.adapter(trip.id));
    UI.mount();
    if (isNew && M.isEmpty()) {
      setTimeout(function () { offerSeed(trip.name); }, 400);
    }
  };

  UI.startLocal = function () {
    UI.currentTrip = null;
    S.open('local');
    S.detachSync();
    S.setStatus('local', 'Lokaal opgeslagen');
    UI.mount();
    if (M.isEmpty()) setTimeout(function () { offerSeed(); }, 350);
  };

  function offerSeed(tripName) {
    RT.modal({
      title: 'Beginnen met voorbeelddata?',
      body: el('div', {},
        el('p.muted', { text: 'Je reis is nog leeg. We kunnen een handvol voorbeelditems neerzetten — twee dagen, wat gear in de rugzakken en een paar uitgaven — zodat je meteen ziet hoe alles werkt. Je kunt ze daarna met één klik wissen.' }),
        el('p.field__help', { text: 'Liever schoon beginnen? Kies "Leeg beginnen".' })
      ),
      buttons: [
        { label: 'Leeg beginnen', value: false },
        { label: 'Voorbeelddata plaatsen', primary: true, value: true }
      ]
    }).then(function (yes) {
      if (yes) {
        M.seed();
        if (tripName) M.saveSettings({ tripName: tripName });
        RT.toast('Voorbeelddata geplaatst', 'ok');
      } else {
        // minimaal de containers, anders is de gear-tab onbruikbaar
        S.batch(function () {
          S.put('container', { name: 'Rugzak', owner: 'a', cols: 5, rows: 7, order: 0 });
          S.put('container', { name: 'Heuptas', owner: 'a', cols: 4, rows: 2, order: 1 });
          S.put('container', { name: 'Rugzak', owner: 'b', cols: 5, rows: 7, order: 0 });
          S.put('container', { name: 'Heuptas', owner: 'b', cols: 4, rows: 2, order: 1 });
          S.put('container', { name: 'Kofferbak', owner: 'shared', cols: 8, rows: 5, order: 0 });
          if (tripName) M.saveSettings({ tripName: tripName });
        });
      }
    });
  }

  /* ============================================================
     Gedeelde UI-bouwstenen voor tabs
     ============================================================ */

  UI.pagehead = function (title, sub, actions) {
    return el('div.pagehead', {},
      el('div', {}, el('h1', { text: title }), sub ? el('div.sub', { text: sub }) : null),
      actions && actions.length ? el('div.pagehead__actions', {}, actions) : null
    );
  };

  UI.empty = function (icon, title, text, action) {
    return el('div.empty', {},
      el('div.empty__icon', { html: RT.icon(icon, 40) }),
      el('h3', { text: title }),
      el('p', { text: text }),
      action || null
    );
  };

  UI.kpi = function (label, value, sub, mod) {
    return el('div.kpi' + (mod ? '.kpi--' + mod : ''), {},
      el('div.kpi__label', { text: label }),
      el('div.kpi__value', { text: value }),
      sub ? el('div.kpi__sub', { text: sub }) : null
    );
  };

  UI.actions = function (onEdit, onDelete, extra) {
    return el('div.entry__actions', {},
      extra || null,
      onEdit ? el('button.iconbtn', { type: 'button', title: 'Bewerken', html: RT.icon('edit', 15), onClick: onEdit }) : null,
      onDelete ? el('button.iconbtn.iconbtn--danger', { type: 'button', title: 'Verwijderen', html: RT.icon('trash', 15), onClick: onDelete }) : null
    );
  };

  UI.confirmDelete = function (what, fn) {
    RT.confirm('"' + what + '" wordt verwijderd.').then(function (ok) { if (ok) fn(); });
  };

  UI.dayBadge = function (dayId) {
    var i = M.dayIndex(dayId);
    if (i < 0) return null;
    var d = M.dayById(dayId);
    return el('span.badge.badge--info', { text: 'Dag ' + (i + 1) + (d && d.date ? ' · ' + RT.fmt.dateShort(d.date) : '') });
  };

  UI.personSelect = function () {
    return [
      { value: 'beide', label: 'Allebei' },
      { value: 'a', label: M.personName('a') },
      { value: 'b', label: M.personName('b') }
    ];
  };

  RT.ui = UI;
})(window.RT);
