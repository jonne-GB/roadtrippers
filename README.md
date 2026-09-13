# Roadtrippers

Roadtrip-planner voor twee personen. Acht tabs: **Kaart · Route · Activiteiten · Campsites · Gear · Eten · Budget · Logboek** — met een gear-tab die werkt als een Escape-from-Tarkov-inventory, maar dan voor twee rugzakken en een kofferbak.

Geen build-stap, geen Node, geen npm. Het is gewone HTML/CSS/JS die je kunt dubbelklikken. Voor inloggen en sync over al je apparaten hangt er een Neon-database (Postgres) onder.

---

## 1. Meteen proberen (lokaal, zonder account)

Dubbelklik **`index.html`**. Klaar.

In deze modus staat alles in de localStorage van díe browser. Prima om rond te klikken, maar je reisgenoot ziet niets en op je telefoon staat niets. Via *Reis-menu → Exporteren* haal je je data eruit als JSON, en later importeer je die in je account.

Wat niet werkt vanaf `file://`:

- **Inloggen** — daarvoor moet de app via https draaien (stap 3).
- **Locatie zoeken** op naam — de browser blokkeert die netwerkaanroep vanaf een lokaal bestand. Coördinaten handmatig invullen kan wel.
- De **achtergrondkaart** heeft internet nodig; markers en route tekenen ook zonder.

---

## 2. Neon instellen (inloggen + sync)

Je hebt een gratis Neon-account nodig: <https://console.neon.tech>.

### 2.1 Database klaarzetten

1. Maak een project aan (of gebruik een bestaand).
2. Open **SQL Editor**.
3. Plak de complete inhoud van **`sql/schema.sql`** en voer het uit.

Dat maakt drie tabellen (`trips`, `trip_members`, `trip_items`), zet **Row Level Security** aan en maakt de functies `create_trip()`, `join_trip()` en `leave_trip()`. RLS is niet optioneel: het is precies wat het veilig maakt dat je browser rechtstreeks met de database praat. Iedereen ziet alleen de reizen waar hij lid van is.

Onderaan het script staat een controle-query. Je hoort drie regels te zien met `rowsecurity = true`.

### 2.2 Auth aanzetten

1. Ga in de Neon Console naar **Auth**.
2. Zet het aan en kies e-mail + wachtwoord als inlogmethode.
3. Kopieer de **Auth URL** (iets als `https://<project-id>.auth.<region>.neon.tech`).

### 2.3 Data API aanzetten

1. Ga naar **Data API** (onder je database).
2. Klik **Enable Data API**.
3. Kopieer de **API URL** (iets als `https://<endpoint>.apirest.<region>.aws.neon.tech/rest/v1`).

### 2.4 `config.js` invullen

```js
window.RT_CONFIG = {
  authUrl:    'https://jouw-project.auth.eu-central-1.neon.tech',
  dataApiUrl: 'https://jouw-endpoint.apirest.eu-central-1.aws.neon.tech/rest/v1',
  sdkUrl:     'https://esm.sh/@neondatabase/neon-js@latest',
  pollInterval: 12000,
  forceLocal: false
};
```

Deze twee URL's zijn publieke endpoints — ze horen in de frontend te staan. Wat je **nooit** in `config.js` zet, is je Postgres-connectiestring of een API-key: die hoort daar niet en is er ook niet voor nodig.

---

## 3. Online zetten

Inloggen werkt alleen via `https://`. Je hoeft niets te builden — je uploadt gewoon de map. Geen van deze opties vraagt om Node of een terminal.

**Cloudflare Pages (aanbevolen, gratis)**

1. <https://dash.cloudflare.com> → **Workers & Pages** → **Create** → **Pages** → **Upload assets**.
2. Sleep de hele projectmap erin (met `index.html` in de root).
3. Je krijgt een URL als `https://roadtrippers.pages.dev`.
4. Volgende keer bijwerken: nieuwe upload op hetzelfde project.

**Netlify Drop** — <https://app.netlify.com/drop>, map erin slepen, klaar.

**GitHub Pages** — werkt ook, maar je hebt er git voor nodig (staat nu niet op deze machine).

Zet die URL daarna op je telefoon op het startscherm; de app is als PWA-achtige pagina gewoon fullscreen bruikbaar.

---

## 4. Met z'n tweeën

1. Jij logt in en maakt een reis aan. Je wordt automatisch **persoon A**.
2. Klik op de reisnaam in de balk → **Uitnodigingscode delen**. Je krijgt een code van 6 tekens.
3. Je reisgenoot maakt een eigen account, kiest **Deelnemen met een code** en vult hem in. Die wordt **persoon B**.
4. Vanaf dan zien jullie dezelfde data. Wijzigingen worden meteen weggeschreven en elke ~12 seconden opgehaald.

Je eigen naam en die van je reisgenoot pas je aan via *Reis-menu → Namen & draagvermogen*. Die namen komen overal terug: in de gear-panelen, bij "wie kookt" en in de budgetverrekening.

**Offline onderweg?** Alles blijft gewoon werken — wijzigingen gaan lokaal in de wachtrij en worden verstuurd zodra je weer bereik hebt. Het bolletje links van je naam in de balk vertelt je de status.

---

## 5. De gear-tab

Twee operator-panelen naast elkaar, elk met uitrustingsslots, een gewichtsbalk en eigen tassen. Daaronder de gedeelde kofferbak en een stash voor wat nog niet ingedeeld is.

