# Info an das Website-Team: Partner-Logos aus dem Portal nach Sanity

Stand 11.09.2026 · Ansprechpartner Konrad (COO) · Technik: Plattform-Team

## Worum es geht
Das neue ChefTreff-Portal (portal.chef-treff.de) sammelt von jedem Partner ein freigegebenes Logo (SVG und PNG) samt Kommunikationsname, Website und Sponsoring-Level. Diese Daten sollen auf der Website erscheinen (Partner-Logo-Wand). Dafür schreibt das Portal je Partner **ein einziges Dokument** in euer Sanity-Projekt — Dokumenttyp `portalPartnerLogo`, feste ID `portalPartnerLogo.<org_id>`. Sonst fasst das Portal in Sanity **nichts** an: keine anderen Dokumente, kein Schema, kein Studio, kein Löschen.

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
    { name: "orgId", type: "string" },           // Organisation im Portal (stabil über Jahre)
    { name: "editionSlug", type: "string" },     // z. B. "fls27"
    { name: "name", type: "string" },            // Kommunikationsname
    { name: "website", type: "url" },
    { name: "sponsoringLevel", type: "string" }, // z. B. "Premium", "Signature"
    { name: "partnerCategory", type: "string" }, // "talent" oder "startup"
    { name: "logoSvg", type: "image" },          // freigegebene SVG-Fassung als Asset
    { name: "logoSvgPath", type: "string" },     // interne Kennung der Fassung
    { name: "logoPngUrl", type: "url" },         // öffentliche PNG-Kopie
    { name: "publishedAt", type: "datetime" },
  ],
});
```
Beispiel-Abfrage für die Logo-Wand:
```groq
*[_type == "portalPartnerLogo" && editionSlug == "fls27"] | order(sponsoringLevel, name) {
  name, website, sponsoringLevel, "svg": logoSvg.asset->url, logoPngUrl
}
```

## Was ihr von uns erwarten könnt
- Es wird nur geschrieben, was das ChefTreff-Team im Portal freigegeben hat; eine neue Freigabe ersetzt das Dokument, es entstehen keine Duplikate.
- Jeder Lauf ist bei uns protokolliert; im Zweifel könnt ihr das Token jederzeit widerrufen, Sanity behält die Dokumenthistorie.
- Erster Echtlauf gemeinsam mit einem einzelnen Partner-Logo, danach regelmäßig durch das Partner-Team.

## Nächste Schritte
1. Ihr: Projekt-ID, Dataset, Viewer-Token → Konrad.
2. Wir: Trockenlauf gegen euer Dataset, Rückmeldung an euch (Prüfergebnis von Sanity, keine Änderung).
3. Ihr: Schema-Snippet ins Studio, sobald die Logo-Wand gebaut wird; Editor-Token, wenn der Relaunch es zulässt.
4. Gemeinsam: erster Echtlauf mit einem Logo, dann Freigabe für alle.
