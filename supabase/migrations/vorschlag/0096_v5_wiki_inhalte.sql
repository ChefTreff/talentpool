-- 0096 · Welle 5 · Die Wiki-Artikel aus Notion (F9.6)
--
-- Liegt unter `vorschlag/`, bis die Architektur-Session sie anwendet.
--
-- Konrad: „Lege erstmal alle Inhalte aus diesem Wiki an" — gemeint ist
-- `cheftreff.notion.site/…12717aa69eee81589e2cddf668eb3eab`, das Partner- und
-- Speaker-Wiki des FLS26. Zehn Artikel, am 14.09.2026 aus Notion gelesen.
--
-- **Alle als Entwurf.** Das ist die wichtigste Entscheidung in dieser Datei.
-- Die Texte stammen aus dem Jahr 2026 und tragen die Daten von 2026 —
-- 9.–12. April, Deadline 13.03., „App geht am 15.03. live". Im Portal für 2027
-- veröffentlicht wären das keine Informationen, sondern falsche Auskünfte, und
-- eine falsche Auskunft ist schlechter als ein leeres Wiki. Sie stehen also im
-- Editor, sauber formatiert, und werden einzeln durchgesehen und
-- freigeschaltet. `status = 'draft'` heisst: die Redaktion sieht sie, die
-- Partner nicht.
--
-- **Jahresunabhängig angelegt** (`edition_id is null`): so überlebt der Artikel
-- den Jahreswechsel, und was 2027 abweicht, legt ein Overlay darüber (0083).
--
-- Drei bewusste Auslassungen gegenüber Notion:
-- 1. **Konrads Mobilnummer** aus dem Speaker-FAQ ist nicht mit eingezogen —
--    private Kontaktdaten von Team und Freelancern gehören nicht in ein Portal
--    (AGENTS.md, Datenschutz). Stattdessen das Rollenpostfach.
-- 2. **Die Ausstattungstabelle** aus „Hallenplan & Standübersicht" fehlt hier:
--    sie steht seit 0094 auf der Messestand-Seite und kommt dort aus dem
--    Produktmodell. Zweimal gepflegt wäre spätestens im zweiten Jahr eine
--    davon falsch; der Artikel verweist stattdessen auf die Seite.
-- 3. **Bilder und Notion-Anhänge** (Hallenplan-JPG, Druckdatenblatt, PDFs)
--    fehlen: die Notion-URLs laufen nach Minuten ab. Der Hallenplan liegt
--    seit 0094 als Editionsdatei im Portal, die übrigen Dateien lädt die
--    Redaktion dort nach.
--
-- Keine neuen Objekte, keine neuen Rechte — nur Zeilen in `kb_article`.

set search_path = public, extensions;

-- Wiederholbar: ein zweiter Lauf legt nichts doppelt an und überschreibt
-- nichts, was die Redaktion inzwischen bearbeitet hat.
insert into kb_article (slug, edition_id, language, audience, phase, title, body_md, status, sort_order)
values

