# Masterplan — ChefTreff-Plattform FLS27 (Entwurf v0.1, 08.09.2026)

> Zur Freigabe durch Konrad. Grundlage: Fragenkatalog (1–63), Entscheidungslog, Legacy-Inventar (§1–11), Feedback-Register FLS26, Design-Briefing v0.3. Änderungen nach Freigabe nur über das Entscheidungslog.

## 0 · Rahmen
- **Ziel:** eine Plattform für Summit 27 (16.–17.04.2027) und Hackathon 27 (15.–16.04.2027), wiederverwendbar für 28: ein Login, Rollen, ein Datenmodell, sauber getrennte Domänen.
- **Termine:** Go-live **14.10.2026** (funktional vollständig) · Prozessstarts **01.11.2026** · Härtungsfenster 15.10.–01.11. (Security-Loop, Design-Loop, Migration, Domain-Umzug).
- **Team:** Konrad + Claude; Design-Loop und Security-Experte am Ende; Freelancerin für Slot-Grafiken (Review).
- **Nicht verhandelbar:** eine Identität + Rollen · Rechtemodell überall · ein Supabase-Projekt, Domänen getrennt · dokumentierte Integrationsschicht (Logik in Supabase, make.com nur Transport) · eine Codebasis/ein Deploy · **Sicherheit = Backbone** · **Doku = jederzeit reproduzierbar** · **bilingual DE/EN** · **E-Mail-Minimierung**.
- **Arbeitsweise:** 80 %-Lösungen je Portal → Feedback → schärfen. Migration der Altdaten ist der **letzte** Schritt.

## 1 · Komponenten
| Bereich (URL) | Nutzer | Kernaufgaben | Welle |
|---|---|---|---|
| Talent-Portal `/` `/profil` `/programm` | Teilnehmer (lead → talent) | Login, Onboarding-Wizard, Profil, Programm ansehen, **1-Klick-Bewerbung** (Masterclass/Company Tour/Side-Event), Anmeldungen, Tickets/QR, Slides (später) | 1 |
| Programm-DB + Editor `/admin/programm` | Programm-Team, Bereichslead | Event → Tag → Bühne → Slot → Session ⇄ Speaker; Zugangsart je Angebot; Kapazitäten; Freigabe der Entscheidungen | 1 |
| Speaker-Portal `/speaker` | Speaker, Assistenz | Onboarding, Talk, Tech-Rider, Consent, Hospitality (statusgesteuert), Reisekosten-Flow, Ticket, Media-Kit | 2 |
| Speaker-Lead-Portal `/speaker-leads` | Speaker-Manager (Scope Bühne×Tag/Slot) | Akquise-Pipeline, Speaker anlegen/betreuen, Slot-Infos, Reception-Flag, Freigaben | 2 |
| Partner-Portal `/partner` | Partner-Kontakte (Rollen), Standbühnen-Editor, Initiativen | Onboarding aus HubSpot, Kontakte selbst pflegen, **produktabhängige Checkliste**, Uploads (SVG/EPS), Ticket-Code/Secret Shop, Bewerber-Auswahl, Slots für Standbühne, Hackathon-Leistungen | 3 |
| Messeshop `/partner/shop` | Partner-Kontakte | Katalog (ohne Startseite/Rollen), Bestellphasen, Lunch-Paket, Merch, Rechnungsentwurf SevDesk | 3 |
| Volunteer-Portal `/volunteers` | Volunteers, Volunteer-Leads | Bewerbung + Präferenzen, Zuteilung (durch uns), Schichten, Shirt, Buddy, Ticket-Code (+ Add-ons), QR | 4 |
| Check-in `/checkin` | Check-in-Rolle (Kiosk) | nur Scan + Status — sonst nichts | 4 |
| Hackathon `/hackathon` | Teilnehmer, Partner (produktbasiert) | Bewerbung/Auswahl, Teams, Challenges, Einreichung, Judging, Zeitplan; Partner-Leistungen | 4 |
| Produktionsportal `/produktion` | Event-Team, Regie | Regie-Ansicht je Bühne×Tag, Mehrbühnen, Stand-/Leistungs-Checklisten, Aufbau | 4 |
| Admin `/admin` | Admin, Bereichsleads | Personen, Rollen, Vokabular, Dubletten, Mail-Versand aus Dashboard, Sync-Reports, Segmente | 1–5 |

