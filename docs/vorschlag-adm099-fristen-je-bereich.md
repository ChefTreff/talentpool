# Vorschlag: Fristen je Bereich — Rechte, Anzeige, Erinnerung in Tagen (ADM-099)

Stand 08.10.2026, Admin-Chat, **zur Freigabe durch Plan**. Noch kein Bau. Anlass: Konrad (08.10.), ADM-099: „Fristen aufteilen auf Speaker, Partner und Volunteers und die Verwaltung in die jeweiligen Bereiche ziehen (Partner-Manager legen Partner-Fristen selbst an); unter System bleibt eine gesammelte Übersicht mit Tabs je Bereich; interne Schlüssel wie `award_vote_from` nicht anzeigen, nur Anzeigename; Erinnerung in **Tagen**.“

## 1 · Ausgangslage

- 10 Fristen live (`deadline`, 08.10.): Zielgruppe `award` 3, `partner` 6, `speaker` 1. Das Feld `audience` ist freier Text (Konrads Werte: speaker, partner, volunteer, all; dazu award).
- **Lesen:** Policy `deadline_read` für jede angemeldete Person (Countdowns in den Portalen). **Schreiben:** nur `upsert_deadline`, und die prüft `is_staff()` — jedes Teammitglied darf **jede** Frist ändern, auch die der anderen Bereiche; Löschen gibt es nicht.
- **Anzeige:** `/admin/fristen` (Abschnitt `deadlines`, alle internen Rollen) zeigt eine Liste mit dem **Schlüssel** (`award_vote_from`) in der ersten Spalte; die Beschriftung steht nur im Datensatz. Erinnerung wird in **Stunden** (`reminder_lead_hours`) eingegeben (48, 168, 336 …).
- **Der Schlüssel ist eine Code-Schnittstelle:** Produkte und Aufgabenvorlagen verweisen mit `due_rule.deadline_key`, Speaker-Aufgaben mit `deadline_key`, der Messeshop mit festen Schlüsseln (`shop_phase1_end`), Side Events mit einem Platzhalter-Schlüssel. Ein Schlüssel darf also nie still umbenannt oder gelöscht werden.

## 2 · Vorschlag

### 2.1 Rechte je Bereich über Abschnitte (wie bei den Mail-Vorlagen, ADM-102)

| Zielgruppe der Frist | Abschnitt, der sie **ändern** darf | Vorgabe-Rollen (zusätzlich zu `admin`) |
|---|---|---|
| `speaker` | `deadlinesSpeaker` | `area_lead_speaker`, `programme_team` |
| `partner` | `deadlinesPartner` | `area_lead_partner`, `partner_team` |
| `volunteer` | `deadlinesVolunteers` | `area_lead_volunteers`, `volunteers_team` |
| `award`, `all`, jede andere | `deadlinesSystem` | — (nur `admin`) |

(Hackathon-Fristen sind Challenge-Fristen in `hack_challenge.submission_deadline`, eigener Weg `set_hack_challenge_deadline`, bleiben unberührt.)

Neu: `can_edit_deadline(p_audience text) returns boolean` = `has_admin_section(<Abschnitt der Zielgruppe>)`; unbekannte Zielgruppe ⇒ `deadlinesSystem` (fail closed). `admin_section_role` + `lib/admin-sections.ts` im selben PR. Der bestehende Abschnitt **`deadlines`** bleibt die **Übersicht** unter System (alle internen Rollen lesen, wie heute) — **ändern** darf man dort nur, wofür `can_edit_deadline` gilt.

**Geändert:** `upsert_deadline` prüft `can_edit_deadline(audience)` statt `is_staff()` — beim Verschieben einer Frist in eine andere Zielgruppe für **alt und neu**. Das ist eine bewusste Einschränkung: heute kann jedes Teammitglied jede Frist ändern.

### 2.2 Eigene Fristen anlegen und entfernen

