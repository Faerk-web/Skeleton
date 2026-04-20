# Skeleton – Initiativstyring

Et WordPress-plugin + Single Page Application til styring af initiativer for frivillige i Skeleton-organisationen.

## Mappestruktur

```
wp-content/plugins/skeleton-team-app/
├── skeleton-team-app.php   ← Hoved-plugin-fil (REST, shortcode, roller, DB)
└── assets/
    ├── styles.css          ← Al CSS (migreret fra index.html)
    └── app.js              ← Al JavaScript inkl. REST-klient og polling
```

`index.html` i roden er den originale standalone-version og bruges som reference/preview.

---

## Krav

| Krav | Version |
|------|---------|
| WordPress | 6.0+ |
| PHP | 7.4+ |
| MySQL/MariaDB | 5.6+ / 10.2+ |

---

## Installation (lokal udvikling / staging)

### 1. Klon repo og placer plugin

```bash
git clone https://github.com/Faerk-web/Skeleton.git
# Kopier (eller symlink) plugin-mappen til dit WP-installation:
cp -r Skeleton/wp-content/plugins/skeleton-team-app /path/to/wordpress/wp-content/plugins/
```

Alternativt med symlink (anbefales til lokal udvikling):

```bash
ln -s /full/path/to/Skeleton/wp-content/plugins/skeleton-team-app \
      /path/to/wordpress/wp-content/plugins/skeleton-team-app
```

### 2. Aktivér plugin

Log ind på wp-admin og aktivér **Skeleton Team App** under *Plugins → Installerede plugins*, **eller** kør:

```bash
wp plugin activate skeleton-team-app
```

Aktiveringen opretter automatisk:
- To databasetabeller: `wp_skeleton_workspaces` og `wp_skeleton_initiatives`
- Brugerrollen **Frivillig** (`volunteer`)
- Eksempel-data: 2 arbejdsområder med 3 initiativer i alt

### 3. Opret hold-side

1. Opret en ny side i WordPress (fx med URL-slug `/team/`).
2. Tilføj shortcode'et i sidens indhold:
   ```
   [skeleton_app]
   ```
3. Publicér siden.
4. Hold-siden er nu beskyttet: ikke-indloggede brugere sendes til login-siden.

### 4. Opret frivillig-bruger

```bash
wp user create frivillig1 frivillig1@example.com \
  --role=volunteer \
  --user_pass=SikkertKodeord123!
```

Eller gøre det via wp-admin under *Brugere → Tilføj ny*.

---

## REST API

Alle endpoints kræver et gyldigt WP-nonce i headeren `X-WP-Nonce`.
Base-URL: `https://ditdomæne.dk/wp-json/skeleton/v1/`

| Metode | Endpoint | Beskrivelse |
|--------|----------|-------------|
| GET | `/workspaces` | Returnerer liste af arbejdsområder med initiativer nested |
| POST | `/workspaces` | Opret nyt arbejdsområde |
| GET | `/initiatives?workspaceId={id}` | Hent initiativer (filtreret på workspace) |
| POST | `/initiatives` | Opret nyt initiativ |
| PATCH | `/initiatives/{id}` | Delvis opdatering (status, titel, felter m.fl.) |
| DELETE | `/initiatives/{id}` | Slet initiativ |

### Eksempel – opret arbejdsområde

```bash
curl -X POST https://ditdomæne.dk/wp-json/skeleton/v1/workspaces \
  -H "X-WP-Nonce: <nonce>" \
  -H "Content-Type: application/json" \
  -d '{"icon":"🏆","name":"Ny kampagne","description":"Beskrivelse her"}'
```

---

## Rollemodel

| Rolle | Adgang til /team/ | Adgang til wp-admin |
|-------|------------------|---------------------|
| Administrator | ✅ | ✅ |
| Editor | ✅ | ✅ |
| Volunteer (Frivillig) | ✅ | ❌ (redirect til /team/) |
| Subscriber / ikke-logget ind | ❌ (redirect til login) | ❌ |

---

## Polling

Appen henter automatisk friske data fra serveren hvert **30. sekund**.
Polling springer over, mens en modal (nyt arbejdsområde / nyt initiativ) er åben, så ufærdige formularer ikke overskrives.

---

## Databasetabeller

### `wp_skeleton_workspaces`

| Kolonne | Type | Beskrivelse |
|---------|------|-------------|
| id | BIGINT UNSIGNED AUTO_INCREMENT | Primærnøgle |
| icon | VARCHAR(16) | Emoji-ikon |
| name | VARCHAR(255) | Navn |
| description | TEXT | Beskrivelse |
| created_at | DATETIME | Oprettelsestidspunkt |
| updated_at | DATETIME | Senest opdateret |

### `wp_skeleton_initiatives`

| Kolonne | Type | Beskrivelse |
|---------|------|-------------|
| id | BIGINT UNSIGNED AUTO_INCREMENT | Primærnøgle |
| workspace_id | BIGINT UNSIGNED | Relation til workspace |
| title | VARCHAR(255) | Titel |
| status | VARCHAR(32) | ide / planlagt / igang / afsluttet |
| short_desc | TEXT | Kort beskrivelse |
| details | TEXT | Lang beskrivelse |
| impact | TEXT | Forventet påvirkning |
| roi | TINYINT UNSIGNED | ROI-score 0–10 |
| cost | INT UNSIGNED | Estimeret pris (DKK) |
| impl | VARCHAR(16) | Vanskelighed: lav / middel / høj |
| effect | VARCHAR(16) | Effekt: lav / middel / høj |
| deadline | DATE | Deadline (nullable) |
| time_horizon | VARCHAR(16) | dage / uger / måneder / år |
| audiences_json | TEXT | JSON-array af målgrupper |
| created_at | DATETIME | Oprettelsestidspunkt |
| updated_at | DATETIME | Senest opdateret |

---

## Lokal test med Local by Flywheel / XAMPP

1. Installer WordPress i Local / XAMPP.
2. Følg installationstrinene ovenfor.
3. Brug `wp user create` til at oprette testbrugere.
4. Åbn `https://dit-lokale-site.local/team/` i browseren.

## Bidrag

Pull requests og issues er velkomne på [GitHub](https://github.com/Faerk-web/Skeleton).
