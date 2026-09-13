/* ============================================================
   core.js — basis-helpers (geen dependencies, classic script)
   Werkt zowel via file:// als gehost.
   ============================================================ */
window.RT = window.RT || {};

(function (RT) {
  'use strict';

  /* ---------- DOM ---------- */

  // el('div.card#main', {props}, ...children)
  function el(spec, props) {
    var kids = Array.prototype.slice.call(arguments, 2);
    var tag = 'div', cls = [], id = null;
    var m = String(spec).match(/^([a-zA-Z0-9-]+)?(.*)$/);
    if (m[1]) tag = m[1];
    (m[2].match(/[.#][^.#]+/g) || []).forEach(function (t) {
      if (t.charAt(0) === '.') cls.push(t.slice(1)); else id = t.slice(1);
    });
    var n = document.createElement(tag);
    if (cls.length) n.className = cls.join(' ');
    if (id) n.id = id;

    if (props && typeof props === 'object' && !(props instanceof Node) && !Array.isArray(props)) {
      Object.keys(props).forEach(function (k) {
        var v = props[k];
        if (v === null || v === undefined || v === false) return;
        if (k === 'class' || k === 'className') { n.className = (n.className ? n.className + ' ' : '') + v; }
        else if (k === 'text') { n.textContent = v; }
        else if (k === 'html') { n.innerHTML = v; }
        else if (k === 'style' && typeof v === 'object') { Object.assign(n.style, v); }
        else if (k === 'dataset') { Object.keys(v).forEach(function (d) { n.dataset[d] = v[d]; }); }
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') {
          n.addEventListener(k.slice(2).toLowerCase(), v);
        }
        else if (k in n && k !== 'list' && k !== 'form' && k !== 'size') {
          try { n[k] = v; } catch (e) { n.setAttribute(k, v); }
        }
        else { n.setAttribute(k, v === true ? '' : v); }
      });
    } else if (props !== undefined && props !== null) {
      kids.unshift(props);
    }

    append(n, kids);
    return n;
  }

  function append(parent, kids) {
    kids.forEach(function (c) {
      if (c === null || c === undefined || c === false || c === true) return;
      if (Array.isArray(c)) return append(parent, c);
      parent.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
    });
  }

  function clear(node) { while (node && node.firstChild) node.removeChild(node.firstChild); return node; }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  /* ---------- misc ---------- */

  function uid(prefix) {
    return (prefix || 'i') + '_' +
      Date.now().toString(36) + '_' +
      Math.random().toString(36).slice(2, 9);
  }

  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

  function debounce(fn, ms) {
    var t; return function () {
      var a = arguments, self = this;
      clearTimeout(t); t = setTimeout(function () { fn.apply(self, a); }, ms || 200);
    };
  }

  function num(v, d) { var n = parseFloat(v); return isFinite(n) ? n : (d || 0); }

  function escapeHtml(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function sortBy(arr, fn, dir) {
    var d = dir === 'desc' ? -1 : 1;
    return arr.slice().sort(function (a, b) {
      var x = fn(a), y = fn(b);
      if (x === y) return 0;
      if (x === null || x === undefined || x === '') return 1;
      if (y === null || y === undefined || y === '') return -1;
      return x > y ? d : -d;
    });
  }

  function groupBy(arr, fn) {
    var out = {};
    arr.forEach(function (x) { var k = fn(x); (out[k] = out[k] || []).push(x); });
    return out;
  }

  /* ---------- formatteren (NL) ---------- */

  var fmt = {
    money: function (v) {
      var n = num(v, 0);
      return '€ ' + n.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    },
    money0: function (v) {
      return '€ ' + Math.round(num(v, 0)).toLocaleString('nl-NL');
    },
    kg: function (v) {
      var n = num(v, 0);
      return n.toLocaleString('nl-NL', { minimumFractionDigits: n < 10 ? 2 : 1, maximumFractionDigits: 2 }) + ' kg';
    },
    g: function (v) { return Math.round(num(v, 0) * 1000).toLocaleString('nl-NL') + ' g'; },
    km: function (v) { return Math.round(num(v, 0)).toLocaleString('nl-NL') + ' km'; },
    n: function (v, dec) {
      return num(v, 0).toLocaleString('nl-NL', { minimumFractionDigits: dec || 0, maximumFractionDigits: dec === undefined ? 1 : dec });
    },
    date: function (iso, opts) {
      if (!iso) return '—';
      var d = new Date(iso);
      if (isNaN(d)) return String(iso);
      return d.toLocaleDateString('nl-NL', opts || { day: 'numeric', month: 'short', year: 'numeric' });
    },
    dateShort: function (iso) {
      if (!iso) return '—';
      var d = new Date(iso);
      if (isNaN(d)) return String(iso);
      return d.toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit' });
    },
    weekday: function (iso) {
      if (!iso) return '';
      var d = new Date(iso);
      if (isNaN(d)) return '';
      return d.toLocaleDateString('nl-NL', { weekday: 'short' });
    },
    duration: function (mins) {
      var m = Math.round(num(mins, 0));
      if (!m) return '—';
      var h = Math.floor(m / 60), r = m % 60;
      return (h ? h + ' u ' : '') + (r ? r + ' min' : (h ? '' : '0 min'));
    },
    coord: function (lat, lng) {
      if (lat === null || lat === undefined || lat === '' || isNaN(parseFloat(lat))) return '—';
      return num(lat).toFixed(4) + ', ' + num(lng).toFixed(4);
    },
    relative: function (ts) {
      if (!ts) return 'nooit';
      var s = Math.round((Date.now() - new Date(ts).getTime()) / 1000);
      if (s < 5) return 'zojuist';
      if (s < 60) return s + ' s geleden';
      if (s < 3600) return Math.round(s / 60) + ' min geleden';
      if (s < 86400) return Math.round(s / 3600) + ' u geleden';
      return Math.round(s / 86400) + ' d geleden';
    }
  };

  function todayISO() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function addDaysISO(iso, days) {
    var d = iso ? new Date(iso) : new Date();
    if (isNaN(d)) d = new Date();
    d.setDate(d.getDate() + days);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  /* ---------- geo ---------- */

  function haversine(a, b) {
    if (!a || !b) return 0;
    var R = 6371, toRad = function (x) { return x * Math.PI / 180; };
    var dLat = toRad(b[0] - a[0]), dLon = toRad(b[1] - a[1]);
    var s = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
  }

  /* ---------- tiny emitter ---------- */

  function emitter() {
    var map = {};
    return {
      on: function (evt, fn) {
        (map[evt] = map[evt] || []).push(fn);
        return function () { map[evt] = (map[evt] || []).filter(function (f) { return f !== fn; }); };
      },
      off: function (evt, fn) { map[evt] = (map[evt] || []).filter(function (f) { return f !== fn; }); },
      emit: function (evt) {
        var args = Array.prototype.slice.call(arguments, 1);
        (map[evt] || []).slice().forEach(function (f) {
          try { f.apply(null, args); } catch (e) { console.error('[RT] handler error op "' + evt + '"', e); }
        });
      }
    };
  }

  /* ---------- iconen (inline svg, 24x24 stroke) ---------- */

  var ICONS = {
    map: '<path d="M9 4 3 6.5v13L9 17l6 2.5 6-2.5v-13L15 6.5 9 4Z"/><path d="M9 4v13M15 6.5v13"/>',
    route: '<circle cx="6" cy="19" r="2.5"/><circle cx="18" cy="5" r="2.5"/><path d="M15.5 5H9a3 3 0 0 0 0 6h6a3 3 0 0 1 0 6H8.5"/>',
    activity: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5.5-5.5 2 2-5.5 5.5-2Z"/>',
    tent: '<path d="M12 4 3.5 19h17L12 4Z"/><path d="M12 9.5 7 19M12 9.5 17 19"/>',
    gear: '<path d="M8 7V5.5A2.5 2.5 0 0 1 10.5 3h3A2.5 2.5 0 0 1 16 5.5V7"/><rect x="4" y="7" width="16" height="14" rx="2.5"/><path d="M4 13h16"/>',
    food: '<path d="M6 3v8a2 2 0 0 0 4 0V3M8 11v10"/><path d="M17 3c-1.5 1.5-2 3.5-2 5.5 0 1.4.6 2.5 2 2.5V3ZM17 11v10"/>',
    wallet: '<rect x="3" y="6" width="18" height="14" rx="2.5"/><path d="M3 10h18M16.5 14.5h.01"/><path d="M17 6V4.5a1.5 1.5 0 0 0-1.9-1.45L4.6 5.6"/>',
    book: '<path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H19v18H5.5A1.5 1.5 0 0 1 4 19.5v-15Z"/><path d="M8 3v18"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    trash: '<path d="M4 7h16M10 7V5h4v2M6 7l1 13h10l1-13"/><path d="M10 11v6M14 11v6"/>',
    edit: '<path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3Z"/><path d="M15 6l3 3"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    sync: '<path d="M20 11A8 8 0 0 0 6.3 6.3L4 8.5"/><path d="M4 4v4.5h4.5"/><path d="M4 13a8 8 0 0 0 13.7 4.7L20 15.5"/><path d="M20 20v-4.5h-4.5"/>',
    user: '<circle cx="12" cy="8.5" r="3.5"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7"/>',
    pin: '<path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11Z"/><circle cx="12" cy="10" r="2.5"/>',
    cart: '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2.5 3h2.2l2.4 12.2A1.6 1.6 0 0 0 8.7 16.5h9.1a1.6 1.6 0 0 0 1.6-1.3L21 7H6"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    down: '<path d="m6 9 6 6 6-6"/>',
    up: '<path d="m6 15 6-6 6 6"/>',
    grip: '<circle cx="9" cy="6" r="1.3"/><circle cx="15" cy="6" r="1.3"/><circle cx="9" cy="12" r="1.3"/><circle cx="15" cy="12" r="1.3"/><circle cx="9" cy="18" r="1.3"/><circle cx="15" cy="18" r="1.3"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h8"/>',
    logout: '<path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4"/><path d="M9 16l-4-4 4-4M5 12h10"/>',
    cloud: '<path d="M7 18a4 4 0 0 1-.6-7.95A5.5 5.5 0 0 1 17.5 9.5 3.75 3.75 0 0 1 17 18H7Z"/>',
    rotate: '<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/>',
    star: '<path d="m12 4 2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4L4.2 9.7l5.4-.8L12 4Z"/>'
  };

  function icon(name, size) {
    var p = ICONS[name] || ICONS.activity;
    return '<svg class="ic" viewBox="0 0 24 24" width="' + (size || 18) + '" height="' + (size || 18) +
      '" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + p + '</svg>';
  }

  function iconEl(name, size) {
    var s = document.createElement('span');
    s.className = 'ico';
    s.innerHTML = icon(name, size);
    return s;
  }

  /* ---------- toasts ---------- */

  function toast(msg, kind, ms) {
    var host = $('#toasts');
    if (!host) { host = el('div#toasts'); document.body.appendChild(host); }
    var t = el('div.toast' + (kind ? '.toast--' + kind : ''), {},
      el('span', { html: icon(kind === 'error' ? 'close' : kind === 'ok' ? 'check' : 'sync', 15) }),
      el('span', { text: msg })
    );
    host.appendChild(t);
    setTimeout(function () { t.classList.add('is-out'); }, ms || 2600);
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, (ms || 2600) + 350);
  }

  /* ---------- modal ---------- */

  var openModals = 0;

  function modal(opts) {
    opts = opts || {};
    var resolveFn;
    var promise = new Promise(function (r) { resolveFn = r; });
    var done = false;

    function close(val) {
      if (done) return; done = true;
      document.removeEventListener('keydown', onKey);
      overlay.classList.add('is-closing');
      openModals--;
      if (!openModals) document.body.classList.remove('modal-open');
      setTimeout(function () { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }, 160);
      resolveFn(val);
    }

    function onKey(e) {
      if (e.key === 'Escape') { e.stopPropagation(); close(null); }
    }

    var body = el('div.modal__body');
    append(body, [opts.body]);

    var footer = el('div.modal__footer');
    (opts.buttons || []).forEach(function (b) {
      footer.appendChild(el('button.btn' + (b.primary ? '.btn--primary' : '') + (b.danger ? '.btn--danger' : ''), {
        type: 'button',
        onClick: function () {
          if (b.onClick) { var r = b.onClick(close); if (r === false) return; }
          else close(b.value === undefined ? true : b.value);
        }
      }, b.label));
    });

    var box = el('div.modal' + (opts.wide ? '.modal--wide' : ''), {},
      el('div.modal__head', {},
        el('h3.modal__title', { text: opts.title || '' }),
        el('button.iconbtn', { type: 'button', title: 'Sluiten', html: icon('close', 18), onClick: function () { close(null); } })
      ),
      body,
      (opts.buttons && opts.buttons.length) ? footer : null
    );

    var overlay = el('div.overlay', {
      onMousedown: function (e) { if (e.target === overlay && opts.dismissable !== false) close(null); }
    }, box);

    document.body.appendChild(overlay);
    openModals++;
    document.body.classList.add('modal-open');
    document.addEventListener('keydown', onKey);
    setTimeout(function () {
      var f = box.querySelector('input,textarea,select');
      if (f && !opts.noAutofocus) { try { f.focus(); f.select && f.select(); } catch (e) { } }
    }, 30);

    promise.close = close;
    return promise;
  }

  function confirm(msg, opts) {
    opts = opts || {};
    return modal({
      title: opts.title || 'Weet je het zeker?',
      body: el('p.muted', { text: msg }),
      buttons: [
        { label: opts.cancelLabel || 'Annuleren', value: false },
        { label: opts.okLabel || 'Verwijderen', danger: opts.danger !== false, primary: opts.danger === false, value: true }
      ]
    }).then(function (v) { return v === true; });
  }

  function alertBox(msg, title) {
    return modal({
      title: title || 'Let op',
      body: el('p.muted', { html: msg }),
      buttons: [{ label: 'Oké', primary: true, value: true }]
    });
  }

  /* ---------- formulier-modal ----------
     fields: [{key,label,type,options,placeholder,help,min,max,step,rows,required,width}]
     types: text | number | textarea | select | date | time | check | color | latlng | tags | range | static
  */
  function form(opts) {
    var fields = opts.fields || [];
    var values = Object.assign({}, opts.values || {});
    var inputs = {};
    var grid = el('div.formgrid');

    fields.forEach(function (f) {
      if (f.type === 'divider') {
        grid.appendChild(el('div.form-divider', { text: f.label || '' }));
        return;
      }
      var wrap = el('label.field' + (f.width === 'full' ? '.field--full' : f.width === 'third' ? '.field--third' : ''));
      wrap.appendChild(el('span.field__label', { text: f.label || f.key }));
      var input;

      if (f.type === 'textarea') {
        input = el('textarea.input', { rows: f.rows || 3, placeholder: f.placeholder || '' });
        input.value = values[f.key] || '';
      } else if (f.type === 'select') {
        input = el('select.input');
        (f.options || []).forEach(function (o) {
          var val = typeof o === 'string' ? o : o.value;
          var lab = typeof o === 'string' ? o : o.label;
          input.appendChild(el('option', { value: val, text: lab }));
        });
        input.value = values[f.key] !== undefined && values[f.key] !== null ? values[f.key] : (f.options && f.options.length ? (typeof f.options[0] === 'string' ? f.options[0] : f.options[0].value) : '');
      } else if (f.type === 'check') {
        wrap.className += ' field--check';
        input = el('input', { type: 'checkbox' });
        input.checked = !!values[f.key];
        wrap.insertBefore(input, wrap.firstChild);
      } else if (f.type === 'latlng') {
        wrap.className += ' field--full';
        var la = el('input.input', { type: 'number', step: 'any', placeholder: 'lat (bv. 61.4980)' });
        var lo = el('input.input', { type: 'number', step: 'any', placeholder: 'lng (bv. 7.2290)' });
        la.value = values[f.key] && values[f.key][0] !== null && values[f.key][0] !== undefined ? values[f.key][0] : '';
        lo.value = values[f.key] && values[f.key][1] !== null && values[f.key][1] !== undefined ? values[f.key][1] : '';
        var row = el('div.latlng', {}, la, lo,
          el('button.btn.btn--ghost.btn--sm', {
            type: 'button', title: 'Zoek op naam',
            html: icon('search', 15),
            onClick: function () {
              geoPick().then(function (r) {
                if (r) { la.value = r.lat; lo.value = r.lng; }
              });
            }
          })
        );
        wrap.appendChild(row);
        inputs[f.key] = {
          get: function () {
            if (la.value === '' || lo.value === '') return null;
            return [num(la.value), num(lo.value)];
          }
        };
        if (f.help) wrap.appendChild(el('span.field__help', { text: f.help }));
        grid.appendChild(wrap);
        return;
      } else if (f.type === 'tags') {
        input = el('input.input', { type: 'text', placeholder: f.placeholder || 'komma-gescheiden' });
        input.value = (values[f.key] || []).join(', ');
        inputs[f.key] = { get: function () { return input.value.split(',').map(function (s) { return s.trim(); }).filter(Boolean); } };
      } else if (f.type === 'static') {
        wrap.appendChild(el('div.field__static', { text: values[f.key] || f.value || '' }));
        grid.appendChild(wrap);
        return;
      } else {
        input = el('input.input', {
          type: f.type || 'text',
          placeholder: f.placeholder || '',
          step: f.step || (f.type === 'number' ? 'any' : null),
          min: f.min, max: f.max
        });
        input.value = values[f.key] !== undefined && values[f.key] !== null ? values[f.key] : '';
      }

      if (f.type !== 'check') wrap.appendChild(input);
      if (f.help) wrap.appendChild(el('span.field__help', { text: f.help }));
      if (!inputs[f.key]) {
        inputs[f.key] = {
          get: function () {
            if (f.type === 'check') return input.checked;
            if (f.type === 'number') return input.value === '' ? null : num(input.value);
            return input.value;
          }
        };
      }
      grid.appendChild(wrap);
    });

    function collect() {
      var out = Object.assign({}, values);
      Object.keys(inputs).forEach(function (k) { out[k] = inputs[k].get(); });
      return out;
    }

    var m = modal({
      title: opts.title,
      wide: opts.wide,
      body: el('form', {
        onSubmit: function (e) { e.preventDefault(); m.close(collect()); }
      }, grid, el('button', { type: 'submit', style: { display: 'none' } })),
      buttons: (opts.extraButtons || []).concat([
        { label: 'Annuleren', value: null },
        {
          label: opts.okLabel || 'Opslaan', primary: true,
          onClick: function (close) { close(collect()); }
        }
      ])
    });
    return m;
  }

  /* ---------- geocoding (Nominatim, alleen gehost) ---------- */

  function geocode(q) {
    var url = 'https://nominatim.openstreetmap.org/search?format=json&limit=6&accept-language=nl&q=' + encodeURIComponent(q);
    return fetch(url, { headers: { 'Accept': 'application/json' } })
      .then(function (r) { return r.json(); })
      .catch(function () { return []; });
  }

  function geoPick() {
    var results = el('div.geo-results', {}, el('p.muted.small', { text: 'Typ een plaatsnaam of adres en druk op enter.' }));
    var input = el('input.input', {
      type: 'text', placeholder: 'bv. Geirangerfjord, Noorwegen',
      onKeydown: function (e) { if (e.key === 'Enter') { e.preventDefault(); run(); } }
    });
    var picked = null;
    var m;

    function run() {
      if (!input.value.trim()) return;
      clear(results).appendChild(el('p.muted.small', { text: 'Zoeken…' }));
      geocode(input.value.trim()).then(function (list) {
        clear(results);
        if (!list.length) {
          results.appendChild(el('p.muted.small', { text: 'Niets gevonden. Bij een lokaal geopend bestand (file://) blokkeert de browser deze zoekopdracht — vul de coördinaten dan handmatig in.' }));
          return;
        }
        list.forEach(function (r) {
          results.appendChild(el('button.geo-item', {
            type: 'button',
            onClick: function () { picked = { lat: parseFloat(r.lat), lng: parseFloat(r.lon), name: r.display_name }; m.close(picked); }
          },
            el('strong', { text: (r.display_name || '').split(',')[0] }),
            el('span.muted.small', { text: r.display_name })
          ));
        });
      });
    }

    m = modal({
      title: 'Locatie zoeken',
      body: el('div', {},
        el('div.row', {}, input, el('button.btn.btn--primary', { type: 'button', text: 'Zoek', onClick: run })),
        results,
        el('p.field__help', { text: 'Data © OpenStreetMap-bijdragers via Nominatim.' })
      )
    });
    return m;
  }

  /* ---------- clipboard ---------- */

  function copy(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(function () { toast('Gekopieerd', 'ok'); })
        .catch(function () { fallbackCopy(text); });
    }
    fallbackCopy(text);
    return Promise.resolve();
  }

  function fallbackCopy(text) {
    var ta = el('textarea', { style: { position: 'fixed', opacity: '0' } });
    ta.value = text;
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); toast('Gekopieerd', 'ok'); } catch (e) { toast('Kopiëren mislukt', 'error'); }
    document.body.removeChild(ta);
  }

  /* ---------- afbeeldingen verkleinen ---------- */

  function shrinkImage(file, maxPx, quality) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onerror = reject;
      fr.onload = function () {
        var img = new Image();
        img.onerror = reject;
        img.onload = function () {
          var max = maxPx || 900;
          var scale = Math.min(1, max / Math.max(img.width, img.height));
          var w = Math.round(img.width * scale), h = Math.round(img.height * scale);
          var c = document.createElement('canvas');
          c.width = w; c.height = h;
          c.getContext('2d').drawImage(img, 0, 0, w, h);
          resolve(c.toDataURL('image/jpeg', quality || 0.72));
        };
        img.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }

  /* ---------- download ---------- */

  function download(filename, text, mime) {
    var blob = new Blob([text], { type: mime || 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = el('a', { href: url, download: filename });
    document.body.appendChild(a); a.click();
    setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 300);
  }

  function pickFile(accept) {
    return new Promise(function (resolve) {
      var inp = el('input', { type: 'file', accept: accept || '', style: { display: 'none' } });
      inp.addEventListener('change', function () { resolve(inp.files && inp.files[0] ? inp.files[0] : null); document.body.removeChild(inp); });
      document.body.appendChild(inp);
      inp.click();
    });
  }

  function readText(file) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(fr.result); };
      fr.onerror = reject;
      fr.readAsText(file);
    });
  }

  /* ---------- export ---------- */

  Object.assign(RT, {
    el: el, append: append, clear: clear, $: $, $$: $$,
    uid: uid, clamp: clamp, debounce: debounce, num: num, escapeHtml: escapeHtml,
    sortBy: sortBy, groupBy: groupBy,
    fmt: fmt, todayISO: todayISO, addDaysISO: addDaysISO, haversine: haversine,
    emitter: emitter, icon: icon, iconEl: iconEl,
    toast: toast, modal: modal, confirm: confirm, alert: alertBox, form: form,
    geocode: geocode, geoPick: geoPick, copy: copy,
    shrinkImage: shrinkImage, download: download, pickFile: pickFile, readText: readText
  });

})(window.RT);
