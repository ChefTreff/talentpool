# Mail-Plan (Stand 10.09.2026, Migrationen bis 0044)

Grundsatz aus dem Feedback FLS26 (T9, P4): so wenige System-Mails wie möglich, jede Mail hat ein Ereignis, Erinnerungen nur bei offenem Deliverable. **Die Datenbank entscheidet**, wann eine Mail fällig ist (Trigger und RPCs rufen `queue_mail()`), der Worker verschickt nur (`lib/mail/queue.ts`, Vercel Cron `/api/cron/mail` alle 10 Minuten, Resend, Idempotenzschlüssel `mail_log-<id>`, drei Versuche, Dry-Run in der Entwicklung).

## Regeln
- **Sprache:** `person.preferred_language`, sonst Englisch für Speaker/Assistenz, sonst Deutsch (`queue_mail`, seit 0029). Vorlagen liegen immer in DE und EN (`mail_template`, Primärschlüssel `key + locale`).
- **Variablen:** `first_name` und `portal_url` setzt der Worker immer; alles Weitere kommt aus dem Auslöser (`mail_log.meta.vars`). Zeiten werden in der Zeitzone des Events formatiert (`mail_fmt_ts`, `session_mail_vars`).
- **Suppression:** gesperrte Adressen landen als `suppressed` im Log, ohne Versand.
- **Einmaligkeit:** jede Vorlage genau einmal je Ereignis; die Erinnerung prüft `mail_log` (Vorlage × Person × Session), die anderen hängen an Zustandswechseln, die nur einmal passieren. `queue_mail` verwirft einen Auftrag nur, wenn dieselbe Vorlage für **dieselbe Person** und dasselbe Bezugsobjekt noch `queued` ist (seit 0042 je Person — vorher blieb bei Fan-outs wie `notify_speaker_leads` nur der erste Empfänger übrig).
- **Interne Mails** gehen an alle aktiven `area_lead_speaker` bzw. `area_lead_partner`, ohne solche an globale Admins (`notify_speaker_leads`, `notify_partner_leads`).

## Vorlagen
| Vorlage | Journey | Auslöser | Empfänger | Einmal je | Seit |
|---|---|---|---|---|---|
| `application_received` | Talent | Trigger auf `application` (Bewerbung angelegt) | Bewerber | Bewerbung | 0020 |
| `application_accepted` · `application_waitlisted` · `application_declined` | Talent | Freigabe der Entscheidungen (`release_decisions`, Trigger) | Bewerber | Entscheidung | 0020 |
| `application_promoted` | Talent | Nachrücken von der Warteliste (`promote_waitlist`, Housekeeping) | Bewerber | Nachrücken | 0020 |
| `registration_confirmed` | Talent | Trigger auf `registration` | Teilnehmer | Anmeldung | 0020 |
| `speaker_invite` | Speaker | `invite_speaker` (nur ab Pipeline `confirmed`, setzt `invited_at`) | Speaker | Einladung | 0025 |
| `assistant_invite` | Speaker | `invite_assistant` | Assistenz | Einladung | 0025 |
| `hospitality_confirmed` | Speaker | `confirm_hospitality` (Team) | Speaker | Buchung | 0030 |
| `expense_submitted` | Speaker → Team | `submit_expense` | `area_lead_speaker` (Fallback Admins) | Einreichung | 0031 |
| `expense_approved` · `expense_rejected` | Speaker | `approve_expense` · `reject_expense` (Grund Pflicht) | Speaker | Entscheidung | 0031 |
| `companion_ticket_requested` | Speaker → Team | `request_companion_ticket` | `area_lead_speaker` (Fallback Admins) | Anfrage | 0034 |
| `companion_ticket_confirmed` · `companion_ticket_declined` | Speaker | `confirm_companion_ticket` · `decline_companion_ticket` (Grund Pflicht) | Speaker | Entscheidung | 0034 |
| `partner_contact_invite` | Partner | `upsert_partner_contact` (neuer Kontakt einer Organisation; auch HubSpot-Ingest) | Kontakt | Kontakt × Org (`org_membership`) | 0040 |
| `partner_deliverable_received` | Partner | `submit_deliverable` (Einreichung einer Pflicht aus der Checkliste, P1) | einreichende Person + `primary_ops` | Pflicht (`deliverable`) × Person | 0041 |
| `partner_deliverable_rejected` | Partner | `review_deliverable` (Team, Ablehnung; Grund Pflicht und in der Mail) | einreichende Person + `primary_ops` | Pflicht × Person je Entscheidung | 0041 |
| `partner_gate_failed` | HubSpot → Sales | `ingest_partner_deal` (Gate-Fehler; Fehlerliste, Deal-Link) | Deal-Owner als `person` (E-Mail), sonst `area_lead_partner`, sonst Admins | je Gate-Fehler (kein Bezugsobjekt-Dedupe: jede Wiederholung ist ein neuer Versuch) | 0043 |
| `presentation_reminder` | Speaker | Housekeeping (`send_presentation_reminders`): `reminder_lead_hours` (Default 48) vor der wirksamen Fälligkeit (Deadline ∧ 48 h vor Slot), nur mit Slot in der Zukunft, ohne aktuelle Präsentation, Session nicht abgesagt | Speaker (nicht Assistenz) | Speaker × Session | 0035 |

## Offen
- ICS-Anhang für die Erinnerung (S im Arbeitsauftrag): der Worker kennt noch keine Anhänge; kommt mit der Qonto-Mail (B8, PDF-Anhang).
- Ticket-Mails (eigenes Speaker-Ticket, Begleitticket ausgestellt) folgen mit der vivenu-Ausstellung (A7b): Vorlage `ticket_final` aus Welle 1 A2.
- Partner-, Volunteer- und Hackathon-Journeys: Welle 3/4.
