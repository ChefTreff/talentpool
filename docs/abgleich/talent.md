# Abgleich Talent (Teilnehmende) — Altsystem → neues Portal

**Stand: 2026-09-17 · Entwurf der Architektur-Session (Codebefund, nicht am Gerenderten geprüft) · zur Prüfung durch Konrad im Walkthrough**

**Quellen (alt):** Airtable-Teilnehmer-Base `appHVQhV4Dp76hrMk` (Analyse 21.07.2026), Tabelle „Participants (Unified Profile)“ und ihr Feldbestand, wie er im Swapcard-Sync sichtbar wird (Inventar §10: E-Mail, Name, `organization`, vier Adresszeilen, Barcodes, **13 Custom Fields** Status · Uni · Erfahrung · Arbeitgeber-Art · Level · Startup-Phase · Startup-/All-Themen · Karrieremöglichkeiten · Leistung · Studienhintergrund · Studiengang, dazu acht „Studiengang: X“-Felder; alle 9 Ticket-Typen in einer Swapcard-Gruppe, Unterscheidung nur über `Ticket (Type)`) · Vivenu-Ticketflow (Inventar §9 und §12.1: Kauf, Personalisierung, `DETAILSREQUIRED`, Coupons, Scans) · OMR-Ticketflow als Referenz (§12.2) · Side-Format-Bases Company Tours `appwhzibE1E6Gm7bL` und Masterclasses `app7znFsinqqv5O0M` (§8: eine Zeile je Person, jedes Angebot nur als Spaltenpaar, keine Angebots-Entität, keine Warteliste, kein Consent) · Initiativen-Base „Alle Ticketholder“ (658) und „Freitickets“ (294) (§4) · Notion-Wiki (§14: **ein Teilnehmer-FAQ existiert nicht**) · Feedback-Register FLS26 (`docs/feedback-fls26.md`, Punkte T1–T12, Ü1–Ü4, R12).
**Quellen (neu):** `/onboarding`, `/profil`, `/meine`, `/programm`; Masterplan §1 (Zeile Talent-Portal) und Ergänzung v0.1a (Ticket-Journey); Arbeitsauftrag Welle 1 (B1–B4, A1–A3); Migrationen `20260908144639_v2_application_ticket.sql`, `20260911183019_v4_vivenu_ticket_ingest.sql` ff., `20260912083355_v4_personalized_flag.sql`.

**Methode.** Zeile = eine Station der alten Teilnehmer-Reise oder ein Feldblock der Teilnehmer-Base; daneben steht, wo das im neuen Portal liegt, in welchem Zustand, und woran man das im Code sieht. Geprüft wurde ausschließlich am Quelltext und an den Migrationen — nicht am Gerenderten und nicht mit echten Daten.

**Regel: Die Matrix benennt Lücken, sie schließt keine.** Gebaut wird nur, was Konrad je Zeile als „FLS27 braucht es“ markiert; alles andere wird als „bewusst weggelassen“ ins Entscheidungslog geschrieben.

---

## 1 · Ticket-Journey (Vivenu) — Kauf, Bestätigung, Personalisierung

Zielbild ist Masterplan Ergänzung v0.1a in acht Schritten. Diese Tabelle geht sie der Reihe nach durch.

