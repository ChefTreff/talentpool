# Feedback-Runde 2 (Konrad, 14.09.2026) — Grundstruktur, Partner-Portal, Admin

Querschnitts-Auftrag **F8 ff.**, Fortsetzung der Zählung aus Runde 1 (F1–F7). Konrad gibt das Feedback in mehreren Teilen; dieses Dokument wächst mit. **Teil 1: Grundstruktur und Partner-Portal.**

Aufteilung nach Absprache mit der Architektur-Session: Oberfläche und Verhalten baut die Build-Session, ein PR je Baustein. Alles, was Regeln ändert — wer was sehen darf, Rollen, Datenfelder, Abweichungen, Integrationen — ist unten als **Entscheidung** markiert und geht an die Architektur-Session.

Konrads Leitsatz für diese Runde, er gilt für jede Seite: *„extrem serviceorientiert denken und Fragen antizipieren, damit sie gar nicht erst gestellt werden. Alles simpel und klar, aber auch ausführlich genug."*

---

## A · Grundstruktur

| Nr. | Seite | Ist | Soll |
|---|---|---|---|
| **F8.1** | alle | Die Seitenleiste ist eine abgerundete Karte **innerhalb** eines zentrierten Inhaltsbereichs, darüber eine Topbar. | Echte Seitenleiste: bündig am linken Rand, über die volle Höhe, kein Container darum. Vorbild: Teamportal (Screenshot). |
| **F8.2** | alle | Die Wortmarke steht als Text in der Topbar. | Das **Logo** steht dauerhaft oben in der Seitenleiste, **monochrom**. ⚠️ Die SVGs liegen nicht im Repo — siehe „Was fehlt". |
| **F8.3** | alle | Der Bereichswechsel ist eine Reihe von Links in der Topbar, erst ab zwei Bereichen. | Auswahl **im Menü** (Seitenleiste), als aufklappbare Auswahl des aktuellen Portals. |
| **F8.4** | alle | Mehrere Bereiche starten auf einer Unterseite; nicht jedes Portal hat eine eigene Übersicht. | Jedes Portal ist ein **vollständig eigenständiges Portal** mit eigener Startseite, die als Übersicht dient. |
| **F8.5** | alle | „Mein Profil" hängt als Navigationspunkt in jedem Fachbereich und führt ins Teilnehmer-Portal — aus dem Volunteer-Portal landet man im Speaker-Portal. | **Globales Profilmenü oben rechts**: kleines Profilbild, darunter ein Aufklappmenü (Profil, Einstellungen, Sprache, Abmelden). Unabhängig vom Portal, überall gleich. Vorbild: Screenshot 2. |
| **F8.6** | Admin | Admin steht als gleichrangiges Portal im Umschalter. | Admin ist ein **separater Bereich**, aus jeder App ansteuerbar und klar als solcher erkennbar. Aus dem Speaker-Portal führt „Admin" in den **Speaker-Abschnitt** des Admin-Bereichs. Der Admin-Bereich ist genauso gegliedert wie die Portale: Speaker, Partner, Volunteers, Hackathon, Produktion, System. |
| **F8.7** | alle | Das Teilnehmer-Portal erscheint nur, wenn es der **einzige** Bereich ist (Runde 1, Punkt 2). | **Entscheidung, Umkehrung:** Das Teilnehmer-Portal ist immer sichtbar. Begründung Konrad: es ist das Front-End des Talent-CRM und gilt übergreifend für Teilnehmende des Summits und anderer Formate — also ein eigenes Portal wie die anderen. |
| **F8.8** | alle | — | **UX-Durchgang** über alle Oberflächen: Hierarchien schärfen, Handlungsflächen sichtbar machen, aufräumen. Konrad möchte dafür einen Skill einbinden; Vorschläge unten. |

## B · Partner-Portal

Grundhaltung für alle Partnerseiten: mehr Erklärung, Fragen vorwegnehmen. Das Menü bleibt, wie es ist.

