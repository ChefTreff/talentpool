# Wiki-Import aus Notion (ADM-008)

**Stand 01.10.2026.** Quelle: Notion-Datenbank „Wiki – FUTURE LEADER SUMMIT 2026"
(`12717aa69eee81589e2cddf668eb3eab`, 26 Seiten, über den Notion-Zugang gelesen).
Ziel: `kb_article`, alle Artikel veröffentlicht, Kategorie gesetzt.

## Was gebaut wurde

- **`content/wiki/*.md`** — 26 Quelldateien, eine je Artikel. Kopf mit `slug`,
  `titel`, `zielgruppe` (Pflicht), `phase`, `status`, `quelle` (Notion-URL) und
  `pruefen`; darunter der Text als Markdown.
- **`scripts/wiki-quelle.mjs`** — liest und prüft die Quelldateien.
- **`scripts/wiki-import.mjs`** — schreibt sie nach `kb_article`. Ohne `--apply`
  passiert nichts; ein zweiter Lauf aktualisiert denselben Slug.
- **`tests/wiki-inhalte.test.ts`** — Schutz gegen Reste aus dem Vorjahr.

## Warum nicht mechanisch übersetzt

Der Auftrag lautete, Fristen und Jahreszahlen zu ersetzen. Beim Lesen der Seiten
zeigte sich, dass das nicht reicht. Die Artikel tragen vier Sorten von Angaben,
die eine Jahreszahl-Ersetzung **falsch** machen würde:

1. **Fristen**, die für 2027 noch nicht gesetzt sind — Ticketeinlösung,
   Druckdaten, die zwei Messeshop-Phasen, Fahrzeugeinfahrt, Slides, App-Go-live,
   Hackathon-Bewerbung. Eine Frist des Vorjahres mit neuer Jahreszahl ist keine
   Frist, sondern eine falsche Zusage.
2. **Preise und Beträge** — Hotelraten, Parkhaustarif, Pfandbeträge.
3. **Dienstleister und externe Ansprechpersonen** — Logistiker, Caterer,
   Getränkepartner, Hotelpartner. Für 2027 sind sie nicht bestätigt; namentlich
   genannte Personen Dritter stehen deshalb nicht mehr im Text.
4. **Dateien und Links** — die Bilder, Hallenpläne und PDFs liegen in Notion
   hinter ablaufenden Signaturen und sind von außen nicht erreichbar. Dazu
   Airtable-Formulare, Drive-Ordner, Loom-Videos, der alte Messeshop unter
   `partner.chef-treff.de` und die Programm- und Shop-Links des Vorjahres.

