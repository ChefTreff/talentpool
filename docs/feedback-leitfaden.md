# Feedback-Leitfaden — so gibst du Feedback, so wird es eingearbeitet (v1, Entwurf 17.09.2026)

> Für Konrad. Gilt für alle Chats der Plattform. Grundlage: `docs/plan-ergaenzung-2026-09-17.md` §4. Chat-Zuschnitt und Ports gelten nach Konrads Entscheidung (§7 dort); die Regeln in diesem Leitfaden gelten unabhängig davon.

## 1 · Wohin geht welches Feedback?

| Es geht um … | Chat | Backlog-Datei |
|---|---|---|
| eine Seite im Partner-Portal, Messeshop, Messestand, Partner-Admin | **Partner** | `docs/feedback/partner.md` |
| Speaker-Portal, Speaker-Leads, Programm, Hospitality, Regie, Speaker-Admin | **Speaker-Domäne** | `speaker.md`, `speaker-leads.md` |
| Teilnehmer-Portal (Profil, Programm, Bewerbungen), Hackathon | **Talent & Hackathon** | `talent.md`, `hackathon.md` |
| Volunteers, Produktion, Check-in-Kiosk, Catering | **Volunteers, Produktion & Check-in** | `volunteers.md`, `produktion.md`, `checkin.md` |
| Admin allgemein (Team, Rollen, Personen, Vokabular, Mail, Wiki, Videos), Integrationen, Login, Umschalter, Seitenleiste, Mails | **Admin & Schnittstellen** | `admin.md`, `querschnitt.md` |
| Farben, Schrift, Abstände, Komponenten, „sieht nicht nach uns aus“ — **bis das Design-System abgenommen ist** | **Design** | wird dort geführt |
| Rollen und Rechte, Datenmodell, „soll das so sein?“, Abweichungen vom Masterplan, Reihenfolge | **Architektur/Security** | Entscheidungslog |

Faustregel: **Wo du es siehst, dort meldest du es** — im Chat des Bereichs. Was der Chat nicht selbst lösen kann (Rechte, Daten, Entscheidung), reicht er an die Architektur-Session weiter und schreibt „Entscheidung nötig“ in den Backlog. Du musst nichts doppelt melden.

## 2 · So sieht ein Feedback-Punkt aus

```
Seite: /partner/checkliste
Ist:   Die Frist steht unter der Aufgabe, man übersieht sie.
Soll:  Frist rechts in der Zeile, überfällig rot wie in der Liste der Bestellungen.
Prio:  P2
```

- **Seite** als Pfad (steht in der Adresszeile). Bei Alt-Portal-Bezug: „wie im Speaker Hub, Seite Travel“.
- **Ist / Soll** je ein Satz. Wenn du das Soll nicht weißt, schreib „Soll: Vorschlag machen“.
- **Prio:** **P1** blockiert den Go-live 14.10. (Funktion fehlt, ist falsch, Sicherheit) · **P2** vor dem Prozessstart 01.11. (Kunden sehen es) · **P3** danach.
- Screenshots gern, **ohne Zugangsdaten, Tokens oder fremde Personendaten** im Bild.

**Bündeln:** Ein Durchgang = **eine** Nachricht mit nummerierter Liste, nicht zehn einzelne Nachrichten. Nicht mischen: Design-Punkte in den Design-Chat, bis das System abgenommen ist; danach gehören sie in den Portal-Chat.

## 3 · Was die Session daraufhin tun muss (Pflichtablauf)

1. **Erfassen vor Bauen.** Jeder Punkt kommt in die Backlog-Datei mit ID (`PART-014`), Datum, Seite, Ist → Soll, Prio, Status `erfasst`, Quelle.
2. **Antwort mit IDs:** „Erfasst: PART-014 bis PART-019. Rückfragen zu PART-016 und PART-018: …“ — Rückfragen gesammelt, nicht einzeln.
3. **Bauen in Prio-Reihenfolge**, Status `geplant #PR`. Die PR-Beschreibung nennt die IDs.
4. **Walkthrough-Bericht** je ID mit Screenshot oder Beleg, Status `gebaut`.
5. **Du hakst ab** („PART-014 passt, PART-016 so nicht: …“) → `abgenommen`, oder ein neuer Punkt mit Verweis auf den alten.

**Status:** `erfasst` · `geplant` · `gebaut` · `abgenommen` · `zurückgestellt` (Grund + Datum) · `abgelehnt` (Verweis Entscheidungslog). **Nie löschen**, nur Status ändern. Ein Punkt gilt erst als erledigt, wenn du ihn abgenommen hast.

## 4 · Wann welches Feedback dran ist

| Phase | Was du meldest | Wo |
|---|---|---|
| **Jetzt (Woche A)** | Struktur: „Diese Funktion des Alt-Portals fehlt / reicht nicht für FLS27“ — mit der Abgleich-Matrix in der Hand | Matrix (`docs/abgleich/*.md`), Ergebnis in die Backlogs |
| **Design-Review (Woche B)** | Richtung, Bausteine, Referenzseiten | Design-Chat |
| **Nach dem Rollout (Woche C/D)** | Feinfeedback je Bereich: Wortlaut, Reihenfolge, Abstände, Zustände | Portal-Chat |

Was noch nicht dran ist, notierst du trotzdem — als P3 in den Portal-Chat, mit dem Zusatz „später“. Es wird erfasst und wartet dort.

## 5 · Stand abfragen
„Stand?“ im Portal-Chat liefert die Backlog-Tabelle gefiltert auf offen. Die Dateien liegen auch im Drive-Spiegel (Ordner der Doku), also ohne Chat lesbar.

## 6 · Start eines Chats (Vorlage)

Neuen Chat im Repo öffnen, umbenennen (z. B. „FLS27 · Partner“), als erste Nachricht:

```
Du bist die Build-Session für den Bereich PARTNER der ChefTreff-Plattform.
Arbeite nach AGENTS.md, Abschnitt „Build-Session im Worktree (Checkliste beim Start)“.
Branch-Präfix: partner/ · Dev-Server: talentpool-dev-3001 (Port 3001) · Backlog: docs/feedback/partner.md
Lies zuerst docs/masterplan.md, docs/entscheidungen.md, docs/plan-ergaenzung-2026-09-17.md, docs/feedback-leitfaden.md und dein Backlog.
Regeln: Migrationen nur als Datei unter supabase/migrations/vorschlag/, UI nur mit geladenem Skill /portal-design, jedes Feedback zuerst in den Backlog (Leitfaden §3).
Erste Aufgabe: <Backlog-IDs oder Baustein>.
```

Für die anderen Chats dieselbe Vorlage mit Bereich, Präfix, Port und Backlog-Dateien aus dem Plan §4.3. Vor dem ersten Login im jeweiligen Dev-Server muss `http://localhost:<port>/auth/callback` in den Supabase-Redirect-URLs stehen (Konrad).

## 7 · Was du nicht tun musst
- Feedback wiederholen — der Backlog ist das Gedächtnis, auch wenn der Chat seinen Kontext verdichtet oder ruht.
- Entscheiden, in welchem PR etwas landet — die Session ordnet zu und nennt die IDs.
- Zugangsdaten teilen — Walkthroughs laufen mit deinem eigenen Login; die Sessions lesen nur.