## 2 · Architektur
- **Backend:** Supabase (Postgres, Auth, Storage, Edge Functions, pg_cron) — ein Projekt, Schemas `public` (fachlich), `import` (Migration), `integration` (Webhook-Events, Sync-Jobs). RLS auf allen Tabellen; Staff-Zugriffe serverseitig (`service_role`) nach Rollenprüfung.
- **Frontend:** eine Next.js-App (App Router) mit Bereichen als Route-Gruppen; gemeinsames UI-Kit (Tokens aus Design-Briefing, Sharp Sans/Laica als WOFF2), i18n (DE/EN) über Message-Kataloge + `vocab_term`.
- **Auth:** Supabase Auth — Magic-Link für alle; **Google-SSO (Domain chef-treff.de) + 2FA-Pflicht** für Staff. Ein Login, Bereichs-Umschalter nach Rollen.
- **Hosting/Domain:** Vercel Pro (EU), **`portal.chef-treff.de`**; Env-Secrets nur in Vercel (lokal `vercel env pull`).
- **Mail:** Resend (Templates DE/EN, Mail-Log, Reminder-Engine); Gmail bleibt Team-Postfach.
- **Automation:** Logik = SQL/RPC/Edge Functions; **make.com nur Webhook-Transport**; Cron für Sweeps/Reminder.
- **Dateien:** Supabase Storage (Logos, CVs, Slides, Belege) mit signierten, zeitlich begrenzten Links; Upload-Validierung je Deliverable-Typ.
- **Monitoring:** Fehler-Tracking, Uptime, `alarm@chef-treff.de`; Webhook-Reconciliation-Sweeps.

