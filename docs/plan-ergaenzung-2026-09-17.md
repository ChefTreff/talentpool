# Ergänzender Plan — Abschluss vor Go-live · Abgleich Alt/Neu · Feedback-Prozess · Backend-Walkthrough · Design (17.09.2026)

> **Stand:** 17.09.2026 · Architektur-/Security-Session · Antwort auf Konrads fünf Punkte vom 17.09. · **Von Konrad freigegeben am 17.09.2026** (Antworten in §7); Abweichungen vom Masterplan stehen im Entscheidungslog (Eintrag 2026-09-17).
> Ergänzt Masterplan §6 (Welle 5 „Go-live“ 10.–14.10., Härtung 15.10.–01.11.). Er ersetzt weder Masterplan noch Abschluss-Checkliste; die Checkliste bleibt die Liste, dieser Plan ordnet sie zeitlich und ergänzt vier Arbeitsstränge.
> Zahlen: heute bis Go-live **27 Tage**, bis Prozessstart **45 Tage**. Stand der Plattform: 88 Seiten in neun Bereichen, 78 Tabellen, Migrationen bis 0107 live (Team-Verwaltung, Zugriffsschnitt), Welle 4 komplett, Welle 5 bis auf Merge #48/#49 gebaut.

---

## 0 · Kurzfassung: Bewertung der fünf Punkte

| # | Konrads Punkt | Bewertung | Kern der Empfehlung |
|---|---|---|---|
| 1 | Erst offene Punkte fertig, dann Feedback | **Ja, mit einer Änderung der Reihenfolge.** | Feedback hat zwei Sorten. **Strukturfeedback** (fehlende Seiten und Funktionen, Punkt 2) muss **vor** dem Design kommen, sonst gestalten wir Seiten, die sich noch ändern. **Feinfeedback** (Wortlaut, Abstände, Reihenfolge) kommt **nach** dem Design-Rollout, je Portal, einmal. So gibst du jedes Feedback nur einmal. |
| 2 | Walkthrough Alt- und Neuportale, Feature-Abgleich | **Ja — als Matrix je Altsystem, die wir vorbereiten und du gegenprüfst.** | Nicht du klickst allein, wir liefern die Vorlage aus Inventar und Code; du gehst mit der Matrix durch die Alt-Portale und markierst. Zwei Matrizen gibt es schon (Speaker-/Partner-Portal, Speaker-Domäne); es fehlen Messeshop, Volunteers, Hackathon, Initiativen, Talent und die **Team-Werkzeuge** (Airtable-Interfaces, Programm-Sheet, Regie-Sheet). |
| 3 | Ein Chat je Portal, Anleitung fürs Feedback | **Ja zu Portal-Chats — aber die Ursache des verlorenen Feedbacks ist nicht die Zahl der Chats.** | Feedback stand bisher nur im Chatverlauf und in Fließtext-Dokumenten; beim Verdichten des Kontexts fällt es heraus, ohne dass jemand es sieht. Deshalb zuerst ein **Backlog je Portal im Repo** (jeder Punkt mit ID und Status), dann Chats als Adressen. **Fünf Build-Chats nach Datenverbund** statt neun nach Portal, dazu ein Design-Chat und diese Session; höchstens zwei bis drei gleichzeitig aktiv. Leitfaden: `docs/feedback-leitfaden.md`, Startpakete: `docs/chat-startpakete.md`. |
| 4 | Backend-Walkthrough, wer schaut in Supabase, Verwaltungsfunktionen | **Klare Antwort: niemand außer dir und dieser Session.** | Supabase Studio arbeitet mit der Datenbank-Vollrolle und umgeht RLS, Spalten-Grants und Audit-Log — als Team-Oberfläche verstößt es gegen unsere eigene Grundregel. Folge: **jedes fachliche Feld hat genau einen Pflegeort im Portal**, technische Felder brauchen keinen. Der Walkthrough läuft über eine **Feld-Eigentümer-Matrix** (78 Tabellen in neun Domänen), nicht durch Klicken in Studio. |
| 5 | Design: Website-Blöcke als Fundament, Sidebar bleibt, Events-Branding, Team-Portal als Vorbild | **Richtig und dringend — das Partner-Portal steht am 01.11. vor Kunden.** | Die 26 Figma-Blöcke werden in einen **Portal-Baukasten übersetzt** (Block → Baustein, Gelb → Events-Primär `#6262DC`), das Team-Portal liefert die Muster für Tabellen und Formulare. Vier Referenzseiten als Vercel-Preview, zwei Review-Runden mit dir, dann **mechanischer Rollout über das UI-Kit** je Cluster. Sidebar bleibt. Auftrag: `docs/design-system-v2-auftrag.md`. |

**Was das für die Zeit bedeutet:** Abgleich und Design kosten zusammen etwa drei Wochen Bauzeit, die im Masterplan nicht standen. Der 14.10. bleibt als „funktional vollständig“ haltbar, wenn hinter ihn rutschen: die Segmentierungs-Übersicht fürs Marketing (direkt nach dem Chatbot, Prio 1), die Strategy-Call-Slots und die C-Features (§7b, einzeln zu entscheiden). **Der Chatbot der Wissensbasis kommt vor dem Go-live** (Konrad, 17.09.: „der ist wichtig“). Das Design muss bis zum **14.10.** stehen, damit die Härtung nur noch härtet.