| Alte Seite / Funktion | Neu (Pfad) | Status | Beleg | Prüfung Konrad | Prio |
|---|---|---|---|---|---|
| **1. Kauf** im vivenu-Shop (Pass-Typ, Codes, Secret Shop) | bleibt im vivenu-Shop | **anders**, mit Absicht — „Kauf aus Portal: nein“ (Entscheidung 08.09.), Undershops und Coupons steuert das Portal | `docs/entscheidungen.md` (Abschnitt H); `lib/vivenu/allocations.ts`, `lib/vivenu/volunteers.ts` | | |
| **2. Redirect** mit Transaction-ID auf `/tickets/bestaetigung` | — | **fehlt** — der Pfad ist nur als öffentlicher Pfad reserviert, ein Verzeichnis `app/tickets/` existiert nicht | `proxy.ts:18` (`PUBLIC_PATHS` enthält `/tickets/bestaetigung`); `ls app/` ohne `tickets`; Auftrag B4 in `docs/arbeitsauftrag-welle-1.md:21` | | |
| **3. Confirmation Page** nach OMR-Muster (Tickets, „Für wen?“, Sprache, Badge-Minimum, „Vorerst überspringen“, Next-Best-Actions, Add-on-Kacheln) | — | **fehlt** — vollständig; auch die Bestätigungsmail-Optik ist nicht nachgebaut | s. o.; `docs/legacy-inventar.md` §12.2 als Vorbild | | |
| **4./5. Personalisierung im Portal** und Rückschreiben der vier Badge-Felder nach vivenu | — | **fehlt** — die RPC `personalize_ticket(ticket, Vorname, Nachname, Unternehmen, Position, für mich?, Inhaber-Mail)` ist gebaut, hat aber **keinen einzigen Aufrufer**; der vivenu-Client kennt keinen Personalisierungs-Endpunkt | `20260908144639_v2_application_ticket.sql:514`; Suche nach `personalize_ticket` in `app/`, `lib/`, `tests/` ohne Treffer; `lib/vivenu/client.ts` exportiert nur `getEvent`, `putUnderShops`, `createCoupon`, `updateCoupon`, `listTickets` | | |
| Personalisierungsstand sichtbar (`DETAILSREQUIRED` = kein PDF) | wird aus vivenu übernommen und gespeichert, aber **nirgends angezeigt** | **fehlt** — der Stand wird gespeichert, aber auf keiner Seite gezeigt | `vivenu_personalization_status`-Mapping (`20260911184227_v4_vivenu_status_mapping.sql:28–39`), `personalized: true` ⇒ `partial`, nie Rückstufung (`20260912083355_v4_personalized_flag.sql:47–49`) | | |
| **6. Finale Ticket-Mail aus dem Portal** mit dem vivenu-Barcode als QR (Feedback T11) | — | **fehlt** — keine Vorlage `ticket_final`, kein Versand | Auftrag A2 (`docs/arbeitsauftrag-welle-1.md:9`); Suche in den Mail-Vorlagen ohne Treffer | | |
| **Ticket und QR für Teilnehmende sichtbar** (Masterplan §1 „Tickets/QR“, Auftrag B3 „QR groß, Pass-Typ, Personalisierungsstatus“) | — | **fehlt** — `/meine` liest aus `ticket` nur `event_id` und `person_id`, und zwar ausschließlich für den Hinweis „für diese Session brauchst du ein Ticket“ | `app/(talent)/meine/page.tsx:46–49`, `MeineView.tsx:73–74,356–357`; QR wird im ganzen Repo nur im Speaker-Portal gerendert (`app/(speaker)/speaker/tickets/TicketsView.tsx:5,275–282`), obwohl der Spalten-Grant auf `ticket.barcode` für Talente besteht (`20260911185048_v4_ticket_column_grants.sql:22`) | | |
| **10. Ticket-Code überall identisch** (Feedback T10: vivenu = Event-App = Portal) | Barcode wird importiert und gespeichert | **fehlt** — die Quelle stimmt, aber der Code wird im Talent-Portal nicht angezeigt (s. o.) und für Teilnehmende nicht nach Swapcard gespielt (§6) | `ingest_vivenu_ticket` schreibt `barcode` (`20260912083355:60–112`) | | |
| **Ingest** aus vivenu (Webhook + Sweep) | `POST /api/webhooks/vivenu` mit Signatur über den Raw-Body und Idempotenz, dazu Cron-Sweep | **vorhanden**, vollständiger als im Altsystem | `app/api/webhooks/vivenu/route.ts`, `lib/vivenu/signature.ts:28–47` (HMAC-SHA256, `x-vivenu-signature`), `record_webhook_event` / `finish_webhook_event`, `app/api/cron/vivenu-tickets/route.ts` | | |
| Importierte Felder | Barcode, Ticket-Typ ⇒ `pass_type`, Undershop, Transaktion, Customer-ID, Käufer- und Inhaber-Mail, Name, Unternehmen, Status, Add-ons, `meta`, `extraFields`, Rabatt-ID, Preis, Zeitstempel | **vorhanden** | `20260912083355_v4_personalized_flag.sql:60–112`; Out-of-order-Schutz `vivenu_updated_at` (`20260911190442`) | | |
| `ticket.secret` (Credential) | eigene Tabelle `ticket_secret` ohne Grants, nur `service_role` | **vorhanden**, besser | `20260911183236_v4_ticket_secret_own_table.sql:18,22` | | |
| Kontingente über Discount-Codes (Partner, Initiativen, Unis) | Undershops + Coupon-Serien, Einlösungen werden gezählt | **vorhanden**, besser | `recount_allocation_usage` (`20260912083355:136–145`), `lib/vivenu/allocations.ts` | | |
| Verknüpfung Ticket ↔ Person beim Login | `claim_or_create_person()` beim Anmelden | **vorhanden** | `app/(talent)/onboarding/page.tsx:25`; Auftrag A3 | | |
| **Add-ons Hotel / DB-Ticket / Locker / Bundles** (Feedback T2–T5) | `ticket.addons` wird importiert, **aber nirgends angezeigt und nirgends angeboten** | **fehlt** | `20260908144639:147`; Suche nach `addons` / `addOns` in `app/` ohne Treffer | | |
| **Deposit für Freitickets** (Feedback T1) | — | **fehlt** — offene Frage an vivenu (`docs/vivenu-support-anfrage.md`) | | | |
| Check-in / Scan | `/checkin`-Kiosk über `checkin_scan` | **vorhanden** (siehe `docs/abgleich/volunteers.md` §10) | Migration 0090 | | |

