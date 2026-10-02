# Team-Testleitfaden FLS27-Portale — Testrunde ab Montag, 06.10.2026 (Entwurf, Stand 02.10.)

Für alle Teammitglieder, die ab Montag Zugriff auf `portal.chef-treff.de` bekommen. Ziel der Runde: Fehler, Stolperstellen und fehlende Funktionen finden, bevor Partner, Speaker und Talents am 14.10. hineinkommen. Konrad gibt die Zugänge frei und sammelt das Feedback; die Architektur-Session verteilt es in die Backlogs (`docs/feedback/*.md`) — nichts geht verloren, jeder Punkt bekommt eine Nummer.

## 1 · Anmelden

1. Du bekommst eine Einladung per E-Mail (Konrad legt dich unter Admin → Verwaltung → Zugänge an und vergibt deine Rollen).
2. Anmelden auf `portal.chef-treff.de` mit deiner Arbeitsadresse: Magic Link, kein Passwort. Der Link gilt kurz und nur einmal; neu anfordern, wenn er abgelaufen ist.
3. Nach dem Login landest du auf dem Einstieg deiner Rolle. Teammitglieder arbeiten im **Admin** (`/admin`), dort entscheiden Rollen und Abschnitte, was du siehst. Externe Portale (Talent, Speaker, Partner, Volunteers, Hackathon, Stage Leads) siehst du nur, wenn Konrad dir zusätzlich eine solche Rolle gibt — zum Testen aus Sicht eines Partners oder Speakers bitte bei ihm melden.

## 2 · Spielregeln im Testbetrieb

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

## 6 · Bekannte Lücken (nicht melden, schon im Backlog)

Katalogpreise und Shop-Sortiment kommen im Oktober (PART-010/077); der Hallenplan 2027 entsteht erst in einigen Wochen (PROD-001); Discord-Link für den Hackathon folgt (HACK-001); Folien-Spiegelung nach Drive braucht noch den Schlüssel (K-03); Benachrichtigungen, Event-Fotos, Feedback-Fenster (TAL-009/010/011) und das Schichtmodell (VOL-002) sind in Bau; Sanity-Übertragung der Speaker nur als Vorschau; CSP läuft bewusst im Berichtsmodus bis Bauende (K-13).
