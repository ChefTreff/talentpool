# Runbook · Partner-Logos auf die Website (Sanity, Welle 3 A11) — Kontrakt v2

Freigegebene Partner-Logos (Pflichten `logo_vector` = SVG, `logo_png` = PNG, beide vom Team akzeptiert) werden als Dokumente vom Typ **`portalPartnerLogo`** in das Sanity-Projekt der Website geschrieben — genau ein Dokument je Organisation (`_id = portalPartnerLogo-<org_id>`), erneute Freigabe ersetzt es. Sonst fasst das Portal in Sanity nichts an (Entscheidungslog 11.09., Schutz der Website-Baustelle). **Kontrakt v2 (15.09.2026)** nimmt die vier Bitten des Website-Teams auf: veröffentlicht statt Entwurf, `logoTransparent`, `sponsoringRank`, feste Wertelisten.

## Schutzregeln
1. **Bis zur Freigabe durch das Web-Team** nur ein Viewer-Token (`SANITY_API_TOKEN` mit Rolle Viewer): Lesen und Trockenlauf funktionieren, Schreiben scheitert mit 401/403 — gewollt.
2. Für den Echtlauf ein Editor-Token. Dataset-genaue Rollen gibt es nur im Enterprise-Plan; der Schutz liegt im Code: nur `createOrReplace` auf `portalPartnerLogo-<org_id>`, keine Patches an fremden Dokumenten, keine Schema-Änderungen, kein Löschen. Lesend zählt das Portal nur den eigenen Dokumenttyp.
3. **Trockenlauf ist Standard.** Er nutzt `dryRun=true` der Sanity-API: die Mutationen werden serverseitig geprüft, nichts wird geschrieben, keine Assets hochgeladen.
4. Das Web-Team nimmt den Dokumenttyp ins Studio-Schema auf, sobald die Logo-Wand auf Portaldaten umgestellt wird; vorher sind die Dokumente unsichtbar und stören nichts.
5. **Veröffentlicht, nicht als Entwurf:** die ID trägt kein `drafts.`-Präfix — und **keinen Punkt**. In Sanity gilt jede ID mit Punkt als Pfad (wie `drafts.`), und Dokumente in Pfaden sind nur mit Token lesbar; die statisch gebaute Website liest ohne Token. Deshalb Bindestrich (`portalPartnerLogo-<org_id>`), nicht mehr `portalPartnerLogo.<org_id>` aus v1.

## Kontrakt für das Web-Team (Studio-Schema)
```ts
defineType({
  name: "portalPartnerLogo", title: "Partner-Logo (Portal)", type: "document",
  readOnly: true, // Quelle ist das Portal
  fields: [
    { name: "orgId", type: "string" },            // Organisation im Portal (UUID, stabil über Jahre)
    { name: "editionSlug", type: "string" },      // Werteliste unten, z. B. "fls27"
    { name: "name", type: "string" },             // Kommunikationsname
    { name: "website", type: "url" },
    { name: "sponsoringLevel", type: "string" },  // Schlüssel aus der Werteliste unten, z. B. "premium"
    { name: "sponsoringRank", type: "number" },   // Sortierung aufsteigend: 10 = oben … 999 = ohne Zuordnung
    { name: "partnerCategory", type: "string" },  // "talent" | "startup", kann fehlen
    { name: "logoSvg", type: "image" },           // freigegebene SVG-Fassung als Asset (Maske auf Navy)
    { name: "logoSvgPath", type: "string" },      // Kennung der Fassung im Portal
    { name: "logoTransparent", type: "boolean" }, // false = Hintergrundfläche erkannt ⇒ Website lässt das Logo aus
    { name: "logoPngUrl", type: "url" },          // öffentliche PNG-Kopie (Bucket partner-logos)
    { name: "publishedAt", type: "datetime" },
  ],
});
```
GROQ für die Logo-Wand:
```groq
*[_type == "portalPartnerLogo" && editionSlug == "fls27" && logoTransparent == true]
  | order(sponsoringRank asc, name asc) { name, website, sponsoringLevel, sponsoringRank, "svg": logoSvg.asset->url }
```

### Wertelisten (für Auswahllisten im Studio)
- **`editionSlug`** = `event.slug` der Edition: heute `fls27`; jede weitere Edition folgt dem Muster `fls<jj>` (`fls28`, …). Nur Editionen mit Partnern kommen vor.
- **`partnerCategory`** = Vokabular `partner_category`: `talent` (Talent-Partner), `startup` (Startup-Partner). Fehlt, wenn die Organisation keine Kategorie hat — das Logo gehört trotzdem auf die Wand.
- **`sponsoringLevel`** = Vokabular `sponsoring_level` (Migration 0097; Quelle ist der HubSpot-Standtyp ohne Größenangabe). Schlüssel → Rang:

  | Schlüssel | Bezeichnung | `sponsoringRank` |
  |---|---|---|
  | `main_stage_loge` | Main Stage Loge | 10 |
  | `signature` | Signature | 20 |
  | `lounge` | Lounge | 30 |
  | `premium` | Premium | 40 |
  | `general` | General | 50 |
  | `intro` | Intro | 60 |
  | `start_up` | Start-Up | 70 |
  | `gemeinschaftsstand` | Gemeinschaftsstand | 80 |

  Ein Level, das im Vokabular fehlt, kommt normalisiert mit (klein, Nicht-Alphanumerisches zu `_`) und erhält Rang **999**; ohne Level fehlt `sponsoringLevel`, der Rang ist 999. Die Reihenfolge ist Konrads Entscheidung und wird im Vokabular gepflegt (Daten, kein Code); die Website übernimmt nur den Rang.