---

## 2 · Teilnehmer-Base „Participants (Unified Profile)“ — Profil- und Matching-Felder

| Alte Seite / Funktion | Neu (Pfad) | Status | Beleg | Prüfung Konrad | Prio |
|---|---|---|---|---|---|
| Profil entsteht aus Ticketkauf + Formular, Pflege durch das Team | `/onboarding` (vier Schritte) und `/profil` (Selbstpflege) | **anders**, besser — die Person pflegt selbst | `app/(talent)/onboarding/Wizard.tsx:19` (`basics, work, interests, consent`), `app/(talent)/profil/ProfileForm.tsx` | | |
| Vor-/Nachname, E-Mail | Pflicht im Onboarding (Name), E-Mail aus dem Login | **vorhanden** | `Wizard.tsx:127–176`, Pflichtprüfung `:22–30` | | |
| **Status** (Schüler/Bachelor/Master/Founder/Professional) | `occupation_status` | **vorhanden** | `Wizard.tsx:186–227`, `ProfileForm.tsx:222–273` | | |
| **Level** und **Erfahrung** | `career_level`, `work_experience` | **vorhanden** — `work_experience` allerdings nur in `/profil`, nicht im Onboarding | `ProfileForm.tsx:222–273`; Onboarding-Schritt „work“ ohne `work_experience` (`Wizard.tsx:186–227`) | | |
| **Arbeitgeber-Art** und Arbeitgeber | `employer_type`, `employer_name` | **vorhanden** | `ProfileForm.tsx:222–273` | | |
| **Startup-Phase** (Founder-Felder konditional, Entscheidung 08.09.) | `startup_phase` | **vorhanden** | `ProfileForm.tsx:222–273` | | |
| **Uni / Studienhintergrund / Studiengang** (+ acht „Studiengang: X“-Felder im Sync) | `university`, `study_field`, `study_program` (abhängig von `study_field`) | **anders** — zwei Ebenen plus Uni statt der alten Feldfamilie | `ProfileForm.tsx:279–313`, Abhängigkeit `app/(talent)/profil/page.tsx:59–67` | | |
| **Studiengangsbezeichnung als Freitext** (`study_program_label`, Entscheidung 08.09.: „drei Ebenen“) | — | **fehlt** — die dritte Ebene existiert nirgends | Suche nach `study_program_label` in `supabase/`, `app/`, `lib/` ohne Treffer; `docs/entscheidungen.md` Abschnitt G | | |
| **Startup-Themen / All-Themen** (Interessen als Matching-Grundlage) | `person_interest` aus den Vokabularen `interests` und `interests_founder` | **vorhanden** | `Wizard.tsx:236–247`, `ProfileForm.tsx:317–332` | | |
| **Karrieremöglichkeiten** (Job-Opt-in, OMR-Muster) | — | **fehlt** — kein Feld, keine Einwilligung dafür | keine Spalte, kein `consent_type` dieser Art (`20260908145110_v2_seed_vocab_fls27.sql:117–124`) | | |
| **Leistung** (Feld im Swapcard-Sync) | — | **fehlt** — im Inventar nur als Feldname geführt, kein Gegenstück gefunden; was das Feld enthielt, ist offen | `docs/legacy-inventar.md` §10 | | |
| **Vier Adresszeilen** (Anschrift für Swapcard) | — | **bewusst weggelassen** — Datenminimierung; das Portal führt `city`, `country`, `nationality` | `Wizard.tsx:127–176`, `ProfileForm.tsx:142–216`; AGENTS „Datenminimierung“ | | |
| Stadt (neu, Entscheidung 08.09. „wichtig für Auswertung“) | `city` — **nur im Onboarding**, nicht in `/profil` | **anders** — nur im Onboarding erfassbar; wer sich vertippt, kann die Stadt später nicht ändern | `Wizard.tsx:127–176`; `ProfileForm.tsx` führt `country`, aber kein `city` | | |
| Land/Nationalität nach ISO | `country`, `nationality` | **vorhanden** | `ProfileForm.tsx:142–216` | | |
| Titel (Dr.), Pronomen, Foto | — | **fehlt** im Talent-Bereich — die Spalten `person.title`, `pronouns`, `photo_url` existieren, werden aber nur im Speaker-Profil geschrieben | `20260908141744_v2_identity_roles.sql:16–20`; `app/(speaker)/speaker/profil/SpeakerProfileForm.tsx:178` | | |
| Telefon, LinkedIn | in `/profil`, nicht im Onboarding | **vorhanden** | `ProfileForm.tsx:142–216` | | |
| Geburtsdatum, Geschlecht | in `/profil` | **vorhanden** | `ProfileForm.tsx:142–216` | | |
| „Wie bist du auf uns gekommen“ | `acquisition_channel` ⇒ `person_acquisition_channel` | **vorhanden** | `ProfileForm.tsx:334–341`, `app/(talent)/profil/actions.ts:110–128` | | |
| Selbsteinschätzung | `self_assessment` | **vorhanden** | `ProfileForm.tsx:279–313` | | |
| Sensible Felder (Art. 9) | bewusst nicht erhoben | **bewusst weggelassen** — Entscheidung 08.09. („Empfehlung weglassen“); Ernährung ist der einzige Art.-9-nahe Wert und liegt bei Speakern/Volunteers mit Löschfrist | `docs/entscheidungen.md` Abschnitt G; Migration 0100 (`purge_diet_data`) | | |
| Profil löschen / Suppression (Pflicht laut Entscheidungslog Abschnitt I) | Backend vollständig, **Knopf fehlt** | **fehlt** — `delete_my_profile()` anonymisiert, hängt die Adressen gehasht in `suppression` und lässt die Historie pseudonym stehen; aufgerufen wird die RPC von keiner Seite, und das im Kopf genannte Runbook „Profil löschen“ liegt nicht in `docs/runbooks/` | `20260908141744_v2_identity_roles.sql:205–243`; Suche nach `delete_my_profile` in `app/`, `lib/`, `scripts/` ohne Treffer; `ls docs/runbooks/` ohne die Datei | | |
| Pflege durch das Team (Airtable-Ansicht) | `/admin/personen`, `/admin/personen/[id]` | **vorhanden** | `app/(admin)/admin/personen/page.tsx` | | |