| Actie | Hoe |
|---|---|
| Verplaatsen | Sleep het item naar een ander vak, tas, slot of de stash |
| Draaien tijdens het slepen | Toets **R** |
| Direct draaien | Rechtermuisknop op het item |
| Details bekijken | Klik erop |
| Ingepakt afvinken | Dubbelklik (of via het detailvenster) |
| Slepen annuleren | **Esc** |
| Automatisch inpakken | Knop **Sorteren** (grootste items eerst, rest naar de stash) |

Werkt ook op touch — slepen met je vinger doet hetzelfde.

**Gewicht telt naar locatie, niet naar eigenaar.** Wat in jouw rugzak of heuptas zit of aan jouw slots hangt, telt mee voor jouw draaggewicht. Zodra je iets in de kofferbak legt, telt het voor niemand meer mee. Dat maakt het slepen een echte beslissing in plaats van een administratie. De balk kleurt oranje boven 80% en rood boven je draagvermogen.

Containers zijn niet vast: via het icoontje rechts in de kop van een tas pas je naam en rastergrootte aan, of je maakt er een nieuwe bij (dakkoffer, fietstas, wat je wilt). Items die door een verkleining niet meer passen gaan automatisch naar de stash in plaats van te verdwijnen.

---

## 6. De andere tabs kort

- **Kaart** — klik ergens en voeg daar een activiteit, camping, route-stop of eigen punt toe. Route-stops worden genummerd en met een stippellijn verbonden. Lagen aan/uit rechtsboven.
- **Route** — de ruggengraat: dagen met datum, van/naar, km en rijtijd. Alles in andere tabs kun je aan een dag koppelen, en die dag toont dan waar je slaapt, wat je doet en wat je eet.
- **Activiteiten** — wensenlijst die doorgroeit naar gepland en gedaan. Per activiteit kun je vastleggen wie het wil.
- **Campsites** — prijs per nacht, aantal nachten, voorzieningen, beoordeling en of het geboekt is.
- **Eten** — maaltijden per dag, plus een boodschappenlijst. *Uit maaltijden* trekt alle ingrediënten in één klik naar de lijst, zonder dubbelingen.
- **Budget** — uitgaven met wie betaalde en hoe het gedeeld wordt. Onderaan staat precies wie wie nog wat schuldig is, en met één knop boek je de verrekening weg.
- **Logboek** — dagboek met weer, kilometerstand en foto's. Foto's worden in de browser verkleind naar ~1000px voordat ze opgeslagen worden.

Sneltoetsen **1** t/m **8** springen naar de tabs.

---

## 7. Bestanden

```
index.html            de app
config.js             Neon-instellingen (leeg = lokale modus)
css/
  base.css            shell, tabs, knoppen, formulieren, modals
  views.css           stijl per tab (kaart, route, eten, budget, logboek)
  tarkov.css          de inventory-skin
js/
  core.js             DOM-helpers, formatteren, modals, formulieren
  store.js            offline-first datalaag + sync-engine
  cloud.js            Neon Auth + Data API
  model.js            domeinmodel, categorieën, voorbeelddata
  ui.js               app-shell, tabbeheer, inlogscherm, reis-kiezer
  tab-*.js            één bestand per tab
  app.js              opstarten
sql/schema.sql        database + RLS + RPC's
dev/
  selftest.html       51 controles over datalaag, model en alle tabs
  preview.html        app met een volle voorbeeld-inventory (?tab=gear)
```

Scripts worden als klassieke `<script>`-tags geladen in de volgorde die in `index.html` staat. De volgorde van de `tab-*.js`-bestanden bepaalt de volgorde van de tabs. Een tab toevoegen = een bestand maken dat zichzelf registreert met `RT.ui.register({...})` en het in `index.html` zetten.

Alle reisdata gaat als JSON-record de database in (`trip_items.data`), met `kind` als soort. Daardoor verandert het databaseschema niet mee als de app groeit — een nieuw veld toevoegen vraagt geen migratie.

---

## 8. Ontwikkelen

`dev/selftest.html` opent in je browser en draait meteen 51 controles: datalaag, import/export, gewichtsberekening, botsingsdetectie in het raster, de budgetverrekening, en of elke tab rendert. Groen = goed.

`dev/preview.html?tab=gear` vult de app met een volle inventory zodat je de gear-tab met echte data ziet, en waarschuwt in de paginatitel als items elkaar overlappen.

Beide pagina's raken je echte reisdata niet aan.

---

## 9. Als er iets misgaat

**"Geen toegang (401/403)"** — je bent uitgelogd, of `sql/schema.sql` is niet (helemaal) gedraaid. Controleer in de SQL Editor of de controle-query onderaan het script drie keer `true` geeft.

**Inlogscherm zegt dat de app vanaf een bestand draait** — klopt: log je in, dan moet de app via https draaien. Zie stap 3.

**Kaarttegels blijven leeg** — geen internet, of een netwerk dat `tile.openstreetmap.org` blokkeert. Markers en route werken dan nog gewoon.

**Wijzigingen van je reisgenoot komen niet door** — klik op het status-bolletje in de balk om nu te synchroniseren. Bij een conflict wint de laatste bewerking per item, dus jullie kunnen tegelijk in verschillende tabs werken zonder elkaar te overschrijven.

**Lokaal opslaan mislukt** — localStorage zit vol, meestal door foto's in het logboek. Exporteer, wis oude foto's, of ga over op de Neon-modus.

---

## Attributie

Kaartdata © OpenStreetMap-bijdragers. Kaartweergave via [Leaflet](https://leafletjs.com). Zoeken op plaatsnaam via Nominatim.