| Nr. | Seite | Ist | Soll |
|---|---|---|---|
| **F9.1** | `/partner` | Fortschritt, Fristen, gebuchte Leistungen. | Dazu feste Inhalte: **Ansprechpartner mit Bild** (Speaker-Buddy, Partner-Buddy, allgemeiner Kontakt), **allgemeine Zeiten** (nur Öffnungszeiten, Einlass, Aufbau — Details im Wiki, mit Verweis), **Google-Maps-Karte** der Location (CCH, Congressplatz 1, 20355 Hamburg) mit Hinweis aufs Wiki für die Anfahrt. |
| **F9.2** | `/partner/tickets` | Frist als Textzeile. | Frist **deutlich größer und als Countdown**. |
| **F9.3** | `/partner/tickets` | Der Ticketshop liegt hinter einem Link. | Shop **als iFrame eingebettet**, damit niemand das Portal verlässt. Geht das nicht, ein klarer Knopf. |
| **F9.4** | `/partner/tickets` | Keine Anleitung. | **Loom-Video** einbetten (`532a8072a5eb49f8ba8c35b0e2a29044`). Dazu im Admin eine **zentrale Liste aller eingebetteten Videos**, in der die Links austauschbar sind. |
| **F9.5** | `/partner/tickets` | Kein Verweis aufs Wiki. | Wiki verlinken. |
| **F9.6** | `/partner/wiki` | Leer. | Alle Artikel aus dem bestehenden Notion-Wiki anlegen. |
| **F9.7** | Admin | Artikel nur über Felder pflegbar. | **Redaktionsoberfläche** für Wiki-Artikel, vergleichbar mit dem Notion-Editor (übliche Formatierungen). |
| **F9.8** | `/partner/event-app` | **Seite fehlt vollständig.** | Neue Seite: erklärend, führt zu Swapcard, mit Checkliste. Inhalt steht unten. |

### F9.8 · Inhalt der Event-App-Checkliste (von Konrad)

1. **Füllt euer Profil aus:** Bitte geht in den Exhibitor-Bereich der App und füllt euer Profil vollständig aus. Ergänzt Links zu eurer Karriere-Seite und Social-Kanälen, ein Header-Bild und weitere Informationen.
2. **Fügt euer Team hinzu:** Bestenfalls über das Partner-Hub. Alternativ könnt ihr auch direkt in der App Team-Mitglieder hinzufügen. Das geht allerdings erst, wenn sie bereits ein Ticket auf ihre Mailadresse personalisiert haben.
3. **Füllt die Profile der Mitarbeitenden aus:** Bestenfalls sind auch die Profile aller Teammitglieder richtig ausgefüllt, sodass man als Teilnehmer direkt sieht, mit wem man spricht.

---

## C · Entscheidungen für die Architektur-Session

Diese Punkte ändern Regeln, Datenfelder oder Integrationen. Sie sind weitergeleitet; gebaut wird erst nach der Antwort.

1. **F8.7 — Teilnehmer-Portal immer sichtbar.** Kehrt Runde 1, Punkt 2 um. Betrifft `areasFor()` und `canEnterArea()` und damit jeden Bereich. Rückfrage: Gilt die Umkehrung auch für das Kiosk-Konto? Dort war die Trennung ausdrücklich gewollt (E8, `isKioskOnly`), und ein Gerätekonto am Eingang sollte kein Teilnehmerprofil öffnen.
2. **F9.1 — Ansprechpartner als Datenfeld.** Speaker-Buddy, Partner-Buddy und allgemeiner Kontakt je Edition, mit Bild. Runde 1 hat private Kontaktdaten von Freelancern ausdrücklich aus dem Portal genommen; ein Buddy braucht also ein Rollen-Postfach und ein Bild, keine private Nummer.
3. **F9.1 — Allgemeine Zeiten als Editionsdaten.** Öffnungszeiten, Einlass, Aufbau je Edition, sichtbar in Partner- **und** Speaker-Portal und im Wiki. Braucht Felder und eine Pflegestelle.
4. **F9.1 — Google Maps.** Externe Einbettung: CSP `frame-src`, Datenschutz (Maps setzt Cookies und überträgt die IP), ggf. Zwei-Klick-Lösung.
5. **F9.3 — Ticketshop im iFrame.** CSP `frame-src` für vivenu; ob vivenu das Framing erlaubt (`X-Frame-Options`/`frame-ancestors`), ist zu prüfen. Ohne Freigabe bleibt der Knopf.
6. **F9.4 — Loom-Einbettung und Videoliste.** CSP `frame-src` für Loom; die zentrale Liste braucht eine Ablage (Tabelle oder Vokabular) plus Admin-Oberfläche.
7. **F8.6 — Admin ist kein Portal im Umschalter.** Ändert die Bedeutung von `AREAS`; Rechte bleiben, wie sie sind (`is_staff()`).

