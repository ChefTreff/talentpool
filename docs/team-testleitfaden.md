# Team-Testleitfaden FLS27-Portale — Testrunde ab Montag, 05.10.2026 (Stand 04.10.)

Für alle Teammitglieder, die ab Montag Zugriff auf `portal.chef-treff.de` bekommen. Ziel der Runde: Fehler, Stolperstellen und fehlende Funktionen finden, bevor Partner, Speaker und Talents am 14.10. hineinkommen. Konrad gibt die Zugänge frei und sammelt das Feedback; die Architektur-Session verteilt es in die Backlogs (`docs/feedback/*.md`) — nichts geht verloren, jeder Punkt bekommt eine Nummer.

## 1 · Anmelden

1. Du bekommst eine Einladung per E-Mail (Konrad legt dich unter Admin → Verwaltung → Zugänge → „Teammitglied anlegen“ an und vergibt deine Rollen — seit 0250 auch für Personen, die noch kein Profil haben; die Mail geht an die hinterlegte Arbeitsadresse).
2. Anmelden auf `portal.chef-treff.de` mit deiner Arbeitsadresse: Magic Link, kein Passwort. Der Link gilt kurz und nur einmal; neu anfordern, wenn er abgelaufen ist.
3. Nach dem Login landest du auf dem Einstieg deiner Rolle. Teammitglieder arbeiten im **Admin** (`/admin`), dort entscheiden Rollen und Abschnitte, was du siehst. Externe Portale (Talent, Speaker, Partner, Volunteers, Hackathon, Stage Leads) siehst du nur, wenn Konrad dir zusätzlich eine solche Rolle gibt — zum Testen aus Sicht eines Partners oder Speakers bitte bei ihm melden.

## 2 · Spielregeln im Testbetrieb

