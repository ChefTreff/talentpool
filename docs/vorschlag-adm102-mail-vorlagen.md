# Vorschlag: Mail-Vorlagen je Bereich — Datenmodell Kategorie und Rechte (ADM-102)

Stand 08.10.2026, Admin-Chat, **zur Freigabe durch Plan**. Noch kein Bau. Anlass: Konrad (08.10.), ADM-102 (a) bis (f). Dieses Dokument deckt (a) Kategorie und Rechte je Bereich, (c) kategorisieren und durchsuchbar, (d) Anzeigename statt Systemname, (e) DE und EN **zusammen** je Vorlage ab und legt die Grundlage für (f) Platzhalter im Editor. (b) „Vorlagen als erster Tab“ und die Menüpunkte je Bereich sind Oberfläche und Navigation (Design, nach Konrads Go).

## 1 · Ausgangslage

- 43 Vorlagen (`mail_template`, PK `key` + `locale`), je Sprache eine Zeile; Schlüssel wie `application_accepted`.
- Vier Funktionen, alle `has_role('admin')`: `mail_templates_admin()`, `upsert_mail_template(p_data)`, `mail_template_history(key, locale, limit)`, `restore_mail_template(…)`. Ein Partner-Manager darf heute keine Vorlage lesen oder ändern.
- Es gibt keine Kategorie und keinen Anzeigenamen; `description` ist eine interne Notiz („Intern: neue Begleitticket-Anfrage (an area_lead_speaker)“).
- Rechte im Admin laufen über **Abschnitte** (`admin_section_role` + Ausnahmen je Rolle/Person in `admin_section_override`, ADM-053, bedienbar unter `/admin/rollen`). Der Abschnitt `mail` (Protokoll, Vorlagen, Test) ist nur für `admin`.

## 2 · Vorschlag

### 2.1 Eine Tabelle je Vorlage (nicht je Sprache): `mail_template_key`

| Spalte | Typ | Bedeutung |
|---|---|---|
| `key` | text PK | Schlüssel der Vorlage, wie in `mail_template.key` |
| `category` | text, Vokabular `mail_category` (`is_vocab_key`, kein CHECK) | Bereich; Begriffe `speaker`, `partner`, `participant` (Teilnehmer), `volunteer`, `system` mit DE/EN-Bezeichnung, pflegbar unter Vokabular |
| `name_de`, `name_en` | text, nicht leer | **Anzeigename** (ADM-102 d), z. B. „Zusage zur Bewerbung“ / „Application accepted“ |
| `variables` | text[] | erlaubte Platzhalter, ohne Klammern (`first_name`, `portal_url` …) — Grundlage für „Platzhalter per Klick einfügen“ (f); Startwert = die in den vorhandenen Texten benutzten |
| `sort_order` | integer | Reihenfolge innerhalb der Kategorie |
| `updated_at` | timestamptz | |

RLS an, **keine** Policy und kein Grant: Lesen und Schreiben nur über die Funktionen unten (wie die übrigen Verwaltungstabellen).

**Warum keine Fremdschlüssel von `mail_template.key`:** 23 Migrationen legen Vorlagen per `insert into mail_template` an, und offene PRs anderer Chats tun es auch. Ein Fremdschlüssel ließe deren Migration nach „Migration live“ scheitern. Stattdessen: **eine Vorlage ohne Eintrag gilt als Kategorie `system`** (nur `admin` — fail closed, wie `lib/admin-sections.ts`). Ein Test findet jede in Migrationen angelegte Vorlage und prüft, dass sie in der Zuordnung steht; wer eine neue Vorlage anlegt, ergänzt die Zeile im selben PR.

### 2.2 Vorschlag für die Zuordnung der 43 Schlüssel

