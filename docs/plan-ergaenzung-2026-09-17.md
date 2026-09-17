# Ergänzender Plan — Abschluss vor Go-live · Abgleich Alt/Neu · Feedback-Prozess · Backend-Walkthrough · Design (Entwurf zur Abstimmung, 17.09.2026)

> **Stand:** 17.09.2026 · Architektur-/Security-Session · Antwort auf Konrads fünf Punkte vom 17.09. · **Entwurf** — gilt nach Konrads Freigabe; jede Abweichung vom Masterplan wird dann im Entscheidungslog eingetragen.
> Ergänzt Masterplan §6 (Welle 5 „Go-live“ 10.–14.10., Härtung 15.10.–01.11.). Er ersetzt weder Masterplan noch Abschluss-Checkliste; die Checkliste bleibt die Liste, dieser Plan ordnet sie zeitlich und ergänzt vier Arbeitsstränge.
> Zahlen: heute bis Go-live **27 Tage**, bis Prozessstart **45 Tage**. Stand der Plattform: 88 Seiten in neun Bereichen, 78 Tabellen, Migration 0105 live, Welle 4 komplett, Welle 5 bis auf den Zugriffsschnitt (#48/#49) gebaut.

---

## 0 · Kurzfassung: Bewertung der fünf Punkte

| # | Konrads Punkt | Bewertung | Kern der Empfehlung |
|---|---|---|---|
| 1 | Erst offene Punkte fertig, dann Feedback | **Ja, mit einer Änderung der Reihenfolge.** | Feedback hat zwei Sorten. **Strukturfeedback** (fehlende Seiten und Funktionen, Punkt 2) muss **vor** dem Design kommen, sonst gestalten wir Seiten, die sich noch ändern. **Feinfeedback** (Wortlaut, Abstände, Reihenfolge) kommt **nach** dem Design-Rollout, je Portal, einmal. So gibst du jedes Feedback nur einmal. |
| 2 | Walkthrough Alt- und Neuportale, Feature-Abgleich | **Ja — als Matrix je Altsystem, die wir vorbereiten und du gegenprüfst.** | Nicht du klickst allein, wir liefern die Vorlage aus Inventar und Code; du gehst mit der Matrix durch die Alt-Portale und markierst. Zwei Matrizen gibt es schon (Speaker-/Partner-Portal, Speaker-Domäne); es fehlen Messeshop, Volunteers, Hackathon, Initiativen, Talent und die **Team-Werkzeuge** (Airtable-Interfaces, Programm-Sheet, Regie-Sheet). |
| 3 | Ein Chat je Portal, Anleitung fürs Feedback | **Ja zu Portal-Chats — aber die Ursache des verlorenen Feedbacks ist nicht die Zahl der Chats.** | Feedback stand bisher nur im Chatverlauf und in Fließtext-Dokumenten; beim Verdichten des Kontexts fällt es heraus, ohne dass jemand es sieht. Deshalb zuerst ein **Backlog je Portal im Repo** (jeder Punkt mit ID und Status), dann Chats als Adressen. Empfehlung: **fünf Build-Chats nach Datenverbund** statt neun nach Portal, dazu ein Design-Chat und diese Session; höchstens zwei bis drei gleichzeitig aktiv. Leitfaden: `docs/feedback-leitfaden.md`. |
| 4 | Backend-Walkthrough, wer schaut in Supabase, Verwaltungsfunktionen | **Klare Antwort: niemand außer dir und dieser Session.** | Supabase Studio arbeitet mit der Datenbank-Vollrolle und umgeht RLS, Spalten-Grants und Audit-Log — als Team-Oberfläche verstößt es gegen unsere eigene Grundregel. Folge: **jedes fachliche Feld hat genau einen Pflegeort im Portal**, technische Felder brauchen keinen. Der Walkthrough läuft über eine **Feld-Eigentümer-Matrix** (78 Tabellen in neun Domänen), nicht durch Klicken in Studio. |
| 5 | Design: Website-Blöcke als Fundament, Sidebar bleibt, Events-Branding, Team-Portal als Vorbild | **Richtig und dringend — das Partner-Portal steht am 01.11. vor Kunden.** | Die 26 Figma-Blöcke werden in einen **Portal-Baukasten übersetzt** (Block → Baustein, Gelb → Events-Primär `#6262DC`), das Team-Portal liefert die Muster für Tabellen und Formulare. Drei Referenzseiten als Vercel-Preview, zwei Review-Runden mit dir, dann **mechanischer Rollout über das UI-Kit** je Cluster. Sidebar bleibt. |

**Was das für die Zeit bedeutet:** Abgleich und Design kosten zusammen etwa drei Wochen Bauzeit, die im Masterplan nicht standen. Der 14.10. bleibt als „funktional vollständig“ haltbar, wenn drei Dinge in die Härtung (15.10.–01.11.) rutschen: der Wissensbasis-Chatbot, die Segmentierungs-Übersicht fürs Marketing und alles, was ohnehin nach dem 01.11. kommt (C-Features). Das Design muss bis zum **14.10.** stehen, damit die Härtung nur noch härtet.

---

## 1 · Fahrplan bis zum Go-live

| Woche | Architektur-Session (diese) | Build-Chats | Design-Chat | Konrad |
|---|---|---|---|---|
| **A · 17.–21.09.** Abschluss & Vorbereitung | #48/#49 prüfen, Migrationen 0106/0107 anwenden, mergen · `schema.md` neu erzeugen · **Backlog-Dateien anlegen** und offene Punkte aus Runde 1/2 übertragen · **Abgleich-Matrizen** als Entwurf (§3) · **Feld-Matrix** per Skript + Hand (§5) · **Design-Analyse D0**: alle 26 Blöcke aus Figma lesen, Startpaket für den Design-Chat · `launch.json` für weitere Ports | Welle 5 zu Ende: Zugriffsschnitt (#49), danach Warteschlange leer — Chats werden neu aufgesetzt (§4.3) | wird aufgesetzt, bekommt Startpaket | **Walkthrough Alt-Portale mit Matrix** (Partner Hub, Speaker Hub, Messeshop, Airtable-Interfaces, Notion-Wikis) · **Team-Portal-Walkthrough** für das Design (Chrome, eingeloggt, wir lesen nur) · Antworten auf §7 |
| **B · 22.–28.09.** Lücken & Design-System | **Backend-Walkthrough** mit Konrad, zwei Termine (§5.3) · Redundanz-Befunde als Migrationen · Reviews | **P1-Lücken** aus den Matrizen · **Verwaltungsfunktionen** aus der Feld-Matrix (Admin-Chat) | **D1**: Tokens und Kit erweitern, Archetypen B/C/D, drei Referenzseiten als Preview | Design-Review Runde 1 und 2 · Entscheidungen zu Lücken (FLS27 braucht es / braucht es nicht) |
| **C · 29.09.–05.10.** Rollout & Restlücken | Reviews, Merges, Doku · CSP scharf (`CSP_ENFORCE`) nach Log-Prüfung · Volunteer-Airtable: Schichtmodell 2026 auslesen und optimiert ableiten (Auftrag 11.09.) | **P2-Lücken** · Feinfeedback erst nach Rollout des eigenen Clusters | **D2 Rollout**: Shell zuerst, dann je Cluster ein PR mit Screenshots Desktop/Mobil | Abnahme Design je Portal |
| **D · 06.–12.10.** Feinfeedback & Härtung Teil 1 | RLS-Review, Rate-Limits, Audit-Log-Ansicht, Sync-Reports, Reproduktionstest (Masterplan Welle 5) · Entscheidungslog, Checkliste | Feinfeedback aus den Portal-Runden | Nacharbeit aus dem Feinfeedback | **Eine Feedback-Runde je Portal** in den Portal-Chats (Backlog) |
| **13./14.10.** | **Go-live: funktional vollständig, Design steht.** | | | |
| **Härtung 15.10.–01.11.** | Wie Masterplan: Security-Loop (Experte), Consent-Texte (Agent + Anwalt), Domain-Umzug, PITR/Alarm, Vercel-Env, **Migration Altbestand zuletzt**, Team-Onboarding. **Neu hierher:** Chatbot der Wissensbasis (vor 01.11. für das Partner-Onboarding), Segmentierungs-Übersicht → AC-Tags. | | | |

**Regeln für die Zeit bis zum 14.10.**
- Reihenfolge je Portal: **Struktur (Matrix) → Design-Rollout → Feinfeedback.** Kein Feinfeedback an Seiten, die noch strukturell offen sind oder noch nicht im neuen Design stehen.
- Die Build-Chats bauen Lücken mit dem **heutigen** Kit weiter (Tokens und Komponenten aus `components/ui`); der Design-Chat tauscht Kit und Tokens. Weil der Skill die Kit-Nutzung erzwingt, zieht die Änderung automatisch auf jede regelkonforme Seite; handgestrickte Seiten werden im Rollout einzeln nachgezogen.
- Migrationen wendet weiterhin nur diese Session an; die Build-Chats legen sie als Datei unter `supabase/migrations/vorschlag/` ab (unverändert).

---

## 2 · Punkt 1 — Was vor dem Go-live noch offen ist

Die vollständige Liste bleibt `docs/abschluss-checkliste.md`. Hier nur, was **neu sortiert oder neu** ist:

**Bau (Build-Chats), Reihenfolge**
1. #48 `/admin/team` und #49 Zugriffsschnitt `is_staff()` := `has_role('admin')` (Migrationen 0106/0107) — im Review, diese Woche.
2. P1-Lücken aus dem Abgleich (§3) — sobald die Matrizen von dir gegengeprüft sind.
3. Verwaltungsfunktionen aus der Feld-Matrix (§5.5) — Admin-Chat.
4. Sicherheits-Härtung auf App-Ebene (Rate-Limits an Login, Uploads, RPC-Routen) — mit Vorgabe aus dieser Session.
5. Chatbot der Wissensbasis (Masterplan v0.1b, Welle 5) — **rutscht in die Härtung**, vor 01.11.

**Architektur-Session**
- #48/#49 anwenden, `schema.md` nach 0103–0107 neu erzeugen.
- Backlog-Dateien, Abgleich-Matrizen, Feld-Matrix, Design-Analyse D0 (Startpaket), `launch.json`-Einträge, Start-Prompts.
- Volunteer-Tabelle 2026 auslesen, Schichtmodell optimiert ableiten (Konrads Auftrag vom 11.09., bisher offen).
- CSP von Report-Only auf scharf (`CSP_ENFORCE=true`), nachdem die Vercel-Logs einige Tage ohne eigene Verstöße sind.
- RLS-Review, Audit-Log-Ansicht, Sync-Reports, Doku-Reproduktionstest (Masterplan Welle 5).
- Ganz am Ende, unverändert: HubSpot-Go-live des Ingest und Swapcard-Kategorien.

**Konrad / extern** — unverändert aus der Checkliste, darunter zeitkritisch: Sanity-Prüfergebnis ans Website-Team + Rangfolge `sponsoring_level` bestätigen, Event-App-Entscheidung bis 24.09., Katalogpreise vor dem Freischalten, Wiki-Entwürfe freischalten, Hallenplan hochladen, iPad-Test des Check-in, Leaked-Password-Protection, `NEXT_PUBLIC_SITE_URL`, AVVs, Consent-Agent und Anwalt, Security-Experte, PITR/`alarm@`, Domain-Umzug Teil A Anfang Oktober.

---

## 3 · Punkt 2 — Abgleich Alt-Portale ↔ neue Portale

**Methode.** Je Altsystem eine Matrix: Zeile = alte Seite oder Funktion; Spalten = neue Seite, Status (**vorhanden · anders · fehlt · bewusst weggelassen** mit Verweis auf die Entscheidung), Prüfung Konrad (✓ / ✗ / Kommentar), Prio (P1/P2/P3). Vorbereitet aus `docs/legacy-inventar.md` (§1–8 Airtable/SoftR, §13 Alt-Portale, §14 Wikis, §15 Programm-Sheet, §11 Regie-Sheet) und der Seitenliste des Repos; **geprüft am Gerenderten** (Anmeldung als Konrad per Magic-Link, jede Seite abgerufen — so wie in F4), nicht nur am Quelltext. Ergebnis: `docs/abgleich/<system>.md`, Drive-Spiegel.

**Regel aus F4 bleibt:** Die Matrix benennt Lücken, sie schließt keine. Gebaut wird erst, was du je Zeile als „FLS27 braucht es“ markierst; alles andere wird als „bewusst weggelassen“ ins Entscheidungslog geschrieben, damit es nicht in jeder Runde neu auftaucht.

**Was es schon gibt:** `docs/feedback-runde-1-abgleich.md` (Speaker-Portal 7 Seiten, Partner-Portal 10 Seiten, 14.09.), `docs/speaker-portale-abgleich-2026-09-15.md` (Admin · Leads · Speaker gegen dein Zielbild), `docs/speaker-felder-abgleich-2026-09-15.md` (Felder gegen Paulinas Master-Liste).

**Was fehlt (Reihenfolge = Kundennähe):**

| # | Altsystem | Neu | Besonderheit |
|---|---|---|---|
| 1 | Messeshop WooCommerce `partner.chef-treff.de` (Katalog, Rollen, Bestellphasen, Rechnung) | `/partner/shop`, `/partner/shop/bestellungen`, `/admin/partner/bestellungen`, `/produktion/bestellungen` | Katalog 110 Artikel, 68 publiziert; 57 Artikel ohne Preis (Checkliste) |
| 2 | Partner Hub, Rest: Hackathon-Seite, Media Kit, Alle Dateien, Masterclass-Sichtbarkeit | `/partner/*`, `/hackathon` (Partner-Sicht) | in F4 nur teilweise |
| 3 | Volunteers: Airtable-Formulare (8), Interfaces „VOLO ÜBERSICHT“, „NON/FEHLT VOLOS“, Notion-Volunteer-Wiki (≈53 Artikel), Einsatz-Raster | `/volunteers/*`, `/admin/volunteers/*`, Wiki | Schichtmodell 2026 wird parallel optimiert abgeleitet (Architektur) |
| 4 | Hackathon: Luma, Airtable (Applications, Participants, Feedback), Discord | `/hackathon/*`, `/admin/bewerbungen` | Discord-URL noch nicht gesetzt (Checkliste) |
| 5 | Initiativen: Airtable (Applications & Outreach, Onboarding-Data, Freitickets, Award, Messestand) | Partner-Portal als Partner-Typ (Welle 4) | **prüfen, ob der Partner-Typ wirklich alle Initiativen-Fälle trägt** (Barter-Deal, 100 %/50 %-Codes, Mini-Booth, Award) |
| 6 | Talent: Teilnehmer-Base `appHVQhV4Dp76hrMk` (Analyse 21.07.), Vivenu-Personalisierung | `/profil`, `/meine`, `/programm`, `/onboarding` | Consent-Set (Checkliste) |
| 7 | **Team-Werkzeuge:** 9 Bühnen-Interfaces Speaker, Speaker-Bilder-View, Volo-Views, Regieplan-Sheet, Master-Programm-Sheet, Partner-Base-Views, Hospitality/Shuttle-Tabellen | `/admin/*`, `/speaker-leads/*`, `/produktion/*`, `/regie/*` | speist direkt §5.5 Verwaltungsfunktionen |

**Dein Anteil (Woche A):** Mit der jeweiligen Matrix offen durch das Altsystem gehen, je Zeile ✓/✗/Kommentar, fehlende Zeilen ergänzen. Was du dabei an Feinheiten siehst („der Countdown stand oben“), gehört noch nicht hierher, sondern später in die Feinfeedback-Runde — die Matrix fragt nur: **Gibt es die Funktion, und reicht sie für FLS27?**

---

## 4 · Punkt 3 — Chats und Feedback-Prozess

### 4.1 Diagnose
Feedback lief bisher als Fließtext in `docs/feedback-runde-*.md` und im Chat. Punkte hatten Nummern je Runde (F1 … F12), aber **keinen Status** und keinen festen Ort, an dem „offen“ von „erledigt“ unterscheidbar war. Wenn eine Session ihren Kontext verdichtet oder eine Runde die nächste überholt, fällt ein Punkt still heraus — genau dein Gefühl „nicht jeder Punkt wird eingearbeitet“. Mehr Chats allein ändern daran nichts; ein Backlog mit IDs ändert es vollständig.

### 4.2 Backlog je Portal (Repo, Drive-Spiegel)
`docs/feedback/<portal>.md` für `talent`, `speaker`, `speaker-leads`, `partner` (inkl. Messeshop, Messestand), `volunteers`, `hackathon`, `produktion`, `checkin`, `admin`, `querschnitt` (Shell, Login, Mails, Umschalter).

Eine Tabelle je Datei:

| ID | Datum | Seite | Ist → Soll | Prio | Status | Quelle |
|---|---|---|---|---|---|---|
| `PART-014` | 14.09. | `/partner/checkliste` | … → … | P1 | geplant #52 | Runde 2 |

- **Status:** `erfasst` · `geplant` (mit PR) · `gebaut` (im PR, wartet auf dich) · `abgenommen` · `zurückgestellt` (Grund + Datum) · `abgelehnt` (Verweis Entscheidungslog). Es wird nie gelöscht, nur der Status geändert.
- **Pflichtablauf der Session:** (1) jede Feedback-Nachricht zuerst vollständig in den Backlog übertragen, (2) mit den IDs antworten („erfasst: PART-014 bis PART-019; Rückfragen: …“), (3) bauen in Prio-Reihenfolge, (4) die PR-Beschreibung nennt die IDs, (5) Walkthrough-Bericht mit Screenshot je ID, (6) du hakst ab → `abgenommen`.
- **Einmalige Übertragung** der offenen Punkte aus Runde 1 und 2 (Architektur-Session, Woche A), damit nichts Altes verloren geht.
- Alternative wäre GitHub Issues mit Projekt-Board (bessere Übersicht, aber ein weiteres Werkzeug für dich, und die Doku-Wahrheit läge außerhalb von `docs/`). Empfehlung: Markdown im Repo; wenn du ein Board willst, sagst du es, der Wechsel ist ein Skript.

### 4.3 Chat-Struktur (Empfehlung)

| Chat | Bereiche | Branch-Präfix | Port | Backlog-Dateien |
|---|---|---|---|---|
| **Partner** | `/partner/*` (Onboarding, Eure Daten, Kontakte, Checkliste, Dateien, Tickets, Event-App, Messestand, **Messeshop**, Bühne, Bewerber), `/admin/partner/*` | `partner/` | 3001 | partner |
| **Speaker-Domäne** | `/speaker/*`, `/speaker-leads/*`, `/admin/speaker*`, `/admin/programm`, `/admin/hospitality`, `/admin/anreise`, `/admin/reisekosten`, `/admin/technik`, `/regie/*` | `speaker/` | 3002 | speaker, speaker-leads |
| **Talent & Hackathon** | `/profil`, `/meine`, `/programm`, `/onboarding`, `/hackathon/*`, `/admin/bewerbungen`, `/admin/dubletten` | `talent/` | 3003 | talent, hackathon |
| **Volunteers, Produktion & Check-in** | `/volunteers/*`, `/produktion/*`, `/checkin`, `/admin/volunteers/*`, `/admin/catering` | `ops/` | 3004 | volunteers, produktion, checkin |
| **Admin & Schnittstellen** (dein „allgemeiner Build-Chat“) | `/admin` Team, Rollen, Personen, Vokabular, Mail, Wiki, Videos, Ansprechpartner, Fristen, UI; Integrationen (HubSpot, vivenu, Swapcard, SevDesk, Sanity); Shell, Login, Umschalter, Mails | `admin/` | 3005 | admin, querschnitt |
| **Design** (befristet bis Rollout) | `components/ui`, `app/globals.css`, Skill `portal-design`, Shell, Referenzseiten, Rollout-PRs je Cluster | `design/` | 3006 | — (Design-Feedback bis zur Abnahme des Systems hier) |
| **Architektur/Security** (diese) | Migrationen, Reviews, Merges, `docs/`, Entscheidungslog, Backlog-Übertragung, Matrizen | `main` | — | — |

**Warum Verbund statt Portal:** Speaker, Speaker-Leads und Programm teilen sich dieselben Tabellen und RPCs; Volunteers, Check-in und Produktion ebenso. Ein Chat je Portal würde dieselbe Migration in zwei Chats erfinden. Außerdem sind **deine** Review-Zeit und **meine** Merge-Zeit der Engpass — nicht die Zahl der Bauenden.

**Was du wissen musst:** Das Wochenkontingent gilt über alle Sessions gemeinsam. Sieben parallele Chats bauen nicht siebenmal so schnell, sie verbrauchen siebenmal Kontext. Deshalb: **höchstens zwei bis drei Chats gleichzeitig aktiv**, die anderen ruhen; das Backlog ist ihr Gedächtnis, ein ruhender Chat verliert nichts. Wenn du lieber neun Portal-Chats willst, funktioniert dasselbe Backlog — dann bitte trotzdem nur zwei bis drei aktiv.

**Einrichtung je Chat (einmalig):** eigener Worktree auf einem Branch mit dem Präfix, `.env.local` per `sh scripts/env-pull.sh --worktrees`, Dev-Server über `.claude/launch.json` (Einträge 3002–3006 lege ich an), Magic-Link-Redirect `http://localhost:<port>/auth/callback` in Supabase (trägst du ein). Der Start-Prompt je Chat steht im Leitfaden; er verweist auf die Build-Session-Checkliste in `AGENTS.md` und auf die eigenen Backlog-Dateien.

### 4.4 Leitfaden
`docs/feedback-leitfaden.md` — wohin welches Feedback geht, wie ein Punkt aussieht, was die Session daraufhin tun muss, Prioritäten, wann welche Art von Feedback dran ist, Start-Prompts.

---

## 5 · Punkt 4 — Backend-Walkthrough

### 5.1 Entscheidung (Empfehlung)
**Supabase Studio nur für Konrad und die Architektur-Session (per MCP); das Team arbeitet ausschließlich in den Portalen.** Studio nutzt die Datenbank-Vollrolle: kein RLS, keine Spalten-Grants, kein Audit-Log, Sicht auf Gesundheitsangaben (Ernährung, 0100) und Vault-Verweise. Das widerspricht „Sicherheit ist Backbone“ und der Datenminimierung. „Interfaces in Supabase“ gibt es nicht — das wäre Airtable-Denken; die Interfaces **sind** die Portale. Konsequenz: Verwaltungsfunktionen im Admin (§5.5).

### 5.2 Werkzeug: Feld-Eigentümer-Matrix
`docs/feld-matrix-2026-09.md`, erzeugt aus `docs/schema.md` (Tabellen, Spalten, Kommentare) plus Suche im Code (welche Seite und welche RPC schreibt und liest die Spalte), dann von Hand vervollständigt. Je Tabelle: Domäne, Zweck in einem Satz, Datenschutz-Klasse (ohne Personenbezug · personenbezogen · besonders geschützt Art. 9 · Bank/Vault). Je Spalte: **fachlich oder technisch**, wer schreibt (RPC, Trigger, Ingest, Cron), **wo pflegbar** (Seite), wo sichtbar, Anmerkung („doppelt zu …?“).

Neun Domänen für den Walkthrough:

| # | Domäne | Tabellen |
|---|---|---|
| 1 | Identität & Zugang | `person`, `person_email`, `person_acquisition_channel`, `person_eligibility`, `person_interest`, `person_merge_log`, `potential_duplicate`, `consent_record`, `suppression`, `registration`, `role_assignment`, `staff_user` (entfällt nach 0107), `audit_log` |
| 2 | Edition & Programm | `event`, `event_day`, `stage`, `stage_day`, `track`, `slot`, `slot_history`, `session`, `session_speaker`, `session_question`, `session_submission`, `question_catalog`, `programme_backlog`, `application`, `decision_release`, `regie_cue` |
| 3 | Speaker | `speaker_profile`, `speaker_asset`, `speaker_travel`, `hospitality_quota`, `hospitality_booking`, `expense_claim` |
| 4 | Partner & Leistungen | `organization`, `org_membership`, `org_edition`, `org_product`, `org_step`, `org_step_check`, `org_ticket_allocation`, `partner_asset`, `partner_deal`, `deliverable`, `deliverable_template`, `deadline`, `booth`, `booth_service_check` |
| 5 | Messeshop & Produkte | `product`, `product_component`, `stock_ledger`, `shop_order`, `shop_order_line`, `shop_request` |
| 6 | Tickets & Einlass | `ticket`, `ticket_secret`, `ticket_type_map`, `checkin` |
| 7 | Volunteers | `volunteer_profile`, `shift`, `shift_assignment`, `volunteer_coupon_revocation` |
| 8 | Hackathon | `hack_application`, `hack_challenge`, `hack_team`, `hack_team_member`, `hack_submission`, `hack_judging_score` |
| 9 | Inhalte, Kommunikation, Stammdaten, Integration | `kb_article`, `mail_log`, `mail_template`, `portal_video`, `edition_contact`, `edition_file`, `edition_info`, `vocab_term`, `external_ref`, Schema `integration` (nicht exponiert) |

### 5.3 Ablauf mit dir
Zwei Termine à etwa 90 Minuten (Domänen 1–5, dann 6–9), Matrix als Leitfaden. Je Tabelle drei Fragen: **Fehlt ein Feld?** (aus deiner Arbeit, aus den Alt-Systemen) · **Ist etwas doppelt?** · **Kann das Team es pflegen, wo es hingehört?** Antworten landen in der Matrix; daraus werden Migrationen (diese Session) und Verwaltungsfunktionen (Admin-Chat, Backlog `admin`). Wenn du echte Zeilen sehen willst, kannst du parallel den Tabellen-Editor in Studio öffnen — lesend; die Matrix bleibt das Arbeitsdokument.

### 5.4 Prüffragen, die ich schon mitbringe (Fragen, keine Befunde)
`staff_user` gegen die Rolle `admin` (entfällt mit 0107) · Jobtitel/Organisation auf `speaker_profile` gegen `person` · `partner_deal` gegen `org_product` (HubSpot-Spiegel gegen gebuchte Leistungen) · `deadline` gegen Fälligkeiten in `deliverable` · `registration` gegen `ticket` · `edition_info` gegen `kb_article` · Freitext `sponsoring_level` gegen Vokabular-Schlüssel (0097, bewusst beides) · `edition_contact` gegen `person`/`role_assignment` (bewusst getrennt: dienstliche Kontaktdaten).

### 5.5 Verwaltungsfunktionen — Kandidaten (im Walkthrough zu bestätigen)
Vorhanden im Admin: Personen, Rollen, Team (#48), Vokabular, Dubletten, Mail-Versand, Wiki, Videos, Ansprechpartner, Fristen, Partner (Produkte, Vorlagen, Kontingente, Bestellungen, Integrationen, Review), Speaker, Speaker-Leads, Speaker-Tickets, Hospitality, Anreise, Reisekosten, Technik, Catering, Bewerbungen, Volunteers (Schichten, Tickets), Programm (Board, Tabelle).
**Wahrscheinlich fehlend:** Editionen, Tage, Bühnen, Tracks anlegen und pflegen (heute nur per Migration?) · **Audit-Log-Ansicht** · Consent-Übersicht und „Profil löschen“-Anfragen · Suppression-Liste · Mail-Vorlagen bearbeiten (heute Versand, Vorlagen in der Datenbank) · Hackathon-Admin (Challenges, Judging-Freigabe, Zeitplan) · Initiativen als eigene Sicht · Kiosk-Konten (`checkin_operator`) · Dateien der Edition (heute unter Produktion) · Integrations-Status über alle Systeme (heute unter Partner).

---

## 6 · Punkt 5 — Design

### 6.1 Befund
Fundament steht: Sharp Sans und ABC Laica liegen als WOFF2 im Repo und sind eingebunden, Logo-SVGs sind da, Tokens in `globals.css`, UI-Kit mit Button, Card, Table, Drawer, Modal, Stepper, Badge und weiteren, Skill `/portal-design` mit Kontrastmessung. Von den Bildschirm-Archetypen ist nur **A · Liste** entworfen; B · Detail, C · Formular, D · Übersicht stehen im Skill als „noch nicht entworfen — Konrad zieht einen Designer hinzu“. **Dieser Designer sind jetzt die Website-Blöcke plus das Team-Portal.** Das Problem ist nicht Token oder Schrift, sondern **Komposition und Atmosphäre**: Die Portale sind hell, dünn und textlastig; die Marke ist Navy, fett, kursiv, fotografisch, mit Formen.

### 6.2 Was in den Figma-Blöcken steht (Stichprobe 17.09.: Hero, Speaker, Step, Detail)
- **Variablen:** Background blue `#081A35`, Light Gray `#F5F4F2`, **Yellow `#FFCD40`** (Academy). Typo: Sharp Sans H1 82 Extrabold Caps, H3 32 Extrabold Caps, H5 16 Semibold; ABC Laica 38 und 16 Regular Italic. Deckungsgleich mit `docs/design-briefing.md` §3.
- **Hero:** Navy, Laica-Eyebrow in Gelb, Extrabold-Caps-Titel, ein Satz, **Pink-CTA**, Fotocollage mit dünner Linien-Scribble, Zertifikats-Logo. Speaker: Porträts in **Hexagon-Masken** mit gelbem Verlauf und Umriss, gelber Laica-Rollen-Chip, Name in Caps, Organisation kursiv. Step: nummerierte **Hexagon-Marker** auf einer Linie. Detail: drei Fotokarten mit großem kursivem Akzentwort in Indigo (bereits Events-Farbe), Ellipsen-Linien.
- **Übersetzungsregeln:** Gelb → Events-Primär **`#6262DC`** (Brandbook Final; Ramp `#5B5BD9 / #4A4AC5 / #E8E8FC`). Pink `#FF88CF` bleibt Marketing-Marker (Login, Welcome, Hero), nie Arbeits-Button. **Offen:** Hexagon (Website-Blöcke) gegen Dreieck/Winkel (Brandbook Events, Entscheidung 12.09.) — §7.

### 6.3 Übersetzung Block → Portal-Baustein

| Website-Block (Desktop + Mobil) | Portal-Baustein | Einsatz |
|---|---|---|
| Header | **Sidebar bleibt** (Konrad); mobil ein Off-Canvas-Menü im Website-Header-Stil | alle Bereiche |
| Hero | **Portal-Hero**: Navy-Band oben auf der Startseite jedes Bereichs — Laica-Eyebrow („Euer Summit 2027“), Caps-Titel mit einem Highlight-Wort, ein Satz, **eine** Aktion, Fotocollage rechts | Startseiten, Login, Welcome |
| Logo Section | Logo-Wand | Produktion/Admin (Aussteller), Talent-Programm (Partner) |
| Detail Section | **Drei-Karten-Erklärung** (Foto, kursives Akzentwort, Satz) | Onboarding-Einstieg, Leerzustände, Wiki-Start |
| Programm Section | Programm-Liste und -Kacheln | `/programm`, Speaker-Session, Board-Lesesicht |
| Testimonial | Zitat-Karte | Welcome, Speaker-Reception |
| Speaker Section | **Personen-Karte** (Porträt-Maske, Rollen-Chip, Name Caps, Organisation) | Speaker-Listen, Ansprechpartner, Jury, Buddys, Team |
| CTA Banner | **Nächster-Schritt-Banner** (Akzentfläche, Navy-Text) | Startseiten: „3 von 8 Aufgaben offen“ |
| Ticket Section | **Ticket-Karten** (Kontingent, Codes, QR) | Partner-, Speaker-, Talent-, Volunteer-Tickets |
| Step Section | **Schritt-Leiste** (nummerierte Marker auf Linie) = Stepper und Onboarding-Fortschritt | Wizard, Onboarding, Checklisten-Kopf |
| Special Section | Hervorhebungs-Karte für Sonderformate | Hackathon, Masterclass, Company Tour |
| FAQ | Akkordeon | Wiki und Hilfe je Bereich |
| Footer | Portal-Footer (Impressum, Datenschutz, Support-Postfach) | alle |

Portal-eigene Bausteine ohne Website-Vorbild — **Tabellen, Filterleisten, Formulare, Drawer, Statuschips, Datei-Upload, Board/Kalender** — folgen Archetyp A und dem **Team-Portal** (§6.6).

### 6.4 Der Mittelweg (Vorschlag „Hell mit Marken-Momenten“)
Navy-Sidebar mit Formensprache · **Portal-Hero** auf jeder Startseite · Sektionsköpfe im Website-Rhythmus (Eyebrow → Caps-Titel → ein Satz) · Arbeitsflächen hell, dicht, linksbündig · Fotos nur in Hero, Detail-Karten, Personen-Karten · Pink nur für Marketing-Momente, Akzent für Aktionen · Mobil nach den Mobil-Blöcken der Website gestapelt. Die Alternative **„Dunkler Rahmen“** (Navy-Shell rundum, helle Karten darauf, näher an der Website) zeigen wir im Prototyp an der Partner-Startseite als zweite Variante, wenn du sie sehen willst; für dichte Tabellen wäre sie schwieriger (Kontrast, Ruhe).

### 6.5 Vorgehen im Design-Chat (mit `/portal-design`, Figma-MCP, Claude in Chrome)
- **D0 · Analyse (2 Tage, Architektur-Session beginnt sofort):** alle 26 Blöcke lesen (`get_design_context`), Team-Portal-Walkthrough (du eingeloggt, wir lesen), Übersetzungstabelle festziehen, Entscheidungen §7 einholen → Startpaket `docs/design-system-v2-auftrag.md`.
- **D1 · System und Referenz (4 Tage):** Tokens ergänzen (Foto-Masken, Linien, Hero-Band), Kit erweitern (`HeroBand`, `PersonCard`, `StepBar`, `NextStepBanner`, `TicketCard`, `Accordion`, `PhotoCard`, `Footer`), Archetypen B/C/D entwerfen. **Drei Referenzseiten + Login** auf einem Branch als Vercel-Preview: Partner-Startseite (D · Übersicht), „Eure Daten“ (C · Formular), Speaker-Detail im Admin (B · Detail). Zwei Review-Runden mit dir; jedes Farbpaar gemessen.
- **D2 · Rollout (5–7 Tage):** Shell zuerst (Sidebar, Kopf, Footer, Login, Welcome), dann je Cluster ein PR — Partner → Speaker-Domäne → Talent & Hackathon → Ops → Admin — mit Screenshots 1440 und 375 im PR; du nimmst je Bereich ab. Build-Chats ändern in dieser Zeit keine Seiten des Clusters, der gerade konvertiert wird (Absprache über das Backlog).
- **D3 · Feinfeedback je Bereich** (Woche D).
- **Claude Design:** optional. Das Kit lässt sich als Design-System-Projekt spiegeln (`/design-sync`), damit du Bausteine dort ansiehst und kommentierst. Ob dort auch entworfen wird, prüfen wir nach dem ersten Blick — die Abnahme läuft in jedem Fall auf der Vercel-Preview mit echten Daten.

### 6.6 Team-Portal als Vorbild
Du zeigst es im Walkthrough (Chrome, eingeloggt; wir lesen nur, wie am 08.09. bei den Alt-Portalen). Wir notieren Tabellen-Dichte, Filterleisten, Formularaufbau, Farbeinsatz, Navigationstiefe und übernehmen die Muster in `referenzen/muster.md` als Vorlage für Archetypen B und C.

---

## 7 · Entscheidungen für Konrad (Antworten als Liste genügen)

1. **Reihenfolge:** Strukturfeedback jetzt über die Matrizen, Feinfeedback erst nach dem Design-Rollout je Portal? *(Empfehlung: ja)*
2. **Chats:** fünf Verbund-Chats + Design + Architektur *(Empfehlung)* — oder neun Portal-Chats + Allgemein? Gleichzeitig aktiv: höchstens drei?
3. **Backlog:** Markdown je Portal in `docs/feedback/` *(Empfehlung)* oder GitHub Issues mit Board?
4. **Supabase:** Studio nur du und diese Session, Team ausschließlich über Portale *(Empfehlung: ja)* → Verwaltungsfunktionen werden gebaut.
5. **Backend-Walkthrough:** zwei Termine à 90 Minuten anhand der Feld-Matrix *(Empfehlung)* oder asynchron als Kommentare in der Matrix?
6. **Design-Richtung:** „Hell mit Marken-Momenten“ *(Empfehlung)*, „Dunkler Rahmen“, oder beides im Prototyp an der Partner-Startseite?
7. **Formen:** Hexagon-Porträts und -Marker aus den Website-Blöcken übernehmen oder Brandbook-Events-Form (Dreieck/Winkel, 12.09.)? *(Empfehlung: das Website-Team fragen, welche Form die Events-Seiten nutzen; bis zur Antwort Brandbook)*
8. **Pink-CTA** nur für Marketing-Momente (Login, Welcome, Hero)? *(Empfehlung: ja)*
9. **Nach den 14.10. rutschen:** Chatbot (→ Härtung, vor 01.11.), Segmentierungs-Übersicht/AC-Tags, Strategy-Call-Slots, C-Features — einverstanden?
10. **Termine:** Team-Portal-Walkthrough (Chrome) und Alt-Portal-Walkthrough mit Matrix — wann in Woche A?
11. **Supabase-Redirects** `http://localhost:3002…3006/auth/callback` trägst du ein, sobald die Chats stehen?

---

## 8 · Was diese Session nach deiner Freigabe sofort tut
1. #48/#49: Review, 0106/0107 anwenden mit Tests, „Migration live“, Walkthrough der Build-Session, Merge #48 → #49; `schema.md` neu.
2. `docs/feedback/*.md` anlegen, offene Punkte aus Runde 1/2 übertragen; `launch.json` 3002–3006; Start-Prompts im Leitfaden.
3. Abgleich-Matrizen (§3, Entwürfe 1–7) und Feld-Matrix (§5.2, Skript + Hand).
4. Design-Analyse D0: alle 26 Blöcke aus Figma, Team-Portal-Walkthrough mit dir, Startpaket für den Design-Chat.
5. Entscheidungslog (deine Antworten zu §7), Abschluss-Checkliste, Drive-Spiegel, Gedächtnis.
