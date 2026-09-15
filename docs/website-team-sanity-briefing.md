# Info an das Website-Team: Partner-Logos aus dem Portal nach Sanity

Stand 15.09.2026 (v2, nach eurer Antwort) · Ansprechpartner Konrad (COO) · Technik: Plattform-Team

## Antwort auf eure Nachricht vom 15.09.2026
Danke für Projekt-ID, Dataset und Viewer-Token — die Werte liegen bei uns nur in der Server-Umgebung. Zu euren vier Bitten:

1. **Veröffentlicht, nicht als Entwurf:** ja. Wir schreiben mit `createOrReplace` direkt ein veröffentlichtes Dokument, nie unter `drafts.`. Dabei ist uns beim Nachlesen eurer Doku aufgefallen, dass **jede ID mit Punkt** in Sanity als Pfad gilt und nur mit Token lesbar ist — unsere geplante ID `portalPartnerLogo.<org_id>` hätte eure statisch gebaute Seite also nie gesehen. Die ID heißt deshalb jetzt **`portalPartnerLogo-<org_id>`** (Bindestrich). Sonst ändert sich am Dokumenttyp nur, was unten steht.
2. **Transparente SVGs:** jedes Dokument trägt **`logoTransparent: boolean`**. Wir prüfen die freigegebene SVG-Datei automatisch auf deckende Hintergrundflächen (Hintergrund im `style` des `<svg>`, Rechtecke/Polygone/Pfade über die ganze Zeichenfläche mit Füllung) und setzen bei Fund `false` — dann lasst ihr das Logo aus, wie vorgeschlagen. Zusätzlich verlangt die Logo-Pflicht im Portal ab sofort ausdrücklich „freigestellt, transparenter Hintergrund“, und unser Team prüft das bei der Freigabe. Farben sind uns egal, euch auch — passt.
3. **`sponsoringRank`** (Zahl) kommt zusätzlich zu `sponsoringLevel`. Sortiert aufsteigend: 10 steht oben, 999 heißt „ohne Zuordnung“ (kommt zuletzt). Die Rangfolge pflegen wir zentral, ihr übernehmt nur die Zahl.
4. **Feste Wertelisten** für `editionSlug`, `partnerCategory` und `sponsoringLevel` stehen unten — daraus könnt ihr eure Auswahllisten bauen.

Was ihr von uns als Nächstes bekommt: das **Prüfergebnis des Trockenlaufs** (JSON: Lesen gegen euer Dataset, Sanitys Prüfung eines Musterdokuments mit `dryRun=true`, je Partner der geplante Schreibvorgang mit `logoTransparent`). Geschrieben wird dabei nichts; mit dem Viewer-Token weist Sanity die Prüfung einer Mutation vermutlich mit 401/403 ab — dann steht das so im Ergebnis, die Struktur des Dokuments ist unten und durch unsere Tests belegt. Den ersten Echtlauf machen wir wie besprochen gemeinsam mit einem einzelnen Logo, dafür brauchen wir dann das Editor-Token.

### Wertelisten
- **`editionSlug`:** `fls27` heute; jede weitere Edition heißt `fls<jj>` (`fls28`, …).
- **`partnerCategory`:** `talent` | `startup`; kann fehlen (Logo gehört trotzdem auf die Wand).
- **`sponsoringLevel` → `sponsoringRank`:** `main_stage_loge` 10 · `signature` 20 · `lounge` 30 · `premium` 40 · `general` 50 · `intro` 60 · `start_up` 70 · `gemeinschaftsstand` 80 · unbekannt/ohne Level 999. Ein unbekanntes Level kommt als kleingeschriebener Schlüssel mit `_` (z. B. `sonder_stand`), der Rang ist dann 999.
- **`logoTransparent`:** `true` | `false` (siehe Punkt 2).