- **`logoTransparent`**: `true`, wenn die Heuristik (`lib/sanity/svg.ts`) keine deckende Hintergrundfläche findet — geprüft werden `background` im `style` des Wurzelelements sowie `<rect>`, `<polygon>` und gerade `<path>`-Rechtecke über die ganze Zeichenfläche mit Füllung (außerhalb von `defs`/`clipPath`/`mask`/`pattern`). Nicht erkannt: Hintergründe aus `<style>`-Regeln, transformierte Flächen, eingebettete Rasterbilder (werden im Trockenlauf gemeldet). Der eigentliche Schutz ist die Freigabe der Pflicht `logo_vector` durch das Team — ihre Beschreibung verlangt seit 0097 „freigestellt, transparenter Hintergrund“.

## Einrichtung
1. Werte vom Web-Team: Projekt-ID und Dataset sind keine Geheimnisse ⇒ `printf '%s' <projekt-id> | sh scripts/env-set.sh SANITY_PROJECT_ID --config` und `printf '%s' production | sh scripts/env-set.sh SANITY_DATASET --config`; das Token (erst Viewer, später Editor) ⇒ `sh scripts/env-set.sh SANITY_API_TOKEN` (fragt unsichtbar, schreibt Vercel + `.env.local`; lokal nötig, weil das Trockenlauf-Skript es liest).
2. **Trockenlauf von der Kommandozeile** (ohne Portal-Login, gleiche Bausteine wie die Route, protokolliert in `integration.sync_job`):
   ```
   node --env-file=.env.local --conditions=react-server --experimental-transform-types --no-warnings=ExperimentalWarning \
        --import ./tests/register-alias.mjs scripts/sanity-dryrun.mjs --edition fls27 --beispiel --json /tmp/sanity-pruefergebnis.json
   ```
   Ergebnis: Lesen (Anzahl eigener Dokumente und Entwürfe im Dataset), Prüfung eines Musterdokuments durch Sanity (`--beispiel`; mit Viewer-Token 401/403 = erwartet), je Org `would_create`/`would_update`/`unchanged`, `logoTransparent=false` mit Grund, Prüf-Fehler von Sanity als `invalid`. Die JSON-Datei ist das Prüfergebnis für das Web-Team.
3. Trockenlauf aus dem Portal: Team im Admin über `POST /api/admin/sanity/partner-logos` `{ editionId?, dryRun (Standard true), orgId? }`.
4. Echtlauf (`dryRun: false`) erst nach Freigabe des Web-Teams, mit Editor-Token und gemeinsam mit einem einzelnen Logo (`orgId`): lädt die SVG-Datei als Asset hoch, schreibt das Dokument, kopiert das PNG in den öffentlichen Bucket und merkt sich die Fassung in `external_ref` (system `sanity`, object_type `partner_logo`, object_id = `org_edition`, `meta` = SVG-Pfad, PNG-Asset, Name, Level-Schlüssel, Rang, Transparenz, Sanity-Asset). Nur geänderte Fassungen werden erneut geschrieben.

## Ablauf
- Quelle `event_app_exhibitors(edition?)`, gefiltert auf Zeilen mit freigegebener SVG-Fassung (`logo_svg_path`); seit 0097 mit `sponsoring_key` und `sponsoring_rank` aus dem Vokabular.
- `lib/sanity/mapping.ts` (rein, getestet) baut das Dokument; `lib/sanity/svg.ts` (rein, getestet) prüft die Transparenz — dafür wird die SVG-Datei auch im Trockenlauf aus dem privaten Bucket gelesen; `lib/sanity/client.ts` spricht die HTTP-API (`v2025-02-19`, `data/query`, `data/mutate`, `assets/images` mit Rückfall auf `assets/files`, Bearer-Token nur serverseitig); `lib/sanity/publish.ts` orchestriert.
- Fehler je Org landen in `integration.sync_error` (nur im Echtlauf); der nächste Lauf versucht es erneut.

## Trockenlauf 15.09.2026
Lesen ok (0 eigene Dokumente), Musterdokument mit Viewer-Token ⇒ 403 (erwartet), 3 Org-Editionen ohne freigegebenes Logo ⇒ nichts zu validieren; Job 626. Ergebnis für das Web-Team: `docs/sanity-trockenlauf-2026-09-15.md`. Stolperstein: doppelt eingefügter Token ⇒ 401 „Session not found“ (Länge prüfen, 2× `sk`).

## Offen
- Editor-Token vom Web-Team, wenn der Relaunch es zulässt; erster Echtlauf gemeinsam mit einem Partner-Logo.
- Konrads Bestätigung der Rangfolge im Vokabular `sponsoring_level` (Vorschlag nach Paketgröße).
- Ob ein Team-Mitglied `logoTransparent` von Hand überstimmen soll (heute nur Heuristik + Freigabeprüfung) — erst, wenn ein echter Fall es verlangt.
