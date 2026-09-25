# Rechte-Review Stage-Lead-Portal `/speaker-leads/*` (PORT3, 25.09.2026)

**Stand:** Bestandsaufnahme, nur gelesen (Live-Fassungen aus `supabase/snapshot/functions/`, Policies und Views aus den Migrationen). **WIP Pause 25.09.** — der Migrationsbau beginnt nach der Pause.

**Entscheidung (Plan-Chat, 25.09., Variante A):** keine neue Rolle. `speaker_manager` **ist** die Rolle der externen Stage Leads — seit #161 (ADM-053, 0162) keine Teamrolle mehr und ohne Admin-Zugang (Konrads Rollenmodell vom 24.09. abends, Arbeitsauftrag Welle 6). PORT3 macht sie dicht: nur Scope `stage` (oder `slot`/`stage_day`), Prädikat `is_stage_lead_of(stage)`, keine Edition-Zweige mehr, keine fremden Entwürfe, Personendaten nur zu Speakern der eigenen Bühnen und eigenen Einträgen.

## 1 · Was schon stimmt

- **App-Gate:** `speaker_manager` steht in `EXTERNAL_ROLES`, nicht in `TEAM_ROLES` (`lib/admin-sections.ts`); der Bereich `admin` lässt nur `TEAM_ROLES` ein (`lib/areas.ts`) → `requireArea("admin")` weist einen reinen `speaker_manager` ab. `speaker-leads` öffnet `speaker_manager` und `programme_team`.
- **Board lesen:** `programme_board` ist `security_invoker`, die Session-Felder kommen über die RLS von `session` (`session_read`, 0180): veröffentlicht, Team (`is_programme_reader` = `is_staff`), eigener Auftritt, eigene Organisation, Standbühnen-Editor der Org, `can_edit_session`. Für einen Stage Lead heißt das: veröffentlichte Sessions, Sessions der eigenen Bühnen/Slots/Tage (`can_edit_slot` kennt für `speaker_manager` nur `stage`, `stage_day`, `slot`) und eigene Backlog-Sessions. **Fremde Entwürfe stehen als belegter Slot ohne Inhalt da.**
- **Board schreiben:** `create_slot`/`move_slot`/`set_slot_status` über `can_edit_stage`/`can_edit_slot` (nur Bühnen-, Tag-, Slot-Scope für `speaker_manager`); Tagesrahmen hart über `stage_frame_binds` (nur Bühnen-Scope).
- **Regie:** alle Wege über `can_edit_regie` = `is_production_team() or can_edit_stage(stage)` bzw. `can_plan_regie`.
- **Team-Funktionen:** `approve_travel_costs` (admin, area_lead_speaker), `search_people` (`is_staff`), `publish_session`/`release_partner_session` (Programm-Team) — Stage Leads bekommen 42501.

## 2 · Lücken (Fix in der PORT3-Migration)

| # | Stelle | Heute | Folge | Fix |
|---|---|---|---|---|
| L1 | `can_manage_speaker` | Zweig `has_role('speaker_manager','edition', null, sp.edition_id)` | ein Lead mit Edition-Scope verwaltet **alle Speaker der Edition** (Personendaten, Reise, Verlauf, Einladung) | Edition-Zweig raus; Bühnen-Zweig über `is_stage_lead_of(sl.stage_id)`; Slot/Tag wie bisher; Owner/Ersteller bleiben (eigene Einträge, Übergabe) |
| L2 | `can_search_board` | `speaker_manager` mit `global` oder `edition` darf im ganzen Event suchen | Suche über fremde Bühnen hinaus | nur Bühnen im Event, für die `is_stage_lead_of` gilt |
| L3 | `board_search_people` | liefert Name und Organisation **aller Speaker-Profile der Edition** (alle Stände: Lead, Absage, Gast) an jede Person mit `can_search_board` | ein Stage Lead sieht die Pipelines aller anderen Bühnen | für Nicht-Programm-Editoren nur Profile mit `can_manage_speaker(sp.id)`; Moderationszweig (LEAD-042) nur Stage Leads mit Bühnen-Scope (Zeile `ra.edition_id = v_ed` fällt), nur Namen |
| L4 | `speaker_managers()` | Name **und E-Mail** aller Leads an jeden Lead | fremde Kontaktdaten | E-Mail nur für das Team (`admin`, `area_lead_speaker`, `programme_team`), sonst `null`; die Übergabe braucht nur den Namen |
| **L5** | **`upsert_speaker`** | jeder `speaker_manager` (jeder Scope) darf; bei bestehender Person **und** Profil der Edition greift `on conflict … do update` **ohne `can_manage_speaker`** — `person_id` wird von Nicht-Team angenommen | **ein Stage Lead überschreibt per E-Mail oder `person_id` jedes fremde Profil der Edition** (Pipeline-Status, Typ, Titel, Organisation, interne Notiz, Reception, Reisekosten-Übernahme) | Nicht-Team: kein `person_id`, nur der E-Mail-Weg; gibt es das Profil schon und fehlt `can_manage_speaker` → Abbruch (Fehlerschlüssel siehe Frage F1); sonst anlegen wie bisher |
| L6 | `my_manager_scope` | `editions` nur aus Edition-Scope, `all` aus globalem Scope | nach L1/L7 hätte ein Bühnen-Lead keine Edition → „Speaker anlegen“ und Board-Vorauswahl leer | `editions` aus Bühnen, Tagen und Slots ableiten; `all` nur Team |
| L7 | `assign_role`; `/admin/speaker-leads` (`makeLead`) | vergibt `speaker_manager` **mit Edition-Scope** (`p_scope_type: "edition"`) | jeder neue Lead sähe alles (L1) | `assign_role`: `speaker_manager` nur mit `stage`/`slot`/`stage_day` und vorhandener `scope_id` (22023 `stage_scope_required`); CHECK `role <> 'speaker_manager' or scope_type in (…)` als `not valid` (Historie bleibt); Admin-Seite: Bühne wählen statt Edition, mehrere Bühnen = mehrere Zeilen |

