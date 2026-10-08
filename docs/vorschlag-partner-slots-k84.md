# Vorschlag K-84 · Partner legen auf Standbühne und gebrandeter Bühne selbst Slots an

Stand 08.10.2026 (abends), Speaker-Chat. **Vorschlag vorab an Plan, nichts gebaut** — Datenmodell und Rechte zuerst; Migration, Test und Oberfläche folgen nach der Freigabe. Gelesen auf `main` (cac0f689 plus 0278): die Live-Fassungen im Snapshot von `can_edit_stage`, `can_edit_slot`, `can_edit_regie`, `create_slot`, `move_slot`, `partner_window_binds`, `partner_booth_window`, `stage_frame_binds`, `stage_slot_check`, `can_edit_session`, `attach_session_to_slot`, `partner_delete_session`, dazu die Tests `v6_standbuehne_oeffnungszeiten` und `v6_standbuehne_regeln`. Live-Daten nicht angefasst.

## Auftrag

K-84 (Konrad, 08.10.), Q2 **ja**: Auf Partner-Bühnen (`kind` `booth` und `branded`, mit eigener Organisation) legt der Partner **im Rahmen seiner Zeiten selbst Slots an**; die Slotlänge darf von der normalen abweichen, der Partner entscheidet. Plan: `create_slot`, `move_slot` und das Löschen von Inhalts-Slots für Partner innerhalb des Zeitfensters der Bühne, Sperrzeiten des Events bleiben hart, bühnenspezifische Sperrzeiten setzt das Team, Audit, Rechte-Probe mit echtem Rollenwechsel. Die Oberfläche `/partner/buehne` baut der Partner-Chat nach „Migration live“; das Löschen im gemeinsamen Board (`components/programme/`) baue ich.

## Ist-Stand (Rolle `standbuehne_editor`, Scope `org`)

| Frage | Standbühne (`partner_booth`) | Gebrandete Bühne (`branded`) |
|---|---|---|
| Slot anlegen (`create_slot` → `can_edit_stage`) | ja | **nein** — 42501 „not allowed on this stage“ (Scope `org` gilt nur für `partner_booth`) |
| Vorhandenen Slot verschieben, Status setzen (`can_edit_slot`) | ja | ja (jede Bühne mit `partner_org_id`) |
| Auf eine andere Bühne ziehen (`can_edit_stage` der Zielbühne) | nur auf eine andere Standbühne der Organisation | nein |
| Slot **löschen** | **kein Weg** (`partner_delete_session` löscht nur den Slot einer Side-Event- oder Interview-Table-Session) | kein Weg |
| Zeitfenster hart (`partner_window_binds` → `outside_partner_window`) | ja: je Grenze Öffnungszeit der Bühne (`stage_day`), sonst Tagesrahmen der Veranstaltung, ganz ohne Rahmen keine Grenze (PART-090) | **nein** — `move_slot` meldet nur die Warnungen `before_open` und `after_close`; `create_slot` scheitert schon am Recht |
| Art des Slots | `create_slot` nimmt jede Art (`content`, `fixed_block`, `placeholder`, `partner_block`, `frame`) von jedem, der die Bühne bearbeiten darf | dasselbe |
| Sperrzeiten, Gültigkeitstage (`stage_slot_check`) | hart für alle, auch das Team | hart für alle |
| Länge | nur `end > start` und keine Überlappung (`slot_no_overlap`, 23P01); `default_duration_min` und `changeover_min` wirken nur als Vorgabe im Board und als Warnung `changeover_short` | gleich |
| Regie (`can_edit_regie` = Produktionsteam oder `can_edit_stage`) | ja | nein |

## Vorschlag

Eine Migration `v6_partner_slots`, nur Funktionen — **keine neue Tabelle, keine neue Spalte**. Auf Basis des Snapshots, mit `fn-diff`.