---

## 1 · Fahrplan bis zum Go-live

| Woche | Architektur-Session (diese) | Build-Chats | Design-Chat | Konrad |
|---|---|---|---|---|
| **A · 17.–21.09.** Abschluss & Vorbereitung | ✅ 0106/0107 angewendet und getestet · Gate und Merge #48 → #49 nach dem Walkthrough · `schema.md` neu erzeugen · ✅ Backlog-Dateien und Übertragung Runde 1/2 (Hintergrundauftrag) · ✅ Abgleich-Matrizen als Entwurf (§3) · ✅ Feld-Matrix per Skript (§5) · ✅ Design-Auftrag und Chat-Startpakete · ✅ `launch.json` 3002–3005 | Admin & Schnittstellen (bestehende Session): Umbenennen, Walkthrough #48/#49, danach **Chatbot** · die vier neuen Chats starten nach dem Walkthrough mit dem Vorschlag ihrer Bausteine | **D0**: 26 Blöcke und 4 Marken-Referenzen lesen, Block-Katalog, Fragen an Konrad, Team-Portal-Walkthrough | **Walkthrough Alt-Portale mit Matrizen** (17./18.09.) · **Team-Portal-Walkthrough** mit dem Design-Chat · Redirect-URLs 3002–3005 · Termine Backend-Walkthrough |
| **B · 22.–28.09.** Lücken & Design-System | **Backend-Walkthrough** mit Konrad, zwei Termine (§5.3) · Redundanz-Befunde als Migrationen · Reviews | **P1-Lücken** aus den Matrizen · **Verwaltungsfunktionen** aus der Feld-Matrix (Admin-Chat) · Chatbot (Admin-Chat) | **D1**: Tokens und Kit erweitern, Archetypen B/C/D, vier Referenzseiten als Preview | Design-Review Runde 1 und 2 · Entscheidungen zu Lücken (FLS27 braucht es / braucht es nicht) |
| **C · 29.09.–05.10.** Rollout & Restlücken | Reviews, Merges, Doku · CSP scharf (`CSP_ENFORCE`) nach Log-Prüfung · Volunteer-Airtable: Schichtmodell 2026 auslesen und optimiert ableiten (Auftrag 11.09.) | **P2-Lücken** · Chatbot fertig · Feinfeedback erst nach Rollout des eigenen Clusters | **D2 Rollout**: Shell zuerst, dann je Cluster ein PR mit Screenshots Desktop/Mobil | Abnahme Design je Portal |
| **D · 06.–12.10.** Feinfeedback & Härtung Teil 1 | RLS-Review, Rate-Limits, Audit-Log-Ansicht, Sync-Reports, Reproduktionstest (Masterplan Welle 5) · Entscheidungslog, Checkliste | Feinfeedback aus den Portal-Runden · Segmentierungs-Übersicht beginnen | Nacharbeit aus dem Feinfeedback | **Eine Feedback-Runde je Portal** in den Portal-Chats (Backlog) |
| **13./14.10.** | **Go-live: funktional vollständig, Design steht, Chatbot läuft.** | | | |
| **Härtung 15.10.–01.11.** | Wie Masterplan: Security-Loop (Experte), Consent-Texte (Agent + Anwalt), Domain-Umzug, PITR/Alarm, Vercel-Env, **Migration Altbestand zuletzt**, Team-Onboarding. **Neu hierher:** Segmentierungs-Übersicht → AC-Tags (Prio 1), Strategy-Call-Slots. | | | |

**Regeln für die Zeit bis zum 14.10.**
- Reihenfolge je Portal: **Struktur (Matrix) → Design-Rollout → Feinfeedback.** Kein Feinfeedback an Seiten, die noch strukturell offen sind oder noch nicht im neuen Design stehen.
- Die Build-Chats bauen Lücken mit dem **heutigen** Kit weiter (Tokens und Komponenten aus `components/ui`); der Design-Chat tauscht Kit und Tokens. Weil der Skill die Kit-Nutzung erzwingt, zieht die Änderung automatisch auf jede regelkonforme Seite; handgestrickte Seiten werden im Rollout einzeln nachgezogen.
- Migrationen wendet weiterhin nur diese Session an; die Build-Chats legen sie als Datei unter `supabase/migrations/vorschlag/` ab (unverändert).

---

## 2 · Punkt 1 — Was vor dem Go-live noch offen ist

Die vollständige Liste bleibt `docs/abschluss-checkliste.md`. Hier nur, was **neu sortiert oder neu** ist:

