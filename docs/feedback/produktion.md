# Feedback-Backlog · Produktion

Stand: 2026-09-17 · Pflege: die zuständige Build-Session; Konrad liest hier den Stand

| ID | Datum | Seite | Ist → Soll | Prio | Status | Quelle |
|---|---|---|---|---|---|---|
| PROD-001 | 14.09. | /produktion/dateien | Der Hallenplan liegt nicht im Repo — der aus 2026 war nur ein Bild im Chat und ist nicht mehr abrufbar → Datei hochladen, damit /partner/messestand sie zeigt | P2 | erfasst | Runde 2 Teil 2 · Aufgabe Konrad |
| PROD-002 | 14.09. | /produktion/staende | Die Standliste der Edition fehlt; bis dahin zeigt die Messestand-Seite den Leerzustand mit Erklärung → Standnummern zuordnen (kommt laut Konrad in einigen Wochen aus der Produktion) | P2 | erfasst | Runde 2 Teil 2 · Aufgabe Konrad |
| PROD-003 | 14.09. | /produktion | `regie_cue` war je Slot vorgesehen → an Bühne mal Tag mit optionalem Slot, weil die Hälfte der Zeilen aus der Vorlage 2026 keine Session hat (Soundcheck, DOORS OPEN, Einlass, Puffer, Countdown-Video); ein Ablaufplan, der nur Sessions kennt, wäre am Veranstaltungstag unbrauchbar | P3 | gebaut (0082, /produktion; Entscheidungslog 14.09. akzeptiert) | Welle-4-Bericht Abw. 1 |
| PROD-004 | 17.09. | /produktion/bestellungen, /produktion/staende | Messeshop-Bestellungen fehlen in der Produktionsliste → je Stand: Standardausstattung des Pakets **plus** Shop-Bestellungen = Produktionsliste; die Lieferantenliste summiert beides (Konrad: „elementar“) | P1 | erfasst | Walkthrough 17.09., Antwort 11 · Abgleich messeshop.md |
| PROD-005 | 17.09. | /produktion/staende (neu: interne Checkliste je Stand) | Keine interne Plausibilitätsprüfung der Bestellungen → interne Checkliste je Stand, erster Punkt „Bestellungen passen zur Standgröße“ (kein Kicker auf 4 qm), weitere Punkte kommen dazu; ersetzt die Shop-Rollen | P2 | erfasst | Antwort 9 |
| PROD-006 | 17.09. | /produktion/produkte (neu) | Artikel entstehen nur per Import-Skript → **Produktstamm pflegen im Produktionsportal**: Artikel anlegen und ändern mit allen Feldern, Bild, Phase (voll / kurzfristig), Sichtbarkeit; Abgleich nach **HubSpot** (Produkt fürs Angebot) und **SevDesk** (Artikel mit eigener ID) per API, idempotent über die SKU — ersetzt Airtable-Formular und make.com | P2 | erfasst | Antworten 12 + 14 · Integrationsdesign: Architektur-Session |
