# Admin-Abschnitte: wer sieht was (PORT1)

Seit dem 22.09.2026 gilt **Admin zuerst**: alle Team-Funktionen liegen unter `/admin`, unterschieden wird über Rollen. Die Tür (`requireArea("admin")`) lässt deshalb **jede Teamrolle** ein — der Schutz sitzt eine Ebene tiefer.

## Die drei Stellen

1. **`lib/admin-sections.ts`** — die einzige Quelle: welcher Abschnitt, welcher Pfad, welche Rollen. `roles: []` heisst **nur `admin`**.
2. **`requireAdminSection("<key>")`** in `lib/auth.ts` — das Gate jeder Seite, jeder Server-Action und jeder Admin-Route. Wer nicht darf, bekommt **404**, nicht 403: dass es die Seite gibt, ist für ihn keine Information.
3. **`app/(admin)/layout.tsx`** — die Navigation liest dieselbe Quelle. Eine Leiste, die auf eine 404 zeigt, wäre schlimmer als keine; eine Gruppe ohne sichtbaren Punkt verschwindet mit.
4. **`admin_section_role` in der Datenbank** (PORT1b) — dieselbe Zuordnung als Tabelle, damit SQL-Funktionen sie **fragen** können, statt die Rollenliste abzuschreiben. Sie ist eine **Spiegelung** von Punkt 1, keine zweite Quelle: `tests/admin-sections.test.ts` hält beide gegeneinander, und geschrieben wird sie nur per Migration.

## Einen Abschnitt hinzufügen

1. Schlüssel in `AdminSectionKey` und Zeile in `ADMIN_SECTIONS` ergänzen (Pfad unter `/admin/…`, Rollen **ohne** `admin`).
2. In der Seite `await requireAdminSection("<key>")` statt `requireArea("admin")`. Dasselbe in `actions.ts` — eine Server-Action ist ein eigener Einstieg von aussen, keine Fortsetzung der Seite.
3. Punkt in `app/(admin)/layout.tsx` über `eintrag("<key>", …)` einhängen.
3b. **Migrationsvorschlag** mit den Zeilen für `admin_section_role`: eine Zeile je Rolle **plus** eine `admin`-Zeile (die macht die Tabelle zum vollständigen Katalog, damit `has_admin_section` einen Tippfehler von „darf nicht" unterscheiden kann). Ohne diesen Schritt schlägt `npm test` fehl — mit Angabe, welches Paar fehlt.
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

## Eine Seite, ein Abschnitt (ADM-054)

Reiter innerhalb einer Seite teilen die **Ansicht**, nicht die **Rechte**: Wer den Abschnitt hat, hat alle Reiter. Sobald verschiedene Leute mit den Teilen arbeiten, gehört jeder Teil in einen eigenen Abschnitt mit eigenem Menüpunkt — so wie die Produktion seit dem 25.09.2026 (`production`, `productionBooths`, `productionOrders`, `productionFiles`).

Die Rollen bleiben dabei zunächst **dieselben**. Der Gewinn ist nicht die andere Vorgabe, sondern dass sich ab jetzt eine einzelne Seite über `/admin/rollen` öffnen oder schliessen lässt, ohne die anderen anzufassen.

**Bevor ein neuer Abschnitt entsteht, prüfen, ob es ihn schon gibt.** Catering hatte unter der Produktion einen Reiter *und* einen eigenen Abschnitt mit derselben Ansicht — zwei Seiten, zwei Rollenlisten, eine Wahrheit zu viel. Geblieben ist der eigene Abschnitt; die alte Adresse leitet über `next.config.ts` dorthin, nicht über eine Seite mit `redirect()`: die bräuchte ein eigenes Gate und damit eine dritte Rollenliste.

## Datenbankrechte: `has_admin_section(key)` (PORT1b)

PORT1 änderte **keine** SQL-Prädikate; die Oberfläche war die zweite Schranke, nicht die erste. Das blieb an einer Stelle unbefriedigend: RPCs, die genau die Frage eines Abschnitts stellen, schrieben dessen Rollenliste ab — `can_edit_next_up()` und `can_view_community_events()` trugen den Hinweis „dieselbe Rollenliste" im Kommentar. Zwei Abschriften derselben Regel laufen auseinander, und zwar zur falschen Seite: die Seite wäre zu, die Schreib-RPC offen.

Seit PORT1b gibt es dafür **ein Prädikat**:

```sql
select has_admin_section('nextUp');
```

Es beantwortet die Frage in derselben Reihenfolge wie `mayEnterAdminSection` in `lib/admin-access.ts`: `admin` sieht alles → Ausnahme für die Person → Ausnahme für eine Rolle (mehrere Rollen: eine offene genügt) → Vorgabe aus `admin_section_role`. Ein **unbekannter Schlüssel** scheitert laut mit `22023 unknown_section`, wie `adminSection()` in TypeScript — ein stilles „nein" ließe die Funktion für immer zu, ohne dass jemand die Ursache fände.

`my_admin_sections()` liefert alle Abschnitte mit der Antwort für die angemeldete Person in **einer** Abfrage — für Oberflächen, die nicht jede Seite einzeln fragen wollen.

**Wann welches Prädikat.** `has_admin_section` gehört in RPCs, deren Recht sich mit dem Abschnitt deckt. Die Bereichs-Prädikate (`is_speaker_team`, `is_partner_team`, `is_production_team` …) bleiben, wo eine Funktion eine **fachliche** Zugehörigkeit meint und nicht den Zugang zu einer Seite — die beiden Fragen sehen sich ähnlich, sind aber nicht dieselbe, und sie zusammenzulegen hieße, ein Recht an eine Navigation zu hängen.

Die Tabelle hat RLS und **keine** Grants für `authenticated`: gelesen wird nur über die beiden Funktionen, geschrieben nur per Migration. Ausnahmen pflegt Konrad weiter über `/admin/rollen` (`admin_section_override`), damit es dafür genau einen Weg gibt.