**Entscheidung:** Jede dieser Angaben ist aus dem Text entfernt und im Kopf
unter `pruefen` festgehalten. Der Import schreibt sie **sichtbar** als ersten
Absatz in den Artikel („Für 2027 noch nicht final: …"). Ein veröffentlichter
Artikel sagt damit, was er nicht weiß, statt eine Vorjahresangabe als Tatsache
zu behaupten. Verbindliche Fristen verweisen zusätzlich auf die Aufgabenliste im
Portal — dort stehen sie mit Erinnerung, und das Wiki verdoppelt die Quelle nicht.

## Was ersetzt wurde

| Vorjahr | 2027 |
|---|---|
| FLS26, 2026 | FLS27, 2027 |
| Summit 10./11. April | **16./17. April 2027** (Fr/Sa) |
| Aufbau Do 09.04., Abbau So 12.04. | **Aufbau Do 15.04., Abbau So 18.04.**, externe Messebauer ab Mi 14.04. |
| Hackathon 09./10. April | **15./16. April 2027** |
| Challenge-Frist | **18.03.2027, 23:59** (Entscheidung 17.09.2026) |
| Partner-Hub, Speaker Hub | Partner-Portal, Speaker-Portal |
| Messeshop unter `partner.chef-treff.de` | Messeshop im Portal |
| Formulare für Masterclass und Company Tour | „Eure Formate" im Partner-Portal |
| Telefonnummern einzelner Personen im Text | Verweis auf die Ansprechperson im Portal (Name, Foto, E-Mail, Telefon) |

Uhrzeiten, die am Hallenplan hängen (Öffnungszeiten, Aufbaufenster), stehen als
Rhythmus des Vorjahres im Text und sind als noch nicht verbindlich gekennzeichnet.

## Kategorien

Notion kennt sieben Kategorien, das Portal fünf Zielgruppen. Abbildung:

| Notion | Portal |
|---|---|
| Allgemein | alle fünf |
| Partner & Messe | partner |
| Speaker | speaker |
| Hackathon | hackathon |
| Company Tours | partner, talent |
| Masterclasses | partner, speaker |
| Volunteers | volunteer (keine Seite in dieser Datenbank) |

**Bei den zehn Artikeln, die es im Portal schon gab, bleibt die dort gepflegte
Zielgruppe stehen** — sie ist bewusst gesetzt und teils enger als Notions
„Allgemein". Beispiel: „Tickets & Akkreditierung" steht in Notion unter
Allgemein, beschreibt aber Partner-Ticketcodes und bleibt deshalb bei `partner`.

## Die Artikel

| Slug | Titel | Zielgruppe | Phase | Für 2027 offen |
|---|---|---|---|---|
| `ai-hackathon-wiki` | AI Hackathon: Überblick | hackathon, partner | vor | Location und Adresse für 2027; Teilnehmerzahl und Zahl der Challenges; Bewerbungsfrist und Anmeldelink; Frist für die Pitch-Folien |
| `anlieferung-aufbau` | Anlieferung (PKW), Vorabsendung & Aufbau | partner | aufbau | verbindliche Aufbau- und Anlieferzeiten; Logistikdienstleister des Hauses und dessen Ansprechperson; Empfängeradresse und Versandlabel für Vorabsendungen; Hallenbezeichnung |
| `anlieferung-lkw` | Anlieferung (LKW) durch Dienstleister | partner | aufbau | Frist für die Fahrzeugeinfahrtsformulare; Anmeldeformular für die Logistik; Logistikdienstleister und Ansprechperson; Höhe des Pfands; interne Ansprechperson |
| `company-tours` | Company Tours | partner, talent | vor | Startzeiten der Touren 2027; Gruppengröße; Termin für die Einsendung der Tour-Informationen |
| `eigenbau-stand-genehmigung` | Eigenbau-Stand: Genehmigung | partner | vor | Antragsvorlage für 2027 hinterlegen; Frist für die Einreichung; Empfängeradresse für den Antrag |
| `event-app` | Event-App (Swapcard) | partner, speaker | vor | Termin für den Daten-Upload; Go-live-Termin der App; Link zum Event in der App |
| `faq-speaking` | FAQ: Speaking beim Summit | speaker | evergreen | Link zum Programm 2027; Link zum Event in der App; Frist für die Slides |
| `hackathon-ablauf-teilnehmende` | AI Hackathon: Zeitlicher Ablauf | hackathon | event | Location und Räume für 2027; verbindliche Uhrzeiten; Side-Formate wie Meet-ups |
| `hallenplan-standuebersicht` | Hallenplan & Standübersicht | partner | vor | Hallenplan 2027 als Datei hochladen; Standnummern und Maße; Ausstattung je Standkategorie bestätigen |
| `help-desk-kiosk` | Vor Ort: Help Desk & Aussteller-Kiosk | partner | event | Standort des Kiosks im Hallenplan 2027; Öffnungszeiten; Leihbedingungen und Pfand |
| `hotel-unterkunft` | Hotelpartnerschaft & Unterkunft | partner, speaker | vor | Hotelpartner für 2027; Zimmerraten; Buchungscode und Buchungslink; Stornobedingungen |
| `location-anfahrt` | CCH: Location & Anfahrt | partner, speaker, talent | evergreen | Hallenbezeichnung für 2027; Parkhaustarife |
| `masterclasses` | Masterclasses | partner, speaker | vor | Zahl und Lage der Masterclass-Räume 2027; Termin für den Anmeldeschluss |
| `media-kit` | Media Kit | partner, speaker | vor | Zahlen für 2027 (Speaker, Gäste); Grafiken, Banner und Teaser-Videos neu hochladen; Link zur Bild- und Logo-Ablage |
| `messeshop` | Messeshop | partner | vor | Fristen der beiden Bestellphasen; Sortiment der Nachbestellung; Video-Anleitung neu aufnehmen |
| `messestand-rueckwand` | Messestand: Rückwand & Druckdaten | partner | vor | Frist für die Druckdaten; Standgrößen und Maße für 2027; Druckdatenblatt der Druckerei neu hinterlegen; Uhrzeit für die Mitnahme beim Abbau |
| `oeffnungszeiten-ablauf` | Öffnungszeiten & Ablauf | partner, speaker | evergreen | verbindliche Uhrzeiten für 2027; Rahmenprogramm mit Partnern, Zeiten und Orten; Veröffentlichungstermin des Programms |
| `pfand` | Pfand (Brand-Partner & Teilnehmende) | partner | event | Pfandhöhe je Gebinde; Terminal-Anbieter für den Pfand-Einzug; Lage der Pfandstationen |
| `praesentationen` | Präsentationen | speaker | vor | Frist für den Upload der Slides |
| `recruiting-best-practices` | Recruiting: Best Practices | partner | vor | Termin, ab dem die Filter in der Event-App freigeschaltet sind |
| `speaker-briefing` | Speaker-Briefing | speaker | vor | Link zum Programm 2027; Frist für die Slides; Abendprogramm mit Partnern, Zeiten und Orten; Link zum LinkedIn-Grafikgenerator |
| `sponsored-talk` | Sponsored Talk | partner, speaker | vor | Bühnennamen und Slotlänge für 2027 |
| `stand-catering` | Stand-Catering & Crew-Verpflegung | partner | event | exklusiver Caterer für 2027; Lage des Crewbereichs im Hallenplan; Getränkepartner auf der Fläche |
| `talk-guidelines` | Talk Guidelines & Titel | speaker, partner | vor | Beispiel-Präsentation neu hinterlegen |
| `tickets-akkreditierung` | Tickets & Akkreditierung | partner | vor | Einlösefrist für die Ticketcodes; Zeiten der Akkreditierung am Donnerstag und Freitag |
| `ueber-cheftreff` | Über ChefTreff | partner, speaker, talent, volunteer, hackathon | evergreen | Teamgröße; Zahl der Speaker und Gäste für 2027 |

**26 Artikel, 73 offene Punkte.** Sie stehen alle sichtbar im jeweiligen Artikel.

## Redaktionelle Eingriffe über die Ersetzungen hinaus

- **Challenge-Liste des Hackathons entfernt.** Die Notion-Seite listet die
  Challenge-Partner 2026 namentlich, teils mit `[[PLATZHALTER]]`. Das ist
  interner Planungsstand einer vergangenen Edition und gehört nicht in ein
  Wiki, das Partner und Teilnehmende lesen.
- **Challenge-Beispiele gekürzt und entnamt.** Aus sieben ausführlichen
  Beschreibungen mit Firmennamen sind drei kurze Beispiele ohne Namen geworden.
  Sie sollen zeigen, wie eine gute Challenge aussieht, nicht wer sie gestellt hat.
- **„Media Kit – 2026" heißt jetzt „Media Kit"**, damit der Titel nicht jedes
  Jahr falsch wird.
- **Fehler in der Quelle, nicht übernommen:** Auf „Eigenbau-Stand: Genehmigung"
  zeigt der Link `konrad@chef-treff.de` auf `mailto:jan.maubach@chef-treff.de`.
  Im Portal steht stattdessen der Verweis auf die Ansprechperson.

## Sechs Hackathon-Entwürfe, die niemand verdoppeln sollte

Im Wiki stehen bereits sechs Artikel als **Entwurf**, die ein anderer Chat für
FLS27 geschrieben hat: `hackathon-challenge-definieren`, `hackathon-mentoren-jury`,
`hackathon-pitch-vorstellung`, `hackathon-preise`, `hackathon-rueckwand`,
`hackathon-teilnehmende`.

Der importierte Überblick aus Notion deckte dieselben Themen noch einmal ab –
Challenge-Definition, Mentoren, Preise, Rückwand, Zielgruppe. **Der Überblick ist
deshalb gekürzt** und verweist auf die sechs Artikel, statt sie zu wiederholen.
Sonst stünde dieselbe Aussage zweimal im Wiki und zweimal im Assistenten.

Die sechs sind inhaltlich fertig und tragen keine Reste aus dem Vorjahr. Ihnen
fehlt nur die Veröffentlichung – ein Klick je Artikel unter `/admin/wiki`.
**Nicht von hier aus gemacht:** Sie gehören zum Hackathon-Bereich, den ein
anderer Chat betreut (ADM-055), und der Überblick verweist jetzt auf sie, also
sollte die Entscheidung dort oder bei Konrad liegen, nicht hier nebenbei fallen.

## Prüfungen

- `tests/wiki-inhalte.test.ts` lässt keine Datei durch, die `FLS26` oder `2026`
  im Text hat oder auf Notion, Airtable, Drive, Loom, den alten Messeshop, den
  alten Ticketshop oder das Programm des Vorjahres verlinkt. Gegenprobe gefahren:
  mit eingebautem Fund wird der Test rot.
- Der Test prüft außerdem, dass die Zielgruppenliste im Importskript sich mit
  `KB_AUDIENCES` deckt, dass ein Artikel ohne Kategorie den Import abbricht und
  dass die offenen Punkte wirklich im Artikeltext landen.

## Kategorie ist Pflicht

Konrads Vorgabe („Kategorie ist Pflicht, sie steuert Sichtbarkeit und Chatbot")
war an zwei von drei Stellen schon erfüllt und an einer nicht:

- **Tabelle:** `kb_article_audience_chk` (`cardinality(audience) > 0`) besteht
  seit Migration 0083. **Eine Migration war dafür nicht nötig** — ein Entwurf
  hätte den Prüfsatz nur verdoppelt; der Probelauf hat das gezeigt. Der Test
  hält die Regel jetzt fest, damit sie nicht still verschwindet.
- **RPC:** `upsert_kb_article` wirft `22023 invalid_audience`.
- **Oberfläche:** Dort fehlte sie. Der Editor liess sich ohne Kategorie
  speichern und meldete den Fehler erst nach dem Absenden. Jetzt ist das Feld
  als Pflicht gekennzeichnet, und Speichern bleibt gesperrt, solange nichts
  gewählt ist.

## Nächste Schritte

1. Konrad liest die 26 Artikel unter `/admin/wiki` durch und füllt die offenen
   Punkte, sobald die Angaben feststehen.
2. Bilder, Hallenpläne und PDFs neu hochladen — gehört zu ADM-063 (zentrale
   Medienverwaltung) und `edition-files`.
3. Englische Fassungen fehlen durchgehend; alle Artikel sind `de`.