('location-anfahrt', null, 'de', '{partner,speaker,talent}', 'evergreen',
 'CCH: Location & Anfahrt',
$md$> Der FUTURE LEADER SUMMIT findet im **CCH – Congress Center Hamburg** statt. Das CCH liegt zentral in Hamburg, direkt am Bahnhof Dammtor und in unmittelbarer Nähe zum Park Planten un Blomen.

## Veranstaltungsort

**Congress Center Hamburg (CCH)**
Congressplatz 1
20355 Hamburg
Halle H

## Anreise mit öffentlichen Verkehrsmitteln

- **Bahn:** Das CCH liegt direkt am Bahnhof Hamburg Dammtor (Fernbahn, S-Bahn S11, S21, S31). Von dort sind es etwa 2 Minuten Fußweg zum Haupteingang.
- **U-Bahn:** U1, Haltestelle Stephansplatz (etwa 5 Minuten Fußweg).
- **Bus:** Zahlreiche Buslinien halten am Bahnhof Dammtor oder Stephansplatz.
- **Fahrplanauskunft:** [HVV](https://www.hvv.de/)

## Anreise mit dem Auto

- Das CCH ist über die Hauptverkehrsachsen Hamburgs gut erreichbar.
- **Parkmöglichkeiten:** Direkt am CCH liegt das Parkhaus „CCH/Marseiller Straße" mit über 800 Stellplätzen. Die Zufahrt erfolgt über die Marseiller Straße.
- **Tarife:** pro Stunde 3,00 EUR, höchstens 30,00 EUR am Tag.
- **Anlieferung:** Für Anlieferungen mit dem LKW gibt es einen separaten Ladehof — siehe den Artikel „Anlieferung, Vorabsendung & Aufbau".$md$,
 'draft', 10),

('oeffnungszeiten-ablauf', null, 'de', '{partner,speaker}', 'evergreen',
 'Öffnungszeiten & Ablauf',
$md$> Hier findet ihr eine Übersicht der Öffnungszeiten und den Ablauf mit Rahmenprogramm. Das inhaltliche Programm erscheint auf der Website und in der Event-App.

## Öffnungszeiten CCH (Übersicht)

| Datum | Do. 09. April | Fr. 10. April | Sa. 11. April | So. 12. April |
| --- | --- | --- | --- | --- |
| | **Aufbau** | **Event** | **Event** | **Abbau** |
| Partner: Einlass/Anlieferung | 14:00–18:00 | 09:00 | 09:00 | 07:00 |
| Teilnehmende: Einlass | – | 12:00 | 11:00 | – |
| Programm: Beginn | – | 13:00 | 12:00 | – |
| Programm: Closing (Side Stages) | – | 19:00 | 18:00 | – |
| Programm: Closing (Main Stage) | – | 19:30 | 19:00 | – |
| Messe: Ende normaler Betrieb | – | 20:00 | 20:00 | – |
| Messe: Ende Rahmenprogramm | – | 23:00 | 23:00 | – |
| **Last Person Out** | – | 23:59 | 23:59 | 23:59 |

## Rahmenprogramm

| | Tag | Start | Ende | Ort |
| --- | --- | --- | --- | --- |
| Hackathon | Do. 09.04. | 09:00 | Fr. 14:00 | Factory Hammerbrooklyn |
| Company Tours | Do. 09.04. | 11:00 | 19:00 | CCH & Hamburg |
| Initiativen Welcome | Do. 09.04. | 18:00 | 21:00 | Kühne Logistics University |
| Future of HR | Fr. 10.04. | 09:00 | 11:00 | CinemaxX Dammtor |
| Speaker Reception | Fr. 10.04. | 19:30 | 23:00 | wird noch bekannt gegeben |
| VC Breakfast | Sa. 11.04. | 10:00 | 12:00 | TWOSIX (Radisson Blu) |
| Karaoke & Afterparty | Sa. 11.04. | 19:30 | 23:30 | Industry Stage (CCH) |$md$,
 'draft', 20),

('tickets-akkreditierung', null, 'de', '{partner}', 'vor',
 'Tickets & Akkreditierung',
$md$> Eine Übersicht, wie ihr eure Tickets einlöst und wo ihr euch vor Ort akkreditiert.

## Wie bekommt ihr eure Tickets?

In eurem Portal unter „Tickets" findet ihr die Ticketcodes zur Einlösung. Je nach Paket habt ihr zwei Codes:

1. **Partner-Tickets:** für euer Personal — alle Personen am Stand, bei einer Masterclass oder die euch in anderer Form vertreten.
2. **Talent-Tickets:** für Talente aus eurem Unternehmen. Damit könnt ihr zum Beispiel Trainees oder Juniors eine Teilnahme ermöglichen, unabhängig davon, ob sie unterstützen oder als Gast teilnehmen.

## Für wen sind die Tickets gedacht?

- Euer **Team** vor Ort — Partner-Code und Partner-Ticket
- **Studierende, Auszubildende oder junge Talente** aus eurem Unternehmen — Talent-Code und Talent-Ticket
- **Bewerberinnen und Bewerber**, die ihr in einem entspannten Rahmen kennenlernen möchtet

## Einlösung in zwei Schritten

### Schritt 1: Code eingeben und Ticket einlösen

Gebt euren Partner-Code im Fenster nach dem Klick auf „Ticket kaufen" ein. So erhaltet ihr Zugang zum Shop. Der Partner-Code schaltet Partner-Tickets frei, der Talent-Code die Talent- und Student-Pässe.

### Schritt 2: Tickets personalisieren

Nach dem Kauf müssen die Tickets personalisiert werden — so könnt ihr sie direkt verteilen. Gebt dabei unbedingt für **jede Person eine eigene Mailadresse** an, sonst bekommt sie keinen Zugang zur Event-App.

## Was ist zu beachten?

- **Jede Person braucht ein eigenes Ticket.** Die Bändchen sind nicht übertragbar — auch nicht bei wechselndem Standpersonal an beiden Tagen.
- **Eine eigene Mailadresse je Person**, nicht zehnmal dieselbe.
- Braucht ihr **mehr Tickets**, meldet euch beim Partner-Team; dafür findet sich in der Regel eine Lösung.
- Die **Frist zur Einlösung** steht im Portal auf der Ticketseite. Wir rechnen damit, vollständig auszuverkaufen — je früher ihr einlöst, desto eher können wir nicht genutzte Tickets wieder freigeben.

## Akkreditierung

Die Akkreditierung ist am Aufbautag nachmittags und am ersten Eventtag vormittags vor der Eröffnung möglich, sonst zu den normalen Öffnungszeiten. Wer später kommt, meldet sich am Speaker-Counter am Einlass und bekommt sein Bändchen schneller.$md$,
 'draft', 30),

('event-app', null, 'de', '{partner,speaker}', 'vor',
 'Event-App (Swapcard)',
$md$> Wir nutzen Swapcard als Event-App. Hier steht, wie ihr die App und euer Profil einrichtet.

➡️ [Zur Event-App](https://app.swapcard.com)

Sobald die App für Teilnehmende offen ist, sollten alle Informationen hinterlegt sein. Das betrifft vor allem:

- eure persönlichen Profile
- das Aussteller- bzw. Partnerprofil
- eure Meeting-Slots
- offene Job-Positionen
- weitere Produktangebote

## Wichtig: Einstellung zum Teilen der Kontakte

Damit die Leads wirklich mit allen geteilt werden, muss **jedes Teammitglied** eine Einstellung vornehmen. Geht dafür auf „Teammitglieder". Rechts seht ihr euer Profil — schaltet dort das Feld **„Meine Kontakte"** an. So werden alle Leads mit dem Team geteilt und lassen sich am Ende exportieren.

Am einfachsten ist es, wenn ihr Personen über das Portal zur App hinzufügt: dann ist die Einstellung bereits gesetzt.

➡️ [Vollständiger Step-by-Step-Guide von Swapcard](https://help-attendees.swapcard.com/en/articles/8185513-how-to-use-lead-capture-to-collect-and-process-leads)

## Was passiert in der App?

- Lead-Scanning
- Darstellung und Personalisierung der Agenda
- Bewerbung und Zulassung zu Masterclasses
- Buchung von Meetings an den Meetingpunkten in der Halle
- Austausch mit Teilnehmenden$md$,
 'draft', 40),

('messestand-rueckwand', null, 'de', '{partner}', 'vor',
 'Messestand: Rückwand & Druckdaten',
$md$> Diese Seite hilft euch, die richtige Druckdatei für die Rückwand eures Messestands zu erstellen und fristgerecht einzureichen.

## Wer muss eine Datei einsenden?

Das hängt von der Standgröße ab:

- **1,5 qm Stand:** keine Rückwand
- **4 qm, 9 qm oder 18 qm Stand:** Rückwand mit Druckfläche

Eure Standgröße steht im Portal unter „Messestand".

## Maße für Design und Beschnitt

Für den Druck ist **Beschnitt erforderlich**.

- Umlaufend 1 % Beschnittzugabe (mindestens 20 mm), insgesamt also je 2 % pro Maß.
- Hintergrundgrafiken immer bis in den Beschnitt ziehen.

| Standgröße | Endformat / Sichtrahmen (B × H) | Datenformat inkl. Beschnitt (B × H) |
| --- | --- | --- |
| 4 qm | 1984 × 2976 mm | **2024 × 3036 mm** |
| 9 qm | 2976 × 2976 mm | **3036 × 3036 mm** |
| 18 qm | 5952 × 2976 mm | **6072 × 3036 mm** |

## Grafikanforderungen

- **Sicherheitsabstand:** Texte, Logos und Gesichter mindestens 100 mm vom sichtbaren Rand
- **Dateiformat:** PDF/X-4
- **Farbraum:** CMYK (ISO Coated v2)
- **Auflösung:** mindestens 62 dpi im Endformat
- **Schriften:** einbetten oder in Pfade umwandeln
- **Sicherheitszone** = 100 mm nach innen, zählt nicht zum Beschnitt
- **Endformat** = sichtbarer Rahmen
- **Datenformat** = Endformat + Beschnitt

## Bis wann und wo reiche ich die Druckdatei ein?

Der Upload läuft über das Portal unter „Messestand". Dort steht auch die Frist als Countdown. Meldet euch früh, falls es zu Verzögerungen kommt — dann finden wir gemeinsam eine Lösung.$md$,
 'draft', 50),

('hallenplan-standuebersicht', null, 'de', '{partner}', 'vor',
 'Hallenplan & Standübersicht',
$md$> Der Hallenplan zeigt, wo euer Stand im Raum liegt, wie die Stände zueinander stehen und wo Eingänge, Laufwege und Serviceflächen sind.

## So nutzt ihr den Hallenplan

Den Hallenplan und die Liste aller Aussteller findet ihr im Portal unter „Messestand". Dort steht auch eure Standnummer, sobald sie vergeben ist.

**Sind die Standzuweisungen final?** Nein. Die Zuweisungen sind vorläufig und können sich im Zuge der Planung noch ändern — aus organisatorischen oder technischen Gründen.

## Was ist für euch besonders relevant?

- **Standnummer** — für Orientierung und Kommunikation
- **Standgröße** — sie entscheidet über Grafik, Ausstattung und Druckdaten

## Ausstattung der Stände

Die Basisausstattung je Paket steht im Portal unter „Messestand". Sie kommt dort aus dem Produktkatalog, also aus derselben Liste, aus der die Produktion bestellt — deshalb steht sie hier nicht noch einmal.

Zusätzliche Elemente und Upgrades bucht ihr über den Messeshop.$md$,
 'draft', 60),

('anlieferung-aufbau', null, 'de', '{partner}', 'aufbau',
 'Anlieferung, Vorabsendung & Aufbau',
$md$> Diese Informationen gelten für kleinere Materialien: alles, was ihr selbst in Kartons mit einem Auto mitbringt oder vorab an das CCH senden möchtet, zum Beispiel Merch. Für eigene Messestände und größere Aufbauten mit Transporter oder LKW gelten eigene Regeln — meldet euch dafür beim Partner-Team.

## Adressen und Zufahrten

- **Congress Center Hamburg (CCH):** Congressplatz 1, 20355 Hamburg (direkt am Bahnhof Dammtor)
- **Anlieferung für LKW und Transporter — Eingang B:** Tiergartenstraße 2, 20355 Hamburg, Zufahrt über Renzelstraße/Karolinenstraße
- **PKW-Anlieferung und Kleinmengen:** Parkhaus am Radisson Blu (Conti Park Tiefgarage), Zufahrt über Dammtorstraße, Zugang per Aufzug direkt ins Kongressgebäude

## Pakete vorab an die Location senden

**Wichtig:** Direkte Zusendungen an das CCH sind nicht möglich. Vorablieferungen laufen über den internen Logistiker des Hauses (DB Schenker). So geht ihr vor:

1. Erstellt ein übliches Versandlabel (DHL, UPS, Hermes) mit dieser Empfängeradresse: Schenker Deutschland AG, c/o Future Leader Summit, Messeplatz 1, 20357 Hamburg, Germany.
2. Erstellt zusätzlich das interne Versandlabel für die Verarbeitung auf dem Gelände: c/o Future Leader Summit, c/o [euer Name], HALL-NO. „CCH Halle H", BOOTH-NO. [eure Standnummer].

Eure Standnummer steht im Portal unter „Messestand".

## Wann könnt ihr anliefern und aufbauen?

- **Mittwoch (nur externe Messebauer):** 08:00–18:00 Uhr Anlieferung und Beginn Standaufbau
- **Donnerstag:** 08:00–20:00 Uhr Standaufbau durch externe Messebauer; ab 14:00 Uhr können Partner ihre Stände beziehen und ausstatten
- **Freitag:** ab 08:00 Uhr Standbestückung und finale Anlieferung für alle Partner. Bitte alle Materialien bis spätestens 12:00 Uhr anliefern, damit der Summit pünktlich startet.

## Was könnt ihr während der Veranstaltung einlagern?

- **Am Stand:** nur das, was ihr während der Veranstaltung braucht.
- **Leergut, große Kartonagen, Verpackungen:** sofort aus dem Stand entfernen (Brandschutz). Einlagerung über DB Schenker, Anmeldung erforderlich.
- **Garderobe:** Es gibt eine eigene Garderobe für Partner und Speaker für Jacken und Rucksäcke.

## Abbau

**Sonntag:** 08:00–20:00 Uhr Abbau für alle Partner, Standbestückende und externe Messebauer.

## Wichtige Hinweise zur Zufahrt

- **LKW und Transporter:** Zufahrt ausschließlich über die Tiergartenstraße (Eingang B). Pfand von 100 € in bar bei Einfahrt, Rückgabe bei Ausfahrt. Höchstens 60 Minuten Standzeit in der Ladezone. Folgt den Anweisungen der Einweiser und Sicherheitskräfte.
- **PKW (Kleinmengen):** Bitte ausschließlich das Parkhaus am Radisson Blu nutzen, Zugang per Fahrstuhl direkt ins CCH. **Keine** Anlieferung kleiner Mengen über die Tiergartenstraße.$md$,
 'draft', 70),

('help-desk-kiosk', null, 'de', '{partner}', 'event',
 'Vor Ort: Help Desk & Aussteller-Kiosk',
$md$> Am Aussteller-Kiosk und Help Desk bekommt ihr während der Veranstaltungstage schnell und unkompliziert Hilfe.

## Standort

Der Aussteller-Kiosk liegt in Segment 8, direkt hinter dem Bereich der Impossible Founders Stage und der Masterclasses. Während Aufbau, Veranstaltung und Abbau ist dort jemand für euch da.

## Was bietet der Aussteller-Kiosk?

- **Fragen und Hilfe:** ob Aufbau, Logistik, Orientierung in der Halle oder Technik — wir helfen direkt oder leiten euch weiter.
- **Leihservice:** kurzfristig ausleihbar sind unter anderem Rollhund, Hubwagen, Werkzeug sowie Kabel, Tape und Gaffa. Die Ausleihe gilt für höchstens 30 Minuten und erfolgt gegen Pfand.

## Hinweise für den Aufbau

- **Eigenverantwortung:** Bringt alle Materialien und Werkzeuge mit, die ihr braucht. Der Leihservice ist als Notfalllösung gedacht.
- **Bei Engpässen:** Fehlt doch etwas, kommt einfach zum Kiosk — wir helfen schnell weiter.$md$,
 'draft', 80),

('hotel-unterkunft', null, 'de', '{partner,speaker}', 'vor',
 'Hotelpartnerschaft & Unterkunft',
$md$> Partner, Speaker und Gäste können rabattierte Kontingente in unserem Partnerhotel nutzen.

## Hotelpartner: 25hours Hotel

Zwei Standorte in Hamburg: [Altes Hafenamt](https://25hours-hotels.com/de/hamburg/altes-hafenamt/) und [HafenCity](https://25hours-hotels.com/de/hamburg/hafencity/).

| Haus | Zimmer | Rate inkl. Frühstück |
| --- | --- | --- |
| 25hours HafenCity | M-Room | 150 € |
| 25hours HafenCity | M-PLUS | 170 € |
| 25hours HafenCity | L-Room | 190 € |
| 25hours Altes Hafenamt | M-Room | 170 € |
| 25hours Altes Hafenamt | M-PLUS | 190 € |
| 25hours Altes Hafenamt | L-Room | 210 € |

Kostenlose Stornierung bis 24 Stunden vor Anreise. Früh buchen lohnt sich.

➡️ Buchung über [25hours Hamburg](https://25hours-hotels.com/de/). Den Buchungscode findet ihr im Portal oder erfragt ihn beim Partner-Team.$md$,
 'draft', 90),

('faq-speaking', null, 'de', '{speaker}', 'evergreen',
 'FAQ: Speaking beim Summit',
$md$> Alles rund um das Programm und das Speaking beim FUTURE LEADER SUMMIT.

### Wo finde ich das Programm?

Das Programm erscheint nach und nach auf unserer Website und in der Event-App.

### Kann ich den Titel meiner Keynote ändern?

Ja — meldet euch unter speaker@chef-treff.de.

### Wann ist mein Slot?

Euren Speaker-Slot findet ihr in der Event-App und auf der Website. Bei Fragen meldet euch bei eurem Speaker-Buddy oder unter speaker@chef-treff.de.

### Wann soll ich da sein?

Bitte seid spätestens 30 bis 60 Minuten vor eurem Auftritt vor Ort. 5 bis 10 Minuten vorher werdet ihr an eurer Bühne verkabelt.

### Wo melde ich mich an?

Es gibt eine eigene Speaker-Akkreditierung direkt am Eingang. Dort meldet ihr euch und werdet abgeholt. Bei dringenden Fragen am Eventtag erreicht ihr uns unter speaker@chef-treff.de.

### Was gibt es an Technik?

Ihr bekommt einen Klicker und ein Mikrofon — je nach Bühne Handmikro oder Headset.

### Kann ich Slides mitbringen?

Ja. Wir brauchen sie bis drei Tage vor dem Event. Nutzt eure Slides als unterstützendes Element, zum Beispiel mit Fotos oder Key Learnings. Slides mit viel Text oder Eigenwerbung sind bei uns nicht gern gesehen.

### Gibt es eine Speaker Lounge?

Ja, es gibt einen eigenen Bereich für Speaker. Wir zeigen ihn euch bei der Ankunft; ihr könnt dort eure Sachen lassen und euch zurückziehen.

### Gibt es vor Ort Essen?

Ja, in der Speaker Lounge steht kostenfreies Catering für Speaker bereit.$md$,
 'draft', 100)

on conflict do nothing;

select harden_definer_functions();