---

## 3 · Programm-Ansicht

| Alte Seite / Funktion | Neu (Pfad) | Status | Beleg | Prüfung Konrad | Prio |
|---|---|---|---|---|---|
| Programm auf der Website und in der Event-App, nicht im Teilnehmerkonto | `/programm` im Portal | **vorhanden**, neu | `app/(talent)/programm/ProgrammeView.tsx`, View `programme_public` (`20260908142441_v2_edition_programme.sql:485–496`) | | |
| Filter nach Tag / Bühne | Tag-Tabs plus „Alle Tage“, Bühnenfilter | **vorhanden** | `ProgrammeView.tsx:219–261` | | |
| Filter nach Format und Sprache | vorhanden | **vorhanden**, neu | `ProgrammeView.tsx:262–282` | | |
| Session-Detail (Beschreibung, Kapazität, Frist, Ticketpflicht) | Detail-Drawer | **vorhanden** | `ProgrammeView.tsx:351–422` | | |
| **„Create your own Timetable“ / Merkliste / Meine Agenda** (Feedback R12) | — | **fehlt** — kein Merken, keine eigene Agenda | Suche nach `agenda`, `timetable`, `merken`, `bookmark`, `favorit` im Talent-Bereich ohne Treffer | | |
| **Kalender-Export (ICS)** | — | **fehlt** | Suche nach `ics` / `ical` / `calendar` im Talent-Bereich ohne Treffer | | |
| **Social-Bild aus der eigenen Auswahl** (Feedback R12, OMR-Vorbild) | — | **fehlt** | s. o. | | |
| **Slides für Teilnehmende nach dem Summit** (Slid@Home, Feedback Ü1) | — | **fehlt** im Talent-Bereich — die Freigabe durch den Speaker existiert, der Download nicht | `app/(speaker)/speaker/session/actions.ts:84–90` (`set_slides_release`), Consent `slides_publication`; keine Seite im Talent-Bereich | | |