Nicht geändert (Begründung): `is_programme_board_user` lässt `speaker_manager` jedes Scopes in den Realtime-Kanal des Boards — die Nachrichten tragen keine Inhalte. `upsert_session` lässt `speaker_manager` Backlog-Sessions anlegen — sie gehören dann dem Ersteller (`can_edit_session` über `created_by`), an einen Slot hängen geht nur mit `can_edit_slot`.

## 3 · Tabelle je Seite und RPC (Rechte-Review)

| Seite unter `/speaker-leads` | RPC / View | Prädikat heute | nach PORT3 |
|---|---|---|---|
| alle | Layout | `requireArea("speaker-leads")` | unverändert |
| Pipeline, Bestätigte | `manager_speakers` | Eintritt `has_role('speaker_manager')`…, Zeilen `can_manage_speaker` | Zeilen über L1 |
| | `my_manager_scope` | eigene Rollen | L6 |
| | `speaker_managers` | Team oder `speaker_manager` | L4 |
| | `stage` (Tabelle) | RLS, nur Namen | unverändert |
| Pipeline (Aktionen) | `upsert_speaker` | `is_speaker_team` oder `has_role('speaker_manager')`, **ohne Profilprüfung** | **L5** |
| | `update_speaker`, `set_speaker_pipeline`, `set_speaker_stage_candidates`, `invite_speaker`, `handover_speaker` | `can_manage_speaker` (+ Team-Felder, 0200-Sperre) | über L1 |
| | `approve_session_content`, `reject_session_content` | `can_edit_session` oder `can_manage_speaker` | über L1 |
| | `approve_travel_costs` | admin, area_lead_speaker | unverändert (42501 für Leads) |
| | `search_people` | `is_staff` | unverändert (42501 für Leads) |
| Fenster: Verlauf | `speaker_activities`, `add/update/delete_speaker_activity`, `set_speaker_activity_done` | `can_manage_speaker` | über L1 |
| Anreise | `speaker_travel_list` | Eintritt Rolle, Zeilen `can_manage_speaker` oder Produktion | über L1 |
| Shuttle | `manager_shuttle_bookings`, `request_shuttle`, `cancel_shuttle` | `can_manage_speaker` / `can_request_shuttle` | über L1 |
| Einreichungen | `pending_submissions` | `can_edit_session` oder `can_manage_speaker` | über L1 |
| Board, Tabelle | `programme_board`, `programme_backlog` (Views, `security_invoker`), `stage_day`, `stage_day_slot_stats` | RLS `session_read` | unverändert — fremde Entwürfe ohne Inhalt |
| Board: Schubfach | `session` (Tabelle), `session_speakers_public`, `session_question`, `question_catalog` | RLS / `is_session_visible` | unverändert |
| | `upsert_session`, `set_session_speakers`, `attach_session_to_slot`, `detach_session`, `set_session_questions` | `can_edit_session` (+ `can_edit_slot`) | unverändert |
| | `create_slot`, `move_slot`, `set_slot_status` | `can_edit_stage` / `can_edit_slot`, Rahmen `stage_frame_binds` | unverändert |
| | `board_search_people` | `can_search_board` | **L2 + L3** |
| | `board_search_partners`, `board_session_refs`, `set_session_partner` | `can_search_board` (+ `can_edit_session`) | über L2 (nur Organisationsnamen) |
| | `publish_session`, `unpublish_session`, `release_partner_session` | Programm-Team | unverändert |
| Regie | `my_regie_stages`, `lead_regie_slots`, `regie_view`, `regie_open_slots`, `set_regie_anweisungen`, `upsert_regie_cue`, `delete_regie_cue` | `can_edit_regie` / `can_plan_regie` (Bühne) | unverändert |
| Admin (Vergabe) | `assign_role` (`/admin/speaker-leads`) | admin | **L7** |

