# Feedback-Backlog — Zweck, Format, Pflichtablauf

**Stand: 2026-09-17 · Pflege: die zuständige Build-Session; Konrad liest hier den Stand**

Je Portal eine Datei. Sie ist das **Gedächtnis** für Konrads Feedback: jeder Punkt steht mit ID und Status an genau einer Stelle, auch wenn ein Chat ruht oder seinen Kontext verdichtet. Grundlage: `docs/plan-ergaenzung-2026-09-17.md` §4.2, Regeln für Konrad und die Sessions: `docs/feedback-leitfaden.md`.

**Dateien:** `talent.md` · `speaker.md` · `speaker-leads.md` · `partner.md` (inkl. Messeshop und Messestand) · `volunteers.md` · `hackathon.md` · `produktion.md` · `checkin.md` · `admin.md` · `querschnitt.md` (Shell, Login, Umschalter, Mails).

**Format:** eine Tabelle je Datei — `ID | Datum | Seite | Ist → Soll | Prio | Status | Quelle`. Die Seite ist der Pfad aus der Adresszeile (`/partner/checkliste`), im Querschnitt ein Ort (`Shell`, `Login`, `Mails`). **ID-Schema:** Präfix je Datei plus dreistellige, fortlaufende Nummer — `TAL-`, `SPK-`, `LEAD-`, `PART-`, `VOL-`, `HACK-`, `PROD-`, `CHK-`, `ADM-`, `QS-`. Eine vergebene ID wird nie neu belegt.

**Prio:** `P1` blockiert den Go-live 14.10. (Funktion fehlt, ist falsch, Sicherheit) · `P2` vor dem Prozessstart 01.11. (Kunden sehen es) · `P3` danach.

**Status:** `offen` (früher `erfasst`, gleichbedeutend; nichts gebaut) · `geplant #<PR>` · `gebaut` (im Code, von Konrad noch nicht abgenommen) · `abgenommen` (nur wenn Konrad es ausdrücklich bestätigt hat) · `zurückgestellt (Grund, Datum)` · `abgelehnt (Entscheidungslog <Datum>)`. Hinter `gebaut`/`geplant` steht der Beleg in Klammern (Pfad oder Migrationsnummer). **Nie löschen, nur den Status ändern.**

**Pflichtablauf der Session (Leitfaden §3):**
1. Jede Feedback-Nachricht **zuerst vollständig** hier eintragen, Status `erfasst`.
2. Mit den IDs antworten („Erfasst: PART-014 bis PART-019; Rückfragen: …“).
3. In Prio-Reihenfolge bauen, Status `geplant #<PR>`; die PR-Beschreibung nennt die IDs.
4. Walkthrough-Bericht je ID mit Beleg, Status `gebaut`.
5. Konrad hakt ab → `abgenommen`; sonst ein neuer Punkt mit Verweis auf den alten.

**Abgrenzung:** Konrads eigene Aufgaben aus dem Projektbetrieb (Domain, AVVs, Consent, Security-Experte …) stehen weiter in `docs/abschluss-checkliste.md`. Hier stehen nur Aufgaben, die aus einem Feedback-Punkt entstanden sind; sie tragen in der Spalte Quelle den Zusatz „Aufgabe Konrad“.