## 3 · Gesamt-Datenmodell (Domänen, Kernobjekte)
**Identität** · `person` (stabile ID, `tier` lead/talent = Login, Titel, Stadt, ISO-Land) · `person_email` (genau 1 primär) · `role_assignment` (role, scope_type: global/edition/portal/org/stage/stage_day/slot, scope_id, edition_id, valid_from/to) · `organization` (type corporate/startup/initiative/university, HubSpot-ID) · `org_membership` (Kontaktrollen: primary_ops, cc, event_app_member, signing, accounting, shop) · `consent_record` (typ, version, zeitpunkt, quelle) · `suppression` (gehashte E-Mail nach Profil-Löschung).
**Event & Programm** · `event_edition` (FLS27-Woche → Summit 27, Hackathon 27) · `event_day` · `stage` (type main/partner_booth, owner_org) · `slot` (start/ende, stage, responsible_person) · `session` (format, titel/beschreibung DE/EN, sprache, `access_mode` open/registration/application, `eligibility_rule`, `capacity`, `ticket_required`, `deadline`, host_org/speaker, themen, `publish_status`) · `session_speaker` (rolle speaker/moderator/host) · `track`.
**Bewerbung & Anmeldung** · `application` (person × session: applied → shortlisted → accepted(confirm_by) → confirmed → attended/no_show | waitlisted → promoted | declined/expired; rank; answers; consent_share; decided_by) · `question_catalog` · `session_question` (max 2 custom, approved_by) · `decision_release` (Freigabe-Gate → Mails) · `registration` (open/registration-Formate, Historie) · Kollisionsprüfung + Entscheidungszwang bei zeitgleichen Zusagen.
**Tickets** · `ticket_type_map` (Vivenu ticketTypeId ↔ pass_type ↔ Gruppe/Rechte) · `ticket` (barcode = **der** QR, vivenu ticket/transaction/customer ids, holder person, status, personalization_status, add-ons) · `org_ticket_allocation` (pass_type, menge, coupon, undershop_url) · Speaker-/Crew-Freitickets.
**Partner** · `product` (aus HubSpot Line-Items; Kategorie: Paket, Standbühne, Hackathon, Merch …) · `org_product` (gebucht, Menge, Status) · `deliverable_template` (je Produkt: Typ, Frist-Regel, Dateiregeln) · `deliverable` (Status offen/eingereicht/bestätigt/überfällig, Dateien, Eingangsbestätigung) · `strategy_call` · `booth` (Nummer, Fläche, Leistungen) · Bewerber-Auswahl über `application`.
**Messeshop** · `shop_product` (Kategorie, Eignungshinweis, Bild), `shop_order` (Phasen, Fristen), `order_item`, `stock_ledger`, Rechnungsentwurf → SevDesk.
**Speaker** · `speaker_profile` (edition-bezogen: titel, bio DE/EN kurz/lang, foto + rechte, socials, pronomen, sprache, speaker_type, pipeline_status, reception_eligible, lounge_access, pass_type, hospitality_status, tech_rider, consents, assistant_person) · `hospitality_booking` (hotel/shuttle, Kontingente) · `expense_claim` (Belege, Betrag, Bankdaten verschlüsselt, PDF, Freigabe, SevDesk-Ref) · `speaker_asset` (Slides mit Slid@Home-Freigabe, Grafiken).
**Volunteers** · `volunteer_profile` (shirt, areas, day_prefs, availability, buddy, status) · `shift` (position, start, ende, soll) · `shift_assignment` (status, bestätigt) · `checkin` (scan, gerät, zeit).
**Hackathon** · `hack_application`/`hack_participant` (skills, team_pref) · `team` · `challenge` (partner_org, mentoren, preise) · `submission` · `judging_score`.
**Produktion** · `regie_cue` (+ `mic_assignment`, `regie_media`, backstage/furniture) · `booth_service_check` (Leistung × Stand × geprüft).
**Kommunikation** · `mail_template` (DE/EN), `mail_log`, `reminder_rule` (Deliverable/Frist/Status), `campaign_send` (Dashboard-Versand).
**Integration** · `webhook_event` (Quelle, Event-ID, Payload, verarbeitet — Idempotenz) · `sync_job`/`sync_error` · `external_ref` (System, Objekt, ID).

## 4 · Rollen & Rechte (Auszug)
| Rolle | Scope | Darf |
|---|---|---|
| talent | eigene Person | Profil, Bewerben/Anmelden, eigene Tickets/Slides |
| speaker / speaker_assistant | eigenes Speaker-Profil (Assistenz ohne Bankdaten/Consent) | Onboarding, Talk, Hospitality, Reisekosten (nur Speaker) |
| speaker_manager | Bühne×Tag **oder Slot** (Edition) | Speaker im Scope anlegen/bearbeiten (Feld-Whitelist), Slot-Infos, Pipeline |
| partner_contact (+Kontaktrolle) | eigene Org | Checkliste, Uploads, Kontakte, Shop (Rolle shop), Rechnungen (accounting), Bewerber-Auswahl, Codes |
| standbuehne_editor | eigene Bühne | Slots/Sessions eintragen (Freigabe durch Programm) |
| volunteer / volunteer_lead | eigene Person / Bereich | Präferenzen, Schichten sehen/bestätigen; Lead: Bereich |
| checkin_operator | Edition | ausschließlich Scan + Anwesenheit |
| production_team | Edition | Regie, Stände, Checklisten |
| area_lead_<bereich> | Portal/Bereich | Vollzugriff im Bereich, nichts anderes |
| admin | global | alles, Rollen vergeben, Mail-Versand, Vokabular, Dubletten |
Regeln: Rollen außer `admin`/Team sind **edition-gebunden**; Kontaktdaten der Speaker nur für Manager im Scope; Partner sehen nur eigene Bewerber, Zugriffe protokolliert; Check-in-Gerät hat keine weiteren Rechte.

