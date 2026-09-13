/* ============================================================
   config.js — Neon-instellingen
   ------------------------------------------------------------
   Laat alles leeg om de app puur lokaal te gebruiken
   (data in localStorage van deze browser, geen login).

   Vul dit in om inloggen + sync over al je apparaten aan te
   zetten. Zie README.md voor de stap-voor-stap setup.
   ============================================================ */
window.RT_CONFIG = {

  // Neon Console → Auth → "Auth URL"
  // ziet eruit als: https://<project-id>.auth.<region>.neon.tech
  authUrl: 'https://ep-round-math-b1gixgh7.neonauth.c-5.eu-central-1.aws.neon.tech/neondb/auth',

  // Neon Console → Data API → "API URL"
  // ziet eruit als: https://<endpoint>.apirest.<region>.aws.neon.tech/rest/v1
  dataApiUrl: 'https://ep-round-math-b1gixgh7.apirest.c-5.eu-central-1.aws.neon.tech/neondb/rest/v1',

  // CDN waar de Neon JS-SDK vandaan komt (geen npm/build nodig).
  sdkUrl: 'https://esm.sh/@neondatabase/neon-js@latest',

  // Hoe vaak er gepolld wordt op wijzigingen van je reisgenoot (ms).
  pollInterval: 12000,

  // Zet op true om altijd in lokale modus te starten (handig bij testen).
  forceLocal: false
};
