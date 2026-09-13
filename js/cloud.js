/* ============================================================
   cloud.js — Neon Auth (inloggen) + Neon Data API (sync)
   ------------------------------------------------------------
   Geen build-stap: de SDK wordt als ES-module van een CDN
   geladen met een dynamische import(). Dat kan alleen als de
   pagina via http(s) draait — op file:// valt de app
   automatisch terug op lokale modus.
   ============================================================ */
(function (RT) {
  'use strict';

  var CFG = window.RT_CONFIG || {};
  var cloud = {
    ready: false,
    user: null,
    auth: null,
    error: null
  };

  /* ---------- beschikbaarheid ---------- */

  cloud.configured = function () {
    return !!(CFG.authUrl && CFG.dataApiUrl) && !CFG.forceLocal;
  };

  cloud.servedOverHttp = function () {
    return location.protocol === 'http:' || location.protocol === 'https:';
  };

  cloud.available = function () {
    return cloud.configured() && cloud.servedOverHttp();
  };

  cloud.unavailableReason = function () {
    if (CFG.forceLocal) return 'Lokale modus staat aan in config.js (forceLocal).';
    if (!CFG.authUrl || !CFG.dataApiUrl) return 'Neon is nog niet ingesteld — vul authUrl en dataApiUrl in config.js in (zie README.md).';
    if (!cloud.servedOverHttp()) return 'De app draait vanaf een bestand (file://). Inloggen werkt alleen als de app gehost draait via https.';
    return null;
  };

  /* ---------- SDK laden ---------- */

  var sdkPromise = null;

  function loadSdk() {
    if (sdkPromise) return sdkPromise;
    var base = CFG.sdkUrl || 'https://esm.sh/@neondatabase/neon-js@latest';
    sdkPromise = import(/* webpackIgnore: true */ base + '/auth')
      .catch(function () { return import(/* webpackIgnore: true */ base); })
      .catch(function () { return import(/* webpackIgnore: true */ 'https://esm.sh/@neondatabase/auth@latest'); })
      .then(function (mod) {
        var create = mod.createAuthClient || (mod.default && mod.default.createAuthClient);
        if (typeof create !== 'function') throw new Error('createAuthClient niet gevonden in de Neon SDK');
        return create;
      });
    return sdkPromise;
  }

  /* ---------- init ---------- */

  cloud.init = function () {
    if (!cloud.available()) {
      cloud.error = cloud.unavailableReason();
      return Promise.resolve(null);
    }
    return loadSdk().then(function (createAuthClient) {
      cloud.auth = createAuthClient(CFG.authUrl);
      cloud.ready = true;
      return cloud.refreshUser();
    }).catch(function (e) {
      console.error('[cloud] init mislukt', e);
      cloud.error = 'Kon de Neon-SDK niet laden: ' + (e && e.message ? e.message : e);
      return null;
    });
  };

  cloud.refreshUser = function () {
    if (!cloud.auth) return Promise.resolve(null);
    return Promise.resolve(cloud.auth.getSession()).then(function (res) {
      var s = res && (res.data || res);
      var u = s && (s.user || (s.session && s.session.user)) || null;
      cloud.user = u ? {
        id: u.id || u.userId || u.sub,
        email: u.email,
        name: u.name || u.displayName || (u.email || '').split('@')[0]
      } : null;
      return cloud.user;
    }).catch(function () { cloud.user = null; return null; });
  };

  /* ---------- auth-acties ---------- */

  function unwrap(res) {
    if (res && res.error) throw new Error(translateAuthError(res.error));
    return res;
  }

  // De SDK geeft fouten soms terug als { error }, soms gooit hij ze.
  // Beide paden moeten door translateAuthError heen, anders krijg je
  // de rauwe Engelse tekst ("Invalid origin") in het inlogscherm.
  function guard(promise) {
    return Promise.resolve(promise).then(unwrap, function (err) {
      throw new Error(translateAuthError(err));
    });
  }

  function translateAuthError(err) {
    var msg = (err && (err.message || err.code || err)) + '';
    if (/invalid\s*origin/i.test(msg)) {
      return 'Neon vertrouwt dit adres nog niet. Voeg "' + location.origin +
        '" toe in de Neon Console onder Auth → Configuration → Domains ' +
        '(mét protocol, zonder slash aan het eind) en probeer het opnieuw.';
    }
    if (/invalid.*(credential|password|email)/i.test(msg)) return 'E-mailadres of wachtwoord klopt niet.';
    if (/already|exists|taken/i.test(msg)) return 'Er bestaat al een account met dit e-mailadres.';
    if (/password/i.test(msg) && /short|length|weak/i.test(msg)) return 'Wachtwoord is te kort (minimaal 8 tekens).';
    if (/verif/i.test(msg)) return 'Bevestig eerst je e-mailadres via de mail die we gestuurd hebben.';
    if (/network|fetch/i.test(msg)) return 'Geen verbinding met Neon. Ben je online?';
    return msg;
  }

  cloud.translateAuthError = translateAuthError;

  cloud.signUp = function (email, password, name) {
    return guard(cloud.auth.signUp.email({ email: email, password: password, name: name || email.split('@')[0] }))
      .then(cloud.refreshUser);
  };

  cloud.signIn = function (email, password) {
    return guard(cloud.auth.signIn.email({ email: email, password: password }))
      .then(cloud.refreshUser);
  };

  cloud.signOut = function () {
    if (!cloud.auth) return Promise.resolve();
    return Promise.resolve(cloud.auth.signOut()).catch(function () { })
      .then(function () { cloud.user = null; tokenCache = null; });
  };

  /* ---------- JWT ---------- */

  var tokenCache = null;

  function token() {
    if (tokenCache && tokenCache.exp > Date.now() + 5000) return Promise.resolve(tokenCache.value);
    if (!cloud.auth) return Promise.reject(new Error('Niet ingelogd'));
    var p = cloud.auth.getJWTToken
      ? cloud.auth.getJWTToken()
      : Promise.resolve(cloud.auth.getSession()).then(function (r) {
        var s = r && (r.data || r);
        return (s && (s.token || s.accessToken || (s.session && (s.session.token || s.session.accessToken)))) || null;
      });
    return Promise.resolve(p).then(function (t) {
      var val = typeof t === 'string' ? t : (t && (t.token || t.value || t.jwt));
      if (!val) throw new Error('Geen geldige sessie — log opnieuw in');
      tokenCache = { value: val, exp: Date.now() + 50000 };
      return val;
    });
  }

  /* ---------- Data API (PostgREST) ---------- */

  function apiBase() {
    return String(CFG.dataApiUrl || '').replace(/\/+$/, '');
  }

  function req(path, opts) {
    opts = opts || {};
    return token().then(function (jwt) {
      var headers = Object.assign({
        'Authorization': 'Bearer ' + jwt,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }, opts.headers || {});
      return fetch(apiBase() + path, {
        method: opts.method || 'GET',
        headers: headers,
        body: opts.body ? JSON.stringify(opts.body) : undefined
      });
    }).then(function (res) {
      if (res.status === 401 || res.status === 403) {
        tokenCache = null;
        return res.text().then(function (t) {
          throw new Error('Geen toegang (' + res.status + '). Controleer je RLS-policies. ' + shorten(t));
        });
      }
      if (res.status === 404) {
        return res.text().then(function (t) { throw new Error(explain404(t, path)); });
      }
      if (!res.ok) {
        return res.text().then(function (t) { throw new Error('Neon ' + res.status + ': ' + shorten(t)); });
      }
      if (res.status === 204) return null;
      var ct = res.headers.get('content-type') || '';
      return ct.indexOf('json') >= 0 ? res.json() : res.text();
    });
  }

  // Een 404 van PostgREST betekent bijna nooit "server niet gevonden",
  // maar "dit ding bestaat niet in de database". De foutcode in de body
  // zegt precies welk ding, dus die vertalen we naar een concrete stap.
  function explain404(body, path) {
    var code = '';
    try { code = (JSON.parse(body) || {}).code || ''; } catch (e) { }
    var what = String(path || '').replace(/^\//, '').split('?')[0];

    if (code === 'PGRST205' || /find the table/i.test(body)) {
      return 'De tabel "' + what + '" bestaat niet in deze database. Voer sql/schema.sql ' +
        'uit in de Neon SQL Editor, op dezelfde branch als waar de Data API op staat. ' + shorten(body);
    }
    if (code === 'PGRST202' || /find the function/i.test(body)) {
      return 'De databasefunctie voor "' + what + '" ontbreekt. Voer sql/schema.sql opnieuw ' +
        'uit — het onderste deel maakt create_trip, join_trip en leave_trip aan. ' + shorten(body);
    }
    if (!String(body || '').trim()) {
      return 'Neon 404 op ' + apiBase() + '/' + what + ' — dat adres bestaat niet. ' +
        'Controleer dataApiUrl in config.js: die hoort te eindigen op /rest/v1 en het stuk ' +
        'ervoor is je databasenaam. Kopieer hem uit Neon Console → Data API.';
    }
    return 'Neon 404: ' + shorten(body);
  }

  function shorten(t) {
    t = String(t || '').replace(/\s+/g, ' ').trim();
    return t.length > 220 ? t.slice(0, 220) + '…' : t;
  }

  cloud.req = req;

  /* ---------- trips ---------- */

  cloud.listTrips = function () {
    return req('/trips?select=id,name,join_code,created_at&order=created_at.asc');
  };

  cloud.createTrip = function (name) {
    return req('/rpc/create_trip', { method: 'POST', body: { p_name: name } })
      .then(function (r) { return Array.isArray(r) ? r[0] : r; });
  };

  cloud.joinTrip = function (code) {
    return req('/rpc/join_trip', { method: 'POST', body: { p_code: String(code || '').trim().toUpperCase() } })
      .then(function (r) {
        var t = Array.isArray(r) ? r[0] : r;
        if (!t || !t.id) throw new Error('Geen reis gevonden met die code.');
        return t;
      });
  };

  cloud.members = function (tripId) {
    return req('/trip_members?trip_id=eq.' + encodeURIComponent(tripId) + '&select=user_id,display_name,slot,joined_at');
  };

  cloud.setMemberSlot = function (tripId, userId, slot) {
    return req('/trip_members?trip_id=eq.' + encodeURIComponent(tripId) + '&user_id=eq.' + encodeURIComponent(userId),
      { method: 'PATCH', headers: { 'Prefer': 'return=minimal' }, body: { slot: slot } });
  };

  cloud.leaveTrip = function (tripId) {
    return req('/rpc/leave_trip', { method: 'POST', body: { p_trip: tripId } });
  };

  /* ---------- sync-adapter voor de store ---------- */

  cloud.adapter = function (tripId) {
    return {
      pull: function (sinceIso) {
        var q = '/trip_items?trip_id=eq.' + encodeURIComponent(tripId) +
          '&select=id,kind,data,deleted,updated_at&order=updated_at.asc';
        if (sinceIso) q += '&updated_at=gt.' + encodeURIComponent(sinceIso);
        return req(q);
      },
      push: function (rows) {
        if (!rows.length) return Promise.resolve();
        var payload = rows.map(function (r) {
          return {
            id: r.id, trip_id: tripId, kind: r.kind,
            data: r.data, deleted: !!r.deleted, updated_at: r.updated_at
          };
        });
        // upsert in stukken van 200
        var chunks = [];
        for (var i = 0; i < payload.length; i += 200) chunks.push(payload.slice(i, i + 200));
        return chunks.reduce(function (p, chunk) {
          return p.then(function () {
            return req('/trip_items', {
              method: 'POST',
              headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
              body: chunk
            });
          });
        }, Promise.resolve());
      }
    };
  };

  RT.cloud = cloud;
})(window.RT);