## Worum es geht
Das neue ChefTreff-Portal (portal.chef-treff.de) sammelt von jedem Partner ein freigegebenes Logo (SVG und PNG) samt Kommunikationsname, Website und Sponsoring-Level. Diese Daten sollen auf der Website erscheinen (Partner-Logo-Wand). Dafür schreibt das Portal je Partner **ein einziges Dokument** in euer Sanity-Projekt — Dokumenttyp `portalPartnerLogo`, feste ID `portalPartnerLogo-<org_id>`. Sonst fasst das Portal in Sanity **nichts** an: keine anderen Dokumente, kein Schema, kein Studio, kein Löschen.

## Was wir von euch brauchen
1. **Projekt-ID und Dataset-Name** (vermutlich `production`).
2. **Ein API-Token, zunächst mit Rolle „Viewer“.** Damit können wir nur lesen und unseren Trockenlauf fahren (Sanitys eigener `dryRun`, schreibt garantiert nichts). Solange euer Relaunch läuft, bleibt es dabei.
3. **Später, wenn ihr grünes Licht gebt: ein zweites Token mit Rolle „Editor“** für den Echtlauf. Das Token geht nicht per Mail oder Chat, sondern Konrad trägt es direkt in unsere Server-Umgebung ein.
4. **Wenn die Seite die Logos zeigen soll:** den Dokumenttyp ins Studio-Schema aufnehmen (Snippet unten). Vorher sind unsere Dokumente im Dataset einfach unsichtbar und stören nichts.

## Dokumenttyp (Studio-Schema, zum Übernehmen)
```ts
defineType({
  name: "portalPartnerLogo", title: "Partner-Logo (Portal)", type: "document",
  readOnly: true, // Quelle ist das Portal
  fields: [
    { name: "orgId", type: "string" },            // Organisation im Portal (UUID, stabil über Jahre)
    { name: "editionSlug", type: "string" },      // z. B. "fls27" (Werteliste oben)
    { name: "name", type: "string" },             // Kommunikationsname
    { name: "website", type: "url" },
    { name: "sponsoringLevel", type: "string" },  // Schlüssel, z. B. "premium" (Werteliste oben)
    { name: "sponsoringRank", type: "number" },   // Sortierung aufsteigend, 999 = ohne Zuordnung
    { name: "partnerCategory", type: "string" },  // "talent" | "startup", kann fehlen
    { name: "logoSvg", type: "image" },           // freigegebene SVG-Fassung als Asset
    { name: "logoSvgPath", type: "string" },      // interne Kennung der Fassung
    { name: "logoTransparent", type: "boolean" }, // false = Hintergrundfläche erkannt ⇒ auslassen
    { name: "logoPngUrl", type: "url" },          // öffentliche PNG-Kopie
    { name: "publishedAt", type: "datetime" },
  ],
});
```
Dokument-ID: `portalPartnerLogo-<org_id>` (veröffentlicht, kein `drafts.`, kein Punkt). Beispiel-Abfrage für die Logo-Wand:
```groq
*[_type == "portalPartnerLogo" && editionSlug == "fls27" && logoTransparent == true]
  | order(sponsoringRank asc, name asc) { name, website, sponsoringLevel, sponsoringRank, "svg": logoSvg.asset->url }
```

## Was ihr von uns erwarten könnt
- Es wird nur geschrieben, was das ChefTreff-Team im Portal freigegeben hat; eine neue Freigabe ersetzt das Dokument, es entstehen keine Duplikate.
- Jeder Lauf ist bei uns protokolliert; im Zweifel könnt ihr das Token jederzeit widerrufen, Sanity behält die Dokumenthistorie.
- Erster Echtlauf gemeinsam mit einem einzelnen Partner-Logo, danach regelmäßig durch das Partner-Team.

## Nächste Schritte
1. ✅ Ihr: Projekt-ID, Dataset, Viewer-Token → Konrad (15.09.).
2. Wir: Trockenlauf gegen euer Dataset, Prüfergebnis an euch (JSON, keine Änderung an euren Inhalten).
3. Ihr: Schema-Snippet (v2 oben) ins Studio, sobald die Logo-Wand auf Portaldaten umgestellt wird; Editor-Token, wenn der Relaunch es zulässt.
4. Gemeinsam: erster Echtlauf mit einem Logo, dann Freigabe für alle.