---

## 4 · 1-Klick-Bewerbung: Masterclass · Company Tour · Side-Event

Alt: zwei Ein-Tabellen-Bases, eine Zeile je Person, jedes Angebot nur als Spaltenpaar `Bewerbung: X` + `Status: X` (Inventar §8).

| Alte Seite / Funktion | Neu (Pfad) | Status | Beleg | Prüfung Konrad | Prio |
|---|---|---|---|---|---|
| Angebot existiert nur als Spaltenpaar (kein Titel, Datum, Ort, Gastgeber, Kapazität, Frist) | Angebot = **Session** mit `access_mode` open / registration / application; Masterclass, Company Tour und Side-Event sind Werte des Vokabulars `session_format` | **anders**, grundlegend besser | `20260908145110_v2_seed_vocab_fls27.sql:84,85,89`; `application` (`20260908144639:66–82`), `registration` (`20260721160701_core_schema.sql`) | | |
| Bewerbung über ein Formular je Base | 1-Klick aus der Programmliste; nur wenn die Session eigene Fragen hat, erscheint ein Modal | **vorhanden**, wie beauftragt | `ProgrammeView.tsx:202–211` (ohne Fragen sofort `applyToSession(id, {}, false)`), `ApplyDialog` `:552–664`, `apply_to_session` (`20260908144639:252`) | | |
| Eigene Fragen je Angebot | `session_question` + `question_catalog`, höchstens zwei eigene Fragen je Session | **vorhanden**, neu | `20260908144639:14–63` | | |
| **Keine Warteliste** im Altsystem | Warteliste für Anmeldungen automatisch, für Bewerbungen über Entscheidung + Nachrücken | **vorhanden**, neu | `register_for_session` setzt bei voller `capacity` auf `waitlisted` (`20260908144639:494–496`); `decide_application('waitlisted')` + `promote_waitlist` (`:428–446`) | | |
| **Keine Kapazität, keine Frist** | `session.capacity` (nur bei Anmeldung geprüft), `session.application_deadline` (beide Wege) | **anders** — Frist auf beiden Wegen, Kapazität nur bei der Anmeldung: `apply_to_session` prüft **keine** Kapazität | `20260908144639:270–272,479–481,494–496`; UI-Sperre `ProgrammeView.tsx:494–496` | | |
| Doppelbuchungen (Feedback Ü3) | Kollisionsprüfung über Zeitüberschneidung, mit Ersetzen-Dialog | **vorhanden**, neu — greift allerdings erst beim **Bestätigen**, nicht beim Bewerben | `confirm_application` prüft `tstzrange && tstzrange` ⇒ `collision` (`20260908144639:350–365`), Dialog `MeineView.tsx:236–263` | | |
| Partner sieht Bewerberdaten sofort, Klick löst Mails aus (Befund §7.12) | Freigabe-Gate: Entscheidungen werden erst mit `release_decisions` sichtbar, vorher zeigt das Portal allen den Stand „beworben“ | **vorhanden**, behebt den Befund | `decision_release` + `decisions_released()` (`20260908144639:226–249`), `confirm_application` ⇒ `not_released` (`:339`) | | |
| Kein Consent für die Weitergabe an den Gastgeber | `application.consent_share` je Bewerbung, Checkbox im Dialog | **vorhanden**, neu | `20260908144639:75`, `ProgrammeView.tsx:640–648` | | |
| Keine Ticketverknüpfung | `session.ticket_required` prüft ein gültiges Ticket der Person | **vorhanden**, neu | `20260908144639:346–349,484–487` | | |
| Zulassungskriterien nur im Text | `session.eligibility_rule` (heute: `u35`, `occupation_status`) | **vorhanden**, schmal | `20260908144639:284–291` | | |
| Bestätigungsfrist und Verfall | `confirm_by_hours`, `expire_overdue_applications`, Nachrücken | **vorhanden**, neu | `20260908144639:417–419,448` | | |
| Mails je Schritt | Vorlagen `application_received/accepted/waitlisted/declined/promoted`, `registration_confirmed` | **vorhanden** | Arbeitsauftrag Welle 1 A5, Migrationen 0020/0021 | | |
| Bearbeitung durch das Team (Airtable-Ansicht je Base) | `/admin/bewerbungen` mit Warteschlange je Session | **vorhanden** | `app/(admin)/admin/bewerbungen/page.tsx`, `[id]/QueueView.tsx`, `actions.ts` | | |
| Masterclass-Einladungen aus der Initiativen-Base (658 Ticketholder) | Einladung als eigener Vorgang | **fehlt** — es gibt Bewerbung und Anmeldung, aber kein „einladen“ | `20260908144639` kennt keine Einladungs-RPC | | |

