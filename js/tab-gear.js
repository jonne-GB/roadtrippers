/* ============================================================
   tab-gear.js — Tarkov-achtige inventory voor twee personen
   ------------------------------------------------------------
   - rasters waarin items 1x1 … 4x3 cellen innemen
   - slepen tussen rugzakken, kofferbak, uitrustingsslots en stash
   - roteren met R (of rechtermuisknop)
   - gewicht per persoon met draagvermogen-balk
   ============================================================ */
(function (RT) {
  'use strict';

  var el = RT.el, S = RT.store, M = RT.model, UI = RT.ui;

  var state = {
    search: '',
    selected: null,
    onlyUnpacked: false
  };

  var drag = null;       // actieve sleepoperatie
  var rootRef = null;

  /* ---------- css-variabelen ---------- */

  function setVars(node, vars) {
    Object.keys(vars).forEach(function (k) {
      if (vars[k] === null || vars[k] === undefined) return;
      node.style.setProperty(k, String(vars[k]));
    });
    return node;
  }

  /* Zoeken dimt items in plaats van alles opnieuw te tekenen,
     zodat de cursor in het zoekveld blijft staan. */
  function applyFilter() {
    if (!rootRef) return;
    RT.$$('.tk-item', rootRef).forEach(function (node) {
      var g = S.get(node.dataset.id);
      if (!g) return;
      var hit = matchesSearch(g);
      node.classList.toggle('is-dim', !hit);
      node.classList.toggle('is-hit', !!state.search && hit);
    });
  }

  function cellSize() {
    var tk = rootRef && rootRef.querySelector('.tk');
    if (!tk) return 58;
    var v = getComputedStyle(tk).getPropertyValue('--cell');
    return parseFloat(v) || 58;
  }

  /* ============================================================
     Plaatsingslogica
     ============================================================ */

  function occupancy(containerId, excludeId) {
    var cont = S.get(containerId);
    if (!cont) return null;
    var grid = [];
    for (var y = 0; y < cont.rows; y++) {
      grid.push(new Array(cont.cols).fill(null));
    }
    M.gearIn(containerId).forEach(function (g) {
      if (g.id === excludeId) return;
      for (var dy = 0; dy < g.h; dy++) {
        for (var dx = 0; dx < g.w; dx++) {
          var yy = g.loc.y + dy, xx = g.loc.x + dx;
          if (grid[yy] && xx < cont.cols) grid[yy][xx] = g.id;
        }
      }
    });
    return { grid: grid, cols: cont.cols, rows: cont.rows };
  }

  function canPlace(containerId, x, y, w, h, excludeId) {
    var occ = occupancy(containerId, excludeId);
    if (!occ) return false;
    if (x < 0 || y < 0 || x + w > occ.cols || y + h > occ.rows) return false;
    for (var dy = 0; dy < h; dy++) {
      for (var dx = 0; dx < w; dx++) {
        if (occ.grid[y + dy][x + dx]) return false;
      }
    }
    return true;
  }

  function findFreeSpot(containerId, w, h, excludeId) {
    var occ = occupancy(containerId, excludeId);
    if (!occ) return null;
    for (var y = 0; y <= occ.rows - h; y++) {
      for (var x = 0; x <= occ.cols - w; x++) {
        if (canPlace(containerId, x, y, w, h, excludeId)) return { x: x, y: y, w: w, h: h };
      }
    }
    if (w !== h) {
      for (var y2 = 0; y2 <= occ.rows - w; y2++) {
        for (var x2 = 0; x2 <= occ.cols - h; x2++) {
          if (canPlace(containerId, x2, y2, h, w, excludeId)) return { x: x2, y: y2, w: h, h: w };
        }
      }
    }
    return null;
  }

  function autoSort(containerId) {
    var items = M.gearIn(containerId).slice().sort(function (a, b) {
      return (b.w * b.h) - (a.w * a.h) || b.w - a.w;
    });
    var cont = S.get(containerId);
    var placed = [];
    var occ = [];
    for (var y = 0; y < cont.rows; y++) occ.push(new Array(cont.cols).fill(false));

    function fits(x, y, w, h) {
      if (x + w > cont.cols || y + h > cont.rows) return false;
      for (var dy = 0; dy < h; dy++) for (var dx = 0; dx < w; dx++) if (occ[y + dy][x + dx]) return false;
      return true;
    }
    function mark(x, y, w, h) {
      for (var dy = 0; dy < h; dy++) for (var dx = 0; dx < w; dx++) occ[y + dy][x + dx] = true;
    }

    var leftovers = [];
    items.forEach(function (g) {
      var done = false;
      for (var y = 0; y < cont.rows && !done; y++) {
        for (var x = 0; x < cont.cols && !done; x++) {
          if (fits(x, y, g.w, g.h)) { mark(x, y, g.w, g.h); placed.push({ id: g.id, x: x, y: y, w: g.w, h: g.h }); done = true; }
          else if (g.w !== g.h && fits(x, y, g.h, g.w)) { mark(x, y, g.h, g.w); placed.push({ id: g.id, x: x, y: y, w: g.h, h: g.w }); done = true; }
        }
      }
      if (!done) leftovers.push(g);
    });

    S.batch(function () {
      placed.forEach(function (p) {
        S.patch(p.id, { w: p.w, h: p.h, loc: { type: 'grid', containerId: containerId, x: p.x, y: p.y } });
      });
      leftovers.forEach(function (g) { S.patch(g.id, { loc: { type: 'stash' } }); });
    });

    if (leftovers.length) RT.toast(leftovers.length + ' item(s) pasten niet — naar de stash verplaatst', 'error');
    else RT.toast('Opnieuw ingedeeld', 'ok');
  }

  /* ============================================================
     Item-node
     ============================================================ */

  function matchesSearch(g) {
    if (state.onlyUnpacked && g.packed) return false;
    if (!state.search) return true;
    var q = state.search.toLowerCase();
    return (g.name || '').toLowerCase().indexOf(q) >= 0 ||
      (M.cat(g.cat).label || '').toLowerCase().indexOf(q) >= 0 ||
      (g.note || '').toLowerCase().indexOf(q) >= 0;
  }

  function itemNode(g, inGrid) {
    var c = M.cat(g.cat);
    var node = el('div.tk-item', {
      dataset: { id: g.id },
      title: g.name + ' · ' + g.w + '×' + g.h + ' · ' + RT.fmt.kg(g.weight)
    },
      el('div.tk-item__glyph', { text: c.glyph }),
      el('div.tk-item__name', { text: g.name }),
      g.qty > 1 ? el('div.tk-item__qty', { text: '×' + g.qty }) : null,
      el('div.tk-item__w', { text: RT.num(g.weight, 0) >= 1 ? RT.fmt.n(g.weight, 1) : RT.fmt.n(g.weight, 2) }),
      el('div.tk-item__flag.tk-item__flag--' + (g.packed ? 'packed' : 'todo'), {
        title: g.packed ? 'Ingepakt' : 'Nog niet ingepakt'
      })
    );
    setVars(node, {
      '--x': inGrid ? g.loc.x : 0,
      '--y': inGrid ? g.loc.y : 0,
      '--w': g.w,
      '--h': g.h,
      '--item-bg': c.bg,
      '--item-line': c.line
    });
    if (state.search || state.onlyUnpacked) {
      node.classList.toggle('is-dim', !matchesSearch(g));
      node.classList.toggle('is-hit', !!state.search && matchesSearch(g));
    }
    if (state.selected === g.id) node.classList.add('is-hit');

    node.addEventListener('pointerdown', onItemPointerDown);
    node.addEventListener('contextmenu', function (e) {
      e.preventDefault();
      rotateInPlace(g.id);
    });
    node.addEventListener('dblclick', function (e) {
      e.preventDefault();
      S.patch(g.id, { packed: !g.packed });
    });
    return node;
  }

  function rotateInPlace(id) {
    var g = S.get(id);
    if (!g || g.w === g.h) return;
    if (g.loc && g.loc.type === 'grid') {
      if (!canPlace(g.loc.containerId, g.loc.x, g.loc.y, g.h, g.w, g.id)) {
        var spot = findFreeSpot(g.loc.containerId, g.h, g.w, g.id);
        if (!spot) { RT.toast('Geen ruimte om te draaien', 'error'); return; }
        S.patch(id, { w: spot.w, h: spot.h, loc: { type: 'grid', containerId: g.loc.containerId, x: spot.x, y: spot.y } });
        return;
      }
    }
    S.patch(id, { w: g.h, h: g.w });
  }

  /* ============================================================
     Drag & drop (pointer events — werkt ook op touch)
     ============================================================ */

  function onItemPointerDown(e) {
    if (e.button !== undefined && e.button !== 0) return;
    var node = e.currentTarget;
    var id = node.dataset.id;
    var g = S.get(id);
    if (!g) return;

    var cell = cellSize();
    var rect = node.getBoundingClientRect();
    var grabX = RT.clamp(Math.floor((e.clientX - rect.left) / cell), 0, g.w - 1);
    var grabY = RT.clamp(Math.floor((e.clientY - rect.top) / cell), 0, g.h - 1);

    drag = {
      id: id, item: g, node: node, cell: cell,
      startX: e.clientX, startY: e.clientY,
      grabX: grabX, grabY: grabY,
      w: g.w, h: g.h,
      moved: false, ghost: null, target: null, preview: null,
      pointerId: e.pointerId
    };

    try { node.setPointerCapture(e.pointerId); } catch (err) { }
    node.addEventListener('pointermove', onPointerMove);
    node.addEventListener('pointerup', onPointerUp);
    node.addEventListener('pointercancel', onPointerCancel);
    document.addEventListener('keydown', onDragKey, true);
  }

  function onPointerMove(e) {
    if (!drag) return;
    var dx = e.clientX - drag.startX, dy = e.clientY - drag.startY;
    if (!drag.moved) {
      if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
      startGhost();
    }
    e.preventDefault();
    positionGhost(e.clientX, e.clientY);
    updateTarget(e.clientX, e.clientY);
  }

  function startGhost() {
    drag.moved = true;
    var g = drag.item;
    var c = M.cat(g.cat);
    var cell = drag.cell;
    var ghost = el('div.tk-item.tk-ghost', {},
      el('div.tk-item__glyph', { text: c.glyph }),
      el('div.tk-item__name', { text: g.name }),
      el('div.tk-item__w', { text: RT.fmt.n(g.weight, 2) })
    );
    setVars(ghost, { '--w': drag.w, '--h': drag.h, '--item-bg': c.bg, '--item-line': c.line, '--cell': cell + 'px' });
    ghost.style.width = (drag.w * cell - 3) + 'px';
    ghost.style.height = (drag.h * cell - 3) + 'px';
    document.body.appendChild(ghost);
    drag.ghost = ghost;
    drag.node.classList.add('is-dragging');
    document.body.style.cursor = 'grabbing';
  }

  function positionGhost(cx, cy) {
    if (!drag.ghost) return;
    var cell = drag.cell;
    drag.ghost.style.left = (cx - (drag.grabX + 0.5) * cell) + 'px';
    drag.ghost.style.top = (cy - (drag.grabY + 0.5) * cell) + 'px';
  }

  function clearTargetVisuals() {
    if (!rootRef) return;
    RT.$$('.tk-grid.is-dropzone, .tk-stash__body.is-dropzone', rootRef).forEach(function (n) { n.classList.remove('is-dropzone'); });
    RT.$$('.tk-slot.is-target, .tk-slot.is-blocked', rootRef).forEach(function (n) { n.classList.remove('is-target', 'is-blocked'); });
    RT.$$('.tk-preview', rootRef).forEach(function (n) { n.parentNode.removeChild(n); });
  }

  function updateTarget(cx, cy) {
    clearTargetVisuals();
    drag.target = null;
    if (drag.ghost) drag.ghost.style.display = 'none';
    var under = document.elementFromPoint(cx, cy);
    if (drag.ghost) drag.ghost.style.display = '';
    if (!under) return;

    var grid = under.closest ? under.closest('.tk-grid') : null;
    var stash = under.closest ? under.closest('.tk-stash__body') : null;
    var slot = under.closest ? under.closest('.tk-slot') : null;

    if (grid) {
      var cell = drag.cell;
      var r = grid.getBoundingClientRect();
      var gx = Math.round((cx - r.left - (drag.grabX + 0.5) * cell) / cell);
      var gy = Math.round((cy - r.top - (drag.grabY + 0.5) * cell) / cell);
      var cid = grid.dataset.container;
      var cont = S.get(cid);
      if (!cont) return;
      gx = RT.clamp(gx, 0, Math.max(0, cont.cols - drag.w));
      gy = RT.clamp(gy, 0, Math.max(0, cont.rows - drag.h));
      var ok = canPlace(cid, gx, gy, drag.w, drag.h, drag.id);
      var prev = el('div.tk-preview' + (ok ? '' : '.is-bad'));
      setVars(prev, { '--x': gx, '--y': gy, '--w': drag.w, '--h': drag.h });
      grid.appendChild(prev);
      grid.classList.add('is-dropzone');
      drag.target = ok ? { type: 'grid', containerId: cid, x: gx, y: gy } : null;
    } else if (stash) {
      stash.classList.add('is-dropzone');
      drag.target = { type: 'stash' };
    } else if (slot) {
      var occupied = slot.dataset.itemId && slot.dataset.itemId !== drag.id;
      slot.classList.add(occupied ? 'is-blocked' : 'is-target');
      drag.target = occupied ? null : { type: 'slot', person: slot.dataset.person, slot: slot.dataset.slot };
    }
  }

  function onDragKey(e) {
    if (!drag || !drag.moved) return;
    if (e.key === 'r' || e.key === 'R') {
      e.preventDefault(); e.stopPropagation();
      var t = drag.w; drag.w = drag.h; drag.h = t;
      var tg = drag.grabX; drag.grabX = Math.min(drag.grabY, drag.w - 1); drag.grabY = Math.min(tg, drag.h - 1);
      if (drag.ghost) {
        setVars(drag.ghost, { '--w': drag.w, '--h': drag.h });
        drag.ghost.style.width = (drag.w * drag.cell - 3) + 'px';
        drag.ghost.style.height = (drag.h * drag.cell - 3) + 'px';
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelDrag();
    }
  }

  function endDragCommon() {
    document.removeEventListener('keydown', onDragKey, true);
    document.body.style.cursor = '';
    if (drag) {
      drag.node.removeEventListener('pointermove', onPointerMove);
      drag.node.removeEventListener('pointerup', onPointerUp);
      drag.node.removeEventListener('pointercancel', onPointerCancel);
      drag.node.classList.remove('is-dragging');
      try { drag.node.releasePointerCapture(drag.pointerId); } catch (e) { }
      if (drag.ghost && drag.ghost.parentNode) drag.ghost.parentNode.removeChild(drag.ghost);
    }
    clearTargetVisuals();
  }

  function cancelDrag() {
    endDragCommon();
    drag = null;
  }

  function onPointerCancel() { cancelDrag(); }

  function onPointerUp(e) {
    if (!drag) return;
    var d = drag;
    if (!d.moved) {
      endDragCommon(); drag = null;
      inspect(d.id);
      return;
    }
    var target = d.target, w = d.w, h = d.h, id = d.id;
    endDragCommon();
    drag = null;

    if (!target) { RT.toast('Past daar niet', 'error'); return; }

    if (target.type === 'slot') {
      S.patch(id, { w: w, h: h, loc: { type: 'slot', person: target.person, slot: target.slot } });
    } else if (target.type === 'stash') {
      S.patch(id, { w: w, h: h, loc: { type: 'stash' } });
    } else {
      S.patch(id, { w: w, h: h, loc: { type: 'grid', containerId: target.containerId, x: target.x, y: target.y } });
    }
  }

  /* ============================================================
     Inspect / bewerken
     ============================================================ */

  function locLabel(g) {
    if (!g.loc || g.loc.type === 'stash') return 'Stash (nog niet ingedeeld)';
    if (g.loc.type === 'slot') {
      var sl = M.SLOTS.filter(function (s) { return s.key === g.loc.slot; })[0];
      return (sl ? sl.label : g.loc.slot) + ' · ' + M.personName(g.loc.person);
    }
    var c = S.get(g.loc.containerId);
    return c ? c.name + ' · ' + M.personName(c.owner) + ' (' + (g.loc.x + 1) + ',' + (g.loc.y + 1) + ')' : '—';
  }

  function inspect(id) {
    var g = S.get(id);
    if (!g) return;
    state.selected = id;
    var c = M.cat(g.cat);
    var total = RT.num(g.weight, 0) * Math.max(1, RT.num(g.qty, 1));

    var m = RT.modal({
      title: g.name,
      body: el('div.tk', { style: { padding: '0', background: 'none', border: '0' } },
        el('div.tk-inspect', {},
          el('div.row', { style: { marginBottom: '10px' } },
            el('div', {
              style: {
                width: '46px', height: '46px', flex: 'none', display: 'grid', placeItems: 'center',
                fontSize: '22px', background: c.bg, border: '1px solid ' + c.line, borderRadius: '2px'
              }, text: c.glyph
            }),
            el('div.grow', {},
              el('div', { style: { fontSize: '11px', letterSpacing: '1.5px', textTransform: 'uppercase', color: '#8e897a' }, text: c.label }),
              el('div', { style: { fontSize: '13px', color: '#e6dcc2' }, text: g.w + ' × ' + g.h + ' cellen' })
            )
          ),
          el('dl.tk-inspect__rows', {},
            el('dt', { text: 'Gewicht' }), el('dd', { text: RT.fmt.kg(g.weight) + (g.qty > 1 ? ' × ' + g.qty + ' = ' + RT.fmt.kg(total) : '') }),
            el('dt', { text: 'Aantal' }), el('dd', { text: String(g.qty || 1) }),
            el('dt', { text: 'Locatie' }), el('dd', { text: locLabel(g) }),
            el('dt', { text: 'Status' }), el('dd', { text: g.packed ? '✔ Ingepakt' : '○ Nog inpakken' }),
            g.price ? el('dt', { text: 'Prijs' }) : null, g.price ? el('dd', { text: RT.fmt.money(g.price) }) : null
          ),
          g.note ? el('div.tk-inspect__note', { text: g.note }) : null,
          el('div.tk-inspect__actions', {},
            el('button.tk-btn', {
              type: 'button', onClick: function () { S.patch(id, { packed: !g.packed }); m.close(); }
            }, g.packed ? 'Uitpakken' : 'Ingepakt ✔'),
            g.w !== g.h ? el('button.tk-btn', { type: 'button', onClick: function () { rotateInPlace(id); m.close(); } }, 'Draaien') : null,
            el('button.tk-btn', { type: 'button', onClick: function () { m.close(); editItem(g); } }, 'Bewerken'),
            el('button.tk-btn', { type: 'button', onClick: function () { m.close(); duplicate(g); } }, 'Dupliceren'),
            el('button.tk-btn', {
              type: 'button', style: { borderColor: '#7a3a2e', color: '#d99385' },
              onClick: function () {
                m.close();
                UI.confirmDelete(g.name, function () { S.remove(id); });
              }
            }, 'Verwijderen')
          )
        )
      )
    });
    m.then(function () { state.selected = null; });
  }

  function itemFields() {
    return [
      { key: 'name', label: 'Naam', width: 'full' },
      { key: 'cat', label: 'Categorie', type: 'select', options: M.catList() },
      { key: 'weight', label: 'Gewicht per stuk (kg)', type: 'number', step: '0.01' },
      { key: 'w', label: 'Breedte (cellen)', type: 'number', min: 1, max: 8, step: '1' },
      { key: 'h', label: 'Hoogte (cellen)', type: 'number', min: 1, max: 6, step: '1' },
      { key: 'qty', label: 'Aantal', type: 'number', min: 1, step: '1' },
      { key: 'price', label: 'Prijs (€)', type: 'number', step: '0.01' },
      { key: 'packed', label: 'Al ingepakt', type: 'check' },
      { key: 'note', label: 'Notitie', type: 'textarea', width: 'full', rows: 2 }
    ];
  }

  function editItem(g) {
    RT.form({
      title: 'Item bewerken',
      values: g,
      fields: itemFields()
    }).then(function (v) {
      if (!v) return;
      v.w = RT.clamp(Math.round(RT.num(v.w, 1)), 1, 8);
      v.h = RT.clamp(Math.round(RT.num(v.h, 1)), 1, 6);
      v.qty = Math.max(1, Math.round(RT.num(v.qty, 1)));
      // past het nog op de huidige plek?
      if (g.loc && g.loc.type === 'grid' && (v.w !== g.w || v.h !== g.h)) {
        if (!canPlace(g.loc.containerId, g.loc.x, g.loc.y, v.w, v.h, g.id)) {
          var spot = findFreeSpot(g.loc.containerId, v.w, v.h, g.id);
          if (spot) { v.w = spot.w; v.h = spot.h; v.loc = { type: 'grid', containerId: g.loc.containerId, x: spot.x, y: spot.y }; }
          else { v.loc = { type: 'stash' }; RT.toast('Past niet meer — naar de stash verplaatst'); }
        }
      }
      S.patch(g.id, v);
    });
  }

  function duplicate(g) {
    var copy = Object.assign({}, g);
    delete copy.id; delete copy.kind; delete copy.updated_at;
    copy.loc = { type: 'stash' };
    copy.packed = false;
    S.put('gear', copy);
    RT.toast('Gedupliceerd naar de stash', 'ok');
  }

  function newItem(preferredContainer) {
    RT.form({
      title: 'Nieuw gear-item',
      okLabel: 'Toevoegen',
      values: { name: '', cat: 'overig', weight: 0.5, w: 1, h: 1, qty: 1, packed: false, note: '', price: null },
      fields: itemFields()
    }).then(function (v) {
      if (!v || !v.name) return;
      v.w = RT.clamp(Math.round(RT.num(v.w, 1)), 1, 8);
      v.h = RT.clamp(Math.round(RT.num(v.h, 1)), 1, 6);
      v.qty = Math.max(1, Math.round(RT.num(v.qty, 1)));
      var loc = { type: 'stash' };
      if (preferredContainer) {
        var spot = findFreeSpot(preferredContainer, v.w, v.h, null);
        if (spot) { v.w = spot.w; v.h = spot.h; loc = { type: 'grid', containerId: preferredContainer, x: spot.x, y: spot.y }; }
      }
      v.loc = loc;
      S.put('gear', v);
    });
  }

  /* ============================================================
     Containers
     ============================================================ */

  function editContainer(c) {
    RT.form({
      title: c ? 'Container bewerken' : 'Nieuwe container',
      okLabel: c ? 'Opslaan' : 'Toevoegen',
      values: c || { name: '', owner: 'shared', cols: 4, rows: 4, order: 9 },
      fields: [
        { key: 'name', label: 'Naam', width: 'full', placeholder: 'bv. Dakkoffer' },
        {
          key: 'owner', label: 'Van wie', type: 'select', options: [
            { value: 'a', label: M.personName('a') },
            { value: 'b', label: M.personName('b') },
            { value: 'shared', label: 'Samen / in de auto' }
          ]
        },
        { key: 'cols', label: 'Kolommen', type: 'number', min: 1, max: 12, step: '1' },
        { key: 'rows', label: 'Rijen', type: 'number', min: 1, max: 10, step: '1' }
      ]
    }).then(function (v) {
      if (!v || !v.name) return;
      v.cols = RT.clamp(Math.round(RT.num(v.cols, 4)), 1, 12);
      v.rows = RT.clamp(Math.round(RT.num(v.rows, 4)), 1, 10);
      if (c) {
        // items die buiten het nieuwe raster vallen naar de stash
        S.batch(function () {
          S.patch(c.id, v);
          M.gearIn(c.id).forEach(function (g) {
            if (g.loc.x + g.w > v.cols || g.loc.y + g.h > v.rows) {
              S.patch(g.id, { loc: { type: 'stash' } });
            }
          });
        });
      } else {
        S.put('container', v);
      }
    });
  }

  function containerMenu(c) {
    var m = RT.modal({
      title: c.name,
      body: el('div.triplist', {},
        el('button.tripitem', { type: 'button', onClick: function () { m.close(); newItem(c.id); } },
          el('span.grow', {}, el('strong', { text: 'Item toevoegen in deze container' }))),
        el('button.tripitem', { type: 'button', onClick: function () { m.close(); autoSort(c.id); } },
          el('span.grow', {}, el('strong', { text: 'Automatisch opnieuw indelen' }))),
        el('button.tripitem', { type: 'button', onClick: function () { m.close(); editContainer(c); } },
          el('span.grow', {}, el('strong', { text: 'Grootte / naam aanpassen' }))),
        el('button.tripitem', {
          type: 'button', onClick: function () {
            m.close();
            RT.confirm('Container "' + c.name + '" verwijderen? De items erin gaan naar de stash.').then(function (ok) {
              if (!ok) return;
              S.batch(function () {
                M.gearIn(c.id).forEach(function (g) { S.patch(g.id, { loc: { type: 'stash' } }); });
                S.remove(c.id);
              });
            });
          }
        }, el('span.grow', {}, el('strong', { text: 'Container verwijderen' })))
      )
    });
  }

  function containerNode(c) {
    var grid = el('div.tk-grid', { dataset: { container: c.id } });
    setVars(grid, { '--cols': c.cols, '--rows': c.rows });
    M.gearIn(c.id).forEach(function (g) { grid.appendChild(itemNode(g, true)); });

    var used = M.gearIn(c.id).reduce(function (a, g) { return a + g.w * g.h; }, 0);
    var cap = c.cols * c.rows;

    return el('div.tk-cont', {},
      el('div.tk-cont__head', {},
        el('span.tk-cont__name', { text: c.name }),
        el('span.tk-cont__owner', { dataset: { owner: c.owner }, text: c.owner === 'shared' ? 'AUTO' : M.personName(c.owner).slice(0, 8) }),
        el('span.tk-cont__stat', { text: used + '/' + cap + ' · ' + RT.fmt.kg(M.containerWeight(c.id)) }),
        el('button.tk-cont__gear', { type: 'button', title: 'Container-opties', html: RT.icon('grip', 14), onClick: function () { containerMenu(c); } })
      ),
      grid
    );
  }

  /* ============================================================
     Persoonspaneel
     ============================================================ */

  function slotNode(person, slotDef) {
    var g = M.gearInSlot(person, slotDef.key);
    var node = el('div.tk-slot' + (g ? '' : '.tk-slot--empty'), {
      dataset: { person: person, slot: slotDef.key, itemId: g ? g.id : '' },
      onClick: function () {
        if (g) inspect(g.id);
        else pickForSlot(person, slotDef);
      }
    },
      el('span.tk-slot__label', { text: slotDef.label }),
      el('span.tk-slot__val', { text: g ? g.name : 'leeg' })
    );
    return node;
  }

  function pickForSlot(person, slotDef) {
    var candidates = M.gear().filter(function (g) {
      return !g.loc || g.loc.type !== 'slot';
    });
    if (!candidates.length) {
      RT.toast('Geen items beschikbaar — maak er eerst een aan');
      return;
    }
    var list = el('div.triplist');
    RT.sortBy(candidates, function (g) { return g.name.toLowerCase(); }).forEach(function (g) {
      list.appendChild(el('button.tripitem', {
        type: 'button',
        onClick: function () {
          m.close();
          S.patch(g.id, { loc: { type: 'slot', person: person, slot: slotDef.key } });
        }
      },
        el('span', { text: M.cat(g.cat).glyph, style: { fontSize: '18px' } }),
        el('span.grow', {}, el('strong', { text: g.name }), el('div.code', { text: RT.fmt.kg(g.weight) + ' · ' + locLabel(g) }))
      ));
    });
    var m = RT.modal({ title: slotDef.label + ' — ' + M.personName(person), body: list });
  }

  function personPanel(slot) {
    var weight = M.personWeight(slot);
    var cap = M.capacity(slot);
    var pct = cap > 0 ? Math.min(100, (weight / cap) * 100) : 0;
    var over = weight > cap;
    var warn = !over && pct > 80;

    var slots = el('div.tk-slots');
    M.SLOTS.forEach(function (s) { slots.appendChild(slotNode(slot, s)); });

    var conts = el('div.tk-containers', { style: { marginTop: '11px' } });
    M.containersFor(slot).forEach(function (c) { conts.appendChild(containerNode(c)); });
    if (!M.containersFor(slot).length) {
      conts.appendChild(el('div', { class: 'tk-stash__empty', text: 'Geen container' }));
    }

    var fill = el('div.tk-weight__fill' + (over ? '.is-over' : warn ? '.is-warn' : ''));
    fill.style.width = pct + '%';

    return el('div.tk-panel.tk-panel--' + slot, {},
      el('div.tk-panel__head', {},
        el('span.tk-panel__tag', { text: slot === 'a' ? 'OPERATOR A' : 'OPERATOR B' }),
        el('span.tk-panel__name', { text: M.personName(slot) }),
        el('div.grow'),
        el('button.tk-cont__gear', {
          type: 'button', title: 'Naam & draagvermogen', html: RT.icon('edit', 14),
          onClick: function () { UI.openSettings(true); }
        })
      ),
      el('div.tk-panel__body', {},
        slots,
        el('div.tk-weight', {},
          el('div.tk-weight__row', {},
            el('span', { text: 'Draaggewicht' }),
            el('span', {}, el('b', { text: RT.fmt.n(weight, 2) }), ' / ' + RT.fmt.n(cap, 1) + ' kg')
          ),
          el('div.tk-weight__track', {}, fill, el('div.tk-weight__ticks'))
        ),
        conts
      )
    );
  }

  /* ============================================================
     Stash
     ============================================================ */

  function stashNode() {
    var items = M.gearInStash();
    var body = el('div.tk-stash__body');
    if (!items.length) {
      body.appendChild(el('div.tk-stash__empty', { text: 'Leeg — alles is ingedeeld' }));
    } else {
      RT.sortBy(items, function (g) { return -(g.w * g.h); }).forEach(function (g) {
        body.appendChild(itemNode(g, false));
      });
    }
    return el('div.tk-stash', {},
      el('div.tk-stash__head', {},
        el('span.tk-stash__title', { text: 'Stash — nog in te delen' }),
        el('span.tk-cont__stat', { text: items.length + ' item(s)' }),
        el('div.grow'),
        el('button.tk-btn', { type: 'button', onClick: function () { newItem(null); } }, '+ Item')
      ),
      body
    );
  }

  /* ============================================================
     Statistieken
     ============================================================ */

  function statsNode() {
    var all = M.gear();
    var totalW = all.reduce(function (a, g) { return a + RT.num(g.weight, 0) * Math.max(1, RT.num(g.qty, 1)); }, 0);
    var packed = all.filter(function (g) { return g.packed; }).length;
    var carW = M.containersFor('shared').reduce(function (a, c) { return a + M.containerWeight(c.id); }, 0);
    var value = all.reduce(function (a, g) { return a + RT.num(g.price, 0) * Math.max(1, RT.num(g.qty, 1)); }, 0);

    function stat(k, v, sub) {
      return el('div.tk-stat', {},
        el('div.tk-stat__k', { text: k }),
        el('div.tk-stat__v', {}, v, sub ? el('small', { text: ' ' + sub }) : null)
      );
    }

    return el('div.tk-stats', {},
      stat('Totaal gewicht', RT.fmt.n(totalW, 1), 'KG'),
      stat('In de auto', RT.fmt.n(carW, 1), 'KG'),
      stat(M.personName('a'), RT.fmt.n(M.personWeight('a'), 1), 'KG'),
      stat(M.personName('b'), RT.fmt.n(M.personWeight('b'), 1), 'KG'),
      stat('Items', String(all.length), packed + ' ingepakt'),
      value ? stat('Waarde', RT.fmt.money0(value), '') : null
    );
  }

  /* ============================================================
     Render
     ============================================================ */

  function render(root) {
    rootRef = root;
    var wrap = el('div.wrap');

    wrap.appendChild(UI.pagehead(
      'Gear',
      'Sleep items tussen rugzakken, heuptassen en de kofferbak. Alles wat in jouw tassen zit telt mee voor jouw draaggewicht.',
      [
        el('button.btn', { type: 'button', onClick: function () { editContainer(null); } },
          el('span', { html: RT.icon('plus', 15) }), 'Container'),
        el('button.btn.btn--primary', { type: 'button', onClick: function () { newItem(null); } },
          el('span', { html: RT.icon('plus', 15) }), 'Nieuw item')
      ]
    ));

    var search = el('input.tk-search', {
      type: 'search', placeholder: 'Zoek in gear…', value: state.search,
      onInput: RT.debounce(function (e) {
        state.search = e.target.value.trim();
        applyFilter();
      }, 140)
    });

    var unpackedBtn = el('button.tk-btn' + (state.onlyUnpacked ? '.tk-btn--gold' : ''), {
      type: 'button',
      onClick: function () {
        state.onlyUnpacked = !state.onlyUnpacked;
        unpackedBtn.classList.toggle('tk-btn--gold', state.onlyUnpacked);
        unpackedBtn.textContent = state.onlyUnpacked ? 'Alleen te doen ✔' : 'Alleen te doen';
        applyFilter();
      }
    }, state.onlyUnpacked ? 'Alleen te doen ✔' : 'Alleen te doen');

    var tk = el('div.tk', {},
      el('div.tk-top', {},
        el('h2.tk-top__title', { text: 'Inventory' }),
        el('div.tk-top__spacer'),
        search,
        unpackedBtn,
        el('button.tk-btn', {
          type: 'button', title: 'Alles in alle containers opnieuw indelen',
          onClick: function () {
            M.containers().forEach(function (c) { autoSort(c.id); });
          }
        }, 'Sorteren')
      ),
      el('div.tk-people', {}, personPanel('a'), personPanel('b'))
    );

    var shared = M.containersFor('shared');
    if (shared.length) {
      var sharedBody = el('div.tk-containers');
      shared.forEach(function (c) { sharedBody.appendChild(containerNode(c)); });
      tk.appendChild(el('div.tk-panel', { style: { marginBottom: '14px' } },
        el('div.tk-panel__head', {},
          el('span.tk-panel__tag', { style: { color: '#9a9a8a' }, text: 'GEDEELD' }),
          el('span.tk-panel__name', { style: { color: '#c9c4b4' }, text: 'In de auto' }),
          el('div.grow'),
          el('span.tk-cont__stat', { text: RT.fmt.kg(shared.reduce(function (a, c) { return a + M.containerWeight(c.id); }, 0)) })
        ),
        el('div.tk-panel__body', {}, sharedBody)
      ));
    }

    tk.appendChild(stashNode());
    tk.appendChild(statsNode());

    // legenda
    var legend = el('div.tk-legend');
    Object.keys(M.GEAR_CATS).forEach(function (k) {
      var c = M.GEAR_CATS[k];
      var sw = el('span.tk-legend__sw');
      sw.style.background = c.bg;
      sw.style.borderColor = c.line;
      legend.appendChild(el('span.tk-legend__item', {}, sw, c.label));
    });
    tk.appendChild(legend);

    tk.appendChild(el('div.tk-hint', {},
      'Slepen om te verplaatsen · ', el('kbd', { text: 'R' }), ' draait tijdens het slepen · rechtermuisknop draait direct · ',
      el('kbd', { text: 'dubbelklik' }), ' markeert als ingepakt · klik voor details'
    ));

    wrap.appendChild(tk);
    root.appendChild(wrap);
  }

  function rerender() {
    if (!rootRef) return;
    RT.clear(rootRef);
    render(rootRef);
  }

  UI.register({
    id: 'gear',
    label: 'Gear',
    icon: 'gear',
    count: function () { return S.count('gear'); },
    render: render
  });

})(window.RT);