**Bau (Build-Chats), Reihenfolge**
1. ✅ Migrationen 0106 (`/admin/team`) und 0107 (Zugriffsschnitt `is_staff()` := `has_role('admin')`) live; Merge #48 → #49 nach Umbenennen und Walkthrough der Build-Session.
2. **Chatbot der Wissensbasis** (Admin & Schnittstellen, direkt nach #49) — vor dem Go-live. Technik: Volltextsuche statt pgvector zunächst, Claude API serverseitig, Rate-Limit, anonymes Fragenprotokoll (Entscheidungslog 17.09., Spezifikation in `docs/chat-startpakete.md`).
3. P1-Lücken aus dem Abgleich (§3) — sobald die Matrizen von dir gegengeprüft sind.
4. Verwaltungsfunktionen aus der Feld-Matrix (§5.5) — Admin-Chat.
5. Sicherheits-Härtung auf App-Ebene (Rate-Limits an Login, Uploads, RPC-Routen) — mit Vorgabe aus dieser Session.
6. **Segmentierungs-Übersicht** ans Marketing (alle Felder und Kombinationen) → Segmente zurück → Views und AC-Tags — Prio 1 nach dem Chatbot, Beginn Woche D, Abschluss in der Härtung.

**Architektur-Session**
- Gate und Merge #48/#49, `schema.md` nach 0103–0107 neu erzeugen.
- Backlog-Dateien, Abgleich-Matrizen, Feld-Matrix (heute als Hintergrundaufträge gestartet), Design-Auftrag, Chat-Startpakete, `launch.json` — ✅ angelegt, Feinschliff nach den Walkthroughs.
- Volunteer-Tabelle 2026 auslesen, Schichtmodell optimiert ableiten (Konrads Auftrag vom 11.09., bisher offen).
- CSP von Report-Only auf scharf (`CSP_ENFORCE=true`), nachdem die Vercel-Logs einige Tage ohne eigene Verstöße sind.
- RLS-Review, Audit-Log-Ansicht, Sync-Reports, Doku-Reproduktionstest (Masterplan Welle 5).
- Ganz am Ende, unverändert: HubSpot-Go-live des Ingest und Swapcard-Kategorien.

**Konrad / extern** — unverändert aus der Checkliste, darunter zeitkritisch: Sanity-Prüfergebnis ans Website-Team + Rangfolge `sponsoring_level` bestätigen, Event-App-Entscheidung bis 24.09., Katalogpreise vor dem Freischalten, Wiki-Entwürfe freischalten, Hallenplan hochladen, iPad-Test des Check-in, Leaked-Password-Protection, `NEXT_PUBLIC_SITE_URL`, AVVs (neu darunter: Anthropic für den Chatbot), Consent-Agent und Anwalt, Security-Experte, PITR/`alarm@`, Domain-Umzug Teil A Anfang Oktober. **Neu 17.09.:** Redirect-URLs 3002–3005 in Supabase, `ANTHROPIC_API_KEY` in Vercel (sobald der Admin-Chat so weit ist), C-Features einzeln entscheiden (§7b).

---

## 3 · Punkt 2 — Abgleich Alt-Portale ↔ neue Portale

**Methode.** Je Altsystem eine Matrix: Zeile = alte Seite oder Funktion; Spalten = neue Seite, Status (**vorhanden · anders · fehlt · bewusst weggelassen** mit Verweis auf die Entscheidung), Beleg, Prüfung Konrad (✓ / ✗ / Kommentar), Prio (P1/P2/P3). Vorbereitet aus `docs/legacy-inventar.md` (§1–8 Airtable/SoftR, §13 Alt-Portale, §14 Wikis, §15 Programm-Sheet, §11 Regie-Sheet) und der Seitenliste des Repos; **Entwürfe sind Codebefund**, nicht am Gerenderten geprüft — das macht dein Walkthrough. Ergebnis: `docs/abgleich/<system>.md`, Drive-Spiegel.

**Regel aus F4 bleibt:** Die Matrix benennt Lücken, sie schließt keine. Gebaut wird erst, was du je Zeile als „FLS27 braucht es“ markierst; alles andere wird als „bewusst weggelassen“ ins Entscheidungslog geschrieben, damit es nicht in jeder Runde neu auftaucht.

**Was es schon gibt:** `docs/feedback-runde-1-abgleich.md` (Speaker-Portal 7 Seiten, Partner-Portal 10 Seiten, 14.09.), `docs/speaker-portale-abgleich-2026-09-15.md` (Admin · Leads · Speaker gegen dein Zielbild), `docs/speaker-felder-abgleich-2026-09-15.md` (Felder gegen Paulinas Master-Liste).

**Neu (17.09., Entwürfe in `docs/abgleich/`):**

| # | Altsystem | Neu | Datei |
|---|---|---|---|
| 1 | Messeshop WooCommerce `partner.chef-treff.de` (Katalog, Rollen, Bestellphasen, Rechnung) | `/partner/shop*`, `/admin/partner/bestellungen`, `/produktion/bestellungen` | `messeshop.md` |
| 2 | Partner Hub, Rest: Hackathon-Seite, Media Kit, Alle Dateien, Masterclass-Sichtbarkeit, Partner-Shop-Seite, FAQ/Chatbot, Checklist & Deadlines | `/partner/*`, `/hackathon` (Partner-Sicht) | `partner-hub-rest.md` |
| 3 | Initiativen: Airtable (Applications & Outreach, Onboarding-Data, Freitickets, Award, Messestand) | Partner-Portal als Partner-Typ | `initiativen.md` |
| 4 | Volunteers: Airtable-Formulare, Interfaces, Einsatz-Raster, Notion-Volunteer-Wiki | `/volunteers/*`, `/admin/volunteers/*`, `/checkin` | `volunteers.md` |
| 5 | Hackathon: Luma, Airtable, Discord | `/hackathon/*`, `/admin/bewerbungen` | `hackathon.md` |
| 6 | Talent: Teilnehmer-Base, Vivenu-Personalisierung | `/profil`, `/meine`, `/programm`, `/onboarding` | `talent.md` |
| 7 | **Team-Werkzeuge:** 9 Bühnen-Interfaces Speaker, Volo-Views, Regieplan-Sheet, Master-Programm-Sheet, Partner-Base-Views, Hotel/Shuttle-Tabellen | `/admin/*`, `/speaker-leads/*`, `/produktion/*`, `/regie/*` | `team-werkzeuge.md` (mit Liste fehlender Verwaltungsfunktionen) |

**Dein Anteil (17./18.09.):** Mit der jeweiligen Matrix offen durch das Altsystem gehen (du eingeloggt, diese Session liest über Claude in Chrome mit), je Zeile ✓/✗/Kommentar, fehlende Zeilen ergänzen. Was du dabei an Feinheiten siehst („der Countdown stand oben“), gehört noch nicht hierher, sondern später in die Feinfeedback-Runde — die Matrix fragt nur: **Gibt es die Funktion, und reicht sie für FLS27?**

---

## 4 · Punkt 3 — Chats und Feedback-Prozess

### 4.1 Diagnose
Feedback lief bisher als Fließtext in `docs/feedback-runde-*.md` und im Chat. Punkte hatten Nummern je Runde (F1 … F12), aber **keinen Status** und keinen festen Ort, an dem „offen“ von „erledigt“ unterscheidbar war. Wenn eine Session ihren Kontext verdichtet oder eine Runde die nächste überholt, fällt ein Punkt still heraus — genau dein Gefühl „nicht jeder Punkt wird eingearbeitet“. Mehr Chats allein ändern daran nichts; ein Backlog mit IDs ändert es vollständig.

### 4.2 Backlog je Portal (Repo, Drive-Spiegel) — entschieden: Markdown
`docs/feedback/<portal>.md` für `talent`, `speaker`, `speaker-leads`, `partner` (inkl. Messeshop, Messestand), `volunteers`, `hackathon`, `produktion`, `checkin`, `admin`, `querschnitt` (Shell, Login, Mails, Umschalter).

Eine Tabelle je Datei:

| ID | Datum | Seite | Ist → Soll | Prio | Status | Quelle |
|---|---|---|---|---|---|---|
| `PART-014` | 14.09. | `/partner/checkliste` | … → … | P1 | geplant #52 | Runde 2 |

- **Status:** `erfasst` · `geplant` (mit PR) · `gebaut` (im PR, wartet auf dich) · `abgenommen` · `zurückgestellt` (Grund + Datum) · `abgelehnt` (Verweis Entscheidungslog). Es wird nie gelöscht, nur der Status geändert.
- **Pflichtablauf der Session:** (1) jede Feedback-Nachricht zuerst vollständig in den Backlog übertragen, (2) mit den IDs antworten („erfasst: PART-014 bis PART-019; Rückfragen: …“), (3) bauen in Prio-Reihenfolge, (4) die PR-Beschreibung nennt die IDs, (5) Walkthrough-Bericht mit Screenshot je ID, (6) du hakst ab → `abgenommen`.
- **Einmalige Übertragung** der offenen Punkte aus Runde 1 und 2 (Architektur-Session, 17.09., Hintergrundauftrag), damit nichts Altes verloren geht.
- Konrad liest den Stand im Chat („Stand?“) oder im Drive-Spiegel; ein Wechsel auf GitHub Issues bleibt möglich (Skript), ist aber nicht geplant.

### 4.3 Chat-Struktur (entschieden 17.09.)

| Chat | Bereiche | Worktree · Branch-Präfix | Port | Backlog-Dateien |
|---|---|---|---|---|
| **Admin & Schnittstellen** (dein „allgemeiner Build-Chat“) | `/admin` Team, Rollen, Personen, Vokabular, Mail, Wiki, Videos, Ansprechpartner, Fristen, UI; Integrationen (HubSpot, vivenu, Swapcard, SevDesk, Sanity); Shell, Login, Umschalter, Mails | **bestehende Build-Session** im Hauptcheckout · `admin/` | 3000 | admin, querschnitt |
| **Partner** | `/partner/*` (Onboarding, Eure Daten, Kontakte, Checkliste, Dateien, Tickets, Event-App, Messestand, **Messeshop**, Bühne, Bewerber), `/admin/partner/*` | neu · `partner/` | 3001 | partner |
| **Speaker-Domäne** | `/speaker/*`, `/speaker-leads/*`, `/admin/speaker*`, `/admin/programm`, `/admin/hospitality`, `/admin/anreise`, `/admin/reisekosten`, `/admin/technik`, `/regie/*` | neu · `speaker/` | 3002 | speaker, speaker-leads |
| **Talent & Hackathon** | `/profil`, `/meine`, `/programm`, `/onboarding`, `/hackathon/*`, `/admin/bewerbungen`, `/admin/dubletten` | neu · `talent/` | 3003 | talent, hackathon |
| **Volunteers, Produktion & Check-in** | `/volunteers/*`, `/produktion/*`, `/checkin`, `/admin/volunteers/*`, `/admin/catering` | neu · `ops/` | 3004 | volunteers, produktion, checkin |
| **Design** (befristet bis Rollout) | `components/ui`, `app/globals.css`, Skill `portal-design`, Shell, Referenzseiten, Rollout-PRs je Cluster | neu · `design/` | 3005 | — (Design-Feedback bis zur Abnahme des Systems hier) |
| **Architektur/Security** (diese) | Migrationen, Reviews, Merges, `docs/`, Entscheidungslog, Backlog-Übertragung, Matrizen | `main` | — | — |

**Warum Verbund statt Portal:** Speaker, Speaker-Leads und Programm teilen sich dieselben Tabellen und RPCs; Volunteers, Check-in und Produktion ebenso. Ein Chat je Portal würde dieselbe Migration in zwei Chats erfinden. Außerdem sind **deine** Review-Zeit und **meine** Merge-Zeit der Engpass — nicht die Zahl der Bauenden.

**Was du wissen musst:** Das Wochenkontingent gilt über alle Sessions gemeinsam. Sieben parallele Chats bauen nicht siebenmal so schnell, sie verbrauchen siebenmal Kontext. Deshalb: **höchstens zwei bis drei Chats gleichzeitig aktiv**, die anderen ruhen; das Backlog ist ihr Gedächtnis, ein ruhender Chat verliert nichts.

**Einrichtung je Chat:** Startpakete mit Prompts in `docs/chat-startpakete.md`; `launch.json` hat Einträge für 3002–3005; Magic-Link-Redirects `http://localhost:3002…3005/auth/callback` in Supabase trägt Konrad ein; nach dem Start eines Chats `sh scripts/env-pull.sh --worktrees` im Hauptcheckout.

### 4.4 Leitfaden
`docs/feedback-leitfaden.md` — wohin welches Feedback geht, wie ein Punkt aussieht, was die Session daraufhin tun muss, Prioritäten, wann welche Art von Feedback dran ist.

---

## 5 · Punkt 4 — Backend-Walkthrough

### 5.1 Entscheidung (Konrad, 17.09.)
**Supabase Studio nur für Konrad und die Architektur-Session (per MCP); das Team arbeitet ausschließlich in den Portalen.** Studio nutzt die Datenbank-Vollrolle: kein RLS, keine Spalten-Grants, kein Audit-Log, Sicht auf Gesundheitsangaben (Ernährung, 0100) und Vault-Verweise. Das widerspricht „Sicherheit ist Backbone“ und der Datenminimierung. „Interfaces in Supabase“ gibt es nicht — das wäre Airtable-Denken; die Interfaces **sind** die Portale. Konsequenz (Konrad): „Deshalb wichtig, dass alle Felder enthalten sind“ — Verwaltungsfunktionen im Admin (§5.5), Vollständigkeit über die Feld-Matrix.

### 5.2 Werkzeug: Feld-Eigentümer-Matrix
`docs/feld-matrix-2026-09.md`, erzeugt mit `scripts/gen-feld-matrix.mjs` aus `docs/schema.md` (Tabellen, Spalten, Kommentare) plus Suche im Code (welche Seite und welche RPC schreibt und liest die Spalte), dann von Hand vervollständigt. Je Tabelle: Domäne, Zweck in einem Satz, Datenschutz-Klasse (ohne Personenbezug · personenbezogen · besonders geschützt Art. 9 · Bank/Vault). Je Spalte: **fachlich oder technisch**, wer schreibt (RPC, Trigger, Ingest, Cron), **wo pflegbar** (Seite), wo sichtbar, Anmerkung („doppelt zu …?“).

Neun Domänen für den Walkthrough:

| # | Domäne | Tabellen |
|---|---|---|
| 1 | Identität & Zugang | `person`, `person_email`, `person_acquisition_channel`, `person_eligibility`, `person_interest`, `person_merge_log`, `potential_duplicate`, `consent_record`, `suppression`, `registration`, `role_assignment`, `staff_user` (entfernt mit der Aufräum-Migration vom 17.09.), `audit_log` |
| 2 | Edition & Programm | `event`, `event_day`, `stage`, `stage_day`, `track`, `slot`, `slot_history`, `session`, `session_speaker`, `session_question`, `session_submission`, `question_catalog`, `programme_backlog`, `application`, `decision_release`, `regie_cue` |
| 3 | Speaker | `speaker_profile`, `speaker_asset`, `speaker_travel`, `hospitality_quota`, `hospitality_booking`, `expense_claim` |
| 4 | Partner & Leistungen | `organization`, `org_membership`, `org_edition`, `org_product`, `org_step`, `org_step_check`, `org_ticket_allocation`, `partner_asset`, `partner_deal`, `deliverable`, `deliverable_template`, `deadline`, `booth`, `booth_service_check` |
| 5 | Messeshop & Produkte | `product`, `product_component`, `stock_ledger`, `shop_order`, `shop_order_line`, `shop_request` |
| 6 | Tickets & Einlass | `ticket`, `ticket_secret`, `ticket_type_map`, `checkin` |
| 7 | Volunteers | `volunteer_profile`, `shift`, `shift_assignment`, `volunteer_coupon_revocation` |
| 8 | Hackathon | `hack_application`, `hack_challenge`, `hack_team`, `hack_team_member`, `hack_submission`, `hack_judging_score` |
| 9 | Inhalte, Kommunikation, Stammdaten, Integration | `kb_article`, `mail_log`, `mail_template`, `portal_video`, `edition_contact`, `edition_file`, `edition_info`, `vocab_term`, `external_ref`, Schema `integration` (nicht exponiert) |

### 5.3 Ablauf mit dir (entschieden: Termine)
Zwei Termine à etwa 90 Minuten (Domänen 1–5, dann 6–9), Matrix als Leitfaden. **Vorschlag:** Dienstag 22.09. und Donnerstag 24.09.; die Matrix liegt bis Montagabend 21.09. vor. Je Tabelle drei Fragen: **Fehlt ein Feld?** (aus deiner Arbeit, aus den Alt-Systemen) · **Ist etwas doppelt?** · **Kann das Team es pflegen, wo es hingehört?** Antworten landen in der Matrix; daraus werden Migrationen (diese Session) und Verwaltungsfunktionen (Admin-Chat, Backlog `admin`). Wenn du echte Zeilen sehen willst, kannst du parallel den Tabellen-Editor in Studio öffnen — lesend; die Matrix bleibt das Arbeitsdokument.

### 5.4 Prüffragen, die ich schon mitbringe (Fragen, keine Befunde)
`staff_user` gegen die Rolle `admin` (entscheidet seit 0107 nichts mehr, Löschung später) · Jobtitel/Organisation auf `speaker_profile` gegen `person` · `partner_deal` gegen `org_product` (HubSpot-Spiegel gegen gebuchte Leistungen) · `deadline` gegen Fälligkeiten in `deliverable` · `registration` gegen `ticket` · `edition_info` gegen `kb_article` · Freitext `sponsoring_level` gegen Vokabular-Schlüssel (0097, bewusst beides) · `edition_contact` gegen `person`/`role_assignment` (bewusst getrennt: dienstliche Kontaktdaten).

### 5.5 Verwaltungsfunktionen — Kandidaten (im Walkthrough zu bestätigen)
Vorhanden im Admin: Personen, Rollen, Team (0106), Vokabular, Dubletten, Mail-Versand, Wiki, Videos, Ansprechpartner, Fristen, Partner (Produkte, Vorlagen, Kontingente, Bestellungen, Integrationen, Review), Speaker, Speaker-Leads, Speaker-Tickets, Hospitality, Anreise, Reisekosten, Technik, Catering, Bewerbungen, Volunteers (Schichten, Tickets), Programm (Board, Tabelle).
**Wahrscheinlich fehlend:** Editionen, Tage, Bühnen, Tracks anlegen und pflegen · **Audit-Log-Ansicht** · Consent-Übersicht und „Profil löschen“-Anfragen · Suppression-Liste · Mail-Vorlagen bearbeiten · Hackathon-Admin (Challenges, Judging-Freigabe, Zeitplan) · Initiativen als eigene Sicht · Kiosk-Konten (`checkin_operator`) · Dateien der Edition (heute unter Produktion) · Integrations-Status über alle Systeme (heute unter Partner). Die Matrix `docs/abgleich/team-werkzeuge.md` bestätigt oder korrigiert jeden Kandidaten mit Beleg.

---

## 6 · Punkt 5 — Design

### 6.1 Befund
Fundament steht: Sharp Sans und ABC Laica liegen als WOFF2 im Repo und sind eingebunden, Logo-SVGs sind da, Tokens in `globals.css`, UI-Kit mit Button, Card, Table, Drawer, Modal, Stepper, Badge und weiteren, Skill `/portal-design` mit Kontrastmessung. Von den Bildschirm-Archetypen ist nur **A · Liste** entworfen; B · Detail, C · Formular, D · Übersicht stehen im Skill als „noch nicht entworfen — Konrad zieht einen Designer hinzu“. **Dieser Designer sind jetzt die Website-Blöcke plus das Team-Portal.** Das Problem ist nicht Token oder Schrift, sondern **Komposition und Atmosphäre**: Die Portale sind hell, dünn und textlastig; die Marke ist Navy, fett, kursiv, fotografisch, mit Formen.

### 6.2 Was in den Figma-Blöcken steht (Stichprobe 17.09.: Hero, Speaker, Step, Detail + vier Marken-Referenzen)
- **Variablen:** Background blue `#081A35`, Light Gray `#F5F4F2`, **Yellow `#FFCD40`** (Academy). Typo: Sharp Sans H1 82 Extrabold Caps, H3 32 Extrabold Caps, H5 16 Semibold; ABC Laica 38 und 16 Regular Italic. Deckungsgleich mit `docs/design-briefing.md` §3.
- **Hero:** Navy, Laica-Eyebrow in Gelb, Extrabold-Caps-Titel, ein Satz, **Pink-CTA**, Fotocollage mit dünner Linien-Scribble. Speaker: Porträts in **Hexagon-Masken** mit gelbem Verlauf, gelber Laica-Rollen-Chip, Name in Caps, Organisation kursiv. Step: nummerierte **Hexagon-Marker** auf einer Linie. Detail: drei Fotokarten mit großem kursivem Akzentwort in Indigo (bereits Events-Farbe), Ellipsen-Linien.
- **Marken-Referenzen (Konrad, 17.09.):** Personen-Karte mit **Dreiecks-Maske im Akzentverlauf** (`3:20146`), **A2 Gradients Events** für Pfeil-/Chevron-Hexagone als Hintergrundfläche (`3:20352`), Line-Art-Scribbles (`3:19981`), Social-Post „Next up…“ mit Termin-Zeilen, Datum-Pille, Pink-Badge und Pfeil-CTA (`319:692`).
- **Entschieden (Konrad, 17.09.):** Gelb → Events-Primär **`#6262DC`** (Ramp `#5B5BD9 / #4A4AC5 / #E8E8FC`). **Hexagon** aus den Website-Blöcken für Aufzählungs- und Schrittmarker; **Gradient-Formen nur für Hintergrund und Porträt-Masken** (Speaker-Formen); Line-Art nur dekorativ. Pink `#FF88CF` nur Marketing-Momente (Login, Welcome, Hero-CTA, Badge auf dunklem Grund). Präzisiert damit die Regel vom 12.09. („Dreieck statt Hexagon“) für die Portale.

### 6.3 Übersetzung Block → Portal-Baustein
Siehe `docs/design-system-v2-auftrag.md` §4 (verbindliche Fassung). Kurz: Header → Sidebar bleibt · Hero → `HeroBand` auf Startseiten · Detail → `PhotoCard` · Programm → Programm-Liste und **Termin-Zeile** (Social-Post) · Speaker → `PersonCard` · CTA → `NextStepBanner` · Ticket → `TicketCard` · Step → `StepBar` · FAQ → `Accordion` · Footer → `PortalFooter`. Tabellen, Filter, Formulare, Drawer, Statuschips, Upload, Board folgen Archetyp A und dem Team-Portal.

### 6.4 Richtung (entschieden: „Hell mit Marken-Momenten“)
Navy-Sidebar mit Formensprache · **Portal-Hero** auf Startseiten (dunkel erlaubt) · Sektionsköpfe im Website-Rhythmus (Eyebrow → Caps-Titel → ein Satz) · Arbeitsflächen hell, dicht, linksbündig · Fotos nur in Hero, Detail-Karten, Personen-Karten · Pink nur für Marketing-Momente, Akzent für Aktionen · Mobil nach den Mobil-Blöcken der Website gestapelt. Konrads Maßstab: „dass man gut damit arbeiten kann“ — Welcome und Login dürfen dunkel sein, alles, wo gearbeitet wird, bleibt hell.

### 6.5 Vorgehen (Design-Chat, Auftrag `docs/design-system-v2-auftrag.md`)
D0 Analyse bis 19.09. (26 Blöcke, 4 Referenzen, Block-Katalog, Team-Portal-Walkthrough) · D1 System und vier Referenzseiten als Vercel-Preview bis 26.09., zwei Review-Runden · D2 Rollout je Cluster bis 05.10. · D3 Feinfeedback 06.–12.10. Claude Design optional nach D1 (`/design-sync`).

### 6.6 Team-Portal als Vorbild
Du zeigst es dem Design-Chat im Walkthrough (Chrome, eingeloggt; die Session liest nur). Notiert werden Tabellen-Dichte, Filterleisten, Formularaufbau, Farbeinsatz, Navigationstiefe → `referenzen/muster.md` als Vorlage für Archetypen B und C.

---

## 7 · Konrads Entscheidungen (17.09.2026)

1. **Reihenfolge** Struktur → Design → Feinfeedback: ja.
2. **Chats:** fünf Verbund-Chats + Design + Architektur; Startpakete liefert die Architektur-Session (`docs/chat-startpakete.md`, Start-Chips im Architektur-Chat).
3. **Backlog:** Entscheidung der Architektur-Session → Markdown je Portal in `docs/feedback/`; Konrad liest den Stand im Chat.
4. **Supabase:** nur Konrad und Architektur-Session; Team ausschließlich über Portale → alle Felder müssen in den Portalen pflegbar sein.
5. **Backend-Walkthrough:** als Termine (Vorschlag 22.09. und 24.09., §5.3).
6. **Design-Richtung:** „Hell mit Marken-Momenten“ überall, wo gearbeitet wird; Welcome/Login dürfen dunkel sein; Arbeitstauglichkeit zählt.
7. **Formen:** Hexagon aus den Website-Blöcken für Aufzählungszeichen und Marker; Gradient-Elemente nur Hintergrund und Speaker-Formen (Figma `3:20146`, `3:20352`, `3:19981`, Social-Post `319:692`).
8. **Pink** nur Marketing-Momente: ja (auf hellem Grund ohnehin ungeeignet).
9. **Nach dem 14.10.:** Chatbot **nicht** — kommt vorher; Segmentierung danach Prio 1; Strategy-Calls nach hinten; C-Features einzeln entscheiden (§7b).
10. **Walkthrough Alt-Portale** heute oder morgen (17./18.09.), Feedback wird dort in Matrix und Backlog mitgenommen.
11. **Redirect-URLs** trägt Konrad ein (Anleitung in `docs/chat-startpakete.md`, Abschnitt „Einmalig vorher“).

### 7b · C-Features — zur Einzelentscheidung (Masterplan §6, Feedback FLS26)

| Feature | Was es ist | Quelle | Empfehlung |
|---|---|---|---|
| **Slid@Home** | Speaker-Slides nach Freigabe beim Upload für Ticketinhaber herunterladbar, nach dem Summit | Ü1 | Q1 2027 (braucht Summit-Inhalte); das Freigabe-Häkchen beim Upload jetzt schon vorsehen (klein) |
| **Talk-Generator** | Assistent im Speaker-Formular: Titel und Beschreibung aus Stichpunkten (Claude API), Speaker editiert | R1 | Q4 nach dem Chatbot — gleiche Technik, vor dem Speaker-Onboarding im Winter |
| **Hear-Me-Speak** | Social-Grafik-Generator für Speaker im Portal (SVG-Template, PNG 1:1/4:5/9:16) statt Fremd-SaaS | R2 | Q1, nach dem neuen Figma-Template |
| **Slot-Grafiken** | automatische Programm-Grafik je Slot aus Figma-Template, Review-Queue der Freelancerin | R3 | Q1 (Template wird neu gebaut — Konrad) |
| **Timetable-Bild** | Programmübersicht als Bild für Website und Social | R12 | Q1 (Programm steht spät) |
| **Bild-Normalisierung** | Porträts freistellen und normalisieren (Ersatz für remove.bg/Placid) | R6 | Q4/Q1, zusammen mit Slot-Grafiken |
| **Kalender-Blocker** | Kalendereinladungen (ICS) für Speaker-Slots und Briefings | Inventar §1.7 | Q1, sobald Slots bestätigt sind; geringer Aufwand |
| **Merch** | Merch-Artikel mit Konfiguration (Logo, Menge) im Messeshop | S4 | Konfiguration existiert seit 0064 (PR #20); offen sind nur die Artikel 2027 — Katalogpflege, kein Bau |
| **Add-ons/Bundles (vivenu)** | Hotel, DB-Ticket, Locker als vivenu-Add-ons; Portal liest sie im Ingest | T2/T4 | extern (Laura, Kontingente bis 01.11.); Anzeige im Portal Q4 |

**Entschieden (Konrad, 17.09. nachmittags):** Slid@Home **bauen**, mit Dummy-Daten komplett durchklickbar, unter anderem Namen (Arbeitstitel „Folien nach dem Summit“; SPK-011, TAL-001) · Talk-Generator **direkt bauen** im Speaker-Portal, Sektion Slot, als Chat mit Schärfung, trainiert an alten Titeln (SPK-012) · Hear-Me-Speak **aufnehmen, super wichtig**: Maske mit Zoom und Positionierung auf dem FLS26-Template, Upload → Positionieren → Bearbeiten → Download (SPK-013) · Slot-Grafiken **nur Admin**: Sektion „Grafiken“ im Speaker-Admin, alle Grafiken je Speaker/Slot zentral, technisch für die Event-App (ADM-020) · Bild-Normalisierung **mit den Slot-Grafiken**: Speaker-Grafik ohne Freistellung, Slot-Grafik mit; Gesicht immer zentral, nicht zentrierte Bilder beschneiden (ADM-020) · Kalender-Blocker **aufsetzen**, Versand erst im finalen Test (SPK-014) · Merch **weiter on hold** · vivenu-Add-ons **ins Backlog**, Erarbeitung im Oktober (Checkliste).

---

## 8 · Stand der Umsetzung (17.09.2026, nach der Freigabe)
1. ✅ 0106/0107 angewendet, Tests 8/8 und 8/8, „Migration live“ an #48/#49; Umbenennen und Walkthrough laufen bei der Build-Session; Gate und Merge folgen.
2. ✅ Design-Auftrag `docs/design-system-v2-auftrag.md`, Chat-Startpakete `docs/chat-startpakete.md`, `launch.json` 3002–3005; Start-Chips im Architektur-Chat.
3. ⏳ Backlog-Dateien mit Übertragung Runde 1/2, Abgleich-Matrizen 1–7, Feld-Matrix mit Skript — Hintergrundaufträge, Ergebnis heute auf `main`.
4. ⏳ `schema.md` nach dem Merge von #49; Entscheidungslog und Checkliste ✅ nachgezogen.