---

## 5 · Consent, Sprache, Zugang

| Alte Seite / Funktion | Neu (Pfad) | Status | Beleg | Prüfung Konrad | Prio |
|---|---|---|---|---|---|
| Consent fehlt systematisch (Inventar §7 Muster 9) | versionierte Einwilligungen mit Historie | **vorhanden**, neu | `consent_record` (`20260908141744:90–103`), View `consent_current`, Version `2026-09` (`lib/consent.ts:9`) | | |
| Einwilligungsarten | Vokabular mit acht Werten: terms, privacy, photo_video, newsletter, share_with_partner, speaker_release, slides_publication, hospitality_data | **vorhanden** | `20260908145110_v2_seed_vocab_fls27.sql:117–124` | | |
| Abfrage im Talent-Bereich | vier davon im Onboarding (terms, privacy Pflicht; photo_video, newsletter freiwillig) | **vorhanden** | `Wizard.tsx:256–285`, `onboarding/actions.ts:81–103` | | |
| **Widerruf / Ändern der Einwilligung** | — | **fehlt** — `/profil` hat keine Einwilligungs-Sektion; nach dem Onboarding gibt es im Talent-Bereich keinen Weg, etwas zurückzunehmen | `ProfileForm.tsx` ohne Consent-Block | | |
| Portal bilingual DE/EN (Feedback Ü4) | `preferred_language` je Person, i18n in allen Ansichten | **vorhanden** | `Wizard.tsx:127–176`, `lib/i18n/` | | |
| Login | Magic-Link, kein Passwort; Talent-Bereich steht jeder angemeldeten Person offen | **anders**, besser als drei getrennte Logins | `lib/areas.ts:38` (`{ key: "talent", path: "/profil", roles: [] }`), `app/login/page.tsx` | | |
| Navigation | drei Punkte: `/programm`, `/meine`, `/profil` (Onboarding steht nicht im Menü) | **vorhanden** | `app/(talent)/layout.tsx:24–31,38` | | |

---

## 6 · Teilnehmer-Wiki, Chatbot, Matching

| Alte Seite / Funktion | Neu (Pfad) | Status | Beleg | Prüfung Konrad | Prio |
|---|---|---|---|---|---|
| **Teilnehmer-FAQ** — gab es im Altbestand **nicht** (Inhalte verstreut in Ablauf, Company Tours, Pfand) | — | **fehlt** weiterhin: die Wissensbasis kennt die Zielgruppe `talent` und drei Seed-Artikel sind ihr zugeordnet, aber es gibt **keine Wiki-Seite im Talent-Bereich** | `kb_audience` enthält `talent` (`20260914095053:29`); der Artikel `location-anfahrt` trägt `{partner,speaker,talent}` (`20260915114852_v5_wiki_inhalte.sql`); es existiert keine Datei `app/(talent)/*/wiki/` — Wiki-Seiten gibt es nur für Partner, Speaker, Volunteers und Admin | | |
| Chatbot „Chefi“ für Teilnehmende (Anforderung Inventar §14) | — | **fehlt** — für Welle 5 vorgesehen, nicht gebaut | Masterplan Ergänzung v0.1b; kein `kb_chunk`, kein pgvector in den Migrationen | | |
| **Matching / Networking** (Kern der Personalisierung laut vivenu-Call) | — | **fehlt** im Portal — Interessen werden erfasst, aber nichts damit gemacht; Matching läuft in der Event-App | Suche nach `matching` / `networking` im Talent-Bereich ohne Treffer (nur ein Kommentar in `profil/page.tsx:31`) | | |
| Event-App-Profil (Swapcard) aus dem Teilnehmerdatensatz (alt: make.com-Szenario 8217084, 13 Custom Fields) | — | **fehlt** — der Swapcard-Weg existiert nur für Partner/Aussteller | `app/(partner)/partner/event-app/page.tsx`, `app/api/admin/swapcard/exhibitors/route.ts`; kein Personen-Sync | | |
| **Community / FLC** für Talente | — | **fehlt**; WhatsApp ausdrücklich nicht | Entscheidung 08.09. („Community/FLC nur Talents; WhatsApp vorerst nicht“) | | |

