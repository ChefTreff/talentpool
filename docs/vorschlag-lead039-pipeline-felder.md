# Vorschlag LEAD-039 · CRM-Felder der Speaker-Pipeline

Stand 25.09.2026, Speaker-Chat. **Nur Vorschlag — gebaut wird nach Freigabe** durch Konrad und die Architektur-Session (Entscheidungslog 25.09., „#193 gemergt … Reihenfolge LEAD-039“).

## Anlass

LEAD-039 ist Teil 2 von LEAD-028 (Konrad, 24.09.). Seit #193 ist `/speaker-leads` die **Pipeline** vor der Zusage, und `/speaker-leads/bestaetigt` zeigt die bestätigten Speaker. In der Pipeline fehlt, womit Konrads Team heute in der Arbeitstabelle „FLS27_Speaker_Themen_Bühnen_Master“ arbeitet. Übernommen wird **nur der Aufbau** der Tabelle, keine Zeile und keine Person.

Mitgedacht sind zwei Punkte, die dasselbe Protokoll brauchen:

- **LEAD-025:** Kommentare je Speaker (Vernetzung, Side-Events) und eine Übersicht im Speaker-Admin.
- **LEAD-027:** eigene Aufgaben mit Frist, oben in der Pipeline.

Wer das Datenmodell jetzt nur für LEAD-039 zuschneidet, baut es für die beiden in zwei Wochen um.

## Bestand (geprüft gegen live, 25.09.)

| Was | Heute |
|---|---|
| Profil | `speaker_profile` je Edition. `pipeline_status` (Vokabular `speaker_pipeline`: lead, contacted, declined, confirmed, onboarded, ready, published, attended), `owner_person_id` („Betreut von“), `internal_notes` (ein Freitext), `declined_at` + `decline_reason` (Vokabular `speaker_decline_reason`), `speaker_type` (Rolle auf der Bühne), `created_by`, `created_by_org_id` |
| Lesen | RLS hat eine einzige Regel, `sp_manage_sel` = `can_manage_speaker(id)`. Sie gilt für das Team (admin, area_lead_speaker, programme_team). Sie gilt auch für `speaker_manager`, und zwar für eigene und selbst angelegte Speaker, mit Editions-Scope für alle und mit Bühnen-, Slot- oder Tages-Scope für Speaker mit Session dort. **Speaker, Assistenz und Partner lesen die Tabelle nicht.** Sie sehen nur, was ihre RPCs ausgeben (`my_speaker_profile`, Partner-RPCs) |
| Schreiben | Nur per RPC. `update_speaker` nimmt eine Schlüsselliste, `owner_person_id` nur fürs Team. `set_speaker_pipeline` setzt Status, `confirmed_at` und Absagegrund. Validierung im Trigger `speaker_profile_check` (`is_vocab_key`), Audit über `log_audit('speaker.update', …)` |
| Löschen | `anonymize_person` leert unter anderem `internal_notes`, `job_title` und `organization_name` |
| Passende Vokabulare | `session_format` (19 Formate, **podcast** ist dabei) für „empfohlenes Format“. `session_topic` (17 Programmthemen) ist **nicht** dasselbe wie die sieben Themencluster. Für Kategorie, Cluster, Prio und Kanal gibt es noch nichts |
| Bühnen | Hängen am Summit-Teilevent (`stage.event_id` → Event mit `parent_event_id` = Edition) |
| HubSpot | Führt nur Partner-Deals, kein Abgleich für Speaker. Die offene CRM-Frage HubSpot → Close (Entscheidung um den 02.10.) betrifft diesen Vorschlag nicht |

`person.tier` heißt „bekannt ohne Login / hat sich eingeloggt“. Es ist **keine** Prio, deshalb heißt das neue Feld `priority`.

## Vorschlag Datenmodell

### A. Einordnung am Profil (`speaker_profile`, additiv, alle optional)

| Feld | Typ | Bedeutung (aus der Arbeitstabelle) | Prüfung |
|---|---|---|---|
| `category` | text | **Kategorie**: Sektor der Person, eine je Speaker | Vokabular `speaker_category` |
| `topic_cluster` | text | **Themencluster**, in dem die Person spricht | Vokabular `topic_cluster` |
| `topic_role` | text | **Thema / programmatische Rolle**, Freitext | höchstens 300 Zeichen |
| `priority` | text | **Prio** A/B/C wie 2026 | Vokabular `speaker_priority` |
| `recommended_format` | text | **Empfohlenes Format**; das Blatt „Podcast“ wird `podcast` | Vokabular `session_format` (bestehend) |
| `contact_via` | text | **Kontakt via**: wer den Draht hat oder über wen es läuft („über Konrad“, „über Partner X“, „über Agentur“) | höchstens 200 Zeichen, **kein `@`** (Fehler `contact_details_not_allowed`) |
| `outreach_channel` | text | **Outreach**: der Weg, über den wir die Person ansprechen | Vokabular `outreach_channel` |

**Bühne in Frage**: neue Tabelle `speaker_stage_candidate (profile_id → speaker_profile on delete cascade, stage_id → stage on delete cascade, created_at, PK beide)`. Mehrfachauswahl; jede Bühne muss zur Edition des Profils gehören (Fehler `invalid_stage`). Eine Tabelle statt `uuid[]`, weil so der Fremdschlüssel greift und sich später fragen lässt, welche Leads für Bühne X im Gespräch sind (siehe Frage F1).

**Warum am Profil und nicht in einer eigenen 1:1-Tabelle:** Die Felder haben genau die Sichtbarkeit von `internal_notes`, und die Tabelle ist schon heute nur für `can_manage_speaker` lesbar. Eine zweite Tabelle brächte einen zweiten Schreibweg und keinen Gewinn an Schutz.

`speaker_type` bleibt, was es ist: die Rolle auf der Bühne, sobald die Person zugesagt hat (Keynote, Panel, Moderation …). `recommended_format` ist unsere Idee während der Akquise. Beide dürfen voneinander abweichen.

### B. Verlauf (`speaker_activity`, neu): Kommentar-Protokoll, Wiedervorlage, Aufgaben

Ein Eintrag je Berührungspunkt. „Nächster Schritt mit Wiedervorlage“ aus der Tabelle ist hier eine **offene Aufgabe** und kein eigenes Feld am Profil. So gibt es eine Quelle statt zwei, die auseinanderlaufen.

| Spalte | Typ | Pflicht | Bedeutung |
|---|---|---|---|
| `id` | uuid | PK | |
| `profile_id` | uuid | ja | → `speaker_profile` on delete cascade |
| `kind` | text | ja | Vokabular `speaker_activity_kind`: `note` (Notiz, Absprache, Vernetzung), `email`, `call`, `meeting`, `message` (LinkedIn, WhatsApp …), `task` (Aufgabe / Wiedervorlage) |
| `body` | text | ja | 1–2000 Zeichen |
| `occurred_at` | timestamptz | ja | wann es war; Standard jetzt, nachtragbar |
| `due_on` | date | nur `task` | Wiedervorlage (CHECK: gesetzt genau bei `task`) |
| `assignee_person_id` | uuid | nur `task` | wer sie erledigt; Standard die schreibende Person; muss Speaker-Lead der Edition oder Team sein (Fehler `invalid_assignee`) |
| `done_at`, `done_by` | timestamptz, uuid | | erledigt (nur bei `task`) |
| `author_person_id` | uuid | ja | wer den Eintrag geschrieben hat, gesetzt aus `current_person_id()` |
| `created_at`, `updated_at` | timestamptz | ja | |

„Wer / Wann / Kanal“ aus der Tabelle sind also `author_person_id`, `occurred_at` und `kind`.

Abgeleitet wird in der Pipeline, nicht gespeichert:

- **Letzte Aktivität**: das jüngste `occurred_at` ohne offene Aufgaben, bei erledigten Aufgaben `done_at`.
- **Nächster Schritt**: die offene Aufgabe mit dem frühesten `due_on`, mit Text, Datum und Zuständigen.
- **Überfällig**: `due_on` vor heute. Solche Einträge stehen **oben** in der Pipeline, mit Badge „überfällig“ (Text und Farbe).

### C. Vokabulare (neu, mit Eintrag in `vocab_binding`)

Die Begriffe pflegt das Team im Vokabular-Admin. Stilllegen statt löschen, die Sperre über `vocab_binding` greift.

| Vokabular | Schlüssel (Reihenfolge = `sort_order`) |
|---|---|
| `speaker_category` | 1 `politics` (Politik), 2 `defence_space`, 3 `business` (Wirtschaft), 4 `technology`, 5 `society` (Gesellschaft), 6 `journalism`, 7 `startup`, 8 `influencer`, 9 `sport`, 10 `academia`, 11 `vc`: die nummerierten Sektoren der Tabelle |
| `topic_cluster` | `politics_society`, `tech_science_deeptech`, `defence_space_resilience`, `climate_energy_infrastructure`, `business_capital_industry`, `work_leadership_career`, `sport_health_lifestyle` (Bezeichnungen DE/EN wie in der Tabelle) |
| `speaker_priority` | `a` „A-Tier“, `b` „B-Tier“, `c` „C-Tier“ |
| `outreach_channel` | `email`, `linkedin`, `phone`, `personal` (persönlich / Netzwerk), `agency` (Agentur / Management), `partner` (über Partner), `other` |
| `speaker_activity_kind` | `note`, `email`, `call`, `meeting`, `message`, `task` |

### D. Wer schreibt (Schreibwege)

Alle Wege sind SECURITY DEFINER mit gepinntem `search_path`, prüfen `can_manage_speaker(profile_id)` und enden mit `harden_definer_functions()`. Direkte Grants zum Schreiben gibt es nicht.

| Weg | Was | Wer |
|---|---|---|
| `update_speaker` (erweitert um die sieben Schlüssel aus A) | Einordnung | wie heute: `can_manage_speaker` |
| `speaker_profile_check` (erweitert) | Vokabular-Schlüssel, Längen, kein `@` in `contact_via` | Trigger |
| `set_speaker_stage_candidates(p_profile_id, p_stage_ids uuid[])` | ersetzt die Menge der Bühnen in Frage | `can_manage_speaker`; Audit |
| `add_speaker_activity(p_profile_id, p_data)` | neuer Eintrag | `can_manage_speaker` |
| `update_speaker_activity(p_id, p_data)` | Text, Datum, Frist, Zuständige | Autor oder Team |
| `set_speaker_activity_done(p_id, p_done)` | abhaken / wieder öffnen | Autor, Zuständige, Owner des Speakers oder Team |
| `delete_speaker_activity(p_id)` | löschen | Autor oder Team; Audit (ohne Text) |

Lesen: RLS auf `speaker_activity` und `speaker_stage_candidate` mit `can_manage_speaker(profile_id)`, dazu `grant select` nur für `authenticated`. Die Listen kommen über RPCs:

- `manager_speakers` bekommt die Felder aus A, `stage_candidates`, `next_task`, `last_activity_at` und `open_tasks`.
- `speaker_activities(p_profile_id)` liefert den Verlauf mit Namen der Autoren.
- `speaker_activity_overview(p_edition_id)` ist die Übersicht aller Einträge fürs Team (LEAD-025, `/admin`).

Fehlerschlüssel: `invalid_category`, `invalid_topic_cluster`, `invalid_priority`, `invalid_format`, `invalid_outreach_channel`, `text_too_long`, `contact_details_not_allowed`, `invalid_stage`, `invalid_activity_kind`, `due_required`, `invalid_assignee`, `activity_not_found` (P0002), `not allowed` (42501). DE und EN kommen in `rpcMessages`.

### E. Sichtbarkeit

| Wer | Einordnung (A) und Bühnen in Frage | Verlauf (B) |
|---|---|---|
| Team (admin, area_lead_speaker, programme_team) | lesen, schreiben | lesen, schreiben, jeden Eintrag löschen |
| Speaker-Lead: Owner, Anleger, Editions-Scope | lesen, schreiben | lesen, schreiben, eigene Einträge ändern und löschen, Aufgaben abhaken |
| Stage Lead (Bühnen-Scope) für Speaker mit Session auf seiner Bühne | wie heute bei `internal_notes`: lesen, schreiben | lesen, eigene Einträge (**Frage F1**) |
| Speaker, Assistenz, Partner | **nie** | **nie** |
| Exporte (Swapcard, Website, CSV fürs Programm) | **nie** | **nie** |

### F. Oberfläche (Umriss für den Bau)

- **Pipeline `/speaker-leads`:**
  - Neue Spalten: Prio (Badge mit Text A/B/C), Kategorie mit Cluster darunter (`ct-help`), Nächster Schritt mit Datum, Letzte Aktivität.
  - Filter: Prio, Kategorie, Cluster, Betreut von.
  - Oben ein Block **„Fällig“** mit den eigenen überfälligen und heute fälligen Aufgaben (LEAD-027).
- **Kontakt öffnen:** LEAD-026 macht aus dem Schubfach ein Modal; bei dieser Feldmenge gehört es in denselben Schnitt. Darin zwei Abschnitte:
  - „Einordnung“ mit den Feldern aus A;
  - „Verlauf“ mit den Einträgen, neuestem zuerst, und einem Formular darüber (Art, Datum, Text; bei Aufgabe dazu Frist und Zuständige).
- **Admin (Admin-Vollständigkeit):**
  - `/admin/speaker`: Filter nach Prio und Kategorie.
  - `/admin/speaker/[id]`: dieselben Abschnitte wie das Modal.
  - `/admin/speaker/verlauf` (neu): alle Einträge der Edition, filterbar nach Art, Autor und Speaker (LEAD-025).
- **Konrads Konto:** Der Schritt `pipeline` in `scripts/testdaten-konrad.mjs` bekommt für die drei TEST-Leads Einordnung, eine Bühne in Frage (die TEST-Bühne), eine Notiz und eine offene Aufgabe (eine davon überfällig).

### G. Datenschutz

- **Nicht als Feld:**
  - Geschlecht: Datenminimierung, die Anrede steht an der Person.
  - FLS-26-Status: kommt mit den Altdaten und wird nicht eingetippt.
- **`contact_via`** trägt nur den Weg, keine Kontaktdaten. Adressen und Telefonnummern Dritter gehören nach `speaker_contact`, und nur mit Einverständnis (`consent_at`, 0148). Die Datenbank weist ein `@` ab, und die Oberfläche sagt das im Hilfetext.
- **`anonymize_person`:**
  - leert die sieben Felder aus A;
  - löscht die Bühnen in Frage und den Verlauf des Profils;
  - Einträge, die die Person **als Autorin** geschrieben hat, bleiben; sie zeigen dann den anonymisierten Namen.
- **Aufbewahrung:** Der Verlauf hängt am Profil (cascade). Eine eigene Frist braucht er nicht.

## Offene Fragen an Konrad

- **F1 · Stage Leads:** Sollen Stage Leads Prio und Verlauf der Speaker auf ihrer Bühne sehen, auch wenn jemand anderes den Kontakt betreut?
  - *Vorschlag:* ja, eine Regel wie heute bei `internal_notes`, weil sie diese Speaker betreuen.
  - *Alternative:* Prio und Verlauf nur für Owner, Anleger und Team. Das kostet eine eigene Leseregel und erklärt sich schlechter.
  - Leads, bei denen ihre Bühne nur „in Frage“ steht, sehen sie nach beiden Varianten **nicht**. Das entspräche „keine fremden Entwürfe“ vom 25.09.
- **F2 · Themencluster und Programmthemen:** Sollen die sieben Cluster später die obere Ebene von `session_topic` werden? Das Vokabular kann das schon (`parent_vocabulary`, `parent_key`).
  - *Vorschlag:* jetzt nur das neue Vokabular, die Zuordnung als eigener Punkt. Am Programm ändert sich nichts.
- **F3 · Bühne in Frage:** Konkrete Bühnen der Edition, mehrfach wählbar (Vorschlag), oder nur Bühnentypen (Main, Side …)?
- **F4 · Mehrere Aufgaben je Speaker:** erlaubt (Vorschlag), oder genau eine Wiedervorlage? Als nächster Schritt zählt die früheste.
- **F5 · Import der Arbeitstabelle:** Sollen die bestehenden Zeilen vor dem Prozessstart am 01.11. übernommen werden?
  - Weg: ein Skript mit Probelauf, CSV → Felder aus A. Die Spalten „Kommentar“ und „nächster Schritt“ werden Einträge in B mit dem Vermerk „aus Arbeitstabelle übernommen“.
  - Die Tabelle enthält Personendaten. Deshalb nur nach deiner Freigabe und mit einer Zuordnungstabelle, die du vorher abnimmst. Ausführen würde die Architektur-Session.
  - Das ist keine Altdaten-Migration, sondern laufende FLS27-Akquise.

## Bau nach Freigabe (zwei Schnitte)

1. **Einordnung und Bühnen in Frage (A, C ohne `speaker_activity_kind`):**
   - Migration mit Test (Rollen L, S, X, Team, Speaker selbst, Partner);
   - Pipeline-Spalten und Filter;
   - LEAD-026 (Modal statt Schubfach);
   - Admin-Detail und Admin-Filter;
   - Testdaten.
2. **Verlauf und Aufgaben (B):**
   - LEAD-039-Protokoll, LEAD-025 (Kommentare und Admin-Übersicht) und LEAD-027 (Aufgaben, Block „Fällig“, überfällig oben);
   - Migration mit Test;
   - Testdaten.