## 5 · Integrationsverträge
| System | Richtung | Trigger | Objekte | Wahrheit | Fehlerpfad |
|---|---|---|---|---|---|
| **Vivenu** | ein: Webhooks `transaction.complete`, `ticket.created/updated`, `scan.created` · aus: Personalize, Coupons/Undershops, Freitickets, Add-ons lesen | Echtzeit + nächtlicher Sweep | Ticket, Käufer, Add-ons; Personalisierung im Portal (Bestätigungsseite nachgebaut, vivenu-validiert), Rückschreiben Name; **finale Ticket-Mail aus Portal** | Ticket/Barcode: Vivenu · Profil: Portal | Signatur prüfen, Idempotenz, Retry-Sweep, Alarm |
| **Swapcard** | aus: Teilnehmer (alle Pass-Typen, Gruppe je Typ), Speaker, Sessions, Exhibitors (Kategorie/Tier), Tracks · ein: Webhooks/Analytics | täglich + on-change | clientId = unsere IDs; Barcode = Vivenu-QR | Portal | Sync-Report, Fehlerliste, Retry |
| **HubSpot** | ein: Deal → Phase „Onboarding Automation" (Pipeline FLS27) · aus: Stammdaten-Rücksync, Deal zurücksetzen bei Lücken | Webhook | Company, Contacts, Deal, Line-Items → Org, Kontakte, Produkte | HubSpot (Sales) / Portal (Onboarding) | Validierung Pflichtfelder → Stage zurück + Slack/Mail |
| **ActiveCampaign** | aus: Segmente/Tags, Reaktivierungs-Kampagne · ein: Opt-in/Abmeldung | täglich | Kontakte, Listen, Tags | Portal (Profil) / AC (Versand) | Log, Diff-Report |
| **SevDesk** | aus: Rechnungsentwürfe (Partner, Shop, Auslagen) nach Summit; Kontakte | Konrad löst aus, Entwürfe automatisch | Contact, Invoice (Entwurf), Positionen, Belege | SevDesk (Buchhaltung) | Status-Rückschreibung |
| **Resend** | aus | ereignis-/regelbasiert | alle System-Mails, Ticket-Mail, Reminder, Dashboard-Versand | Portal | Mail-Log, Bounce-Handling |
| **Sanity (Website)** | aus | Logo freigegeben | Partner-Logos/-Liste | Portal | Log |
| **Luma** | ein (nur Community-Events) | Webhook | Registrierungen → `registration` | Luma | Sweep |
| **Google Workspace** | Auth | SSO | Staff-Login | Google | — |
| **Qonto** | aus (Mail) | Auslagenrechnung freigegeben | PDF an Rechnungseingang | Qonto | — |
| make.com | Transport | Webhook → RPC | keine Logik | — | Alarm |

