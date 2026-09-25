# Durchgang für Konrads Feedback-Runde — Stand 25.09.2026 (Pause, Mittag)

Alle offenen Punkte aus `docs/feedback/*.md` in einer Liste, je Punkt: **Kern** (worum es geht), **Empfehlung** der Architektur-Session mit Aufwandsklasse (S = Stunden, M = ein Tag, L = mehrere Tage oder Integration) und **Frage an dich**, wo eine Entscheidung fehlt. Danach die Punkte, die du früher zurückgestellt hast, mit dem Grund. Am Ende deine offenen K-Punkte.

**So antwortest du am einfachsten:** je Kennung ein Wort — `bauen` (mit Prio, wenn anders als vorgeschlagen), `später` (bleibt liegen bis nach dem Go-live), `streichen` — plus freier Text, wo du etwas anders willst. Was du nicht nennst, bleibt wie vorgeschlagen. Punkte mit „**eingeplant**“ sind den Chats schon zugeteilt und laufen nach der Pause ohnehin; nenne sie nur, wenn du sie anders willst.

## Admin & Schnittstellen

- **ADM-003 · Bewerbungs-Übersicht** (P2) — Kern: `/admin/bewerbungen` ist nicht funktional; du wolltest sie gemeinsam neu ansehen. Empfehlung: Termin in deiner Runde, danach ein Schnitt (M). Frage: Was fehlt dir dort konkret — Filter, Entscheidungen, Export?
- **ADM-008 · Wiki-Artikel aus FLS26** (P2) — Kern: zehn importierte Artikel stehen als Entwurf mit Daten und Fristen aus 2026. Empfehlung: du gehst sie durch, das Team schaltet frei (S, Inhalt bei dir). Frage: Machst du das selbst im Admin, oder soll ein Chat die Jahreszahlen und Fristen vorab ersetzen?
- **ADM-009 · Zweites Loom der Event-App** (P2) — Kern: Link fehlt am Schlüssel `partner_event_app`. Empfehlung: du trägst ihn unter `/admin/videos` ein (S, nur Pflege). Keine Frage.
- **ADM-010 · Fotos der Ansprechpartner** (P2) — Kern: Karten auf den Startseiten ohne Bild. Empfehlung: Fotos hochladen (S, Pflege bei dir). Frage: Hast du die Bilder, oder liefert das Marketing?
- **ADM-018 · Spalte „Verantwortliche“ in der Programm-Tabelle** (P3) — Kern: aus dem Bühnen-Lead ableiten oder eine Person je Session pflegen. Empfehlung: ableiten, kein neues Feld (S). Frage: einverstanden?
- **ADM-022 · Initiativen: Rabattstufen und tageweise Stände** (P2) — Kern: Funnel und Leistungen sind gebaut; offen sind zwei Rabattstufen (100 %/50 % je Kontingent als vivenu-Codes) und Standprodukte für einen Tag. Empfehlung: nach dem Preis-Update im Oktober (M). Frage: brauchst du das vor dem 01.11.?
- **ADM-023 · Media Kit im Admin** (P2) — Kern: Grafiken sind gebaut; die Media-Kit-Pflege fehlt (Gegenstück zu PART-041). Empfehlung: zusammen mit PART-041 als ein Baustein (M). Frage: siehe PART-041.
- **ADM-024 · Initiativen-Award** (P3) — Kern: Bewerbung im Admin, öffentliche Abstimmung ohne Login, Auswertung. Empfehlung: nach dem Go-live (L, Missbrauchsschutz). Frage: Termin des Awards?
- **ADM-025 · Partner am Slot** (P2) — Kern: vermutlich mit dem Board-Drawer (#217) erledigt; Prüfung läuft mit LEAD-010. **eingeplant** (Speaker-Chat prüft).
- **ADM-031 · „Profil löschen“ in den Portalen** (P1) — Kern: Löschung und Löschanträge sind gebaut; ob jedes Portal einen Auslöser hat, ist ungeprüft. Empfehlung: Prüfung und fehlende Knöpfe (S). Keine Frage.
- **ADM-033 · Einwilligungs-Ansicht** (P2) — Kern: Einwilligungen werden versioniert erfasst, aber niemand kann sie nachsehen. Empfehlung: Ansicht je Person unter Verwaltung (M, Nachweispflicht). Keine Frage.
- **ADM-035 · Suppression-Liste** (P2) — Kern: Abmeldungen und Bounces wirken, sind aber unsichtbar. Empfehlung: Ansicht mit Grund und Eintrag von Hand (S). Keine Frage.
- **ADM-036 · Dubletten zusammenführen** (P2) — Kern: die Seite markiert nur, zusammenführen kann niemand. Empfehlung: Zusammenführen mit Vorschau, Protokoll und Rückweg (L, Datenverlust-Risiko). Frage: vor oder nach der Altdaten-Migration?
- **ADM-038 · Kiosk-Gerätekonto anlegen** (P3) — Kern: Gerätekonten entstehen heute von Hand in Supabase. Empfehlung: im Admin anlegen (S). Keine Frage.
- **ADM-042 · Hallenplan verkleinern** (P2) — Kern: 51 Megapixel, auf dem Telefon lädt er nicht. Empfehlung: verkleinerte Fassung beim Upload, Original zum Download (S). Keine Frage.
- **ADM-044 · Wiki-Assistent als echter Chat** (P2) — Kern: wirkt wie FAQ; Vorschläge passen nicht zum Bereich; Phasen-Filter überflüssig (mit PART-058). Empfehlung: Chatverlauf, Vorschläge je Bereich, Filter raus (M). Frage: reicht das, oder willst du Chatbase einbinden?
- **ADM-045 · Company-Tour-Zuordnung** (P2) — Kern: vermutlich mit 0189 erledigt (Touren, Stopps, Tauschen). **eingeplant** (Admin-Chat prüft und meldet das Delta).
- **ADM-046 · Logokategorie als Feld** (P2) — Kern: Website, Swapcard und Logowand brauchen eine Kategorie; heute Ableitung aus der Sponsoring-Stufe. Empfehlung: Feld je Organisation und Edition, Pflege im Admin, Auffangsatz „ohne Stufe ⇒ Official Partner“ bleibt (M). Frage: Welche Kategorien (Liste)?
- **ADM-047 · Hackathon-Stand aus dem Katalog** (P3) — Kern: kein Produkt, gehört zur Challenge. Empfehlung: im Inventurdurchgang ausblenden (S). Keine Frage.
- **ADM-055 · Hackathon-Abschnitt im Admin** (P2) — Kern: Challenges, Teams, Jury, Mentoren gibt es nur im Hackathon-Portal. Empfehlung: nach deinen Hackathon-Terminen (M). **eingeplant** (nach dem Hackathon-Start).
- **ADM-061 · Katalog der Bewerbungsfragen pflegen** (P2) — Kern: „für Partner wählbar“ lässt sich nirgends setzen, die Katalogauswahl der Partner bleibt leer. **eingeplant** (Admin-Chat, S).
- **ADM-062 · Fehlermeldung in den Speaker-Schubfächern** (P3) — Kern: Fehler erscheinen unten als Toast statt am Formular. Empfehlung: umstellen (S). Keine Frage.
- **Eingeplant ohne Frage:** PORT4b Zugänge sperren (nach K-42), Swapcard-Import-Nachweis (K-38), QS-023 Fehlergrenzen.

## Partner

- **PART-001 · Serviceton auf allen Seiten** (P2) — Kern: Grundhaltung „Fragen antizipieren, simpel, ausführlich genug“. Empfehlung: zusammen mit PART-055 als Text-Durchgang je Seite (M). Frage: siehe PART-055.
- **PART-010 · Artikel ohne Preis** (P2) — Kern: 57 Artikel ohne Preis in unsichtbaren Kategorien; Preise kommen im Oktober. Empfehlung: bleibt bis zur neuen Liste (Pflege bei dir). Keine Frage.
- **PART-039 · Einstieg mit Erklärvideo** (P3) — Kern: Pop-up beim ersten Besuch mit Video und Wiki-Link. Empfehlung: nach dem Video im November (S). Keine Frage.
- **PART-041 · Media Kit und Partnergrafik** (P2) — Kern: Marken-Material zum Download und persönliche Grafik „Wir sind dabei“; Pflege im Admin (ADM-023). Empfehlung: ein Baustein für beides (L, Grafikerzeugung). Frage: vor dem Go-live oder als C-Feature nach dem 01.11. (so steht es bei PART-008/SPK-001)?
- **PART-050 · Freigabe partner-angelegter Formate** (P2) — Kern: Datenmodell und Partner-Seite sind gebaut; die Admin-Warteschlange kam mit ADM-049 (#152). Empfehlung: Zeile schließen, wenn du die Freigabe unter Programm → Freigabe siehst (S). Frage: passt die Seite?
- **PART-051 · Export der Bewerbungen** (P2) — Kern: Funktionen sind gebaut, die Oberfläche fehlt; nur Bewerbungen mit Einwilligung, DSGVO-Hinweis in der Datei, Audit. **eingeplant** (Partner-Chat, M).
- **PART-054 · Goodies-Abstimmung auf der Masterclass-Seite** (P2) — Kern: Frage „Wollt ihr Goodies einsenden?“ mit Link auf den Wiki-Artikel (den es noch nicht gibt) und Haken für das Team. Empfehlung: bauen, sobald der Wiki-Artikel steht (S + Migration). Frage: Wer schreibt den Artikel mit Versandadresse und Fristen?
- **PART-055 · Erklärtexte und Bilder aus dem Alt-Portal** (P2) — Kern: Walkthrough durch das Alt-Portal, Texte übernehmen, Bildflächen vorsehen. Empfehlung: ein Chat liest das Alt-Portal aus und schlägt Texte je Seite vor, du gibst frei (M). Frage: Ist die Datenbankverbindung zum Alt-Portal noch da?
- **PART-058 · FAQ statt Chat, Phasenfilter** (P2) — Kern: gleicher Kern wie ADM-044. Empfehlung: mit ADM-044 (M). Frage: siehe ADM-044.
- **PART-072 · Store-Links der Event-App** (P2) — Kern: App-Store- und Play-Links fehlen auf der Downloads-Seite; Pflege im Admin wie Videos. Empfehlung: Admin-Pflege, Teilnehmer-Programm liest mit (S). Keine Frage.
- **PART-073 · Erklärung API- vs. manuelle Anlage** (P2) — Kern: Team-Mitglieder per API teilen gescannte Kontakte automatisch, manuell angelegte nicht; Checkpunkt hervorheben. Empfehlung: Text und Markierung (S). Keine Frage.
- **PART-074 · Design-Akzente auf der Checkliste** (P3) — Kern: „zu clean“. Empfehlung: Design-Runde (S). Frage: willst du das überhaupt?
- **PART-075 · Loom-Anleitung erst im November** (P3) — Kern: Sektion jetzt bauen, Link später pflegen. Empfehlung: mit PART-039 (S). Keine Frage.
- **PART-076 · Häkchen Rechnungsdaten und Countdown** (P2) — Kern: das Häkchen wird übersehen; Deadline als Countdown wie auf der Ticketseite. Empfehlung: bauen (S). Keine Frage.
- **PART-077 · Sortiment Party Rent und Käfer** (P3) — Kern: Angebot überarbeiten, Bilder im FLS-Look; Preise erst im Oktober. Empfehlung: Oktober, mit Moods von dir (L). Frage: Moods und Freigabe des Sortiments?
- **PART-092 · Fünf Wünsche je Tour-Stopp** (P2) — **eingeplant** (Partner-Chat, M).

## Produktion

- **PROD-001 · Hallenplan im Repo** (P2) — Kern: der Plan aus 2026 ist nicht mehr abrufbar. Empfehlung: du lädst ihn unter Edition hoch (S, mit ADM-042 verkleinert). Frage: liegt dir die Datei vor?
- **PROD-002 · Standliste der Edition** (P2) — Kern: Standnummern kommen in einigen Wochen aus der Produktion. Empfehlung: warten, Leerzustand bleibt (Pflege). Keine Frage.
- **PROD-004 · Messeshop-Bestellungen in der Produktionsliste** (P1) — Kern: je Stand Standardausstattung plus Bestellungen; Lieferantenliste summiert („elementar“). Empfehlung: nächster Produktions-Baustein (M). Keine Frage, nur Prio-Bestätigung.
- **PROD-005 · Interne Checkliste je Stand** (P2) — Kern: Plausibilität der Bestellungen (kein Kicker auf 4 qm). Empfehlung: mit PROD-004 (S). Frage: welche Prüfpunkte außer der Standgröße?
- **PROD-006 · Produktstamm pflegen** (P2) — Kern: Artikel entstehen nur per Skript; Pflege im Admin mit Abgleich nach HubSpot und SevDesk, ersetzt Airtable und make.com. Empfehlung: nach dem Preis-Update (L, zwei Integrationen). Frage: vor dem 01.11.?
- **PROD-009 · Zweiter Hallenplan nur für Speaker** (P2) — Kern: Zielgruppe im Upload-Formular fehlt, Bestand ist für alle sichtbar. Empfehlung: Formular mit Zielgruppe, Bestand bereinigen (S). Keine Frage.
- **PROD-011 · Gäste im Catering** (P3) — Kern: durch K-39 entschieden (kein Catering). Wird mit SPK-073 erledigt, Zeile schließt dann.

## Querschnitt

- **QS-014 · Prüf-Checkliste für den UX-Durchgang** (P3) — Kern: externer Skill dazu (Web-Design-Guidelines, AccessLint) oder nicht. Empfehlung: einen Durchgang mit einem externen Skill als Zweitmeinung, `/portal-design` bleibt Autorität (S). Frage: ja oder nein?
- **QS-023 · Fehlergrenzen** (P2) — **eingeplant** (Admin-Chat, S).
- **QS-029 · „Speaker-Team“ statt „Bereichsleitung“** (P2) — Kern: Speaker-Texte erledigt; Partner- und Volunteer-Texte offen. Empfehlung: die zwei Texte im nächsten Partner- bzw. Volunteer-PR (S). Keine Frage.
- **QS-032 · Rollenabhängige Admin-Navigation** (P2) — Kern: vermutlich durch das Rollenmodell und PORT1b erledigt (jedes Teammitglied sieht nur seine Abschnitte). Empfehlung: du prüfst mit einem Team-Konto, dann schließen (S). Frage: hast du ein Team-Konto zum Testen, oder legen wir eines mit ZZTEST an?
- **QS-035 · Hero-Band auf jeder Startseite** — Kern: Band fehlt noch auf einzelnen Startseiten (Produktion, Admin). Empfehlung: Design-Runde (S). Keine Frage.
- **QS-036 · Swapcard-Nachweis** (P1) — **eingeplant** (Admin-Chat nach K-38).
- **QS-039 · Ein Programm-Board für alle Sichten** (P1) — Kern: Regel, keine Aufgabe: Änderungen am Board nur in der gemeinsamen Komponente. Bleibt als Regel stehen. Keine Frage.

## Speaker

- **SPK-023 · Folien nach Google Drive für die Technik** (P2) — Kern: Spiegelung je Bühne und Tag in einen geteilten Ordner; Integration mit Dienstkonto (K-03). Empfehlung: nach PORT3, mit deinem Dienstkonto (L). Frage: Dienstkonto angelegt (K-03)?
- **SPK-046 · Speaker automatisch auf die Website** (P1) — Kern: Abweichung vom Masterplan, Kontrakt steht; braucht Abstimmung mit dem Website-Team (Sanity). Empfehlung: Termin mit dem Website-Team, dann Bau (L). Frage: Wer ist Ansprechperson beim Website-Team, und bis wann?
- **SPK-047 · Foto-Bucket privat** (P2) — Kern: Security-Befund; Swapcard holt Bilder über die öffentliche Adresse. **eingeplant** (befristete signierte Adressen, Speaker-Chat, M).
- **SPK-069 · Abhol-Haken aus Listen** (P3) — **eingeplant** (mit SPK-073, S).
- **SPK-073 · Gäste ohne Catering und Lounge** (P2) — **eingeplant** (K-39, S).
- **SPK-074 · Einwilligungen durch den Ops-Kontakt** (P2) — **eingeplant** (K-40, M).
- **SPK-030 · Zweiter Hallenplan** — liegt bei Produktion (PROD-009).
- **Eingeplant zuerst:** PORT3 (Rechte der externen Bühnenleitungen, ernster Befund L5), L.

## Speaker-Leads

- **LEAD-009 · Paulinas Spalten „Gruppe“ und „Portal Category“** (P3) — Kern: unklar, wofür sie dienten. Empfehlung: du fragst Paulina; ohne Antwort streichen. Frage: fragst du?
- **LEAD-010 · Partner am Slot** (P2) — **eingeplant** (Prüfung gegen #217).
- **LEAD-017 · Kalender moderner, CI-Farben** (P2) — Kern: Design-Vorschlag liegt; Funktion bleibt. Empfehlung: Design-Runde mit dir, dann Umsetzung im Board-Kern (M). Frage: wann ist deine Design-Runde?
- **LEAD-023 · Präsentationen je Slot** (P2) — **eingeplant** (Speaker-Chat, M).
- **LEAD-024 · Übersichtsseite Speaker-Leads** (P2) — Kern: Hero-Band, Kurzüberblick, Checkliste, To-dos; du hast das Muster bestätigt. Empfehlung: mit der Design-Runde (M). Keine Frage.
- **LEAD-029 · Foto-Upload durch den Lead** (P2) — **eingeplant** (S).
- **LEAD-030 · Suche statt Einfachauswahl im Shuttle** (P2) — **eingeplant** (S).
- **LEAD-038 · Rückgabegrund im Drawer** (P3) — Kern: optional für das Team. Empfehlung: mitnehmen, wenn der Drawer ohnehin angefasst wird (S). Frage: willst du das sehen?

## Talent, Hackathon, Volunteers

- **TAL-007 · Community-Events** (P2) — Kern: Adapter und Events-Seite gebaut; Luma-Abgleich läuft stündlich, K-34 offen. Frage: siehe K-34.
- **TAL-009 · Benachrichtigungs-Einstellungen** (P3), **TAL-010 · Event-Fotos** (P3), **TAL-011 · Feedback-Kanal** (P3) — Kern: Konzepte gemeinsam mit dir. Empfehlung: nach dem Go-live (je M). Frage: welches davon vor dem 01.11.?
- **HACK-001 · Discord-Link** (P2) — Pflege, sobald Discord steht. Keine Frage.
- **HACK-005 · Partner- und Teilnehmer-Sicht trennen** (P2) — Kern: Partner-Verwaltung ins Partner-Portal. Empfehlung: mit dem Hackathon-Start (M). **eingeplant** nach deinen Terminen.
- **HACK-006 · Emilios Feedback** (P2) — Kern: aus der Granola-Notiz in Einzelpunkte zerlegen. **eingeplant** beim Hackathon-Start.
- **HACK-007 · Portfolio-Links** (P3) — nur im Hackathon erheben. Empfehlung: mit HACK-005 (S). Keine Frage.
- **VOL-001 · Notion-Export des Volunteer-Wikis** (P2) — Kern: ohne Export kein Import. Frage: kannst du den Export bereitstellen?
- **VOL-002 · Schichtmodell nach Praxis 2026** (P2) — Kern: Kapazität je Position, Dauer, Bestätigung statt 119 Stunden-Spalten. Empfehlung: Tabelle 2026 auslesen, Modell vorschlagen (M). Frage: liegt die Volunteer-Tabelle 2026 im Drive?

## Von dir zurückgestellt — nur zur Erinnerung

- **PART-008 · Media Kit im Partner-Portal**, **SPK-001 · Media Kit, Bühnenfotos, Speaker-Grafik**: C-Feature nach dem 01.11. (Entscheidungslog 14.09.). Zusammen mit PART-041/ADM-023 wäre es ein Baustein — sag, ob vor oder nach dem Go-live.
- **PART-031 · Harte Sperre statt Führung** beim Onboarding (15.09.): heute Führung ins Formular, übrige Seiten bleiben erreichbar.
- **QS-003 · Subdomains je Bereich** (11.09.): Trennung kommt aus Rollen, später als Alias möglich.
- **QS-027 · Bildflächen** („möchte ich später“): hängt mit PART-055 zusammen.
- **SPK-008 Mobilnummer**, **SPK-009 Hotelwunsch**, **SPK-010 Paulinas 62 Spalten** (15.09.): bewusst nicht übernommen.
- **SPK-045 · Kalendertermine mit Beschreibung**: „ganz am Ende“ — Pflege je Edition im Admin, DE/EN.
- **LEAD-004 Einladungsrunde und Kanal**, **LEAD-005 Kurzbezeichnung**, **LEAD-006 job_title_en**, **LEAD-007 Frist je Speaker**, **LEAD-008 Kommentar am Objekt** (15.09.): nicht in deiner Auswahl; LEAD-004 ist für den nächsten Speaker-Baustein vorgesehen.

## Deine offenen K-Punkte

K-13 CSP (nach dem Bauende, Ablauf in `docs/konrad-todos-2026-09-24.md`) · K-34 Luma-Gäste ohne Profil · K-42 gesperrte Zugänge zusätzlich bannen · älter: K-03 Dienstkonto Drive (für SPK-023), K-05 INV0 SKU-Liste, K-16 Schlüsselrotation, K-17 Leaked-Password-Schutz, K-18 Aufbewahrungsfristen, K-19 Einwilligungstext Event-App, K-20 Art.-9-Daten, K-21 AVVs, K-22 Löschkonzept extern, K-23 Informationspflicht Dritte, K-24 HubSpot-Labels, K-25 Zugangs-Liste, K-26 Kontingente, K-27 Chatbase kündigen, K-28 Domain-Umzug und PITR, K-29 Katalogpreise und Moods.
