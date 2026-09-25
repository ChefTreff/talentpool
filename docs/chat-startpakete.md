# Chat-Startpakete — sechs Sessions, ein Repo (Stand 17.09.2026)

> Ort des Repositorys seit 18.09.2026: `~/Developer/talentpool` (nicht `Documents/GitHub`, der Ordner ist iCloud-synchronisiert und hat das Repository einmal zerstört). Chats immer aus diesem Ordner starten.

> Konrads Entscheidung vom 17.09.: fünf Build-Chats nach Datenverbund plus ein Design-Chat, dazu die Architektur-/Security-Session (`talentpool-a9`, arbeitet nur für `main`). Höchstens **zwei bis drei Chats gleichzeitig aktiv** — das Wochenkontingent gilt für alle Sessions gemeinsam, und Konrads Review-Zeit ist der Engpass. Ein ruhender Chat verliert nichts: sein Gedächtnis ist das Backlog in `docs/feedback/`.

> **Aktuell gilt die Tabelle „Runde 26.09.“ direkt darunter**; „Pause 25.09. Mittag“, „Neustart 25.09.“, die Tabelle „Pause 24.09. spät“ und die Texte vom Abend sind überholt. „Runde 24.09.“ sind die Starttexte für neue Chats vom Nachmittag; die Blöcke unter „Archiv“ stammen vom 17.09. und sind nur noch zum Nachlesen.

## Runde 26.09. — nach Konrads Feedback vom 25.09. (Pause beendet; Ziel: nächste Woche alles fertig)

Konrads Antworten zum Durchgang (`docs/konrad-durchgang-2026-09-25.md`) stehen je Zeile in `docs/feedback/*.md`. Partner und Admin & Schnittstellen laufen weiter und haben ihre Reihenfolge per Nachricht; die Speaker-Sitzung ist beendet. **Neue Sitzungen startet Konrad mit einer Zeile:**
- Speaker-Domäne: „Weiter als Speaker-Chat, Runde 26.09.: siehe docs/chat-startpakete.md (Tabelle „Runde 26.09.“) und docs/entscheidungen.md ab 25.09.; Ausgangspunkt ist Draft-PR #231 (speaker/port3, Rechte-Review); Worktree auf origin/main.“
- Design: „Weiter als Design-Chat, Runde 26.09.: siehe docs/chat-startpakete.md (Tabelle „Runde 26.09.“) und docs/entscheidungen.md ab 25.09.; Skill /portal-design laden; Worktree auf origin/main.“
- Talent, Hackathon & Volunteers: „Weiter als Talent-Chat (Talent, Hackathon, Volunteers), Runde 26.09.: siehe docs/chat-startpakete.md (Tabelle „Runde 26.09.“) und docs/entscheidungen.md ab 25.09.; Worktree auf origin/main.“

Regeln wie immer: ein PR je Baustein, Migrationen als Vorschlag ohne Nummer mit Test, Konrads Konto sieht jede Funktion (Schritt in `scripts/testdaten-konrad.mjs`), Admin-Weg im PR, PR-Nummer sofort in die Backlog-Zeile, Wörterbücher sortiert.