## 6 · Bau-Reihenfolge (Wellen)
| Welle | Zeitraum | Inhalt |
|---|---|---|
| **0 Fundament** | 08.–14.09. | Masterplan-Freigabe · Schema v2 (Identität, Rollen/Scopes, Edition, Programm, Session/Application, Tickets, Consent) · i18n · UI-Kit (Tokens, Fonts WOFF2, Komponenten) · Resend · Rollen-Gate im Frontend · Doku-Gerüst |
| **1 Talent + Programm** | 15.–21.09. | Onboarding-Wizard + alle Felder · Programm-Editor (Admin) · Programm-Ansicht + 1-Klick-Bewerbung · Bewerbungs-Pipeline (Frist, Nachrücken, Kollision, Freigabe-Gate) · Vivenu-Ingest (Sandbox) + Personalisierungsseite + Ticket-Mail |
| **2 Speaker** | 18.–25.09. | Speaker-Portal (Onboarding, Talk, Tech-Rider, Consent, Titel, Assistenz) · Speaker-Lead-Portal (Pipeline, Scopes Bühne×Tag/Slot) · Hospitality (statusgesteuert) · Reisekosten-Flow (PDF, SevDesk, Qonto-Mail) · Pass-Regeln, Reception-Flag |
| **3 Partner + Shop** | 24.09.–02.10. | HubSpot-Ingest + Gate · Kontakte/Rollen/Logins · produktabhängige Checkliste + Uploads (SVG/EPS, Eingangsbestätigung) · Reminder-Engine · Secret Shop/Codes (Pass-Typen) · Bewerber-Auswahl-UI · Standbühnen-Slots · Messeshop-Modul · Swapcard-Sync (Exhibitors, Kategorien) |
| **4 Volunteers · Hackathon · Initiativen · Produktion** | 01.–09.10. | Schichtmodell + Präferenzen + Zuteilung + QR-Check-in (Kiosk-Rolle) · Hackathon (Partner-Leistungen, Teilnehmer-App: Bewerbung, Teams, Challenges, Einreichung, Judging) · Initiativen als Partner-Typ · Produktionsportal (Regie-Ansicht, Stand-Checklisten) · Dashboard-Mail-Versand |
| **5 Go-live** | 10.–14.10. | Admin/Rollen finalisieren · Sicherheits-Härtung (RLS-Review, Audit-Log, Rate-Limits) · Sync-Reports · Doku-Reproduktionstest · **Go-live 14.10.** |
| **Härtung** | 15.10.–01.11. | Security-Loop (Experte) · Design-Loop · Consent-Texte (Agent + Anwalt) · Domain-Umzug · PITR/Alarm · Vercel-Env · **Migration Altbestand (zuletzt)** · Team-Onboarding · Prozessstart 01.11. |
| **nach 01.11. (C-Features)** | Q4/Q1 | Slid@Home · Talk-Generator · Hear-Me-Speak · Slot-Grafiken · Timetable-Bild · Bild-Normalisierung · Kalender-Blocker · Merch · Add-ons/Bundles (Vivenu-seitig) |
Überlappungen der Wellen sind beabsichtigt (80 %-Prinzip); Feedback je Welle fließt in die nächste.

## 7 · Sicherheit & Datenschutz
RLS auf jeder Tabelle, Spalten-Grants, `role_assignment`-basierte Policies · `service_role` nur serverseitig nach Rollenprüfung · Google-SSO + 2FA für Staff, Magic-Link für Nutzer · Kiosk-Rolle minimal · Audit-Log (Admin-Aktionen, Partner-Zugriffe auf Bewerberdaten, Exporte) · Consent versioniert mit Zeitstempel; „Profil löschen" + Suppression · Aufbewahrungs-/Löschkonzept (Workshop) · Secrets nur Vercel-Env, Rotation dokumentiert (Vivenu/Swapcard sofort) · Webhook-Signaturen + Idempotenz · Datei-Links signiert/zeitlich begrenzt; CV/Bankdaten verschlüsselt, Bankdaten nach Auszahlung gelöscht · Datenminimierung in Partner-Sichten · Backups + PITR + Restore-Test · Pen-Test im Security-Loop · AVVs vollständig.

## 8 · Dokumentation & Reproduzierbarkeit
Repo `docs/`: Architektur, Datenmodell (aus Schema generiert), Rollenmatrix, Integrationsverträge, Mail-Plan, ADRs (Entscheidungslog), Runbooks (Deploy/Rollback/Restore/Key-Rotation/Incident), Abschluss-Checkliste; Drive-Spiegel für das Team. **Wöchentlicher Doku-Checkpoint** (Freitag): alles aktuell, Reproduktionstest in Welle 5.

## 9 · Risiken
| Risiko | Gegenmaßnahme |
|---|---|
| Scope (10 Bereiche in 5 Wochen) | Wellen + 80 %, C-Features strikt nach 01.11., Feedback-Prio bestätigt |
| Vivenu-API-Unbekannte (E-Mail-Write, Undershops, Retry) | Support-Anfrage jetzt, Sandbox ab Welle 1, Fallback: Vivenu-Personalisierung minimal + Portal ergänzt |
| HubSpot-Datenqualität | Gate + Rücksetzen, Pflichtfeld-Report an Sales |
| Ein Entwickler-Kanal | Doku-Checkpoints, Reproduktionstest, Runbooks |
| Schrift/Design spät | Tokens früh, Designer am Ende themed nur |
| Migration zuletzt | Staging-Pipeline früh bauen, Trockenläufe ab Welle 3 |