| Kategorie | Schlüssel |
|---|---|
| **Speaker** (14) | `assistant_invite`, `companion_ticket_confirmed`, `companion_ticket_declined`, `companion_ticket_requested`, `expense_approved`, `expense_rejected`, `expense_submitted`, `hospitality_confirmed`, `presentation_reminder`, `session_changed`, `side_event_invitation`, `speaker_invite`, `stage_photos_ready`, `ticket_final` |
| **Partner** (11) | `partner_contact_invite`, `partner_deliverable_received`, `partner_deliverable_rejected`, `partner_gate_failed`, `partner_reminder_digest`, `partner_speaker_contact`, `session_changed_partner`, `shop_order_completed`, `shop_order_confirmed`, `shop_request_received`, `ticket_request_received` |
| **Teilnehmer** (7) | `application_accepted`, `application_declined`, `application_promoted`, `application_received`, `application_waitlisted`, `registration_confirmed`, `welcome`* |
| **Volunteers** (6) | `shift_assigned`, `shift_reminder`, `volunteer_accepted`, `volunteer_applied`, `volunteer_declined`, `volunteer_ticket_reminder` |
| **System** (5) | `deletion_rejected`, `deletion_request_team`, `deletion_requested`, `team_member_added`, `test` |

\* `welcome` („Nach erstem Login“) geht an alle Rollen; Vorschlag **Teilnehmer**, weil der Text im Talent-Ton steht — alternativ System.

Interne Mails an ein Team (z. B. `expense_submitted`, `shop_request_received`) stehen bei dem Bereich, der sie bekommt und dessen Text er pflegt.

### 2.3 Rechte: ein Abschnitt je Kategorie (Anschluss an ADM-053)

Vier neue Abschnitte; `system` bleibt der bestehende Abschnitt `mail`:

| Kategorie | Abschnitt | Vorgabe (Rollen zusätzlich zu `admin`) |
|---|---|---|
| speaker | `mailSpeaker` | `area_lead_speaker`, `programme_team` |
| partner | `mailPartner` | `area_lead_partner`, `partner_team` |
| participant | `mailParticipants` | `area_lead_talent`, `talent_team`, `marketing_team` |
| volunteer | `mailVolunteers` | `area_lead_volunteers`, `volunteers_team` |
| system | `mail` | — (nur `admin`) |

Das ist dieselbe Aufteilung wie bei den Bereichsabschnitten (`speakers`, `partner`, `volunteers`, `applications`). **Vorteil gegenüber einer eigenen Rollentabelle je Kategorie:** Konrad ändert die Rechte an derselben Stelle wie alle anderen (`/admin/rollen`, Ausnahmen je Rolle oder Person); es gibt keine zweite Rechtewelt.

`admin_section_role` bekommt die Zeilen, `lib/admin-sections.ts` die vier Schlüssel (`AdminSectionKey`, `ADMIN_SECTIONS`) im selben PR, damit `tests/admin-sections.test.ts` (Abgleich Tabelle ⇄ Code) grün bleibt. Die Schlüssel brauchen Wörterbucheinträge für die Rechteansicht.

### 2.4 Funktionen

| Funktion | Neu / geändert | Rechte |
|---|---|---|
| `mail_template_section(p_key text) returns text` | neu, stabil | liefert den Abschnitt der Kategorie des Schlüssels (`case`: speaker ⇒ `mailSpeaker` …); unbekannter Schlüssel **oder eine Kategorie ohne Abschnitt** ⇒ `mail` (nur `admin`) — ein neuer Vokabularbegriff öffnet also nichts, bis jemand den Abschnitt dazu baut |
| `can_edit_mail_template(p_key text) returns boolean` | neu, Definer | `has_admin_section(mail_template_section(p_key))` |
| `mail_templates_admin(p_category text default null)` | geändert (Live-Fassung aus dem Snapshot) | liefert **je Schlüssel eine Zeile** mit beiden Sprachen (`de`/`en` als jsonb: Betreff, Text, `active`, `version`, geändert von/am), `category`, `name_de`, `name_en`, `variables`, `queued`, `sent_30d` — nur Schlüssel, die die Person bearbeiten darf; ohne Recht für keine Kategorie ⇒ 42501 |
| `upsert_mail_template(p_data jsonb)` | geändert | `can_edit_mail_template(key)` statt `has_role('admin')`; Verhalten sonst unverändert (Protokoll `mail_template.upsert`) |
| `upsert_mail_template_pair(p_key, p_de jsonb, p_en jsonb)` | neu | beide Sprachen **in einer Transaktion** (ADM-102 e); je Sprache wie `upsert_mail_template` mit eigener Version und eigenem Protokolleintrag; ein Fehler in einer Sprache schreibt keine |
| `mail_template_history`, `restore_mail_template` | geändert | `can_edit_mail_template(key)` |
| `set_mail_template_meta(p_key, p_category, p_name_de, p_name_en)` | neu | **nur `admin`** (Abschnitt `mail`): eine Vorlage in eine andere Kategorie zu legen verschiebt, wer sie sieht — das entscheidet Konrad, nicht der Bereich; der Anzeigename darf der Bereich ändern (Vorschlag: ja, `can_edit_mail_template`, Kategorie nur `admin`) |