## D · Was noch fehlt, damit gebaut werden kann

- **Logo-SVGs (F8.2).** Im Repo liegt kein Logo; die Marke steht heute als Text. Der Design-Skill hält fest: „Endgültige Wahl klärt Konrad, sobald die SVGs im Repo liegen." Gebraucht wird die monochrome Variante (hell auf Navy), am besten als SVG. Bis dahin bleibt die Wortmarke als Platzhalter an der richtigen Stelle stehen.
- **Bilder der Ansprechpartner (F9.1).**
- **Zugriff auf die Notion-Wiki-Inhalte (F9.6)** — die Seite ist öffentlich geteilt, der Abruf ist geplant.

## E · Skill-Vorschläge für den UX-Durchgang (F8.8)

Recherche vom 14.09.2026. **Keiner davon ist installiert** — das ist Konrads Entscheidung, weil es fremder Code im Repo ist.

| Kandidat | Was er tut | Einschätzung |
|---|---|---|
| `vercel-labs/agent-skills` → **web-design-guidelines** | Prüft bestehenden UI-Code gegen 100+ Regeln zu Zugänglichkeit und UX. | Passt am besten: ein **Prüfwerkzeug**, kein Generator — genau das, was ein Durchgang braucht. |
| **AccessLint** | Vier Skills, ein Review-Agent, MCP-Server für Kontrastmessung. | Stark bei Zugänglichkeit; überschneidet sich mit unserer `kontrast.mjs`. |
| **UI/UX Pro Max** | Durchsuchbare Wissensbasis (Design-Datenbank, Schriftpaarungen, Paletten, Anti-Muster). | Generator-lastig. Riskant neben unserem Brandbook — er würde eigene Paletten und Schriften vorschlagen. |

**Wichtig in jedem Fall:** Der Projekt-Skill `/portal-design` bleibt die Autorität für Aussehen, Tokens und Formensprache. Ein externer Skill liefert die **Checkliste** für den Durchgang, nicht den Geschmack. Bei Widerspruch gewinnt das Brandbook.