## 10 · Offene Entscheidungen vor Freigabe
Prio-Vorschlag M/S/C bestätigen (56) · Sanity-Zugang (57) · Assistenz-Rechte (58) · Strategy-Call-Tiers (59) · Dashboard-Versand Rechte/Templates (60) · Slot-Grafik-Template/Freelancerin (61) · Slid@Home-Regeln (62) · Kontingente Hotel/DB/Locker (63) · Partner-Kontaktrollen (7) · Swapcard-Gruppen je Pass-Typ (53) · FLS26-make.com-Stack archivieren (54).

## Ergänzung v0.1a (08.09., Vivenu-Call ausgewertet) — Ticket-Journey
1. **Kauf** im vivenu-Shop (Pass-Typ, Add-ons Hotel/DB/Locker, Codes/Secret Shop) → 2. **Redirect** mit Transaction-ID auf `portal.chef-treff.de/tickets/bestaetigung` → 3. Confirmation Page (OMR-Muster): Tickets, „Für wen ist dieses Ticket?", Sprache, **Badge-Minimum** (Vorname, Nachname, Position, Unternehmen), „Vorerst überspringen", Next-Best-Actions (Login/Profil vervollständigen → Programm → Interessen → LinkedIn), Add-on-Kacheln → 4. **Personalisierung/Profil im Portal** (Wizard, Progressive Profiling) → 5. **Rückschreiben** der vier Badge-Felder nach vivenu (Ticket-Endpunkt) → 6. **finale Ticket-Mail aus dem Portal** mit dem vivenu-Barcode als QR → 7. Sync des Barcodes nach Swapcard → 8. Check-in (Setup offen). Identität: E-Mail + `vivenu_customer_id`. Parallelbetrieb mit vivenu-Maske in der Übergangsphase. Abhängigkeit: vivenu-Doku „Bestätigungsseite austauschen" + Endpunktliste (Welle 1 startet im Sandbox-Modus).

## Ergänzung v0.1b (08.09. abends) — Wissensbasis & Chatbots (Anforderung Konrad)
- **Komponente „Wissensbasis":** drei Wikis (Partner, Speaker, Teilnehmer; später Volunteers/Hackathon) + je ein Chatbot, im Portal je Bereich eingeblendet. Datenmodell: `kb_article` (audience[], language, edition, status, valid_until, owner), `kb_chunk` (pgvector, Chunk = H2-Frageblock), `deadline` (strukturiert je Edition; speist Wiki, Checklisten und Countdowns gleichzeitig). Gemeinsames Basis-Modul wird in alle Zielgruppen eingehängt.
- **Chatbot:** Retrieval nur über Artikel der Zielgruppe des eingeloggten Nutzers, nur `live` und gültig; Antwort mit Quellenlink; Logging der Fragen (anonymisiert) als Input für Wiki-Pflege. Technik: Supabase pgvector + Claude API serverseitig (Route Handler), Rate-Limit pro Nutzer; Alternative Chatbase nur wenn Frage 64 dafür entscheidet.
- **Redaktion:** Admin-Editor (Markdown, Vorschau, Status-Workflow draft → review → live, Gültigkeit), Import der 26 Notion-Artikel als Startbestand (Deadlines/PII bereinigt).
- **Einordnung Wellen:** Wiki-Editor + Import in **Welle 4**, Chatbot in **Welle 5** (vor 01.11. nutzbar für Partner-Onboarding), EN-Speaker-Wiki parallel zur Speaker-Welle.
- **Spiegelung nach Drive:** `sh scripts/mirror-docs.sh` kopiert alle `docs/*.md` unter Klarnamen in den Drive-Projektordner (Mapping im Skript). Repo = Quelle der Wahrheit, Drive = Lesekopie für das Team.