1. **Neuer interner Helfer `can_edit_stage_slots(p_stage_id)`** = `can_edit_stage(p_stage_id)` **oder** Rolle `standbuehne_editor` im Scope `org` einer gebrandeten Bühne dieser Organisation (`st.kind = 'branded'`, `st.partner_org_id = scope_id`). `create_slot`, die Zielprüfung in `move_slot` und das neue `delete_slot` fragen ihn statt `can_edit_stage`. **`can_edit_stage` selbst bleibt unverändert.** Grund: `can_edit_regie` hängt daran, und die Regie trägt den Ablauf unserer Bühne (Backstage, Mobiliar, Mikrofone, Technik, Notizen). Plans Wortlaut „`can_edit_stage` für gebrandete Bühnen“ gäbe dem Partner mit dem Slot-Recht auch die Regie unserer Hauptbühne (`regie_view`, `set_regie_anweisungen`). Auf der Standbühne ist das heute schon so und bleibt es. **Entscheidung Plan (R1):** Helfer (Empfehlung) oder `can_edit_stage` direkt.
2. **Zeitfenster hart auch auf der gebrandeten Bühne.** `partner_window_binds` und `partner_booth_window` bedienen `kind in ('booth', 'branded')` mit Partner statt nur `type = 'partner_booth'`. Das Fenster ist dasselbe wie auf der Standbühne (PART-090): je Grenze die Öffnungszeit der Bühne an diesem Tag, sonst der Tagesrahmen der Veranstaltung, ganz ohne Rahmen keine Grenze. Wer `admin` oder `programme_team` ist, bindet es nicht. Interview Table, Raum und Side-Event-Ort bleiben ungebunden (Erwartung 08 aus `v6_standbuehne_oeffnungszeiten`). Der Fehlerschlüssel bleibt `outside_partner_window` (der Text im Wörterbuch sagt heute „eurer Standbühne“ und wird „eurer Bühne“).
3. **Die Fenster-Prüfung rechnet in Zeitpunkten.** Heute vergleicht sie nur Uhrzeiten (`(p_end at time zone v_tz)::time > bis`): ein Slot von 18:30 bis 01:00 am Folgetag besteht die Prüfung, weil 01:00 nicht größer ist als 19:00. Neu: Tag plus Fenster in der Event-Zeit gegen `p_start` und `p_end`; `24:00` heißt „nächster Tag 00:00“. Gleiche Zeile in `create_slot` und `move_slot`. `stage_frame_binds` für Stage Leads (`outside_stage_day`) hat dieselbe Lücke — gleiche Korrektur (R4).
4. **Nur Inhalts-Slots für Partner.** Wer `partner_window_binds` trägt (Partnerbühne, kein Team), legt nur `content` an; sonst P0001 `slot_type_not_allowed`. Rahmen, feste Blöcke, Platzhalter und Partner-Blöcke setzt das Team. (`move_slot` sperrt Rahmen und feste Blöcke für Nicht-Team schon.)
5. **Löschen: neue RPC `delete_slot(p_slot_id uuid) returns void`.** SECURITY DEFINER, `search_path` gepinnt, EXECUTE nur für `authenticated` (wie `create_slot`), `harden_definer_functions()` am Ende. Recht: Programm-Team (jede Art) **oder** auf einer Partnerbühne, wer `can_edit_slot` hat und der Slot ist `content`. Abweisungen mit vorhandenen Schlüsseln: `unpublish_first` bei veröffentlichter Session (wie `detach_session`), `slot_locked` mit der Zahl bei zugesagten oder bestätigten Bewerbungen (wie `partner_delete_session`), sonst 42501 und P0002 `slot not found`. Eine **unveröffentlichte** Session am Slot bleibt bestehen und geht zurück ins Backlog (`session.slot_id` wird NULL, der Fremdschlüssel steht auf `on delete set null`). Der Slot-Verlauf (`slot_history`, `on delete cascade`) geht mit — **der Audit-Eintrag `slot.delete` mit dem Zustand davor bleibt** (Bühne, Zeit, Art, Session-ID, handelnde Person; keine Adresse). Admin-Weg: der Löschknopf im Slot-Fenster des Boards (`/admin/programm`, `/partner/buehne`, `/speaker-leads/board` teilen das Board) — Rückfrage über `ConfirmDialog`, Meldungen über die vorhandenen Schlüssel.
6. **Unverändert:** Sperrzeiten und Gültigkeitstage (`stage_slot_check`), die Überlappungssperre, die Rückfrage bei veröffentlichten Sessions (`confirmation_required`), die Warnungen (`off_grid_5min`, `changeover_short`, `speaker_conflict` — Warnungen, kein Abbruch; die Partner-Oberfläche entscheidet, welche sie zeigt), `can_edit_slot`, `can_edit_session`, `attach_session_to_slot`, die Gäste-Regel (`partner_manages_stage_guest`, `partner_assign_stage_guest`), die Änderungsmail LEAD-063 (bewegt der Partner einen veröffentlichten Slot, bekommen Speaker, Moderation und Partner-Hauptkontakt die wartende Mail wie bei jeder Änderung — auch bei der eigenen). **Slotlänge frei** ist damit schon erfüllt: die Datenbank kennt keine Mindest- oder Höchstlänge und keine Bindung an `default_duration_min` oder `changeover_min`; die Partner-Oberfläche darf die Vorgabe nur nicht erzwingen.
7. **Kontingente** (`stage.partner_slot_quota`, `stage_day.slot_quota`) bleiben Anzeige — keine Funktion erzwingt sie heute (R3).

