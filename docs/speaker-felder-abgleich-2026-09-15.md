# Speaker-Felder: Paulinas Master-Liste gegen unser Datenmodell

**Stand:** 15.09.2026 · Build-Session · Grundlage ist `Excel Pauli Übersicht_KG.xlsx` (119 Spalten, eine Beispielzeile mit Erläuterungen).

## Woher die Liste kommt — und warum das zählt

Die Struktur stammt erkennbar aus der **Münchner Sicherheitskonferenz**: Spalten wie `Delegation`, `Delegationscode`, `Nominated Observer`, `Blue badge holder`, `Country / Organisation (EU / NATO / UN)`, `Global North / Global South`, `WTZ Check`, `HBH` („Zimmer im Bayerischen Hof") und `Position MSC` gehören zu einer Veranstaltung mit **staatlichen Delegationen, Protokollabteilung und Sicherheitsüberprüfung**.

Das ist kein Einwand gegen die Liste — im Gegenteil, sie ist sehr gut durchdacht. Aber sie beantwortet zu großen Teilen Fragen, die wir nicht haben. Ein Speaker kommt bei uns als Person, nicht als Teil einer Delegation; es gibt keine Botschafterin, deren Anrede protokollarisch feststeht, und keine Akkreditierung, die eine Sicherheitsbehörde freigibt.

Die Liste ist deshalb vor allem an einer Stelle wertvoll: **sie zeigt, was eine erfahrene Programmleitung im Alltag wirklich vermisst.** Genau danach habe ich sie gelesen.

## Ergebnis in Zahlen

| | Spalten |
|---|---|
| Bei uns schon vorhanden (teils unter anderem Namen) | **44** |
| Echte Lücke, Ergänzung empfohlen | **13** |
| Echte Lücke, aber bewusst **nicht** übernehmen | **62** |

---

## A · Was fehlt und was ich empfehle

Reihenfolge nach Nutzen im Alltag, nicht nach Spaltenposition.

### 1. An- und Abreise, strukturiert (Spalten BV–BY, CA–CE)

**Ist:** Wir haben `/speaker/travel` mit Hotel- und Shuttle-Kontingenten. Ankunftszeit und Flug-/Zugnummer landen dort höchstens als Freitext im Feld `details` einer Shuttle-Buchung.
**Soll:** Datum, Uhrzeit, Verkehrsmittel und Verbindungsnummer je Richtung als eigene Felder.
**Warum:** Das ist der Block, an dem in der Speaker-Betreuung am meisten hängt — wer wann am Dammtor steht, wer abgeholt wird, wann eine Bühne umgeplant werden muss, weil ein Flug später landet. Als Freitext in einem JSON-Feld ist es weder auswertbar noch sortierbar; eine Ankunftsliste für die Produktion lässt sich daraus nicht bauen.
**Wo:** Speaker pflegt es selbst unter **Speaker-Portal → Anreise & Hotel**. Team liest es im **Speaker-Lead-Board** und — wichtiger — als **Ankunftsliste in der Produktion** (nach Datum und Uhrzeit sortiert).
**Aufwand:** Eine Migration (eigene Tabelle `speaker_travel` je Profil, oder Felder am `speaker_profile`), ein Formularabschnitt, eine Produktionsliste.

### 2. Ernährung und Unverträglichkeiten (Spalte DO)

**Ist:** Fehlt vollständig — für Speaker, Volunteers und Team.
**Soll:** Ein Feld je Person, dazu eine Auswertung fürs Catering.
**Warum:** Speaker Lounge, Speaker Reception, Volunteer-Verpflegung. Heute läuft das über Zuruf und Listen außerhalb des Systems.

> **Entscheidung nötig.** Eine Allergie ist eine **Gesundheitsangabe** (Art. 9 DSGVO), keine normale Stammdate. Wenn wir das aufnehmen, braucht es: freiwillige Angabe mit erklärtem Zweck, Sichtbarkeit nur für Catering und Hospitality (nicht im Board, nicht im Export), und Löschung nach der Edition. Sauberer Mittelweg: **eine kurze Freitextzeile „Ernährung / Unverträglichkeiten"**, ausdrücklich als freiwillig gekennzeichnet — keine Auswahlliste mit medizinischen Kategorien. Das gehört ins Entscheidungslog, bevor es gebaut wird.

**Wo:** Speaker-Portal → Anreise & Hotel (bei der Buchung), Volunteer-Profil; Auswertung in der **Produktion**.

### 3. Anrede: Brief, förmlich, persönlich (AG, AH, AI, AJ)

**Ist:** `person.title` („Dr."), `first_name`, `last_name`, `pronouns`.
**Soll:** Eine fertige Briefanrede DE und EN plus eine persönliche Anrede und die Angabe, welche gilt.
**Warum:** „Sehr geehrte Frau Prof. Dr. Zehle" lässt sich aus Einzelfeldern **nicht zuverlässig** zusammensetzen — Doppeltitel, Namenszusätze, Personen ohne Geschlechtsangabe, englische Anreden. Paulina hat das nicht ohne Grund als eigene Spalte geführt. Jede Serienmail an Speaker hängt daran, und ein falsch zusammengebauter Name ist die eine Stelle, an der ein Portal peinlich wird.
**Wo:** **Admin → Personen** (Team pflegt, einmal), nicht im Speaker-Portal — niemand schreibt sich selbst eine Briefanrede.

### 4. Zusage- und Absagedatum, Absagegrund (Q, R)

**Ist:** `speaker_profile.pipeline_status` kennt `confirmed` und `declined`, aber **ohne Zeitstempel**. Wir wissen also, *dass* jemand zugesagt hat, nicht *wann*.
**Soll:** `confirmed_at`, `declined_at`, `decline_reason`.
**Warum:** Zwei Dinge, die heute nicht gehen: „Wie lange dauert bei uns eine Zusage?" und „Wer hat vor drei Wochen zugesagt und noch kein Profil ausgefüllt?". Der Absagegrund ist für die Planung der nächsten Edition mehr wert als die Absage selbst.
**Wo:** Wird beim Statuswechsel automatisch gesetzt; sichtbar im **Speaker-Lead-Board**.

### 5. Einladungsrunde und -kanal (N, O)

**Ist:** `invited_at` (ein Datum), sonst nichts.
**Soll:** Welche Welle („Runde 2, Januar") und auf welchem Weg (Mail, Brief, persönlich).
**Warum:** Paulinas Kommentar in der Beispielzeile sagt es direkt: *„für uns interessant vor allem wer"*. Bei 150 Speakern über fünf Einladungsrunden ist das der Unterschied zwischen einer Pipeline und einer Liste.
**Wo:** **Speaker-Lead-Board**, als Filter.

### 6. Kurzbezeichnung fürs Programm (AL, AM)

**Ist:** `job_title` und `organization_name` getrennt; das Programm setzt sie zusammen.
**Soll:** Eine redaktionelle Zeile: „Head of Programs, ChefTreff, Hamburg".
**Warum:** Die Zusammensetzung ist eine redaktionelle Entscheidung, keine technische — mal mit Stadt, mal ohne, mal gekürzt, weil der Titel 60 Zeichen hat. Heute müsste dafür `job_title` verfälscht werden.
**Wo:** **Speaker-Lead-Board** (Redaktion), Ausgabe in Programm, Website und Event-App.

### 7. Jobtitel auf Englisch (DA)

**Ist:** Bio gibt es DE und EN, `job_title` nur einmal.
**Soll:** `job_title_en`.
**Warum:** Das Programm ist zweisprachig; die Funktion ist der Teil, den man am ehesten übersetzt.
**Wo:** wie oben.

### 8. Mobilnummer getrennt von der Festnetznummer (AQ, AR)

**Ist:** `person.phone` — eine Nummer.
**Soll:** Mobil zusätzlich.
**Warum:** Vor Ort zählt nur die Mobilnummer. Wer die Zentrale einträgt, ist am Eventtag nicht erreichbar.
**Wo:** Speaker-Portal → Profil.

### 9. Ansprechperson ohne Portalzugang (AT, AU, AV)

**Ist:** `assistant_person_id` — eine Assistenz **mit** eigenem Login, die stellvertretend pflegt.
**Soll:** Zusätzlich ein einfacher Kontakt (Name, Mail, Telefon) ohne Zugang.
**Warum:** Viele Speaker haben ein Office oder eine Agentur, die man anschreibt, die aber nichts im Portal tun soll. Heute müssten wir dafür ein Konto anlegen, das niemand benutzt — das ist mehr Datenhaltung, nicht weniger.
**Wo:** Speaker-Portal → Profil, sichtbar im Board.

### 10. Individuelle Frist (S)

**Ist:** Fristen liegen je Edition und Zielgruppe in `deadline`.
**Soll:** Eine abweichende Frist je Speaker.
**Warum:** Paulinas Notiz: *„konnten wir uns selber setzen"*. Für Nachzügler und für Speaker, die spät dazukommen.
**Wo:** **Speaker-Lead-Board**. Niedrige Priorität — erst bauen, wenn der Bedarf im Betrieb auftritt.

### 11.–13. Kleinere Lücken, gesammelt

| Spalte | Fehlt | Empfehlung |
|---|---|---|
| CO `Gruppe` / CQ `Portal Category` | Freie Gruppierung für Auswertungen | Über `tags` an der Session bzw. `person.tier` ggf. schon abgedeckt — erst klären, wofür Paulina es genutzt hat |
| CS–CW getrennte Kommentare (Hotel, Transport, Protokoll) | Wir haben **ein** `internal_notes` | Nicht mehrere Felder, sondern der Kommentar wandert zu dem Ding, das er betrifft: Hotelkommentar an die Buchung, Transportkommentar an die Anreise |
| BH/BI `Preferred Hotel / Room` | Wunsch vor der Zuteilung | Über `hotel_tier` + Kontingentbuchung weitgehend abgedeckt; ein Wunschfeld nur, wenn wir mehrere Hotels anbieten |

---

## B · Was wir schon haben (Auswahl)

| Paulinas Spalte | Bei uns |
|---|---|
| Name, Surname, Date of Birth, Gender, Nationality, Language | `person.first_name / last_name / birthdate / gender / nationality / preferred_language` |
| Persontype, Type | `role_assignment` (Rolle je Bereich) und `speaker_profile.speaker_type` |
| Position, Institution | `speaker_profile.job_title`, `organization_name` / `org_id` |
| Email Portal, Email Personal | `person_email` mit `type` (`business` / `private`) — mehrere Adressen je Person sind vorgesehen |
| Twitter | `speaker_profile.socials` (JSON, beliebige Kanäle) |
| Invitation Date | `speaker_profile.invited_at` |
| Registration Link, Reminder 1–3 | `mail_log` — jede Mail mit Vorlage, Zeitpunkt und Zustellstatus, statt sechs Datumsspalten |
| Cost Coverage | `speaker_profile.travel_costs_covered` + Freigabe mit Person und Zeitpunkt |
| Booked Hotel, Booking Confirmation, Early Checkin / Late Checkout | `hospitality_booking` über Kontingente |
| Ausweistyp, Ausweiszusatz, Ausweisnr, Ausgegeben am | `ticket.pass_type`, `lounge_access`, `barcode`, `checked_in_at` |
| ASP | `speaker_profile.owner_person_id` (Speaker-Buddy) |
| Photo | `speaker_profile.photo_asset_id` |
| Comment 1 / 2 | `speaker_profile.internal_notes` |
| Newsletter Subscription | `consent_record` mit Version und Zeitpunkt |

**An zwei Stellen sind wir deutlich weiter:** Mails stehen bei uns als Verlauf mit Zustellstatus statt als „Reminder 1/2/3"-Spalten, und die Einwilligung ist versioniert statt ein Haken.

---

## C · Was ich bewusst **nicht** übernehmen würde (62 Spalten)

**Protokoll und Diplomatie** (A `Protocol Title`, C `English Title`, E `Affix`, AK `Protocol`, AJ, AN `Position MSC`) — „Her Excellency", „Ambassador", „6.02 PS – Private Sector". Bei uns spricht niemand eine Botschafterin an. Die **Briefanrede** übernehmen wir (Punkt 3), den Apparat dahinter nicht.

**Delegationen** (AY, AZ, BA, BB, BC, BJ, BZ, CE) — Delegationscode, Sperre, Nominated Observer, gemeinsame An- und Abreise einer Delegation. Wir haben Organisationen, keine Delegationen; das Gegenstück ist `org_edition`.

**Geopolitische Einordnung** (AD `Country / Organisation` NATO/UN/EU, AE `Region`, AF `Global North / South`) — sinnvoll für eine Sicherheitskonferenz, ohne Funktion für uns.

**Badge-Farben und Sicherheit** (BD `Staff (Green)`, BE `Staff (Red)`, BF `Security`, BG `Floater Blue`, CZ `WTZ Check`, CX `VIP List`, BU `VIP Flight`) — bei uns entscheidet der Pass-Typ am Ticket, und eine Sicherheitsüberprüfung gibt es nicht.

**Privatadresse** (AA `Street`, AB `ZIP City`, AC `Country / Address`) — wir brauchen sie nicht. Stadt und Land stehen an `person`, die Rechnungsadresse an der Organisation. Eine Privatanschrift zu speichern, die niemand nutzt, ist genau das, was Datenminimierung verbietet.

**Newsletter-Themen** (DB–DN, 13 Spalten für Regionen und Sachgebiete) — Segmentierung gehört ins CRM, nicht ins Portal. Bei uns liegt die Einwilligung im Portal, die Themenauswahl in HubSpot.

**Hotelabwicklung im Detail** (BN `HBH`, BP `Booked Room`, BR `Room Rate`) — wir arbeiten mit Kontingenten und Kategorien; der Zimmerpreis ist Sache des Hotels und steht auf dessen Rechnung.

**Interne Hilfsspalten** (H `TMP`, CH `TP Event`, CI `TP Zeit`, CN `Documents Hand Over`, CM `Ausgegeben an`) — Artefakte eines Excel-Prozesses, den wir nicht haben.

---

## D · Was zum Plan Chat muss

Jeder neue Datenpunkt ist eine Entscheidung, keine Oberflächenfrage. Sobald Konrad ausgewählt hat, gehen diese Punkte an die Architektur-Session:

1. **Ernährung und Unverträglichkeiten** — Gesundheitsangabe nach Art. 9 DSGVO. Zweck, Sichtbarkeit, Löschfrist müssen vor dem Bau stehen.
2. **An-/Abreise** — eigene Tabelle oder Felder am Profil, und wer sie sehen darf (Produktion braucht sie, das Board nicht unbedingt).
3. **Briefanrede** — neues Feld an `person`, also außerhalb des Speaker-Kontexts; betrifft auch Talent und Partner.
4. **Zusage-/Absagedatum** — Zeitstempel beim Statuswechsel, dazu ein Vokabular für Absagegründe.
5. **Kontakt ohne Login** — bewusst **kein** `person`-Datensatz, sondern Felder am Profil; sonst wächst die Personentabelle um Karteileichen.

## E · Entschieden und gebaut (Konrad, 15.09.)

Konrad hat vier Punkte ausgewählt; die übrigen bleiben liegen. Gebaut als
Migrationen `0097`–`0099` unter `vorschlag/`, jede mit Test.

| Punkt | Wo eingetragen | Wo ausgewertet |
|---|---|---|
| **An- und Abreise** | Speaker-Portal → „Anreise & Unterkunft" (Speaker **und** Assistenz) | Lead-Portal → „An- & Abreise" (nur die eigenen Speaker), Admin → „An- & Abreise" (alle, mit Filtern nach Tag, Verkehrsmittel, Abholung, Suche) |
| **Ernährung** | Speaker-Portal → „Anreise & Unterkunft"; Volunteer-Profil, sobald angenommen | Produktion → „Catering" (Bestellgrundlage), Admin → „Catering" (dazu der Stand der Rückmeldungen) |
| **Briefanrede** | Admin → Personen → Detail, mit Vorschlag für den Normalfall | Serienmails |
| **Zusage- und Absagedatum** | wird beim Statuswechsel gesetzt; der Absagegrund wird abgefragt, bevor umgeschaltet wird | Lead-Board |

### Drei Entscheidungen, die im Bauen entstanden sind

1. **Die Ernährung trägt nur die Person selbst ein — die Assistenz nicht.**
   Ursprünglich war die Assistenz zugelassen (sie pflegt Hotel und Anreise
   ohnehin). Beim Bauen wurde der Fehler sichtbar: sie darf die Angabe **nicht
   lesen** — es gibt keine RPC, die sie zu einer fremden Person herausgibt —,
   sähe also ein leeres Formular und würde beim Speichern eine hinterlegte
   Allergie löschen. Am Ende steht jemand mit der falschen Mahlzeit da. Der
   Parameter für eine fremde Person ist deshalb ganz entfallen; der Test prüft,
   dass es ihn nicht gibt.
2. **Keine RPC gibt Ernährung und Name zusammen heraus.** `catering_summary`
   zählt, `catering_notes` gibt Sätze ohne Person. Die Oberfläche könnte den
   Namen also gar nicht anzeigen, selbst wenn jemand ihn wollte. Restrisiko,
   das bleibt: ein sehr spezieller Hinweis in einer kleinen Gruppe ist
   mittelbar zuordenbar — dagegen hilft nur Sparsamkeit, deshalb steht im
   Formular, dass eine kurze Angabe reicht.
3. **Der Freitext steht nicht im Audit-Log.** Ein Protokoll, das die Allergie
   mitschreibt, hebt genau den Schutz auf, den die RPCs darüber aufbauen. Der
   Eintrag hält fest, *dass* jemand etwas gespeichert hat, nicht *was*.

### Zur Abholung

`needs_pickup` ist ein **Wunsch**, keine Buchung. Die Buchung läuft weiter über
das Shuttle-Kontingent; sonst gäbe es zwei Stellen, an denen eine Abholung
entsteht, und keine wäre die Wahrheit.

## F · Vorschlag zur Reihenfolge

1. **Jetzt:** An-/Abreise und Ernährung. Beides fehlt vollständig, beides wird ab dem Moment gebraucht, in dem die ersten Speaker zusagen.
2. **Mit dem nächsten Speaker-Baustein:** Zusage-/Absagedatum, Einladungsrunde, Kurzbezeichnung, Jobtitel EN — alles im Speaker-Lead-Board, eine Migration.
3. **Wenn der Betrieb es verlangt:** individuelle Frist, Hotelwunsch, Gruppierung.
4. **Briefanrede:** sobald die erste Serienmail an Speaker ansteht.

## G · Offene Frage an Paulina

Zwei Spalten habe ich nicht sicher zuordnen können: **CO `Gruppe`** und **CQ `Portal Category`**. Beide klingen nach einer Sortierung fürs Teilnehmerportal, könnten aber auch MSC-spezifisch sein. Bevor wir etwas bauen, lohnt eine Rückfrage, wofür sie die beiden benutzt hat — falls dahinter „welche Speaker gehören inhaltlich zusammen" steckt, ist das bei uns eher ein **Track** oder ein **Tag an der Session** als ein Feld an der Person.
