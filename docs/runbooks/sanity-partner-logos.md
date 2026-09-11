# Runbook · Partner-Logos auf die Website (Sanity, Welle 3 A11)

Freigegebene Partner-Logos (Pflichten `logo_vector` = SVG, `logo_png` = PNG, beide vom Team akzeptiert) werden als Dokumente vom Typ **`portalPartnerLogo`** in das Sanity-Projekt der Website geschrieben — genau ein Dokument je Organisation (`_id = portalPartnerLogo.<org_id>`), erneute Freigabe ersetzt es. Sonst fasst das Portal in Sanity nichts an (Entscheidungslog 11.09., Schutz der Website-Baustelle).

## Schutzregeln
1. **Bis zur Freigabe durch das Web-Team** nur ein Viewer-Token (`SANITY_API_TOKEN` mit Rolle Viewer): Trockenlauf und Lesen funktionieren, Schreiben scheitert mit 403 — gewollt.
2. Für den Echtlauf ein Editor-Token. Dataset-genaue Rollen gibt es nur im Enterprise-Plan; der Schutz liegt im Code: nur `createOrReplace` auf `portalPartnerLogo.<org_id>`, keine Patches an fremden Dokumenten, keine Schema-Änderungen, kein Löschen.
3. **Trockenlauf ist Standard.** Er nutzt `dryRun=true` der Sanity-API: die Dokumente werden serverseitig geprüft, nichts wird geschrieben, keine Assets hochgeladen.
4. Das Web-Team nimmt den Dokumenttyp ins Studio-Schema auf, sobald die Seite ihn anzeigen soll; vorher sind die Dokumente unsichtbar und stören nichts.

## Kontrakt für das Web-Team (Studio-Schema)
```ts
defineType({
  name: "portalPartnerLogo", title: "Partner-Logo (Portal)", type: "document",
  readOnly: true, // Quelle ist das Portal
  fields: [
    { name: "orgId", type: "string" },          // Organisation im Portal (stabil über Jahre)
    { name: "editionSlug", type: "string" },    // z. B. "fls27"
    { name: "name", type: "string" },           // Kommunikationsname
    { name: "website", type: "url" },
    { name: "sponsoringLevel", type: "string" },// aus HubSpot (Standtyp ohne Größe, z. B. "Premium")
    { name: "partnerCategory", type: "string" },// talent | startup
    { name: "logoSvg", type: "image" },         // freigegebene SVG-Fassung als Asset
    { name: "logoSvgPath", type: "string" },    // Kennung der Fassung im Portal
    { name: "logoPngUrl", type: "url" },        // öffentliche PNG-Kopie (Bucket partner-logos)
    { name: "publishedAt", type: "datetime" },
  ],
});
```
GROQ für die Logo-Wand: `*[_type == "portalPartnerLogo" && editionSlug == "fls27"] | order(sponsoringLevel, name) { name, website, sponsoringLevel, "svg": logoSvg.asset->url, logoPngUrl }`.

## Einrichtung
1. Web-Team legt im Sanity-Projekt ein Token an (erst Viewer, später Editor) → `sh scripts/env-set.sh SANITY_API_TOKEN`; `SANITY_PROJECT_ID` und `SANITY_DATASET` (Standard `production`) mit `--config`.
2. Trockenlauf: Team im Admin (B9) über `POST /api/admin/sanity/partner-logos` `{ editionId?, dryRun (Standard true), orgId? }` — Ergebnis je Org `would_create`/`would_update`/`unchanged`, Prüf-Fehler von Sanity als `invalid`. Läufe in `integration.sync_job` (system `sanity`).
3. Echtlauf (`dryRun: false`) erst nach Freigabe des Web-Teams und mit Editor-Token: lädt die SVG-Datei als Asset hoch, schreibt das Dokument, kopiert das PNG in den öffentlichen Bucket und merkt sich die Fassung in `external_ref` (system `sanity`, object_type `partner_logo`, object_id = `org_edition`, `meta` = SVG-Pfad, PNG-Asset, Name, Level, Sanity-Asset). Nur geänderte Fassungen werden erneut geschrieben.

## Ablauf
- Quelle `event_app_exhibitors(edition?)`, gefiltert auf Zeilen mit freigegebener SVG-Fassung (`logo_svg_path`).
- `lib/sanity/mapping.ts` (rein, getestet) baut das Dokument; `lib/sanity/client.ts` spricht die HTTP-API (`v2025-02-19`, `data/mutate`, `assets/images` mit Rückfall auf `assets/files`, Bearer-Token nur serverseitig); `lib/sanity/publish.ts` orchestriert.
- Fehler je Org landen in `integration.sync_error`; der nächste Lauf versucht es erneut.

## Offen
- Token vom Web-Team (Viewer zuerst). Erster Echtlauf gemeinsam mit einem Partner-Logo.
- Ob die Website Level-Gruppen aus `sponsoringLevel` bildet oder eigene Kategorien braucht (Swapcard-Typ ist noch offen).