- **Jede Seite zeigt unter der Kopfzeile einen gelben Streifen „Testbetrieb“** mit derselben Regel (seit #306); er verschwindet zum Go-live.
- **Es ist die Live-Datenbank.** Alles, was du anlegst, ist echt. Testdaten tragen deshalb immer die Kennung **ZZTEST** im Namen (Person, Organisation, Challenge, Artikel …); nur solche Daten dürfen geändert oder gelöscht werden. Daten ohne ZZTEST nicht anfassen.
- **Keine echten Personendaten Dritter** eintippen (keine Adressen oder Telefonnummern von Freunden, keine Fotos fremder Personen). Für Personen-Tests die ZZTEST-Personen nutzen oder deine eigene Arbeitsadresse.
- **Knöpfe, die nach außen schreiben, nicht drücken:** Abgleich nach HubSpot oder SevDesk, Übertragung nach Sanity (Website) oder Swapcard (Event-App), Drive-Spiegelung, Mailversand an echte Adressen. Diese Wege testet Konrad. Trockenlauf-Knöpfe („Vorschau“, „Trockenlauf“) sind erlaubt.
- **Löschen nur mit ZZTEST-Daten.** Profil löschen, Personen löschen und Sperrliste sind echte Vorgänge mit Audit.
- **Browser:** aktueller Chrome, Safari oder Firefox, einmal auch am Handy (Hochformat). Sprache oben umschalten (DE/EN) und beide Fassungen anschauen.

## 3 · So meldest du Feedback

Gesammelt an Konrad (eine Nachricht oder eine Liste je Tag), je Punkt eine Zeile:

`Bereich · Seite (Adresse) · Was ich getan habe · Was ich erwartet habe · Was passiert ist · Browser/Gerät · ggf. Screenshot`

Beispiel: `Partner · /partner/messestand · Hallenplan geöffnet · Vorschau sehen · nur Download-Knopf, keine Vorschau · Safari Mac · Bild angehängt`

Bitte auch das Positive und das Verwirrende melden („wusste nicht, wo ich klicken soll“ ist ein wertvoller Befund). Schweregrad kurz dazu: **blockiert** (geht nicht weiter), **falsch** (geht, aber falsches Ergebnis), **unschön** (geht, aber stört).

## 4 · Testwege je Bereich (Admin)

Jeder Weg: öffnen, einmal den Normalfall durchspielen, einmal einen Fehlerfall (leeres Pflichtfeld, falsche Datei, doppelter Eintrag), einmal am Handy.

| Bereich | Adresse | Normalfall | Schau besonders auf |
|---|---|---|---|
| Übersicht und Leiste | `/admin` | Alle Punkte deiner Rolle erreichbar, Vorschau je Rolle | fehlende oder doppelte Punkte, Beschriftungen |
| Personen und Verwaltung | `/admin/personen`, `/admin/verwaltung` | ZZTEST-Person suchen, Profil öffnen, Zugang einladen, Rolle vergeben, Sperre setzen und aufheben, Protokoll lesen | Was eine gesperrte Person noch sieht; Audit-Einträge vollständig |
| Dubletten | `/admin/dubletten` | ZZTEST-Paar in der Vorschau vergleichen, zusammenführen, Rückweg | Vorschau stimmt mit Ergebnis überein; Rückweg stellt alles her |
| Einwilligungen und Sperrliste | Verwaltung → Einwilligungen / Sperrliste | Geschichte einer ZZTEST-Person lesen, Adresse auf der Sperrliste suchen | Keine Klartextadressen in der Sperrliste |
| Medien | `/admin/medien` | Video, Link, Datei (mit Zielgruppe), Ansprechpersonen-Foto pflegen | Zielgruppe wirkt im Portal; Foto sitzt in der Dreiecksform |
| Produktion | `/admin/produktion/…` (Dateien, Produkte, Bestellungen, Stände, Regie) | Hallenplan mit Zielgruppe hochladen, Artikel anlegen und ändern, Lieferantenliste als CSV | Rechte je Rolle; CSV öffnet sich korrekt in Excel/Numbers |
| Partner | Partner-Abschnitte (Organisationen, Logo-Wand mit Kategorie, Produkte, Integrationen) | ZZTEST-Organisation öffnen, Logokategorie setzen, Checkliste prüfen | Auffangsatz „ohne Stufe ⇒ Official“; keine scharfen Abgleiche |
| Bewerbungen | `/admin/bewerbungen` | Filter (Format, Session, Status, Einwilligung, Suche), Seiten, Sammelentscheidung mit Rückfrage | Bewerbungen ohne Einwilligung sichtbar markiert; Suche mit % und _ wörtlich |
| Initiativen und Award | `/admin/initiativen`, öffentlich `/award` und `/award/bewerben` | Funnel-Stufe mit Notiz setzen, Award-Bewerbung öffentlich einreichen (ZZTEST-Initiative, Testbilder), Status im Admin entscheiden, Abstimmung ohne Login | Keine Kontaktdaten öffentlich; Fristen (Platzhalter) greifen |
| Hackathon | `/admin/hackathon`, Teilnehmer-App `/hackathon` | Challenge mit Track und Wunschprofil freigeben, Bewerbung mit Track-Wunsch und Portfolio, Team, Datensatz, Abgabe mit Frist, Leaderboard | Fremde Teams sehen nur Bestätigtes; keine Personendaten im Leaderboard |
| Programm und Speaker | `/admin/programm`, Speaker-Bereich, `/speaker-leads/board`, `/speaker-leads/regie` | Slot verschieben, Session bearbeiten, Rückgabe, Regieplan, Folien einer ZZTEST-Session | Drei Programmansichten gleich strukturiert; Speaker-Namen ab 45 Minuten auf der Karte |
| Company Tours | Admin → Company Tours (Zuordnung folgt mit #292) | Touren je Edition, Partner zuordnen und tauschen | Audit bei Zuordnung und Tausch |
| Wiki und Assistent | `/admin/wiki`, Wiki-Bubble im Partner-Portal | Artikel lesen, Kategorie, Entwurf veröffentlichen (nur Konrad) | Antworten des Assistenten passen zur Zielgruppe |
| Fristen | `/admin/fristen` | Fristen je Zielgruppe lesen | Platzhalter als solche erkennbar |

## 5 · Testwege aus Sicht der Externen (mit zusätzlicher Rolle)

| Portal | Adresse | Normalfall |
|---|---|---|
| Talent | `/profil`, `/events`, `/hackathon`, `/benachrichtigungen` (folgt) | Profil ausfüllen, Porträt hochladen (ein Klick), Lebenslauf, Event ansehen und Anmeldelink kopieren, Hackathon-Bewerbung |
| Speaker | `/speaker`, `/speaker/profil`, `/speaker/session`, `/speaker/travel` | Profil, Einwilligungen, Folien hochladen, Hallenplan (nur Speaker-Plan), Anreise und Hotel |
| Partner | `/partner`, `/partner/messestand`, `/partner/shop`, `/partner/media`, `/partner/event-app`, `/partner/hackathon`, `/partner/buehne` | Eure Daten, Checkliste, Shop-Bestellung (ZZTEST, nicht absenden an Lieferanten), Media Kit, Event-App-Anleitung, Challenge anlegen, Standbühne |
| Volunteers | `/volunteers` (Wiki, Schichten), Check-in | Schicht ansehen, Wiki lesen; Check-in mit Kiosk-Gerät (Konrad) |
| Stage Leads | Einstieg nach Login (eigene Bühne) | Nur die eigene Bühne sichtbar, fremde Entwürfe nicht |

## 5a · Speaker und Stage Leads — Testwege im Detail

Ergänzt die Zeile „Programm und Speaker“ (Abschnitt 4) und die Zeilen „Speaker“ und „Stage Leads“ (Abschnitt 5). Je Seite ein Normalfall und ein Fehlerfall; dazu gehört jedes Mal der Blick am Handy und in beiden Sprachen.

**Zugang — bei Konrad anfragen**
- Den Speaker-Bereich im Admin (Gruppe „Speaker & Programm“) sehen Bereichslead Speaker und Programm-Team. **Hotelanfragen bestätigen oder ablehnen** dürfen beide; **Reisekosten** (freigeben, zurückweisen, auszahlen) nur der Bereichslead Speaker — Geld läuft über die Bereichsleitung; **Hotel-Kontingente** (Kapazität, aktivieren) ändert nur Konrad, du siehst sie zum Lesen.
- Das **Speaker-Portal** siehst du, wenn Konrad dir ein ZZTEST-Speaker-Profil mit deiner Arbeitsadresse anlegt oder dich als Kontakt mit Zugang an einen ZZTEST-Speaker hängt. Mit mehreren Profilen wählst du oben in der Leiste unter „Du arbeitest für“. Das Portal startet auf Englisch — oben auf DE umschalten.
- Das **Stage-Lead-Portal** öffnet die Rolle Speaker-Manager auf der Bühne „TEST — Bühne Stage Lead“. Mit Programm-Team oder Bereichslead Speaker siehst du darin alle Bühnen.
- **ZZTEST-Speaker anlegen:** `/speaker-leads/pipeline` → „Speaker anlegen“ (im Admin gibt es dafür keinen eigenen Knopf, ADM-004). Der Name beginnt mit ZZTEST, als E-Mail deine eigene Arbeitsadresse mit Zusatz, z. B. `vorname+zztest1@chef-treff.de` — Einladungen und Freigaben landen dann bei dir. Den Hotel-Anspruch setzt das Speaker-Team im Admin (Speaker → Karte „Pass & Hospitality“); ohne ihn zeigt die Anreise kein Hotel.

**Nicht drücken** (das testet Konrad): „Übertragen“ auf der Website-Seite (schreibt nach Sanity, ist ohnehin gesperrt), „Verbindung prüfen“ und „Spiegelung nachholen“ unter Technik (Drive, K-03), „Ausstellen“ bei den Speaker-Tickets (legt ein Ticket bei vivenu an), „Freigeben“ bei den Reisekosten (Reiter „Reisekosten“ unter Freigaben; erzeugt die Auslagenrechnung und schickt den SevDesk-Beleg und eine Mail ans Qonto-Postfach). Einträge, die mit „TEST —“ beginnen, hat Konrad angelegt; entscheide über sie nur, wo er es sagt.

**Danach zurücknehmen**
- Eine Hotelbuchung belegt echtes Kontingent → „Stornieren“.
- Ein Shuttle nur mit Fahrgast „ZZTEST …“ anfordern und danach stornieren, sonst landet die Fahrt im Export für den Fahrdienst.
- Folien nur an eine Session auf einer TEST-Bühne hochladen und danach „Entfernen“. Sobald der Drive-Schlüssel gesetzt ist (K-03), legt der Server von jeder Folie eine Kopie im Technik-Ordner an — bei einer echten Bühne im Ordner dieser Bühne.
- Bankverbindung nie echt, nur die Beispiel-IBAN `DE89 3704 0044 0532 0130 00`.

**Speaker-Portal**

| Seite | Normalfall | Fehlerfall | Schau besonders auf |
|---|---|---|---|
| `/speaker` Übersicht | Band mit dem einen nächsten Schritt, Checkliste („x / y erledigt“), Termine, Ansprechpersonen mit Foto und Kontakt | Profil ohne Foto: der Schritt „Foto“ steht offen, der Knopf im Band führt dorthin | Die Checkliste zählt mit, sobald ein Schritt erledigt ist; Texte in beiden Sprachen |
| `/speaker/profil` Profil | Person, Bio (DE/EN) und Links speichern; Foto hochladen; Einwilligungen setzen und wieder zurücknehmen; Kontakt (Assistenz, Agentur, Office) eintragen | Ohne englische Kurzbio bleibt „Speichern“ gesperrt; Foto als PDF oder über 10 MB → Hinweis am Foto; Kontakt ohne das Häkchen „Diese Person weiß Bescheid …“ wird nicht gespeichert | Das Porträt sitzt in der Dreiecksform; beim Verlassen mit ungespeicherten Änderungen kommt eine Rückfrage |
| `/speaker/session` Session | Titel und Beschreibung (DE/EN) speichern; Folien hochladen, durch eine neue Datei ersetzen, entfernen | Falsches Format („Bitte PDF, PowerPoint oder Keynote.“) und Dateien über 100 MB werden abgewiesen | Ersetzen behält die alte Fassung; „Für Summit Slides freigeben“ verlangt die Einwilligung im Profil |
| `/speaker/travel` Anreise | Anfahrt lesen; An- und Abreise speichern; Shuttle anfordern; Hotel: „Buchen“ → Formular → die Anfrage steht unter „Meine Buchungen“ | Shuttle-Zeit außerhalb des Fensters (erster Tag ab 12 Uhr, sonst ab 9 Uhr, jeweils bis 21 Uhr) und Hotel-Datum außerhalb des Kontingents → Meldung am Feld statt Fehlerseite; fehlt die Einwilligung, fragt „Buchen“ sie zuerst ab | Der Hotelbereich erscheint nur mit Hotel-Anspruch; ausgebucht ⇒ Warteliste |
| `/speaker/tickets` Tickets | Die Karte zeigt den Stand (vor der Bestätigung eine Erklärung, danach „wird ausgestellt“, mit Ticket der QR-Code); Begleitticket anfragen (Vorname, deine +zztest-Adresse) und zurückziehen | Ohne Vorname oder E-Mail bleibt „Begleitticket anfragen“ gesperrt | Nur die Speakerin selbst sieht den QR-Code, die Assistenz nicht; Konrads Testkonto hat ein ausgestelltes Testticket |
| `/speaker/reisekosten` Reisekosten | Nur bei Kostenübernahme: Beleg erfassen (Datum, Kategorie, Betrag, Beschreibung, Datei), Bankverbindung hinterlegen, „Antrag freigeben“ | Beleg als falscher Typ („Bitte PDF oder ein Bild.“); „Antrag freigeben“ bleibt gesperrt, bis jede Zeile einen Beleg und die Bankverbindung hinterlegt ist | Ohne Kostenübernahme leitet die Adresse auf die Übersicht; die Auslagenrechnung (PDF) stimmt mit den Zeilen überein |
| `/speaker/media` Deine Bilder | Der Leerzustand („Noch keine Fotos“) sagt, wann Bühnenfotos kommen, und führt zu „Deine Grafik“; mit Konrads Testfotos lädt „Herunterladen“ die Datei | — (keine Eingabe) | Das Foto lässt sich speichern, es öffnet kein leeres Fenster |
| `/speaker/grafik` Deine Grafik | Porträt wählen (JPG, PNG, WebP bis 10 MB), per Ziehen oder Pfeiltasten zurechtrücken, Regler „Größe“, „Als PNG herunterladen“; Post-Vorlagen kopieren; Post-Generator mit Anlass, Kanal und ein paar Sätzen (ein- bis zweimal, er nutzt die KI) | Falsches Dateiformat oder zu große Datei → Hinweis; „Entwurf schreiben“ bleibt gesperrt, solange das Textfeld leer ist | Am Handy lässt sich der Regler greifen; das Porträt verlässt den Browser nicht (Hinweis steht auf der Seite) |
| Stellvertretend bestätigen (verwalteter ZZTEST-Speaker) | Oben „TEST Verwaltet“ wählen → Profil → Einwilligungen: „Ich bestätige für TEST Verwaltet, dass …“ (vier Texte), „Stellvertretend bestätigen“; Anreise → Hotel → „Buchen“ fragt die Einwilligung für Hotel und Shuttle in derselben Fassung ab | Konto ohne Verwaltet-Fall (Assistenz „TEST Assistenz“): Karte „Nur der Speaker selbst kann das entscheiden.“ ohne Knopf | Im Admin-Detail steht „Stellvertretend bestätigt durch … am …“; die Ernährung bleibt für den Kontakt gesperrt |

**Stage-Lead-Portal** (`/speaker-leads`)

| Seite | Normalfall | Fehlerfall | Schau besonders auf |
|---|---|---|---|
| Übersicht | Gruß und eine Aktion im Band; vier Kennzahlen führen zu ihrer Liste; „Als Nächstes“ zeigt deine Aufgaben mit Frist, überfällige zuerst; „Fehlt noch“ nennt offene Schritte bestätigter Speaker | Ohne Aufgaben oder Bestätigte steht ein erklärender Satz statt einer leeren Karte | Es zählt nur die eigene Bühne; Gäste der Partner zählen nicht |
| `/pipeline` Pipeline | „Speaker anlegen“ (Vorname, Nachname, E-Mail) → er steht als Lead in der Liste; Zeile öffnen: Stand ändern („Hat bestätigt“ in der Zeile oder im Fenster meldet die Zusage — erst danach öffnen sich Onboarding, Hospitality und Programm, das Fenster nennt die nächsten Schritte), Aufgabe mit Frist anlegen und erledigen, Notiz, Einordnung (Prio, Kategorie, Themencluster, Format, Bühnen in Frage); Filter und Suche setzen und die Adresse in einem neuen Tab öffnen | „Anlegen“ bleibt ohne Vorname und E-Mail gesperrt; eingeladen wird erst im Stand „Bestätigt“ | Die Filter stehen in der Adresszeile und bleiben nach dem Neuladen; die Tabelle scrollt am Handy im eigenen Kasten (bekannt, QS-058) |
| `/bestaetigt` Bestätigte Speaker | Liste mit „Fehlt noch“, Sessions, Einladung und Programm; im Fenster „Einladung schicken“ (nur an eine +zztest-Adresse) | Suche oder Filter ohne Treffer | „Fehlt noch“ nennt dieselben Schritte wie die Checkliste des Speakers |
| `/board` Programm-Board (und `/board/tabelle`) | Slot verschieben, Session bearbeiten; die Öffnungszeiten der Bühne erscheinen schraffiert | Ein Slot außerhalb der Öffnungszeiten wird als Stage Lead hart abgewiesen (im Admin nur eine Warnung) | Dieselbe Struktur wie `/admin/programm`; fremde Bühnen sind nicht bearbeitbar |
| `/praesentationen` Präsentationen | Alle Slots der eigenen Bühne mit Stand; eine Datei, die per Mail kam, hochladen | Falsches Format oder über 100 MB wird abgewiesen | Folien siehe „Danach zurücknehmen“ |
| `/anreise`, `/shuttle`, `/regie`, `/einreichungen` | Listen und Pläne der eigenen Bühne öffnen, filtern, einen Eintrag öffnen | Filter ohne Treffer | Nur die eigene Bühne; Anreise-Filter „Nur mit Shuttle“ |

**Admin (Gruppe „Speaker & Programm“)**

| Seite | Normalfall | Fehlerfall | Schau besonders auf |
|---|---|---|---|
| `/admin/speaker` Speaker | Liste mit Suche und Filter; Zeile öffnen; oben die Knöpfe „Verlauf“ und „Website (Sanity)“ | Suche ohne Treffer | Jeder Weg der Stage Leads und Speaker ist hier erreichbar |
| `/admin/speaker/<id>` Detail | Die Karten Status, Betreuung, Stammdaten, Biografien, Links & Technik, Pass & Hospitality, Interne Notiz, An- & Abreise, Sessions und Einwilligungen; ändern und speichern; „Einladen“ (nur an eine +zztest-Adresse); Einwilligungen lesen | Name leeren oder einen ungültigen Link eintragen und speichern (soll: Meldung, nichts wird gespeichert) | Die Einwilligungen nennen bei stellvertretender Bestätigung wer und wann („Stellvertretend bestätigt durch … am …“); die interne Notiz erscheint nie im Speaker-Portal |
| `/admin/speaker/website` Website (Sanity) | „Vorschau“ lesen: „Wer auf die Website geht“ (drei Bedingungen), dazu die Listen Anlegen, Ändern, Entfernen und Zurückgehalten mit dem Grund je Speaker | „Übertragen“ nicht drücken; bis zur Freigabe durch das Web-Team (K-54) meldet die Vorschau, dass Sanity nichts geprüft hat (nur Leserechte) | ZZTEST-Speaker stehen unter „Zurückgehalten“; „Was nie übertragen wird“ nennt Mailadresse, Telefon, Notizen, Reise, Hotel, Tickets, Ernährung, Slot-Zeiten |
| `/admin/technik` Technik | Karte „Folien in Drive“ lesen: bis K-03 steht dort „Dienstkonto fehlt“ und Uploads laufen wie bisher; die Folienliste unter `/admin/technik/praesentationen` zeigt den Stand je Folie | Knöpfe der Karte nicht drücken | Nach dem Upload einer Folie ändert sich der Stand der Zeile |
| `/admin/einreichungen` Freigaben | Fünf Reiter mit Zähler — Titel & Beschreibungen, Slots, Reisekosten, Hotel, Shuttle; du siehst nur die, die du entscheiden darfst. Je Reiter die wartenden Einträge ansehen und entscheiden: Titel und Beschreibung freigeben oder zurückweisen, Slot freigeben oder zurückgeben, Reisekosten-Antrag zurückweisen, Hotelanfrage bestätigen oder ablehnen, Shuttle-Anfrage bestätigen | „Zurückweisen“ und „Ablehnen“ bleiben ohne Anmerkung gesperrt („Zum Zurückweisen bitte eine Anmerkung angeben.“); fehlt dir das Recht auf eine Art, fehlt ihr Reiter — auch mit `?art=…` in der Adresse; nicht drücken: „Freigeben“ bei Reisekosten | Der Zähler im Reiter stimmt mit den Einträgen darunter überein; im Menü steht neben „Freigaben“ die Summe, darunter je Art ein Unterpunkt mit Zahl (nur Arten, die du entscheiden darfst) — Menü und Reiter nennen dieselbe Zahl, nach einer Entscheidung zieht das Menü mit; wartet nichts, steht „Hier wartet nichts“; Reisekosten, Hotels und Shuttle zeigen in ihren eigenen Bereichen nur noch Lesen und Verlauf, offene Einträge führen mit „Zu den Freigaben“ hierher |
| `/admin/speaker-tickets`, `/admin/reisekosten`, `/admin/hospitality`, `/admin/reception`, `/admin/anreise`, `/admin/regie`, `/admin/grafiken` | Den Eintrag deines ZZTEST-Speakers finden; Begleitticket bestätigen oder ablehnen; Reisekosten-Antrag und Hotelbuchung ansehen (entschieden wird unter Freigaben); Anreise-Liste mit „Nur mit Shuttle“ | Nicht drücken: „Ausstellen“ (Speaker-Tickets) | Jede Liste zeigt dieselben Namen und Stände wie das Detail des Speakers |

## 6 · Bekannte Lücken (nicht melden, schon im Backlog)

Katalogpreise und Shop-Sortiment kommen im Oktober (PART-010/077); der Hallenplan 2027 entsteht erst in einigen Wochen (PROD-001); Discord-Link für den Hackathon folgt (HACK-001); Folien-Spiegelung nach Drive braucht noch den Schlüssel (K-03); Benachrichtigungen, Event-Fotos, Feedback-Fenster (TAL-009/010/011) und das Schichtmodell (VOL-002) sind in Bau; Sanity-Übertragung der Speaker nur als Vorschau; CSP läuft bewusst im Berichtsmodus bis Bauende (K-13).