- Neue Spalte `deadline.custom boolean not null default false`. Die 10 Bestandsfristen sind **Systemfristen** (`custom = false`): Datum, Beschriftung, Beschreibung und Erinnerung änderbar, **Schlüssel und Zielgruppe fest, nicht löschbar** — Code hängt daran.
- Ein Bereichsverantwortlicher legt **eigene Fristen** an (`custom = true`): er gibt nur die **Beschriftung** DE/EN, Datum und Erinnerung an; den **Schlüssel erzeugt die Funktion** (`custom_<slug>` aus der deutschen Beschriftung, bei Kollision mit Zähler) — Schlüssel sind nirgends sichtbar (ADM-099). Eigene Fristen lassen sich in Produktvorlagen und Aufgaben wählen (dort steht die Beschriftung, nicht der Schlüssel).
- Neu: `delete_deadline(p_id)` — nur `custom = true` **und** nicht in Gebrauch (Prüfung gegen `due_rule`/`deadline_key` in den Vorlagen und Aufgaben); sonst P0001 `deadline_in_use` mit der Zahl der Verweise; ohne Recht 42501; Audit `deadline.delete`. Das verhindert den stillen Verlust eines Schlüssels, auf den Code oder Daten zeigen.
- `upsert_deadline`: Anlegen mit `custom = true` nur, wenn kein Schlüssel mitkommt; ein mitgegebener Schlüssel einer **Systemfrist** bleibt wie bisher (Aktualisieren über `(edition_id, key)`).

### 2.3 Anzeige und Erinnerung (ohne Datenbankänderung)

- Die Oberfläche zeigt **nur die Beschriftung** (DE bzw. EN nach Sprache der Person), nie den Schlüssel; Tabs je Bereich (Speaker, Partner, Volunteers, System) mit Zählung; jeder Tab zeigt, ob die Person ändern darf (sonst nur Lesen).
- **Erinnerung in Tagen:** gespeichert bleibt `reminder_lead_hours` (die Erinnerungsjobs rechnen damit); die Eingabe ist in **ganzen Tagen** (0 = zur Fälligkeit, höchstens 90), die Funktion rechnet mal 24. Alle 10 Bestandswerte (0, 48, 72, 168, 336 h) sind volle Tage (0, 2, 3, 7, 14). Ein Wert, der kein Vielfaches von 24 ist (spätere Einzelfälle), wird in der Oberfläche als „n Stunden“ gezeigt und beim Speichern auf Tage gerundet — mit Hinweis.

### 2.4 Verteilung auf die Bereiche

Ich liefere **einen** wiederverwendbaren Baustein `FristenVerwaltung` (Liste je Zielgruppe, Anlegen, Ändern, Löschen, Rechte-Hinweis) und die RPCs. Eingebaut wird er (a) in `/admin/fristen` als Tabs je Bereich (System-Übersicht) und (b) von den Bereichs-Chats als Abschnitt in ihren Seiten (Partner: `/admin/partner`, Speaker: `/admin/speaker`, Volunteers: `/admin/volunteers`) — **ohne neue Menüpunkte**. Das Einhängen in die Bereichsseiten ist deren Aufgabe (Partner-/Speaker-/Talent-Chat), der Baustein bekommt die Zielgruppe als Eigenschaft.

## 3 · Fehlerschlüssel und Protokoll

42501 · 22023 `fields_required` (Beschriftung, Datum), `invalid_reminder` · P0001 `deadline_in_use`, `deadline_is_system` (Löschen einer Systemfrist) · P0002 `deadline_not_found`. Protokoll: `deadline.upsert` (unverändert), neu `deadline.delete`.

## 4 · Entscheidungen für Plan (und ggf. Konrad)

1. **Zuordnung Zielgruppe → Abschnitt** wie in 2.1; besonders: **`award`** und **`all`** ändert nur `admin` (Award läuft über die Verwaltung?) — oder soll ein Bereich (Talent/Marketing) die Award-Fristen pflegen?
2. **Verschärfung:** `upsert_deadline` nicht mehr für jedes Teammitglied, sondern je Zielgruppe — in Ordnung?
3. **Eigene Fristen** mit erzeugtem Schlüssel und **Löschen nur eigener, ungenutzter** Fristen; Systemfristen bleiben unlöschbar.
4. **Erinnerung in Tagen** nur in der Oberfläche (Speicherung in Stunden bleibt).
5. Reihenfolge: ADM-102 ist freigegeben; ADM-099 als eigene Migration derselben Welle (wie besprochen), Bereichs-Einbau durch die Bereichs-Chats danach.
