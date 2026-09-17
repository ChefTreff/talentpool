# Sanity-Trockenlauf gegen das Website-Dataset — Prüfergebnis vom 15.09.2026

**An das Website-Team** · Portal-Team (Konrad) · Projekt `pv72so4s`, Dataset `production`, Viewer-Token. Es wurde **nichts geschrieben**; Rohdaten in `docs/referenz/sanity-pruefergebnis-2026-09-15.json`.

## Ergebnis
| Prüfung | Ergebnis |
|---|---|
| Verbindung und Token (GROQ-Lesen) | ok — `count(*[_type == "portalPartnerLogo"])` = 0, davon als Entwurf 0 |
| Musterdokument durch Sanitys Mutationsprüfung (`dryRun=true`) | **403** — das Viewer-Token darf nicht schreiben. Erwartet und gewollt, solange kein Editor-Token vorliegt; die Struktur des Dokuments belegen unsere Tests (`tests/sanity-mapping.test.ts`, `tests/sanity-svg.test.ts`). |
| Echte Partner der Edition FLS27 | 3 Organisationen, davon **0 mit freigegebenem Logo** — deshalb noch kein Dokument zu validieren. Die ersten Logos entstehen mit dem Partner-Onboarding ab November. |
| Protokoll bei uns | `integration.sync_job` 626 (system `sanity`, `partner_logos_preview`, ausgelöst `script`) |

## Das Dokument, das kommen wird (Kontrakt v2)
```json
{
  "_id": "portalPartnerLogo-<org_id>",
  "_type": "portalPartnerLogo",
  "orgId": "<org_id>",
  "editionSlug": "fls27",
  "name": "Beispiel Partner GmbH",
  "website": "https://example.org",
  "sponsoringLevel": "premium",
  "sponsoringRank": 40,
  "partnerCategory": "talent",
  "logoSvg": { "_type": "image", "asset": { "_type": "reference", "_ref": "<image-asset-id>" } },
  "logoSvgPath": "fls27/<org_id>/logo_vector/<datei>.svg",
  "logoTransparent": true,
  "logoPngUrl": "https://<supabase>/storage/v1/object/public/partner-logos/fls27/<org_id>/<asset>.png",
  "publishedAt": "2026-09-15T13:13:03.873Z"
}
```
- ID **ohne Punkt** (`portalPartnerLogo-<org_id>`): IDs mit Punkt sind in Sanity private Pfade und ohne Token unsichtbar. Veröffentlicht, nie `drafts.`.
- `logoTransparent: false` bedeutet: Hintergrundfläche erkannt, bitte auslassen. `sponsoringRank` aufsteigend sortieren (10 = oben, 999 = ohne Zuordnung).
- Wertelisten: `editionSlug` = `fls27` (Muster `fls<jj>`), `partnerCategory` = `talent` | `startup` (kann fehlen), `sponsoringLevel` = `main_stage_loge` 10 · `signature` 20 · `lounge` 30 · `premium` 40 · `general` 50 · `intro` 60 · `start_up` 70 · `gemeinschaftsstand` 80.
- Schema-Snippet fürs Studio: `docs/website-team-sanity-briefing.md`, Abschnitt „Dokumenttyp“.

## Nächste Schritte
1. Ihr: Schema v2 ins Studio, wenn die Logo-Wand auf Portaldaten umgestellt wird.
2. Ihr: Editor-Token, sobald der Relaunch es zulässt → Konrad trägt es wie das Viewer-Token in unsere Server-Umgebung ein.
3. Gemeinsam: erster Echtlauf mit **einem** freigegebenen Logo (`orgId` gezielt), danach Freigabe für alle.
