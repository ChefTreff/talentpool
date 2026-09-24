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

## Was die Rollen heute öffnen

| Abschnitt | zusätzlich zu `admin` |
|---|---|
| Übersicht, Bausteinkatalog | alle Teamrollen |
| Bewerbungen | `area_lead_talent`, `programme_team` |
| Programm, Gerüst | `programme_team`, `area_lead_speaker`, `area_lead_production` |
| Speaker, Aufgaben | `area_lead_speaker`, `speaker_manager`, `programme_team` |
| Speaker-Leads, Einreichungen | `area_lead_speaker`, `programme_team` |
| Tickets, Reisekosten, Hotels, Reception | `area_lead_speaker`, `speaker_manager` |
| Anreise | dazu `area_lead_production` |
| Regie, Technik | `area_lead_production`, `production_team` (Technik auch `area_lead_speaker`) |
| Grafiken, Videos | `marketing_team`, `area_lead_speaker` |
| Partner, Initiativen | `area_lead_partner` |
| Volunteers | `area_lead_volunteers` |
| Catering | Produktion, Volunteers, Speaker |
| **Produktion** | `production_team`, `area_lead_production` |
| Ansprechpartner, Fristen, Wiki | alle Bereichsleitungen (Wiki auch Marketing) |
| Vokabular, Mail | nur `admin` |
| **Verwaltung**: Personen, Team, Rollen, Dubletten, Löschanträge | **nur `admin`** |

Die Zuordnung ist Arbeitsteilung, keine Technik — sie steht in einer Datei und ist eine Zeile weit änderbar. Was ein Bereichslead in seiner Domäne **tun** darf, entscheidet weiterhin die Datenbank (`is_partner_team()`, `can_edit_slot()` und so fort); dieses Gate sagt nur, welche Seite er öffnen kann.

## Datenbankrechte bleiben, wie sie sind

PORT1 ändert **keine** SQL-Prädikate. `has_role('admin')` erfüllt die Team-Prädikate wie bisher; ein Bereichslead, der eine Seite öffnen darf, bekommt dort trotzdem nur, was seine RPC ihm gibt. Die Oberfläche ist die zweite Schranke, nicht die erste.