---

## Fragen an Konrad

1. **Ticket und QR im Talent-Portal:** Beides ist beauftragt (Masterplan §1, Welle 1 B3) und nicht gebaut. Ist das die erste Lücke, die vor dem 01.11. geschlossen wird?
2. **Confirmation Page und Personalisierung:** Die Kette Redirect → Bestätigungsseite → Personalisierung → Rückschreiben → Ticket-Mail fehlt vollständig, obwohl sie mit vivenu validiert ist. Bleibt es beim Zielbild v0.1a, oder soll die vivenu-Maske für FLS27 doch die Personalisierung behalten?
3. **Studiengangsbezeichnung:** Die dritte Ebene (`study_program_label`, Freitext) wurde am 08.09. entschieden und existiert nicht. Wird sie gebraucht?
4. **Stadt:** Nur im Onboarding erfassbar, in `/profil` nicht änderbar. Soll sie ins Profil?
5. **Einwilligungen widerrufen und Profil löschen:** Der Widerruf fehlt ganz, das Löschen gibt es nur als RPC ohne Knopf. Beides in einen Abschnitt „Daten und Einwilligungen“ im Profil?
6. **Add-ons** (Hotel, Bahn, Locker, Bundles): importiert, aber weder angeboten noch angezeigt. Sollen sie im Portal sichtbar sein, oder bleibt das ganz im vivenu-Shop?
7. **Eigene Agenda:** Merkliste, ICS-Export und Timetable-Bild fehlen alle drei. Was davon braucht FLS27 — und wäre die Merkliste nicht auch die natürliche Grundlage für Erinnerungen?
8. **Teilnehmer-Wiki:** Zielgruppe und Artikel sind vorbereitet, eine Seite im Talent-Bereich gibt es nicht. Soll `/wiki` im Talent-Portal entstehen, oder verweisen wir Teilnehmende auf die Event-App?

## Nicht geprüft

- **Nichts am Gerenderten.** Alle Zeilen sind Codebefunde. Die Lehre aus F4 gilt: ein serverseitiger Abruf zeigt nur den ersten Zustand einer Seite, und was hinter Reitern, Dialogen oder Zuständen liegt, zeigt erst der Browser.
- **Keine Daten.** Ob Tickets, Sessions oder Profile in Frankfurt existieren, wurde nicht abgefragt.
- **Die Teilnehmer-Base `appHVQhV4Dp76hrMk` wurde nicht erneut ausgelesen.** Grundlage ist die Analyse vom 21.07.2026 und der Feldbestand, wie er im Swapcard-Sync des Inventars (§10) sichtbar wird. Eine vollständige Feldliste der Base liegt — anders als bei Speaker, Partner, Volunteers und Hackathon — **nicht** im Inventar; diese Matrix kann deshalb nicht ausschließen, dass Felder fehlen, die nirgends synchronisiert wurden.
- **vivenu wurde nicht aufgerufen.** Welche Data Fields im FLS27-Event konfiguriert sind und ob die Personalisierung dort an oder aus ist, steht im Runbook, nicht in dieser Matrix.
- **Die Side-Format-Bases** (Company Tours, Masterclasses) wurden nicht erneut geöffnet; die Aussage „keine Angebots-Entität, keine Warteliste, kein Consent“ stammt aus Inventar §8.