Quellen: [Snyk — Top Claude Skills for UI/UX Engineers](https://snyk.io/articles/top-claude-skills-ui-ux-engineers/) · [Superdesign — Design Skills Reviewed](https://superdesign.dev/blog/design-skills-reviewed) · [Claude Code Marketplaces — Design & UI/UX](https://claudemarketplaces.com/skills/category/design-ui)

---

# Teil 2 (Konrad, 14.09.2026) — Event-App, Messestand, Messeshop

Aufgenommen, **noch nicht gebaut**: Konrads Vorgabe war, erst F9.1 fertigzustellen. Entscheidungen sind unten markiert und an die Architektur-Session weitergeleitet.

## F9.8 · Event-App — die fehlenden Checklistenpunkte

Ergänzt die drei Punkte aus Teil 1 um vier weitere. Wortlaut von Konrad, gekürzt nur, wo er sich wiederholt:

4. **Kontakte teilen einstellen (WICHTIG):** In den einzelnen Profilen muss eingestellt werden, dass die Kontakte mit dem Team geteilt werden — sonst ist der Zugriff auf die Leads hinterher nicht möglich (Verweis ins Wiki).
5. **Offene Stellen anlegen:** Höchstens drei Stellen, ansprechend und repräsentativ. Lieber ein Traineeship oder eine Projektmanager-Rolle, die eine breite Zielgruppe anspricht — zu spezielle Rollen schrecken ab.
6. **Passende Profile suchen:** Ab Mitte März ist die App live; unter „Teilnehmer" lassen sich Profile nach Studienhintergrund, Berufserfahrung und weiteren Merkmalen filtern. Passende Talente identifizieren und mit Verweis auf die eigene Präsenz anschreiben (mehr im Wiki unter Event-App).
7. **Loom-Video** `67013b2c5a1a42cfbd2ee1a045a9bc5c` einbetten und in der Admin-Linkliste hinterlegen.

## F10 · Neue Seite `/partner/messestand` (unter „Formate")

| Nr. | Abschnitt | Inhalt |
|---|---|---|
| **F10.1** | Einleitung | „Auf dieser Seite findet ihr alle Informationen rund um euren Messestand: Die genauen Maße, die Standnummer und vor allem alles rund um die Rückwand. Solltet ihr einen Eigenbau-Stand mitbringen, beachtet bitte unbedingt die entsprechenden Anmeldungen der Anlieferung und des Standes selbst." |
| **F10.2** | Standardausstattung | Tabelle je Kategorie (Start Up/Initiativen 1,5 qm · Basic 4 qm · All In 9 qm · Premium 18 qm) mit Größe und Ausstattung. **Global im Wiki pflegbar** — nicht im Seitencode. |
| **F10.3** | Eure Rückwand | Erklärtext (siehe unten), Knopf „Wiki" für die Druckanforderungen, Knopf „Jetzt hochladen". **Frist 02.04.2027 als Countdown mit Tagen.** |
| **F10.4** | Hallenplan & Standnummer | Visueller Hallenplan **plus** Liste aller Aussteller mit Ständen. Der Plan ist eine im Produktionsbereich hinterlegte Datei (PDF oder Bild); die Standliste wird dort zugeordnet. Vorlage: Airtable `appbhdF78LhXRbCtL/shrrQp2mBCAsqyHQW`. |

**Text F10.3 (wörtlich):** „Hier findet ihr alle Informationen zu eurer Standrückwand und habt die Möglichkeit, diese einzusenden. Bitte entnehmt die Maße eures Standes der obigen Tabelle. Unter dem Button ‚Wiki' findet ihr unser Wiki mit den exakten Druckanforderungen, dieses könnt ihr gern mit eurer Grafikabteilung oder einer externen Agentur teilen. Dort sind noch einmal alle relevanten Informationen enthalten. Unter ‚Jetzt hochladen' könnt ihr die finale Datei hochladen oder nochmal updaten. Wichtig: Ab dem 13.03. müssen alle Updates bitte per Mail an Konrad erfolgen, da wir dann beginnen, die Dateien in den Druck zu geben."

**Standardausstattung (Stand Vorjahr), Vorspann:** „Unsere All-Inclusive-Stände sind mit einer Basisausstattung versehen. Zusätzliche Elemente und Upgrades kannst du bequem über unseren Messeshop buchen. Und keine Sorge: Solltet ihr etwas vergessen haben, könnt ihr fast alles kurzfristig am Ausstellerkiosk während des FLS noch leihen."

| Kategorie | Standgröße | Ausstattung |
|---|---|---|
| Start Up / Initiativen | 1,5 qm (1 × 1,5 m) | 1 Tresen, 2 Barhocker |
| Basic | 4 qm (2 × 2 m) | 2 m Rückwand inkl. Druck, 1 Stehtisch + 2 Barhocker, 4 qm Teppich, Strom (230 V), Standbeleuchtung, Standreinigung |
| All In | 9 qm (3 × 3 m) | 4 m Rückwand inkl. Druck, 2 Stehtische + 4 Barhocker, 9 qm Teppich, Standbeleuchtung, Strom (230 V), Standreinigung |
| Premium | 18 qm (6 × 3 m) | 6 m Rückwand inkl. Druck, 2 Stehtische + 4 Barhocker + 1 Tresen, 18 qm Teppich, Strom (230 V), Standbeleuchtung, Standreinigung |

## F11 · Messeshop

Konrads Urteil: „grundsätzlich schon gut". Leitlinie für alle Punkte: **so nah an bekannten Shops wie möglich**, damit Bestellen keine Übung verlangt.

| Nr. | Ist | Soll |
|---|---|---|
| **F11.1** | Kein Bestand sichtbar; keine Warenkorb-Anzeige an gewohnter Stelle | „Noch 10 verfügbar" bei begrenztem Bestand; **Warenkorb oben rechts**, wie man es von E-Commerce kennt |
| **F11.2** | Bestellung ohne Prüfschritt | Vor dem Absenden **Rechnungsadresse prüfen** und **PO-Nummer** erfassen können |
| **F11.3** | Produkte nur als Kachelliste | **Suche** und je Produkt eine **kleine Produktseite**, klickbar, mit Weg zurück |
| **F11.4** | Bestellungen nicht gesondert einsehbar | Eigene, aufgeräumte **Unterseite „Bestellungen"** (Konrad verweist auf einen Screenshot aus dem Vorjahr — ⚠️ liegt mir nicht vor) |

## Entscheidungen für die Architektur-Session (Teil 2)

1. **F10.2 — Standardausstattung global im Wiki pflegen.** Die Tabelle soll nicht im Seitencode stehen. Frage: eigener Wiki-Artikel mit fester Kennung, den die Seite einbindet, oder `edition_info`? Der Inhalt ist eine Tabelle, keine Zeile — spricht für den Wiki-Artikel.
2. **F10.4 — Standliste und Hallenplan.** `booth` gibt es schon (`booth_number`). Gebraucht werden: die Zuordnung im Produktionsbereich, eine öffentliche Ausstellerliste je Edition und der Hallenplan als hinterlegte Datei (Bucket + Admin/Produktion). Die Airtable-Vorlage nennt die Spalten.
3. **F10.3 — Zwei Fristen im selben Abschnitt.** Konrad nennt Countdown auf **02.04.2027**, im Text steht die Druckübergabe ab **13.03.** Beides ist richtig, meint aber Verschiedenes (letzte Änderung per Portal vs. ab dann nur noch per Mail). Braucht zwei Felder, sonst widerspricht sich die Seite selbst.
4. **F11.2 — PO-Nummer und Rechnungsadresse im Bestellweg.** Neues Feld an `shop_order`; die Adresse kommt aus den Stammdaten und wird bestätigt, nicht neu erfasst.
5. **F11.1 — Bestand anzeigen.** `product.stock_total` und `track_stock` gibt es; zu klären ist, ob der freie Bestand (abzüglich bestätigter Bestellungen) über die Shop-RPC mitkommt.

## Konrads Antworten auf die Rückfragen (14.09., nachgereicht)

- **F10.3, die zwei Daten:** Nur der **02.04.2027** gilt. Der 13.03. war der alte Stand von 2026 und muss aus dem Text heraus — sonst nennt die Seite eine Frist, die es nicht gibt. Damit **entfällt** der zweite Deadline-Eintrag; es bleibt `booth_backdrop_upload_until`. Der Satz „ab dem 13.03. per Mail an Konrad" wird zum Anfrage-Weg im Portal ohne Datum, bis die Produktion eines nennt.
- **F10.4, Standliste und Hallenplan:** Kommen erst in einigen Wochen als Teil der Produktionsarbeit. Für den Anfang liegt der **Hallenplan FLS26** vor, damit einer hinterlegt werden kann. ⚠️ Die Datei liegt bisher nur als Bild im Chat — sie muss in den Drive-Ordner oder über die Upload-Strecke aus F10.4 ins Repo bzw. in den Bucket.
- **F11.4, Bestellübersicht:** Screenshot liegt vor. Aufbau des Vorjahres (WooCommerce „My Account"): schmale Randspalte mit „Bestellungen" und „Abmelden", daneben eine Tabelle mit **Bestellung · Datum · Status · Gesamtsumme · Aktionen**, je Zeile ein „Anzeigen". Das ist die Vorlage für die eigene Unterseite — ohne den Hinweisbalken zur Mailbestätigung, den es bei uns nicht braucht.

## Was fehlt

- Der **Hallenplan als Datei** (F10.4) — als Bild im Chat vorhanden, noch nicht im Repo.
- Die **Standliste** der Edition (F10.4) — laut Konrad erst in einigen Wochen aus der Produktion.

---

# Teil 3 (Konrad, 14.09.2026) — Seite „Eure Daten" (vormals Stammdaten)

Umgesetzt in **F12**. Konrads Leitsatz dazu, er gilt über diese Seite hinaus: *„Denke bitte immer so, wie ein Kunde, der draufschaut."*

| Nr. | Ist | Soll | Stand |
|---|---|---|---|
| **F12.1** | „Stammdaten" | „Eure Daten" | gebaut |
| **F12.2** | Schritte nur über „Weiter" erreichbar; Beschreibung und Logo nicht anklickbar | Schritte **anklickbar**; Formular erscheint beim ersten Einloggen | gebaut |
| **F12.3** | „Aus HubSpot vorbelegt" — ein internes System im Kundentext | „Das haben wir für euch eingetragen. Stimmt etwas nicht, ändert es einfach hier." | gebaut |
| **F12.4** | Logo-Upload als nacktes Dateifeld, man erkennt nicht, wo hochgeladen wird | Upload als klar gekennzeichneter Knopf | gebaut |
| **F12.5** | Schritt „Rechnung"; darin die Wahl des Pass-Typs | „Rechnungsdaten"; Pass-Typ raus — das ist ein **interner** Status je Partner | gebaut |
| **F12.6** | Kontakte stehen doppelt: unter „Eure Daten" und als eigener Menüpunkt | nur unter „Kontakte" | gebaut |

## Offene Punkte aus Teil 3

1. **Pass-Typ je Partner festlegen (F12.5).** Er ist aus der Partneransicht entfernt, aber noch **nirgends** im Admin pflegbar — das Feld `org_edition.pass_type_choice` existiert weiter und wird jetzt von niemandem mehr gesetzt. Konrads Vorschlag: „bestenfalls sogar schon in HubSpot". Braucht eine Entscheidung: Feld im Partner-Admin, Zuordnung über HubSpot beim Abgleich, oder beides. **Bis dahin ist die Funktion tot.**
2. **„Verpflichtend" (F12.2), Umfang.** Umgesetzt ist: wer die Startseite des Partner-Portals öffnet und noch im Status `invited` steht, landet im Formular. Die übrigen Seiten bleiben erreichbar — eine Sperre, aus der man nicht herauskommt, wäre keine Führung, sondern eine Falle. Falls Konrad wirklich alles sperren will, ist das eine eigene Entscheidung.

---

# Teil 4 (Konrad, 14.09.2026) — Messestand, Messeshop, Wiki

Quelle: Konrads Nachricht vom 14.09. („Unter Formate fehlt noch die Seite Messestand …", „Nächster Bereich: Messeshop …") und die Nachfrage vom selben Abend („Mach mal mit abhaken … Außerdem hatte ich dir doch das Wiki gesendet").
Entscheidungen der Architektur-Session dazu: Entscheidungslog, Eintrag vom 14.09. (Punkte 1–5).

| Nr. | Seite | Ist | Soll | Stand |
|---|---|---|---|---|
| **F9.8b** | `/partner/event-app` | Schritte ohne Haken — wir sehen nicht, was in Swapcard passiert. | **Abhakbar**, als Selbstauskunft, in der Datenbank, damit die Produktion den Stand sieht. | gebaut (0093) |
| **F10.1** | `/partner/messestand` | Seite fehlt. | Einleitung im Wortlaut von Konrad. | gebaut |
| **F10.2** | `/partner/messestand` | — | Standardausstattung je Paket, **aus dem Produktmodell** (`product_component`), eigenes Paket hervorgehoben. | gebaut (0094) |
| **F10.3** | `/partner/messestand` | — | „Eure Rückwand" mit Upload, Wiki-Verweis und **einer** Frist (02.04.2027) als Countdown; danach Änderungswunsch über das Portal. | gebaut (0094) |
| **F10.4** | `/partner/messestand` | — | Hallenplan (Datei aus der Produktion) und Ausstellerliste mit Standnummern. | gebaut (0094) |
| **F11.1** | `/partner/shop` | Bestand als nackte Zahl, Warenkorb unter dem Katalog. | „Noch N verfügbar" ab zehn Stück, „Ausverkauft" bei null; **Warenkorb oben rechts** als eigene Seite. | gebaut |
| **F11.2** | Kasse | Keine Rechnungsdaten, keine PO. | Rechnungsdaten **anzeigen und bestätigen** (Änderung führt nach „Eure Daten"), PO-Nummer je Bestellung. | gebaut (0095) |
| **F11.3** | `/partner/shop` | Kacheln nicht klickbar, keine Suche. | Suche über Name, Beschreibung, Hinweis und Artikelnummer; Produktseite je Artikel mit Zurück-Weg. | gebaut |
| **F11.4** | `/partner/shop` | Historie unter dem Katalog. | Eigene Unterseite „Bestellungen" als Liste nach dem Muster der Checkliste — als **Reiter im Shop**, nicht als Punkt im Portalmenü (Korrektur Konrad, 14.09.). | gebaut |
| **F9.6** | `/partner/wiki` | Leer. | Zehn Artikel aus dem Notion-Wiki angelegt — **als Entwurf**, siehe unten. | gebaut (0096) |
| **F9.7** | Admin | Artikel nur als Rohtext im Feld. | Redaktionsoberfläche mit Formatierungsleiste und Vorschau; Renderer kann jetzt Tabellen, nummerierte Listen, Hinweiskästen, Trennlinien. | gebaut |

## Bewusste Abweichungen (für das Review)

1. **`product.area_sqm` und `product.size_note` als neue Spalten** (0094). Konrads Tabelle hat eine Spalte „Standgröße"; im Produktmodell stand sie nur im Namen und im Fliesstext. Beides liesse sich nur durch Zerlegen von Namen in eine Tabellenspalte bringen. Beide Werte sind sprachneutral (Zahl bzw. „6 m × 3 m"), die Einheit setzt die Oberfläche. Weicht ab von Entscheid 1 („Freitext über `description_de/en`").
2. **Ausstellerliste ohne Logo** (0094). Entscheid 2 nennt das Logo; die Logos liegen im Bucket `partner-assets`, dessen Policy je Organisation greift. Sie quer lesbar zu machen, wäre ein Loch im Bucket für eine Verzierung.
3. **Für F11.1 war keine Migration nötig.** `shop_catalogue` gibt schon heute `shop_stock_available(sku)` heraus, also Gesamtbestand abzüglich bestätigter und offener Bestellungen. Entwürfe reservieren bewusst nicht — sonst blockiert ein vergessener Warenkorb den Bestand. Entscheid 5 ist damit erfüllt; geändert hat sich nur die Anzeige.
4. **Der Änderungswunsch nach der Frist läuft über `shop_request_product`** mit `p_sku = null`. Kein neuer Tabelle für einen Fall: das Partner-Team hat damit **eine** Anfrageliste statt zweier. Der Betreff steht im Text.
5. **Alle Wiki-Artikel als Entwurf** (0096). Die Texte sind aus dem FLS26 und tragen dessen Daten. Veröffentlicht wären sie für 2027 falsche Auskünfte.
6. **Drei Auslassungen beim Wiki-Import:** Konrads Mobilnummer aus dem Speaker-FAQ (private Kontaktdaten gehören nicht ins Portal), die Ausstattungstabelle aus „Hallenplan" (steht seit 0094 auf der Messestand-Seite aus dem Produktmodell) und die Notion-Anhänge (deren URLs laufen nach Minuten ab). Der DB-Schenker-Kontakt ist **drin** — Geschäftskontakt eines Dienstleisters, kein privater; bitte im Review bestätigen.

## Offen für Konrad

- **Wiki durchgehen und freischalten.** Zehn Entwürfe stehen unter `/admin/wiki`. Was 2027 gleich bleibt, kann direkt veröffentlicht werden; Daten und Fristen aus 2026 müssen vorher raus.
- **Hallenplan hochladen** unter `/produktion/dateien`, sobald er da ist. Der aus 2026 liegt noch nicht im Repo — die Datei aus dem Chat war nicht mehr abrufbar.
- **Standliste**: kommt laut Konrad in einigen Wochen aus der Produktion. Bis dahin zeigt die Seite den Leerzustand mit Erklärung.
- **Zweites Loom für die Event-App** (`67013b2c5a1a42cfbd2ee1a045a9bc5c`) unter `/admin/videos` am Schlüssel `partner_event_app` eintragen, sobald 0092 live ist.
