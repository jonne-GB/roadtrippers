/* ============================================================
   app.js — opstarten
   ============================================================ */
(function (RT) {
  'use strict';

  function lastTrip() {
    try { return JSON.parse(localStorage.getItem('roadtrippers.lastTrip') || 'null'); }
    catch (e) { return null; }
  }

  function boot() {
    if (!RT.cloud.configured()) {
      // Geen Neon ingesteld: meteen lokaal aan de slag.
      RT.ui.startLocal();
      return;
    }

    RT.cloud.init().then(function () {
      if (RT.cloud.user) {
        var t = lastTrip();
        if (t && t.id) RT.ui.openTrip(t);
        else RT.ui.tripPicker();
      } else {
        RT.ui.gate();
      }
    }).catch(function (e) {
      console.error('[app] opstarten mislukt', e);
      RT.ui.gate();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  // Laatste redmiddel: laat fouten zien in plaats van een wit scherm.
  window.addEventListener('error', function (e) {
    if (!document.querySelector('#app').children.length) {
      document.querySelector('#app').innerHTML =
        '<div class="gate"><div class="gate__box"><h1 class="gate__title">Er ging iets mis</h1>' +
        '<p class="gate__sub">' + RT.escapeHtml(e.message || 'Onbekende fout') + '</p>' +
        '<p class="field__help">Open de console (F12) voor details.</p></div></div>';
    }
  });

})(window.RT);
