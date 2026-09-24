# Admin-Abschnitte: wer sieht was (PORT1)

Seit dem 22.09.2026 gilt **Admin zuerst**: alle Team-Funktionen liegen unter `/admin`, unterschieden wird über Rollen. Die Tür (`requireArea("admin")`) lässt deshalb **jede Teamrolle** ein — der Schutz sitzt eine Ebene tiefer.

## Die drei Stellen

1. **`lib/admin-sections.ts`** — die einzige Quelle: welcher Abschnitt, welcher Pfad, welche Rollen. `roles: []` heisst **nur `admin`**.
2. **`requireAdminSection("<key>")`** in `lib/auth.ts` — das Gate jeder Seite, jeder Server-Action und jeder Admin-Route. Wer nicht darf, bekommt **404**, nicht 403: dass es die Seite gibt, ist für ihn keine Information.
3. **`app/(admin)/layout.tsx`** — die Navigation liest dieselbe Quelle. Eine Leiste, die auf eine 404 zeigt, wäre schlimmer als keine; eine Gruppe ohne sichtbaren Punkt verschwindet mit.

## Einen Abschnitt hinzufügen

1. Schlüssel in `AdminSectionKey` und Zeile in `ADMIN_SECTIONS` ergänzen (Pfad unter `/admin/…`, Rollen **ohne** `admin`).
2. In der Seite `await requireAdminSection("<key>")` statt `requireArea("admin")`. Dasselbe in `actions.ts` — eine Server-Action ist ein eigener Einstieg von aussen, keine Fortsetzung der Seite.
3. Punkt in `app/(admin)/layout.tsx` über `eintrag("<key>", …)` einhängen.
4. `npm test` — `tests/admin-sections.test.ts` prüft, dass **jede** Seite und jede Action unter `app/(admin)/admin/` ein Gate zieht. Der Test ist die eigentliche Absicherung: ein vergessenes Gate wäre seit der Öffnung der Tür nicht nur unschön, sondern für jede Teamrolle offen.

**Fail closed.** Wer die Rollen vergisst, sperrt den Abschnitt auf `admin` — der Fehler, den man bemerkt, statt des Fehlers, den niemand bemerkt.

## Ausnahmen: Abschnitte je Rolle und je Person (ADM-053)

Die Tabelle unten ist die **Vorgabe**. Konrad kann davon abweichen, ohne dass jemand Code anfasst: unter *Rollen* steht „Abschnitte schalten".

* **Person schlägt Rolle, Rolle schlägt Vorgabe.** Haben zwei Rollen einer Person widersprüchliche Ausnahmen, gewinnt das Öffnen — dieselbe Regel wie bei der Vorgabe.
* **`admin` sieht immer alles** und bekommt gar keine Ausnahmen geliefert. Sonst könnte Konrad sich mit einem Klick den Weg zurück zum Rollen-Bereich abschalten; die RPC weist `role = 'admin'` deshalb ab.
* Gespeichert in `admin_section_override` (eine Zeile je Abschnitt × Ziel), geschrieben nur über `set_admin_section_override` / `delete_admin_section_override`, beides mit Protokoll. Gelesen über `my_admin_section_overrides()` — einmal je Anfrage, Navigation und Gate teilen sich die Antwort (`lib/admin-access.ts`).

**Eine Ausnahme öffnet die Seite, nicht die Datenbank.** Wer einen Abschnitt für eine Rolle anschaltet, deren RPC ihn nicht kennt, sieht die Seite und bekommt darin 42501. Das aufzulösen ist Auflage PORT1b (Admin-RPCs je Abschnitt öffnen).

## Rollenmodell (Konrad, 24.09.2026)

Je Bereich eine **Lead-** und eine **Team-Rolle**, beide intern:

| Bereich | Leitung | Team |
|---|---|---|
| Talent | `area_lead_talent` | `talent_team` |
| **Speaker und Programm** (ein Bereich) | `area_lead_speaker` (Programmleitung) | `programme_team` |
| Partner (mit Initiativen) | `area_lead_partner` | `partner_team` |
| Volunteers | `area_lead_volunteers`, `volunteers_team` | `volunteers_team` |
| Hackathon | `area_lead_hackathon` | `hackathon_team` |
| Produktion | `area_lead_production` | `production_team` |
| Marketing | — | `marketing_team` |

**Extern und ohne Admin-Zugang:** `speaker_manager` (Bühnenleitungen, arbeiten in `/speaker-leads/*`), `volunteer_lead` (Schichtleitung im Volunteer-Portal), `checkin_operator` (Gerätekonto am Einlass). Alle drei standen bis zum 24.09.2026 in `team_role_keys()` und wären mit PORT1 Teammitglieder geworden.

## Was die Rollen heute öffnen

| Abschnitt | zusätzlich zu `admin` |
|---|---|
| Übersicht, Bausteinkatalog | alle Teamrollen |
| Bewerbungen | `area_lead_talent`, `talent_team`, `programme_team` |
| Programm, Gerüst | `programme_team`, `area_lead_speaker`, `area_lead_production` |
| Speaker, Aufgaben | `area_lead_speaker`, `programme_team` |
| Speaker-Leads, Einreichungen | `area_lead_speaker`, `programme_team` |
| Tickets, Reisekosten, Hotels, Reception | `area_lead_speaker`, `programme_team` |
| Anreise | dazu `area_lead_production` |
| Regie, Technik | `area_lead_production`, `production_team` (Technik auch `area_lead_speaker`) |
| Grafiken, Videos | `marketing_team`, `area_lead_speaker` |
| Partner, Initiativen | `area_lead_partner`, `partner_team` |
| Volunteers | `area_lead_volunteers`, `volunteers_team` |
| Catering | Produktion, Volunteers, Speaker |
| **Produktion** | `production_team`, `area_lead_production` |
| Ansprechpartner, Fristen, Wiki | **alle** internen Rollen, Leitung und Team |
| Vokabular, Mail | nur `admin` |
| **Verwaltung**: Personen, Team, Rollen, Dubletten, Löschanträge | **nur `admin`** |

Die Zuordnung ist Arbeitsteilung, keine Technik — sie steht in einer Datei und ist eine Zeile weit änderbar. Was ein Bereichslead in seiner Domäne **tun** darf, entscheidet weiterhin die Datenbank (`is_partner_team()`, `can_edit_slot()` und so fort); dieses Gate sagt nur, welche Seite er öffnen kann.

## Datenbankrechte bleiben, wie sie sind

PORT1 ändert **keine** SQL-Prädikate. `has_role('admin')` erfüllt die Team-Prädikate wie bisher; ein Bereichslead, der eine Seite öffnen darf, bekommt dort trotzdem nur, was seine RPC ihm gibt. Die Oberfläche ist die zweite Schranke, nicht die erste.