## 4 · Bestand (live, 25.09., nur Anzahlen)

`speaker_manager` · Edition · aktiv: 1 (Testdaten, Konrad) · Bühne · aktiv: 2 (Testdaten: Konrads Stage-Lead-Testbühne, „TEST Stage Lead (Moderation)“) · Edition · abgelaufen: 1 (echt, bleibt als Historie). Keine echten externen Zugänge (Auflage vom 24.09. eingehalten).

## 5 · Plan für die Migration (nach der Pause)

Vorschlag `v6_port3_stage_leads`, Funktionen aus dem Snapshot:
1. `is_stage_lead_of(p_stage_id)` (neu, intern): aktive Rolle `speaker_manager` mit Scope `stage` = diese Bühne.
2. `can_manage_speaker` (L1), `can_search_board` (L2), `board_search_people` (L3), `speaker_managers` (L4), `upsert_speaker` (L5), `my_manager_scope` (L6), `assign_role` (L7), CHECK `not valid`.
3. App: `/admin/speaker-leads` `makeLead` mit Bühnenwahl; neue Fehlerschlüssel mit Text DE/EN.
4. Testdaten: Konrads Edition-Zeile `speaker_manager` (MARK) löschen — die Bühnen-Zeile aus `--nur=buehne` bleibt; die Grundausstattung (`apply`) vergibt die Edition-Rolle nicht mehr. Hinweis: Konrad ist `admin` und sieht deshalb immer alles — die Stage-Lead-Sicht belegt der SQL-Test; ein eigenes Testkonto müsste Konrad selbst anlegen.

## 6 · Testplan (echter Rollenwechsel, `set local role authenticated`)

L als `speaker_manager` mit Bühnen-Scope auf Bühne A; Bühne B fremd, darauf ein Entwurf (Vorbedingung: er existiert und ist als Team sichtbar); Speaker SA auf A, SB auf B; Lead-Eintrag LE von L; T mit Edition-Scope `speaker_manager` (Altbestand, direkt eingefügt vor dem CHECK bzw. als abgelaufene Historie simuliert).
1. `programme_board`: Session auf A lesbar; Entwurf auf B: Slot da, `session_id` und Titel leer (0 Zeilen mit Inhalt, Vorbedingung gesetzt).
2. `manager_speakers`: SA und LE, nicht SB; T sieht mit Edition-Scope **nicht** mehr alle.
3. `board_search_people` als L: findet SA und LE, nicht SB.
4. `speaker_managers` als L: E-Mail `null`; als Team: gesetzt.
5. `upsert_speaker` als L mit der Adresse von SB: Abbruch, SB unverändert (Vorbedingung: Werte vorher gelesen).
6. `assign_role('speaker_manager', 'edition')` als Admin → 22023; mit Bühne → ok.
7. Admin-RPCs als L (z. B. `speaker_leads_admin`, `unassigned_speakers`, `team_members`) → 42501.
8. `my_manager_scope` als L: Edition aus der Bühne abgeleitet.

## 7 · Offene Fragen

- **F1 (L5):** Fehlerschlüssel bei fremdem, bestehendem Profil — eigener Schlüssel `speaker_exists` (P0001, „Diese Person ist schon Speaker der Edition — das Team ordnet sie deiner Bühne zu“) ist hilfreich, verrät aber, dass zu einer bekannten Adresse ein Profil existiert; Alternative 42501 ohne Hinweis. Empfehlung: `speaker_exists`, weil die Adresse schon bekannt sein muss.
- **F2 (L3):** Sollen Stage Leads bestätigte oder veröffentlichte Speaker der Edition finden (sie stehen ohnehin auf der Website), um sie in eigene Sessions zu holen? Empfehlung: nein — nur eigene Bühne und eigene Einträge; das Team ordnet zu.
- **F3:** Slot- und Tag-Scope bleiben erlaubt (bestehende Funktionen kennen sie); `is_stage_lead_of` meint nur die ganze Bühne. Passt das?