Fehlerschlüssel: 42501 · 22023 `invalid_category` (kein Vokabularbegriff), `fields_required`, `invalid_locale` · P0002 `template_not_found`. Protokoll: `mail_template.upsert` (unverändert, DE/EN-Anzeigename vorhanden), neu `mail_template.meta`.

### 2.5 Was **nicht** Teil davon ist

- Neue Vorlagen **anlegen** in der Oberfläche (heute nur über Migration) — nicht verlangt.
- Das **Mail-Protokoll** und die **Testmail** bleiben im Abschnitt `mail` (nur `admin`): sie nennen Empfängeradressen.
- Menüpunkte „Vorlagen“ je Bereich und der Tab „Vorlagen vor Protokoll“ sind Oberfläche/Navigation — Design-Vorschlag (ADM-089), Bau nach Konrads Go. Die Seite selbst kann vorher unter `/admin/mail` (Tab) entstehen und je Kategorie per `?kategorie=` filtern; für Bereichspersonen ohne Menüpunkt gibt es bis zum Go keinen Weg dorthin, und das ist so gewollt.

## 3 · Reihenfolge des Baus (nach Freigabe)

1. Migration `v6_mail_vorlagen_kategorie` (Tabelle, Zuordnung der 43 Schlüssel, vier Abschnitte, Funktionen) mit SQL-Test (Rechte je Kategorie mit Rollen-Probe: Partner-Team sieht und ändert nur Partner, nicht Speaker; unregistrierte Vorlage ⇒ nur `admin`; Paar-Schreiben atomar), Test „jede Migrations-Vorlage ist zugeordnet“, `lib/admin-sections.ts`.
2. Oberfläche: Vorlagenliste als Tabelle mit Anzeigename, Kategorie, Suche, Filter, **eine Zeile je Vorlage** mit DE/EN-Umschalter im Editor.
3. Editor (f): Platzhalter-Chips setzen an der Cursorposition ein, Formatierungsleiste (Fett, Kursiv, Link, Liste), Knopf einfügen — Muster aus dem Design-Vorschlag, abgestimmt mit dem Design-Chat.

## 4 · Entscheidungen für Plan (und ggf. Konrad)

1. **Volunteers als eigene Kategorie** (Vorschlag) oder unter Teilnehmer? Konrad nennt Speaker, Partner, Teilnehmer und System. Volunteers haben eigene Bereichsrollen; unter „Teilnehmer“ könnten Volunteer-Verantwortliche sonst Talent-Mails ändern und umgekehrt.
2. Zuordnung in 2.2 so in Ordnung — besonders `welcome` und die interne Mail `partner_gate_failed` (Partner).
3. **Rechte über Abschnitte** (Vorschlag) statt eigener Kategorie-Rollentabelle.
4. **Kategorie ändern nur `admin`**, Anzeigename auch der Bereich.
5. **Unregistrierte Vorlage = System** statt Fremdschlüssel.
6. Migrationsnummer und Reihenfolge zu ADM-099 (Fristen je Bereich, braucht dieselbe Art Abschnittsmigration — Vorschlag: beide in dieselbe Welle, getrennte Dateien).