## Sicherheit (Befunde zuerst)

| Nr. | Befund | Folge im Vorschlag |
|---|---|---|
| F1 | **Mitternachtslücke:** das Fenster vergleicht nur Uhrzeiten (`create_slot`, `move_slot`; auch `outside_stage_day` für Stage Leads). Ein Slot über Mitternacht hinaus besteht die Prüfung | Punkt 3; DB-Test mit Slot 15:30 → 00:30 am Folgetag |
| F2 | **Slot-Art offen:** `create_slot` prüft die Art nicht; ein Standbühnen-Editor kann heute `frame`, `fixed_block`, `partner_block` und `placeholder` anlegen (verschieben darf er sie danach nicht mehr) | Punkt 4 |
| F3 | **Regie-Folge:** `can_edit_stage` ist zugleich das Regie-Recht; es für die gebrandete Bühne zu öffnen, öffnet die Regie unserer Hauptbühne | Punkt 1 (Helfer statt Änderung); R1 |
| F4 | **Neuer Schreibweg `delete_slot`:** der Verlauf geht mit dem Slot, eine Session verliert ihren Slot | Gate, Abweisungen, Audit mit Zustand davor; Test der Abweisungen mit Gegenstücken |
| F5 | **Wirkung von ADM-106 (#398):** wer `partner_org_id` an einer Bühne setzt, gibt den `standbuehne_editor`-Kontakten der Organisation Slot-Rechte — mit diesem Vorschlag auch zum Anlegen und Löschen. Das Formular sagt es im Hinweis; der Vorschlag ändert daran nichts | nur benannt |

**Rechte nach der Änderung** (Scope `org`, Rolle `standbuehne_editor`): eigene Standbühne und eigene gebrandete Bühne — Slots anlegen, verschieben, löschen (nur Inhalt, nur im Fenster, keine Sperrzeit); fremde Bühne, Hauptbühne ohne Partner, Interview Table, Raum, Side-Event-Ort der eigenen Organisation — nichts Neues (vorhandene Slots weiter bearbeiten, wo `can_edit_slot` es schon erlaubt). Stage Leads und Team ändern sich nicht, außer bei der Korrektur F1.

## Test (Datenbank) — `supabase/tests/v6_partner_slots.sql`

Echter Rollenwechsel (`set local role authenticated` mit Anspruch der Person), Wegwerf-Organisationen A und B, Bühnen: gebrandet A, Stand A, gebrandet B, Hauptbühne ohne Partner, Interview Table A; Öffnungszeiten 10:00–16:00; alles zurückgerollt (`dry-run`). Erwartungen (je mit Gegenstück):

- **Form und Rechte:** `delete_slot` und `can_edit_stage_slots` vorhanden, SECURITY DEFINER, `search_path` gepinnt; `delete_slot` für `authenticated` ja, für `anon` und `public` nein; der Helfer intern.
- **Anlegen:** Partner A auf gebrandeter Bühne A im Fenster ja (7 Minuten und 3 Stunden — Länge frei); vor Öffnung und über den Schluss hinaus `outside_partner_window` mit `10:00–16:00`; genau an den Rändern ja; **über Mitternacht** abgewiesen; auf gebrandeter Bühne B, Hauptbühne ohne Partner, Interview Table A: 42501; Rahmen, feste Blöcke, Platzhalter, Partner-Blöcke: `slot_type_not_allowed`, das Team darf sie; ohne Öffnungszeiten der Tagesrahmen, ganz ohne Rahmen keine Grenze.
- **Sperren:** Sperrzeit des Events (`stage_id` leer) und der Bühne: `slot_blocked` für den Partner und für das Team; Gültigkeitstage: `stage_not_valid_that_day`; Überlappung 23P01.
- **Verschieben:** im Fenster ja, außerhalb nicht, auf eine Bühne einer fremden Organisation 42501, auf die eigene Standbühne ja, ein fester Block 42501, veröffentlichte Session `confirmation_required`.
- **Löschen:** leerer Inhalts-Slot ja (Audit `slot.delete` mit Person und Zustand davor, Verlauf weg, Audit bleibt); mit Entwurfs-Session ja und die Session bleibt im Backlog; veröffentlicht `unpublish_first`; zugesagte Bewerbung `slot_locked`; Slot einer fremden Organisation 42501; Rahmen und fester Block für den Partner 42501; das Team löscht jede Art; ohne Anmeldung nichts.
- **Unverändert:** Regie — Partner A auf gebrandeter Bühne **ohne** Regie-Recht, auf der Standbühne wie bisher; Gäste-Regel (`partner_manages_stage_guest`, `partner_assign_stage_guest`) gleiche Ergebnisse wie vorher; Stage Lead (`speaker_manager`, Scope Bühne) unverändert gebunden durch `outside_stage_day`; Interview Table ungebunden (Erwartung 08 aus `v6_standbuehne_oeffnungszeiten`).
- **Änderungsmail:** der Partner bewegt einen veröffentlichten Slot (mit Bestätigung) — die wartende Mail von LEAD-063 entsteht wie bisher.
- **Mitlaufende Tests im Probelauf:** `v6_standbuehne_oeffnungszeiten`, `v6_standbuehne_regeln` (Schritte 01, 02, 04, 06 sind seit PART-090 überholt), `v6_lead_tagesrahmen`, `lead016_buehnen_sichtregel`, `v6_buehnen_stammdaten`, `v2_roles_programme`.
- **Mutationsproben** an der Migration (je Regel eine), `fn-diff` ohne entfernte Zeile.

Dazu der **App-Test** (Wörterbuch `outside_partner_window` und `slot_type_not_allowed`, Löschweg im Board, `components/programme/oeffnung.ts` kennt das Fenster der gebrandeten Bühne wie das der Standbühne) und der Testdaten-Schritt für Konrad: `--nur=partnerslots` (braucht `partner`) legt eine gebrandete TEST-Bühne der Test-Organisation mit Öffnungszeiten an; Konrad ist dort Standbühnen-Editor und klickt `/partner/buehne` (Slot anlegen, verschieben, löschen) und `/admin/programm` (Admin-Weg).

## Offen

**R1 (Plan):** Helfer `can_edit_stage_slots` (Empfehlung, die Regie bleibt zu) oder `can_edit_stage` direkt erweitern (öffnet die Regie der gebrandeten Bühne für den Partner)?

**R2 (Plan):** Der Partner darf auf seiner Bühne **alle** Inhalts-Slots löschen, auch die vom Team angelegten, solange keine Session veröffentlicht ist und keine Bewerbung zugesagt wurde. Genügt das, oder nur die selbst angelegten (`slot.created_by` aus der Organisation)? Empfehlung: alle — die Bühne gehört ihm, der Schutz liegt bei veröffentlicht und zugesagt.

**R3 (Plan/Konrad):** Kontingente (`partner_slot_quota`, `slot_quota`) bleiben Anzeige — oder soll die Zahl der Partner-Slots je Bühne und Tag begrenzt werden? Empfehlung: Anzeige, bis jemand eine Obergrenze nennt.

**R4 (Plan):** Die Mitternachtskorrektur auch für `stage_frame_binds` (Stage Leads, `outside_stage_day`)? Empfehlung: ja, dieselbe Zeile, nur Slots über Mitternacht ändern ihr Verhalten.

**R5 (Plan):** Schlüssel `outside_partner_window` auch für die gebrandete Bühne (Empfehlung, ein Schlüssel je Regel) oder `outside_stage_day` wie in der Nachricht an mich?

## Arbeitsteilung

| | Speaker-Chat | Partner-Chat |
|---|---|---|
| Besitzt | Migration `v6_partner_slots` samt Test, das gemeinsame Board (Löschknopf, Fenster der gebrandeten Bühne in `oeffnung.ts`), Testdaten-Schritt `partnerslots`, Wörterbuch der Fehlerschlüssel | Seite `/partner/buehne` („Eure Bühne“), `partner_add_speaker`, `partner_overview.has_stage` (Vorschlag #389), Gästeverwaltung |
| Berührung | keine gemeinsamen Funktionen: PART-138 ändert `partner_overview` und `partner_add_speaker`, dieser Vorschlag `create_slot`, `move_slot`, `delete_slot`, die Fenster-Helfer und den neuen Rechte-Helfer — die beiden Migrationen hängen nicht voneinander ab | zeigt nach „Migration live“ den Knopf „Slot anlegen“ im Fenster der Bühne (die Funktion `createSlot` im Board gibt es schon) |

## Reihenfolge

1. Antworten R1–R5 und Freigabe dieses Vorschlags.
2. Migration als Vorschlag unter `supabase/migrations/vorschlag/` mit Test und Mutationsproben; PR „Migration enthalten“, Plan nummeriert und wendet an.
3. Nach „Migration live“: Board (Löschknopf, Fenster), Testdaten-Schritt `partnerslots`, Wörterbuch; der Partner-Chat baut die Seite.

**Admin-Weg:** vorhanden — Slots anlegen, verschieben und (neu) löschen im Board unter `/admin/programm`; Partner der Bühne im Bühnenformular unter `/admin/edition` (ADM-106); die Rolle `standbuehne_editor` vergibt das Produkt (`grants_role`, Datenpflege) oder die Organisationsseite unter `/admin/partner`.