| Chat | Reihenfolge (je Punkt ein PR, wo nicht anders gesagt) |
|---|---|
| Speaker-Domäne | 1. **PORT3** Variante A (L5 `upsert_speaker` zuerst; Migration nach §5 und Test nach §6 aus #231) · 2. SPK-073 + SPK-069 · 3. SPK-047 · 4. SPK-074 · 5. ADM-018 (Verantwortliche ableiten, je Session übersteuerbar) + ADM-062 · 6. LEAD-030, LEAD-029, LEAD-023 (+ LEAD-038 im Drawer), Prüfung LEAD-010/ADM-025 gegen #217/0155 · 7. SPK-046 Website-Export: Abstimmung mit Patrick und Juliane ab 29.09., dann Bau nach Kontrakt · 8. SPK-023 Drive-Spiegelung nach K-03 (Dienstkonto Montag). LEAD-017/LEAD-024: Vorschlag vom Design-Chat, Umsetzung danach im Board-Kern |
| Partner | 1. Testdaten-Schritt Side-Event/Interview Tables · 2. PART-092 (fünf Wünsche je Stopp) · 3. PART-051 (Export-Oberfläche) · 4. kleine Punkte: PART-076, PART-073, PART-072 (Store-Links, Pflege im Videos-Admin als Links bis ADM-063), PART-039 + PART-075, PART-054 (Goodies, Wiki-Artikel „Anlieferung“ prüfen/importieren, Migration `goodies_planned`), QS-029 Partner-Text · 5. PART-055 + PART-001 (Texte aus dem Alt-Portal partnerhub.chef-treff.de über Claude in Chrome — Konrad ist angemeldet; Vorschlag je Seite, Konrad gibt frei) · 6. PART-041 + ADM-023 Media Kit (Download, Partnergrafik „Wir sind dabei“, Admin-Pflege unter Grafiken, `marketing_team`). PART-074 → Design; PART-077, PART-010 → Oktober |
| Admin & Schnittstellen | 1. **PORT4b** Zugänge (K-42: Empfehlung angewendet — zusätzlich bannen, reversibel) · 2. Swapcard-Import-Nachweis (K-38, K-37 beachten) · 3. **ADM-008** Wiki-Import aller Artikel 2026 aus Notion, Fristen/Jahreszahlen ersetzen, Kategorie Pflicht, alle veröffentlichen · 4. kleine Punkte: ADM-061, ADM-047, ADM-038, ADM-042, ADM-031, QS-023 · 5. QS-032 rollenabhängige Navigation mit Gruppen · 6. ADM-033 + ADM-035 (Verwaltung) · 7. ADM-036 Dubletten zusammenführen (vor der Altdaten-Migration) · 8. ADM-044 (+ PART-058) Assistent als echter Chat · 9. ADM-046 Logokategorie · 10. ADM-022 + ADM-024 (Rabattstufen, Tagesstände, Award-Formular, öffentliche Abstimmung) · 11. ADM-055 Hackathon-Abschnitt · 12. ADM-063 zentrale Medienverwaltung · 13. ADM-003 Bewerbungs-Übersicht skalierbar · 14. Produktion: PROD-004 + PROD-005, PROD-009, PROD-006 (vor dem 01.11.) · 15. ADM-045 prüfen |
| Design (neu starten) | 1. LEAD-017 Kalender-Vorschlag **auf dem bestehenden Design** (Screens oder Branch, Konrad sieht ihn an) · 2. QS-035 Hero-Band auf allen Startseiten · 3. LEAD-024 Übersichtsseite Speaker-Leads (Design, Bau mit Speaker-Domäne) · 4. PART-074 Event-App-Checkliste · 5. QS-014 UX-Durchgang mit einem externen Skill als Zweitmeinung |
| Talent, Hackathon & Volunteers | **Stand 25.09. abends:** #233 (Konzepte TAL-009/010/011) und #234 (VOL-002 Schichtmodell) gemergt, Fragen als K-43/K-44 bei Konrad — **nichts davon bauen, bis Konrad geantwortet hat** (nächste Woche). Bis dahin nur lesend vorbereiten: HACK-006 (Emilios Feedback aus der Granola-Notiz in Backlog-Zeilen HACK-008 ff., Nummern gegen origin/main), HACK-005 Zuschnitt, HACK-007, HACK-001. Reihenfolge danach: 1. TAL-009/010/011 Bau nach K-43 (vor dem 01.11.) · 2. Hackathon nach Konrads Terminen ab 28.09.: HACK-006 (Emilios Feedback aus der Granola-Notiz in Einzelpunkte), HACK-005, HACK-007, HACK-001 · 3. VOL-002 Schichtmodell aus der Airtable-Tabelle (Vorschlag, dann Bau); VOL-001 am Ende · TAL-007/K-34 offen |
| Architektur-Session | Merges und Migrationen (ab 0208); Rollen-Probe Stage-Lead-Schritt nach PORT3; Security-Check Teil 3; K-34; CSP nach Bauende |

## Pause 25.09. Mittag (drittes Sitzungslimit) — Stand und Fortsetzung je Chat

Alle Chats wurden angewiesen, Begonnenes abzuschließen und nichts Neues zu beginnen. Bei der Rückkehr reicht je Chat **eine Zeile**: „Weiter nach der Pause vom 25.09. Mittag, siehe docs/chat-startpakete.md (Tabelle „Pause 25.09. Mittag“) und docs/entscheidungen.md ab 25.09.“ — Worktree vorher auf origin/main ziehen.

| Chat | Stand bei der Pause | Weiter nach der Pause |
|---|---|---|
| Speaker-Domäne | #221 (0200 Mail-Weiche), #222 (0202 Profilwahl), #225 (0204 Umleitung im Admin), #227 (Board-Interaktion) gemergt; **Draft-PR #231** (`speaker/port3`, nur Doku: Rechte-Review PORT3, Lücken L1–L7, Migrationsplan §5, Testplan §6) — nicht mergen, bevor der Bau dazukommt; Entscheidungen F1–F3 im Log 25.09. (Pause Teil 2) | **Zuerst PORT3 bauen** (Variante A): Migration `v6_port3_stage_leads` aus dem Snapshot nach §5, Test nach §6 mit echtem Rollenwechsel, L5 zuerst (`upsert_speaker`); Bühnenwahl in `/admin/speaker-leads`, Konrads Edition-Zeile `speaker_manager` weg; auf #231 aufsetzen. Danach SPK-073 + SPK-069 → SPK-047 → SPK-074 → LEAD-030/029/023; LEAD-010 gegen #217/0155 prüfen; LEAD-017/024 nach Konrads Design-Runde |
| Partner | #219 (0198 Talk-Speaker), #224 (0203 Company Tour), #228 (0206 Masterclass), #230 (PART-082 Bewerbungen für Side-Event und Interview Tables, ohne Migration) gemergt; Testdaten `partner`/`talk`/`tour-bewerbung`/`masterclass` live gelaufen; **kein Zwischenstand** | **Zuerst** Testdaten-Schritt für Side-Event/Interview Tables (Fläche, Session, eine Bewerbung ohne Mail — die Reiter erscheinen für Konrad erst mit Daten) → PART-092 (fünf Wünsche je Stopp als eigene Tabelle mit Definer-Funktion und Audit, K-41) → PART-051 (Export aller Formate; Tour-Variante braucht eigene Export-RPC). Die „offenen Fragen“ des Chats sind beantwortet: Profilwahl = SPK-071 (#222), Admin-Schalter = SPK-072 (#225), Einwilligungen im Verwaltet-Fall = SPK-074 (K-40 bestätigt) |
| Admin & Schnittstellen | #220 (0199 Check-in), #223 (0201 Logo-Liste), #226 (0205 SevDesk-Kundennummer), #229 (0207 Audit-Einsicht) gemergt; **kein Zwischenstand, kein Branch** — PORT4b nur untersucht (Befund im Log: sechs Funktionen lesen Rollen über `current_person_id()`, eine Sperre muss in allen sechs greifen) | **PORT4b als ein Schnitt:** `person.access_blocked_at`, in allen sechs Funktionen (`active_roles`, `has_role`, `my_roles`, `is_kiosk_only`, `checkin_edition`, `can_edit_edition_info`) `join person … and access_blocked_at is null`, `role_assignment` unangetastet, `set_person_access` mit `has_admin_section('access')`, Audit, Sperre gegen sich selbst ausgeschlossen; **K-42** (Auth-Konto zusätzlich bannen?) vorher bei Konrad → dann Swapcard-Import-Nachweis (K-38 frei, K-37 beachten) → QS-023 → ADM-061 → ADM-045 prüfen; ADM-055 nach dem Hackathon |
| Talent & Hackathon | pausiert (K-34 offen) | erst nach Konrads nächster Runde |
| Design | pausiert | erst nach Konrads Design-Runde (LEAD-017, LEAD-024) |
| Architektur-Session | Migrationen 0198–0207 live, Snapshot 592 Funktionen, Rollen-Probe 5/5, 0 offene PRs; K-37…K-41 entschieden und verteilt (SPK-073/074, PART-092, ADM-061) | Merges und Migrationen; CSP: nach Konrads Klickrunde die Vercel-Logs prüfen, dann `CSP_ENFORCE=true` (K-13); Security-Check Teil 3 (Stage-Lead-Schritt in der Rollen-Probe nach PORT3, Storage-Policies, K-14); K-34; K-36 F5 Import vor 01.11. |

## Neustart 25.09. (Konrad startet Claude neu) — Stand und Fortsetzung je Chat

Konrad startet Claude wegen Verbindungsproblemen neu. Nach dem Neustart je Chat **eine Zeile** senden („Weiter nach dem Neustart vom 25.09., siehe docs/chat-startpakete.md und docs/entscheidungen.md ab „2026-09-25“); die Aufträge stehen in der Doku. Nachrichten der Architektur-Session aus der Warteschlange können beim Neustart verloren gehen — die Doku ist die Wahrheit.

| Chat | Stand beim Neustart | Weiter |
|---|---|---|
| Speaker-Domäne | #190–#196 gemergt (0180 Leseregel, 0182 Regie, 0183 Testdaten; Board-Rest Schnitt 1, LEAD-012-Nachtrag); LEAD-039 Schnitt 1 als Zwischenstand auf `speaker/lead039-einordnung` (WIP 5e2b534, kein PR; Vorschlag `v6_lead039_einordnung` 13/13, Einordnung und `SpeakerFenster` gebaut; offen Pipeline-Spalten/Filter, Admin-Detail, Testdaten-Schritt, PR) | LEAD-039 Schnitt 1 zu Ende (Einordnung, `speaker_stage_candidate`, LEAD-026 Modal; Schnitt 2 auch frei, K-36), dann Masken-Punkte LEAD-040/041/043/044/048, dann LEAD-042/046/047/049, LEAD-039 Schnitt 2, LEAD-017/018/033/035/036/045 |
| Partner | #189 gemergt (0179 Standbühne); Verbindungsprobleme, Nachrichten evtl. nicht angekommen | **Zuerst** Testdaten-Schritt `partner` (Konrads Test-Organisation mit allen Produkten, Kontakt mit vollen Rechten, `standbuehne_editor`; die Teststandbühne hängt seit #195 am Summit-Freitag), gegen live, kurzer PR; dann PART-081 (K-32 beantwortet: Ticket aus dem Partner-Kontingent, Gäste als Swapcard-Speaker, Porträt Pflicht, Person bleibt, Einwilligungs-Haken), dann PART-045 Masterclass, PART-046 Company Tour, PART-082, PART-051; nach 0180 einmal `/partner/buehne` und `/partner/buehne/tabelle` gegen live prüfen |
| Admin & Schnittstellen | #183 (0175), #187 (0177) gemergt; Verbindungsprobleme | **Zuerst** vivenu-Kettenprüfung am Sandbox-Ticket (K-33 gesetzt; Konrads Freiticket mit `--nur=ticket-zurueck` zurücksetzen, ausstellen, QR, Wallet, Swapcard-Export; Nachtrag in `docs/schnittstellen-pruefung-2026-09.md`; danach wieder auf `requested` für Konrads Test), dann PORT1b, ADM-058 Company-Tour-Sektion mit Tour↔Session (K-31), Swapcard-Einladungsfrage für Standbühnen-Gäste (K-32) |
| Talent & Hackathon | pausiert; Luma-Abgleich läuft (0 Zuordnungen im Testbestand, K-34 offen) | erst nach Konrads nächster Runde (TAL-009…011 Konzepte) |
| Design | pausiert seit #180 | erst nach Konrads Design-Runde (LEAD-017 CI-Farben, Board moderner) |
| Architektur-Session | Migrationen 0169–0183 live, Security-Check Teil 2 fertig, Rollen-Probe 5/5 | Merges und Migrationen; CSP nach Konrads Klickrunde (K-13); Security-Check Teil 3; K-34; Import der Speaker-Arbeitstabelle als letzter Schritt vor dem 01.11. (K-36 F5) |

## Pause 24.09. spät (zweites Sitzungslimit) — Stand und Fortsetzung je Chat

Alle Chats wurden angewiesen, den laufenden Baustein abzuschließen und nichts Neues zu beginnen. Bei der Rückkehr reicht je Chat eine Zeile („Weiter nach der Pause vom 24.09. spät, siehe docs/chat-startpakete.md“); die Aufträge stehen unverändert im Arbeitsauftrag („Freigabe nach der Pause vom 24.09.“) und im Entscheidungslog ab „2026-09-24 — Nacht“.

| Chat | Stand bei der Pause | Weiter nach der Pause |
|---|---|---|
| Talent & Hackathon | TAL-008/015/002/003 gebaut (#177–#179, #185); Luma schreibt seit K-30b, Abgleich läuft stündlich fehlerfrei (346 Gäste, 0 zugeordnet — Testbestand) | TAL-007 auf gebaut setzen; Konzepte TAL-009…011 erst nach Konrads Runde; K-34 (Luma-Gäste als Leads?) wartet auf Konrad |
| Speaker-Domäne | SPK-049…062 und SPK-052 gebaut (#184, #186, #188; 0174, 0176, 0178) | **Zuerst LEAD-032 (Sicherheit, P1: Partner lesen fremde Entwürfe — Leserolle nur intern, Policy `session_read` je Rolle)**, dann QS-048, LEAD-028/031, Board-Rest inkl. Partner-Bedarf LEAD-033…038 |
| Partner | PART-083 gebaut (#181, 0172), PART-081 als Vorschlag (#182); PART-078…080 als Zwischenstand auf `partner/standbuehne` (3 Commits, kein PR: Vorschlag `v6_standbuehne_regeln` 13/13, Tabellen-Reiter, Partner-Status) | PR für PART-078…080 nach Mobil-Sichtprüfung, „Slot anlegen“ im Browser und zweitem Blick; dann K-32 (Konrads Antwort) → PART-081 bauen |
| Admin & Schnittstellen | SPK-068 gebaut (#183, 0175), ADM-057 gebaut (#187, 0177); PORT1b nicht begonnen | 1. PORT1b nach ADM-056 · 2. **ADM-058 (K-31, Konrad 25.09.): eigene Admin-Sektion „Company Tours“** — Tour anlegen/pflegen und mit der Session verknüpfen (`upsert_company_tour` bekommt `session_id`, 0173), zusammen mit ADM-052 · 3. vivenu-Kettenprüfung, sobald K-33 gesetzt ist · 4. Swapcard: Standbühnen-Gäste werden als Speaker exportiert (K-32) — prüfen, ob der Import eine Einladungsmail auslöst, Ergebnis an die Architektur-Session · dann QS-036/EA3, ADM-054, F4 |
| Design | QS-047 gebaut (#180), Statuskorrekturen übernommen | wartet auf Konrads Feedback-Runde |
| Architektur-Session | 0169–0177 live, Vorfall `db.sh test` gehärtet | CSP-Logs nach Konrads Klickrunde → `CSP_ENFORCE=true`; Security-Check Teil 2 (Rollenkonten als SQL-Tests); K-31/K-32/K-33 verteilen |

## Freigabe nach der Pause 24.09. (Nacht) — Fortsetzungstexte (Konrad kopiert den Block in den laufenden Chat)

Speaker-Domäne und Talent & Hackathon haben ihren Text per Nachricht von der Architektur-Session bekommen (zugestellt, beide arbeiten); **Admin & Schnittstellen, Partner und Design** waren nicht erreichbar — Konrad kopiert diese drei Blöcke in die laufenden Chats. Grundlage: `docs/arbeitsauftrag-welle-6.md` Abschnitt „Freigabe nach der Pause vom 24.09.“ und `docs/entscheidungen.md` ab „2026-09-24 — Nacht“.

### FLS27 · Admin & Schnittstellen (Fortsetzung)
```
Weiter nach der Pause (Architektur-Session, 24.09. Nacht). Zuerst origin/main ziehen (0 offene PRs, Migrationen 0150–0168 live, Rollenmodell 0162 mit requireAdminSection), dann docs/arbeitsauftrag-welle-6.md Abschnitt „Freigabe nach der Pause vom 24.09.“ (deine Zeilen und der Punkt „Zuschnitt SPK-068“) und docs/entscheidungen.md ab „2026-09-24 — Nacht“ lesen.
Reihenfolge:
1. SPK-068 Speaker-Tickets ausstellen (P1 — Konrad will es testen). Ein PR, komplett bei dir; der Speaker-Chat fasst /admin/speaker-tickets und /speaker/tickets nicht an. vivenu „create free tickets“ (POST /api/tickets; vivenu-Antwort 11.09. in docs/vivenu-support-anfrage.md, Zeile „Freitickets per API“; sendMail: false; Felder gegen /api/openapi.json prüfen; Sandbox zuerst; Retry bei 429). Server-Action issueSpeakerTicket(ticketId) unter app/(admin)/admin/speaker-tickets mit requireAdminSection("speakerTickets") → Ticket prüfen (speaker in requested, speaker_companion in approved) → vivenu anlegen → set_ticket_issued(...) → set_ticket_secret (nur service_role, damit der Wallet-Knopf geht). Idempotenz: Ticket-UUID als Referenz mitgeben, vor dem Anlegen prüfen, ob das vivenu-Ticket schon existiert; Wettlauf mit dem Webhook ticket.created prüfen (ingest_vivenu_ticket darf kein zweites ticket anlegen) — Ergebnis in die PR-Beschreibung. Knopf „Ausstellen“ je Zeile in TicketQueue.tsx, Status „ausgestellt“ mit vivenu-Id, Fehler als Toast über rpcMessages, DE/EN. Testweg: scripts/testdaten-konrad.mjs um --nur=ticket-zurueck ergänzen (Konrads Freiticket aus SPK-063 zurück auf requested; Barcode, vivenu-Id, Secret leer). Kette belegen: Ticket gültig in /speaker/tickets mit QR, Wallet-Link (Sandbox), Speaker im Swapcard-Export (QS-036/EA3) — in der PR-Beschreibung und in docs/schnittstellen-pruefung-2026-09.md. Ticket-Mail ticket_final (docs/mail-plan.md) als zweiter PR danach.
2. ADM-057 Kundennummer: HubSpot-Eigenschaft company_id („Übergreifende Kundennummer (Company ID)“) in COMPANY_PROPERTIES (lib/hubspot/mapping.ts) und ingest_partner_deal aufnehmen — nur ergänzen, nie überschreiben; eine schon an eine andere Firma vergebene Nummer als Gate-Fehler customer_number_taken.
3. PORT1b nach ADM-056: die Zuordnung Abschnitt → Rollen einmal in der Datenbank (Tabelle admin_section_role, aus ADMIN_SECTIONS befüllt) plus Prädikat has_admin_section(key) für die RPCs und — über eine Lese-RPC — die Oberfläche; Admin-RPCs auf das Prädikat umstellen; Migration als Vorschlag mit Test.
4. Danach QS-036/EA3 Übertragungsprüfung Swapcard (Bericht), ADM-054 Produktion als Unterseiten, ADM-052 is_programme_editor(null) in den Company-Tour-Funktionen, F4 poweredByHeader: false.
Backlog: ADM-053 steht auf „gebaut #PR“ → „gebaut (#161, Migration 0162 live)“.
Regeln: Migrationen nur unter supabase/migrations/vorschlag/<name>.sql ohne Nummer, mit Test — Tests lesen sie über migrationText("<name>") aus @/tests/migration-datei, nie über den festen Pfad (das Gate lehnt das ab); bestehende Funktionen nur aus supabase/snapshot/functions/; sh scripts/db.sh fn-diff vor jedem Push; zweiter Blick auf jede geschriebene Spalte, bevor du „PR #N fertig“ meldest (der Plan-Chat merged sofort); Nachricht an „FLS27 System (Plan)“ nur zu Meilensteinen. Wörterbuch: der Design-Chat sortiert lib/i18n alphabetisch (QS-047) — nach dessen Merge main ziehen und Konflikte mit node scripts/i18n-zusammenfuehren.mjs lösen, danach node scripts/i18n-sortieren.mjs; die Architektur-Session sagt Bescheid.
```

### FLS27 · Partner (Fortsetzung)
```
Weiter nach der Pause (Architektur-Session, 24.09. Nacht). Zuerst origin/main ziehen (0 offene PRs; #168 und #173 sind gemergt → PART-056/057/064/065 auf gebaut setzen), dann docs/arbeitsauftrag-welle-6.md Abschnitt „Freigabe nach der Pause vom 24.09.“ → Partner und docs/entscheidungen.md ab „2026-09-24 — Nacht“ lesen.
Reihenfolge:
1. PART-083 Rückgabegrund auf deinem Branch partner/rueckgabegrund nach deinem Entwurf: eigene Tabelle (z. B. partner_session_return: session_id PK/FK on delete cascade, note, returned_at, returned_by), RLS an, keine Grants für authenticated — kein Grund als Spalte an session (Speaker der Session könnten ihn lesen); release_partner_session aus dem Snapshot schreibt bei Ablehnung per Upsert und löscht bei Freigabe; partner_format_sessions drop + create mit return_note und returned_at am Ende, danach die Grants im Test mit has_function_privilege nachweisen. Anzeige auf side-event, interview-tables, talk und als Hinweis über dem Board auf /partner/buehne (components/programme/ nicht anfassen).
2. PART-081 Standbühnen-Speaker als Gäste als Vorschlagsdokument docs/vorschlag-part081-standbuehnen-gaeste.md (Kennzeichen speaker_profile.stage_guest, CHECK gegen Lounge/Reception/Reisekosten, kein Hub-Zugang, kein Ticket, Swapcard nur am Slot); Bau erst nach Freigabe.
3. PART-078…080 auf dem Board-Kern (LEAD-016/019/020/022 sind live): tabellarische Eingabe, Zeitregel serverseitig (stage_day.open_from/open_to; frühestens 90 Minuten nach Öffnung, letzter Slot endet 19:00), Partner-Status mit Veröffentlichen-Warnung. Änderungen am Board selbst laufen über den Speaker-Chat — Bedarf an die Architektur-Session melden.
4. Skizzen PART-058/060/074 liegen in docs/design-vorschlaege-2026-09-24.md; INV0 bleibt zurückgestellt bis zur Einladung des Sales-Teams.
Regeln: Vorschlag ohne Nummer mit Test über migrationText(), Funktionen aus supabase/snapshot/functions/, fn-diff vor jedem Push, zweiter Blick vor „PR fertig“, Nachricht an „FLS27 System (Plan)“ nur zu Meilensteinen. Wörterbuch: nach dem QS-047-Merge des Design-Chats main ziehen und Konflikte mit node scripts/i18n-zusammenfuehren.mjs lösen; die Architektur-Session sagt Bescheid.
```

### FLS27 · Speaker-Domäne (Fortsetzung — per Nachricht zugestellt)
```
Weiter nach der Pause: SPK-068 baut der Admin-Chat komplett — /admin/speaker-tickets und /speaker/tickets bis zu dessen Merge nicht anfassen, danach nur die Speaker-Sicht prüfen. origin/main ziehen (0 offene PRs, 0150–0168 live). Reihenfolge: 1. Konrads Sichtprüfung als zwei bis drei PRs — Session-Seite SPK-049…054 (SPK-055 ist gebaut), Anreise-Seite SPK-056…062 (SPK-060: Check-out Sonntag 18.04.2027 bestätigt; SPK-061: Do ab 12:00, kein Mittwoch; SPK-056 Ernährung ins Profil). 2. LEAD-028 und LEAD-031 (P1). 3. Board-Rest LEAD-014/015/017/018/021 (Skizze LEAD-017 in docs/design-vorschlaege-2026-09-24.md). 4. LEAD-023…027/029/030. 5. PORT3 erst, wenn der Admin-Chat PORT1b gemeldet hat. SPK-041/042/013 auf „abgenommen“ (Konrad: „passt“). Pronomen-Spalte (SPK-066) streicht die Architektur-Session per Migration 0169. Regeln unverändert (zweiter Blick, fn-diff, Snapshot-Fassungen); nach dem QS-047-Merge des Design-Chats main ziehen und Wörterbuch-Konflikte mit node scripts/i18n-zusammenfuehren.mjs lösen.
```

### FLS27 · Talent & Hackathon (Fortsetzung — per Nachricht zugestellt)
```
Weiter nach der Pause: zuerst die Luma-Lese-Probe, dann TAL-008 fertig, TAL-015, TAL-002/003. Konrad hat LUMA_API_KEY und LUMA_CALENDAR_ID gesetzt (Vercel und lokal, auch in deinem Worktree). 1. node --env-file=.env.local scripts/luma-probe.mjs im Worktree; Ergebnis (grün oder Fehler, ohne Schlüsselwerte) an „FLS27 System (Plan)“ — erst danach setzt Konrad LUMA_WRITE_ENABLED (K-30b), bis dahin schreibt nichts nach Luma. 2. TAL-008 auf talent/tal-008-community-admin (WIP 72b362c) fertigstellen: Admin-Abschnitt „Community-Events“ mit requireAdminSection und Eintrag in lib/admin-sections.ts (Rollen laut Rollenmodell 0162, Vorschlag in der PR), Luma-Rücklauf per Cron server-only und nur bei LUMA_WRITE_ENABLED schreibend, Migration als Vorschlag mit Test. 3. TAL-015 Ticket-Seite in der Summit-Gruppe (QR und Pass-Typ; Muster /speaker/tickets; my_ticket_wallet_link ist personengebunden). 4. TAL-002/003 Bewerbung je Format gleich aufgebaut (Interview Tables, Side-Events). HACK-006 ruht. Regeln unverändert; nach dem QS-047-Merge des Design-Chats main ziehen und Wörterbuch-Konflikte mit node scripts/i18n-zusammenfuehren.mjs lösen.
```

### FLS27 · Design (Fortsetzung — Chat war offline, Konrad kopiert)
```
QS-047 ist entschieden: A + C aus deinem Vorschlag, B nicht — bitte jetzt bauen, die Stunde ohne offene PRs ist der ruhige Zeitpunkt. Auflagen: (1) Sortierung ohne Locale, reiner Codepunkt-Vergleich; (2) Test prüft Sortierung, Dubletten im Rohtext, identische Schlüsselmenge DE/EN und Formatierung, im PR zusätzlich der Beleg, dass Schlüsselmenge und Texte vor und nach dem Umsortieren gleich sind und das Skript idempotent ist; (3) eine Zeile in AGENTS.md Build-Checkliste Punkt 6 darfst du ergänzen (neue Schlüssel → node scripts/i18n-sortieren.mjs vor dem Push; Konflikte → node scripts/i18n-zusammenfuehren.mjs); (4) Merge-Treiber optional, nur beschrieben; (5) ein PR nur mit Skripten, Test, AGENTS-Zeile und dem einmaligen Sortieren, keine inhaltliche Änderung. „PR #N fertig“ an „FLS27 System (Plan)“ — Merge sofort, dann informiert die Architektur-Session die anderen Chats. Im selben PR: QS-038 (#169), QS-013 (#172), QS-037 Partner (#151) auf gebaut. Danach Pause bis zu Konrads nächster Feedback-Runde.
```

## Runde 24.09. — Starttexte (Konrad kopiert den Block als erste Nachricht in den Chat)

Alle Chats lesen zuerst `AGENTS.md`, dann `docs/arbeitsauftrag-welle-6.md` Abschnitt **„Runde 24.09.“** (Aufträge, Reihenfolge, Entscheidungen) und ihre Backlog-Liste. Nachrichten an die Architektur-Session (ListAgents: „FLS27 System (Plan)“) nur zu Meilensteinen: PR fertig (Gate selbst grün), Migrationsvorschlag liegt, Blocker.

### FLS27 · Talent & Hackathon (neu)
```
Du bist die Build-Session „FLS27 · Talent & Hackathon“ der ChefTreff-Plattform (Repo talentpool, Hauptcheckout ~/Developer/talentpool).
Arbeitsweise: AGENTS.md → „Build-Session im Worktree (Checkliste beim Start)“ — eigener Worktree auf einem Branch mit Präfix talent/ (von origin/main), npm install, .env.local aus dem Hauptcheckout, Dev-Server nur über .claude/launch.json, Konfiguration talentpool-dev-3003 (Port 3003). UI nur mit Skill /portal-design.
Dein Bereich: Teilnehmer-Portal /start, /programm, /meine, /profil, /onboarding (Front-End des Talent-CRM), /admin/bewerbungen, /admin/dubletten; Hackathon ruht bis Ende September.
Lies zuerst: docs/arbeitsauftrag-welle-6.md Abschnitt „Runde 24.09.“ (dein Auftrag, Reihenfolge 1–7, Entscheidungen D11/D12), docs/feedback/talent.md (Leitbild und TAL-001…014), docs/feedback-leitfaden.md, docs/db-konventionen.md, docs/entscheidungen.md ab 22.09., docs/masterplan.md §1 Talent.
Erste Aufgabe: TAL-004 als eigener kleiner PR (Teilnehmer-Portal immer eigenes Portal, app/(talent)/layout.tsx und lib/areas.ts, sonst keine Shell-Änderung); danach TAL-014, TAL-012, dann der Feldvorschlag TAL-013 als docs/talent-felder-vorschlag.md an Konrad. Rückfragen zu D11/D12 stellst du Konrad hier im Chat.
Regeln: Migrationen nur als Datei unter supabase/migrations/vorschlag/<name>.sql ohne Nummer, mit Test, nie selbst anwenden (db.sh dry-run/test darfst du fahren, apply nicht); jedes weitere Feedback von Konrad sofort in docs/feedback/talent.md mit Nummer und Status; ein PR je Baustein gegen main, PR nennt die IDs; fertig = lint, test, build grün; Review und Merge macht die Architektur-Session „FLS27 System (Plan)“ — ihr schreibst du nur „PR #N fertig“. Keine Änderungen an docs/masterplan.md, docs/entscheidungen.md, docs/datenmodell-v2.md.
```

### FLS27 · Partner (Neustart)
```
Du bist die Build-Session „FLS27 · Partner“ der ChefTreff-Plattform (Repo talentpool, Hauptcheckout ~/Developer/talentpool). Arbeitsweise wie in AGENTS.md „Build-Session im Worktree“: Worktree auf partner/<thema> von origin/main, Port 3001 (talentpool-dev-worktree), Skill /portal-design.
Dein Bereich: /partner/* inkl. Messeshop; /admin/partner/*.
Lies zuerst: docs/arbeitsauftrag-welle-6.md Abschnitt „Runde 24.09.“ (dein Auftrag, Reihenfolge 1–4), docs/feedback/partner.md (PART-055…082 sind neu — Konrads Runde vom 21.09., bis heute nicht erfasst), docs/feedback-leitfaden.md, docs/db-konventionen.md, docs/entscheidungen.md ab 22.09.
Erste Aufgabe: den Branch partner/logo-produktionsliste (4 ungemergte Commits) als PR gegen main stellen; vorher IDs gegen main prüfen (ADM-044/045/046 dort kollidieren → ab ADM-048 neu, PART-054 bleibt). Dann PART-066…071 (Tickets) als erster Baustein. Standbühne (PART-078…081) erst, wenn der Board-Kern LEAD-014…022 auf main ist — PART-081 aber früh als Datenmodell-Vorschlag.
Regeln: Migrationen nur unter supabase/migrations/vorschlag/ ohne Nummer, mit Test, nie anwenden; das Programm-Board (components/programme/) baut der Speaker-Domäne-Chat, du änderst dort nichts; jedes weitere Feedback sofort in docs/feedback/partner.md; ein PR je Baustein; fertig = lint, test, build grün; Review und Merge macht „FLS27 System (Plan)“, Nachricht dorthin nur „PR #N fertig“. Keine Änderungen an masterplan, entscheidungen, datenmodell-v2.
```

### FLS27 · Admin & Schnittstellen (Neustart)
```
Du bist die Build-Session „FLS27 · Admin & Schnittstellen“ der ChefTreff-Plattform (Repo talentpool, Hauptcheckout ~/Developer/talentpool). Arbeitsweise wie in AGENTS.md „Build-Session im Worktree“: Worktree auf admin/<thema> von origin/main, Port 3000 nur, wenn kein anderer Chat ihn nutzt, sonst talentpool-dev-3004; Skill /portal-design.
Dein Bereich: /admin (Shell, Team, Rollen, Personen, Vokabular, Mail, Wiki, Videos), Login, Integrationen (Swapcard, vivenu, SevDesk, HubSpot), ab jetzt auch /admin/produktion/* (Umzug).
Lies zuerst: docs/arbeitsauftrag-welle-6.md Abschnitte „Arbeitspaket PORT“, „Arbeitspaket EA“ und „Runde 24.09.“ (dein Auftrag 1–4), docs/feedback/admin.md, docs/feedback/produktion.md, docs/feedback/querschnitt.md (QS-036, QS-040), docs/db-konventionen.md, docs/entscheidungen.md ab 22.09.
Erste Aufgabe: PORT1 + PORT2 — Zugangsmodell requireArea("admin") mit Teamrollen (jeder Abschnitt prüft serverseitig seine Rolle) und Umzug /produktion/* nach /admin/produktion/* mit Weiterleitungen, Navigation nach Rolle, Launch-Konfigurationen und Links. Zweitens QS-036: Übertragungsprüfung Slot → Swapcard (Speaker- und Partner-IDs, Pflichtfelder), Bericht docs/schnittstellen-pruefung-2026-09.md.
Regeln: Migrationen nur unter supabase/migrations/vorschlag/ ohne Nummer, mit Test, nie anwenden; Schlüssel nur in Vercel, nie im Chat; jedes weitere Feedback sofort in die zuständige Liste; ein PR je Baustein; fertig = lint, test, build grün; Review und Merge macht „FLS27 System (Plan)“, Nachricht dorthin nur „PR #N fertig“. Keine Änderungen an masterplan, entscheidungen, datenmodell-v2.
```

### FLS27 · Design (Neustart)
```
Du bist die Design-Session „FLS27 · Design“ der ChefTreff-Plattform (Repo talentpool, Hauptcheckout ~/Developer/talentpool). Arbeitsweise wie in AGENTS.md „Build-Session im Worktree“: Worktree auf design/<thema> von origin/main, Port 3005 (talentpool-dev-3005), Skill /portal-design ist deine ausführende Schicht.
Dein Bereich: components/ui, components/layout, app/globals.css, Skill portal-design, Rollout in die Portale — reine Oberfläche, keine Migrationen, keine Rechte.
Lies zuerst: docs/arbeitsauftrag-welle-6.md Abschnitt „Runde 24.09.“ (dein Auftrag 1–4), docs/feedback/querschnitt.md (QS-034, QS-037, QS-038, QS-013), docs/design-briefing.md, docs/entscheidungen.md ab 22.09.
Erste Aufgabe: QS-037 — die Talent-Startseite (/start) ist Konrads Vorbild (farbliche Hierarchien, Italic-Schrift, Bildflächen); gehe die übrigen Portale nach diesem Muster durch, ein PR je Portal, Reihenfolge Speaker, Partner, Speaker-Leads, Admin. Dann QS-034 Rest. Für LEAD-017, PART-060, PART-074, PART-058 lieferst du Vorschläge (Skizze im PR-Text oder /design), gebaut wird dort vom zuständigen Chat. lib/areas.ts fasst du nicht an (TAL-004 beim Talent-Chat).
Regeln: keine rohen Hex- oder px-Werte, kein Dark Mode, DE und EN; jedes weitere Feedback sofort in docs/feedback/querschnitt.md; ein PR je Etappe; fertig = lint, test, build grün; Review und Merge macht „FLS27 System (Plan)“, Nachricht dorthin nur „PR #N fertig“. Keine Änderungen an masterplan, entscheidungen, datenmodell-v2.
```

### FLS27 · Speaker-Domäne (Neustart)
```
Du bist die Build-Session „FLS27 · Speaker-Domäne“ der ChefTreff-Plattform (Repo talentpool, Hauptcheckout ~/Developer/talentpool). Arbeitsweise wie in AGENTS.md „Build-Session im Worktree“: Worktree auf speaker/<thema> von origin/main, Port 3002 (talentpool-dev-3002), Skill /portal-design.
Dein Bereich: /speaker/*, /speaker-leads/*, /admin/speaker*, /admin/programm, /admin/hospitality, /admin/anreise, /admin/reisekosten, /admin/technik, /regie/*; das Programm-Board components/programme/ gehört dir allein (Regel QS-039).
Lies zuerst: docs/arbeitsauftrag-welle-6.md Abschnitt „Runde 24.09.“ → „Speaker-Domäne“ (Reihenfolge 1–5), docs/feedback/speaker.md und docs/feedback/speaker-leads.md (LEAD-014…031 sind neu), docs/entscheidungen.md ab 22.09. (24.09.: Sanity-Zuschnitt SPK-046, Auflage Assistenten), docs/db-konventionen.md.
Erste Aufgabe: Board-Kern in dieser Reihenfolge — LEAD-016 (nur die eigene Bühne bearbeitbar, Test mit reinem Editor-Konto), LEAD-019, LEAD-020, LEAD-022, dann LEAD-014/015/017/018/021; ein PR je Schnitt. Parallel als kleiner PR die Auflage aus dem Review von #133: Assistant-Züge in lib/speaker/titel-assistent.ts ebenfalls kappen. Danach LEAD-028 und LEAD-031 (P1).
Regeln: Migrationen nur unter supabase/migrations/vorschlag/ ohne Nummer, mit Test, nie anwenden (dry-run/test/fn-diff darfst du); bestehende Funktionen nur aus supabase/snapshot/functions/; in Definer-Funktionen nie select * oder to_jsonb(person); jedes weitere Feedback sofort ins Backlog; ein PR je Baustein; fertig = lint, test, build grün; Review und Merge macht „FLS27 System (Plan)“, Nachricht dorthin nur „PR #N fertig“. Keine Änderungen an masterplan, entscheidungen, datenmodell-v2.
```

## Archiv — Starttexte vom 17.09.2026 (überholt)

### Übersicht

| Chat (Name in der Seitenleiste) | Bereiche | Worktree · Branch-Präfix | Dev-Server (Port) | Backlog | Start |
|---|---|---|---|---|---|
| **FLS27 · Admin & Schnittstellen** | `/admin` (Team, Rollen, Personen, Vokabular, Mail, Wiki, Videos, Ansprechpartner, Fristen, UI), Integrationen, Shell, Login, Mails | **bestehende Session `talentpool-d8`** im Hauptcheckout · `admin/` | `talentpool-dev` (3000) | `admin.md`, `querschnitt.md` | läuft; erst #48/#49, dann Chatbot |
| **FLS27 · Design** | `components/ui`, `app/globals.css`, Skill `portal-design`, Shell, Referenzseiten, Rollout-PRs | neuer Worktree · `design/` | `talentpool-dev-3005` (3005) | Design-Feedback bis zur Abnahme des Systems im Chat, danach je Bereich | **sofort** (D0) |
| **FLS27 · Partner** | `/partner/*` inkl. Messeshop, Messestand, Event-App, Bühne, Bewerber; `/admin/partner/*` | neuer Worktree · `partner/` | `talentpool-dev-worktree` (3001) | `partner.md` | nach Konrads Walkthrough der Alt-Portale |
| **FLS27 · Speaker-Domäne** | `/speaker/*`, `/speaker-leads/*`, `/admin/speaker*`, `/admin/programm`, `/admin/hospitality`, `/admin/anreise`, `/admin/reisekosten`, `/admin/technik`, `/regie/*` | neuer Worktree · `speaker/` | `talentpool-dev-3002` (3002) | `speaker.md`, `speaker-leads.md` | nach dem Walkthrough (Matrix Team-Werkzeuge) |
| **FLS27 · Talent & Hackathon** | `/profil`, `/meine`, `/programm`, `/onboarding`, `/hackathon/*`, `/admin/bewerbungen`, `/admin/dubletten` | neuer Worktree · `talent/` | `talentpool-dev-3003` (3003) | `talent.md`, `hackathon.md` | nach dem Walkthrough |
| **FLS27 · Volunteers, Produktion & Check-in** | `/volunteers/*`, `/produktion/*`, `/checkin`, `/admin/volunteers/*`, `/admin/catering` | neuer Worktree · `ops/` | `talentpool-dev-3004` (3004) | `volunteers.md`, `produktion.md`, `checkin.md` | nach dem Walkthrough |

### Einmalig vorher (Konrad)
1. **Supabase → Authentication → URL Configuration → Redirect URLs:** `http://localhost:3002/auth/callback`, `http://localhost:3003/auth/callback`, `http://localhost:3004/auth/callback`, `http://localhost:3005/auth/callback` hinzufügen (3000 und 3001 stehen schon). Ohne diese Einträge scheitert der Magic-Link-Login im jeweiligen Dev-Server.
2. Nach dem Start eines neuen Chats (der legt seinen Worktree an): im Hauptcheckout `sh scripts/env-pull.sh --worktrees`, damit `.env.local` mit dem echten Secret Key in jedem Worktree liegt.
3. Chat in der Seitenleiste umbenennen (Name aus der Tabelle), damit du weißt, wo du Feedback gibst.

### Start-Prompts (als erste Nachricht in den neuen Chat kopieren)

### FLS27 · Design
```
Du bist die Design-Session „FLS27 · Design“ der ChefTreff-Plattform (Repo talentpool).
Arbeitsweise: AGENTS.md → „Build-Session im Worktree (Checkliste beim Start)“ — eigener Worktree auf einem Branch mit Präfix design/ (von origin/main abzweigen), npm install, .env.local aus dem Hauptcheckout (Konrad kopiert sie per sh scripts/env-pull.sh --worktrees), Dev-Server nur über .claude/launch.json, Konfiguration talentpool-dev-3005 (Port 3005).
Dein Auftrag steht vollständig in docs/design-system-v2-auftrag.md — lies ihn zuerst, danach den Skill /portal-design (laden), docs/design-briefing.md, docs/plan-ergaenzung-2026-09-17.md §6, docs/feedback-leitfaden.md. Figma liest du über den Figma-MCP (Datei ZmpM9E7Cj8I8JUgPxh4IS3, Node-IDs im Auftrag).
Erste Aufgabe (D0): alle 26 Website-Blöcke und die vier Marken-Referenzen lesen, den Block-Katalog mit Übersetzung nach .claude/skills/portal-design/referenzen/website-bloecke.md schreiben, höchstens acht Fragen an Konrad sammeln und ihn um den Team-Portal-Walkthrough bitten (er loggt sich ein, du liest über Claude in Chrome, nur lesend). Danach D1 nach Auftrag §5: Tokens, Kit, Archetypen B–D, vier Referenzseiten auf design/system-v2 als Vercel-Preview, Kontrast gemessen.
Regeln: reine Oberfläche — keine Migrationen, keine RPC- oder Rechteänderungen; keine rohen Hex-/px-Werte; kein Dark-Mode-Schalter; DE und EN; ein PR je Etappe gegen main, Review durch die Architektur-Session (talentpool-a9), Abnahme durch Konrad auf der Preview. Keine Änderungen an docs/masterplan.md und docs/entscheidungen.md.
```

### FLS27 · Partner
```
Du bist die Build-Session „FLS27 · Partner“ der ChefTreff-Plattform (Repo talentpool).
Arbeitsweise: AGENTS.md → „Build-Session im Worktree (Checkliste beim Start)“ — eigener Worktree auf einem Branch mit Präfix partner/ (von origin/main abzweigen), npm install, .env.local aus dem Hauptcheckout (Konrad kopiert sie per sh scripts/env-pull.sh --worktrees), Dev-Server nur über .claude/launch.json, Konfiguration talentpool-dev-worktree (Port 3001).
Dein Bereich: /partner/* (Onboarding, Eure Daten, Kontakte, Checkliste, Dateien, Tickets, Event-App, Messestand, Messeshop, Bühne, Bewerber) und /admin/partner/*.
Lies zuerst: docs/masterplan.md, docs/entscheidungen.md (ab 11.09.), docs/plan-ergaenzung-2026-09-17.md, docs/feedback-leitfaden.md, docs/db-konventionen.md, dein Backlog docs/feedback/partner.md und die Abgleich-Matrizen docs/abgleich/messeshop.md, partner-hub-rest.md, initiativen.md (Konrads Prüfung steht in der Spalte „Prüfung Konrad“).
Regeln: Migrationen nur als Datei unter supabase/migrations/vorschlag/ mit Test nach docs/db-konventionen.md, nie selbst anwenden, PR-Titel „Migration enthalten“, Walkthrough gegen die Datenbank erst nach „Migration live“ der Architektur-Session; UI nur mit geladenem Skill /portal-design und dem heutigen UI-Kit — das Design-System v2 kommt aus dem Design-Chat, keine eigenen Gestaltungsexperimente; jedes Feedback von Konrad zuerst in docs/feedback/partner.md erfassen (Leitfaden §3: ID, Antwort mit IDs, dann bauen), jeder PR nennt die IDs; ein PR je Baustein gegen main; Review und Merge macht die Architektur-Session (talentpool-a9). Keine Änderungen an docs/masterplan.md und docs/entscheidungen.md.
Erste Aufgabe: Backlog und Matrizen durchgehen; aus allen Punkten mit Status erfasst und Prio P1/P2 einen Vorschlag für Bausteine (Reihenfolge, PR-Schnitt, offene Fragen) machen und Konrad zeigen. Bauen erst nach seinem Go.
```

### FLS27 · Speaker-Domäne
```
Du bist die Build-Session „FLS27 · Speaker-Domäne“ der ChefTreff-Plattform (Repo talentpool).
Arbeitsweise: AGENTS.md → „Build-Session im Worktree (Checkliste beim Start)“ — eigener Worktree auf einem Branch mit Präfix speaker/ (von origin/main abzweigen), npm install, .env.local aus dem Hauptcheckout (sh scripts/env-pull.sh --worktrees durch Konrad), Dev-Server nur über .claude/launch.json, Konfiguration talentpool-dev-3002 (Port 3002).
Dein Bereich: /speaker/*, /speaker-leads/*, /admin/speaker, /admin/speaker/[id], /admin/speaker-leads, /admin/speaker-tickets, /admin/programm, /admin/hospitality, /admin/anreise, /admin/reisekosten, /admin/technik, /regie/*.
Lies zuerst: docs/masterplan.md, docs/entscheidungen.md (ab 11.09.), docs/plan-ergaenzung-2026-09-17.md, docs/feedback-leitfaden.md, docs/db-konventionen.md, docs/speaker-portale-abgleich-2026-09-15.md, docs/speaker-felder-abgleich-2026-09-15.md, dein Backlog docs/feedback/speaker.md und docs/feedback/speaker-leads.md sowie docs/abgleich/team-werkzeuge.md (Abschnitt Speaker & Programm).
Regeln: Migrationen nur als Datei unter supabase/migrations/vorschlag/ mit Test, nie selbst anwenden, PR-Titel „Migration enthalten“, Walkthrough erst nach „Migration live“; in SECURITY-DEFINER-Funktionen nie select * oder to_jsonb(person) auf person; UI nur mit Skill /portal-design und dem heutigen UI-Kit (Design-System v2 kommt aus dem Design-Chat); jedes Feedback zuerst ins Backlog (Leitfaden §3), PR nennt die IDs; ein PR je Baustein gegen main; Review und Merge macht die Architektur-Session (talentpool-a9). Keine Änderungen an docs/masterplan.md und docs/entscheidungen.md.
Erste Aufgabe: Backlog und Matrix durchgehen; Vorschlag für Bausteine aus allen Punkten mit Status erfasst und Prio P1/P2 an Konrad. Bauen erst nach seinem Go. Achtung: die Rollendefinition im Speaker-Team wird am Ende gesamt getestet (Abschluss-Checkliste, 15.09.) — keine Rechteänderungen ohne Entscheidung der Architektur-Session.
```

### FLS27 · Talent & Hackathon
```
Du bist die Build-Session „FLS27 · Talent & Hackathon“ der ChefTreff-Plattform (Repo talentpool).
Arbeitsweise: AGENTS.md → „Build-Session im Worktree (Checkliste beim Start)“ — eigener Worktree auf einem Branch mit Präfix talent/ (von origin/main abzweigen), npm install, .env.local aus dem Hauptcheckout (sh scripts/env-pull.sh --worktrees durch Konrad), Dev-Server nur über .claude/launch.json, Konfiguration talentpool-dev-3003 (Port 3003).
Dein Bereich: /profil, /meine, /programm, /onboarding (Teilnehmer-Portal = Front-End des Talent-CRM), /hackathon/* (Teilnehmer- und Partner-Sicht), /admin/bewerbungen, /admin/dubletten.
Lies zuerst: docs/masterplan.md (§1 Talent, Ergänzung v0.1a Ticket-Journey), docs/entscheidungen.md (ab 11.09.), docs/plan-ergaenzung-2026-09-17.md, docs/feedback-leitfaden.md, docs/db-konventionen.md, docs/arbeitsauftrag-welle-1.md, docs/arbeitsauftrag-welle-4.md (Hackathon), dein Backlog docs/feedback/talent.md und docs/feedback/hackathon.md sowie docs/abgleich/talent.md und docs/abgleich/hackathon.md.
Regeln: Migrationen nur als Datei unter supabase/migrations/vorschlag/ mit Test, nie selbst anwenden, PR-Titel „Migration enthalten“, Walkthrough erst nach „Migration live“; Hackathon EN zuerst, sonst DE zuerst, immer beides; UI nur mit Skill /portal-design und dem heutigen UI-Kit; jedes Feedback zuerst ins Backlog (Leitfaden §3), PR nennt die IDs; ein PR je Baustein gegen main; Review und Merge macht die Architektur-Session (talentpool-a9). Datenschutz: Consent versioniert, keine sensiblen Felder, Bewerberdaten nur mit Einwilligung an Partner. Keine Änderungen an docs/masterplan.md und docs/entscheidungen.md.
Erste Aufgabe: Backlog und Matrizen durchgehen; Vorschlag für Bausteine (P1/P2) an Konrad. Bauen erst nach seinem Go.
```

### FLS27 · Volunteers, Produktion & Check-in
```
Du bist die Build-Session „FLS27 · Volunteers, Produktion & Check-in“ der ChefTreff-Plattform (Repo talentpool).
Arbeitsweise: AGENTS.md → „Build-Session im Worktree (Checkliste beim Start)“ — eigener Worktree auf einem Branch mit Präfix ops/ (von origin/main abzweigen), npm install, .env.local aus dem Hauptcheckout (sh scripts/env-pull.sh --worktrees durch Konrad), Dev-Server nur über .claude/launch.json, Konfiguration talentpool-dev-3004 (Port 3004).
Dein Bereich: /volunteers/*, /produktion/* (Regie, Stände, Bestellungen, Catering, Dateien), /checkin (Kiosk), /admin/volunteers/*, /admin/catering.
Lies zuerst: docs/masterplan.md, docs/entscheidungen.md (ab 11.09.), docs/plan-ergaenzung-2026-09-17.md, docs/feedback-leitfaden.md, docs/db-konventionen.md, docs/arbeitsauftrag-welle-4.md, docs/bericht-welle-4-pause.md, dein Backlog docs/feedback/volunteers.md, produktion.md, checkin.md sowie docs/abgleich/volunteers.md und docs/abgleich/team-werkzeuge.md (Abschnitte Volunteers, Produktion).
Regeln: Migrationen nur als Datei unter supabase/migrations/vorschlag/ mit Test, nie selbst anwenden, PR-Titel „Migration enthalten“, Walkthrough erst nach „Migration live“; Gesundheitsangaben (Ernährung) nur über die vorgesehenen RPCs, nie in Listen oder Logs; UI nur mit Skill /portal-design und dem heutigen UI-Kit; jedes Feedback zuerst ins Backlog (Leitfaden §3), PR nennt die IDs; ein PR je Baustein gegen main; Review und Merge macht die Architektur-Session (talentpool-a9). Das optimierte Schichtmodell aus der Volunteer-Tabelle 2026 leitet die Architektur-Session ab — nicht vorgreifen. Keine Änderungen an docs/masterplan.md und docs/entscheidungen.md.
Erste Aufgabe: Backlog und Matrizen durchgehen; Vorschlag für Bausteine (P1/P2) an Konrad. Bauen erst nach seinem Go.
```

### FLS27 · Admin & Schnittstellen (bestehende Session `talentpool-d8`)
Kein neuer Prompt nötig; die Architektur-Session übergibt per Nachricht: Zuständigkeit, Backlog `docs/feedback/admin.md` und `querschnitt.md`, Reihenfolge **#48/#49 → Chatbot der Wissensbasis → Segmentierungs-Übersicht**. Der Chatbot-Baustein:

- **Ziel (Masterplan v0.1b, Konrad 17.09.: „vorher machen, der ist wichtig“):** je Bereich ein Frage-Antwort-Assistent auf der Wiki-Seite, der nur Artikel der Zielgruppe des eingeloggten Nutzers nutzt (`kb_article`, nur `live` und gültig), mit Quellenlink antwortet und Fragen anonymisiert protokolliert (Input für die Wiki-Pflege).
- **Technik (Entscheidung Architektur-Session 17.09.):** Retrieval zunächst über **Postgres-Volltextsuche** (`tsvector` DE/EN je Artikel-Abschnitt, Abschnitt = H2-Frageblock) statt pgvector — bei 26 bis 60 Artikeln reicht das, spart einen Embedding-Anbieter und einen AVV; pgvector bleibt der zweite Schritt, falls die Trefferqualität nicht genügt. Antwort serverseitig über die Claude API (Route Handler, `ANTHROPIC_API_KEY` in Vercel, Konrad setzt ihn mit `sh scripts/env-set.sh ANTHROPIC_API_KEY`), Rate-Limit je Nutzer, Hinweis im Eingabefeld „keine persönlichen Daten eingeben“, Protokoll ohne Nutzerbezug (`kb_question_log`: Bereich, Sprache, Frage, gefundene Artikel, Zeit — keine `person_id`).
- **Migration als Datei** mit Test: `kb_chunk` (Artikel, Abschnitt, Sprache, `tsvector`), Trigger aus `kb_article`, RPC `kb_search(p_query, p_audience, p_language)` mit Zielgruppenprüfung (`my_kb_audiences()`), `kb_log_question`. UI: Komponente auf `/partner/wiki`, `/speaker/wiki`, `/volunteers/wiki` mit dem heutigen Kit.
