# Befund Talent 09.10.2026: QS-070 — Partner-Seite des Vokabular-Inventars

Gelesen aus Schema-Doku, Snapshot der Funktionen (`supabase/snapshot/functions/`), den Migrationen und dem Code (`app/(partner)`, `components/partner`); nichts geändert, keine Abfrage gegen die Live-Daten (Zahlen in Klammern = Einträge im Vokabular laut Befund 08.10., Teilnehmer-Seite siehe `docs/befund-part129-qs070-2026-10-08.md` §2). Ergänzt das Teilnehmer-Inventar für das Konzept von Plan.

## 1 · Was Partner heute angeben

| Ort im Partner-Portal | Speicherort | Was | Vokabulare | Gebunden / geprüft |
|---|---|---|---|---|
| **Interview Tables** (`/partner/interview-tables`, PART-046) | `session.format_details` (jsonb, je Tisch) | **Gesuchtes Profil** `target_profile`; dazu Freitext `job_title` (≤ 120), `job_posting_text` (≤ 2000), `job_posting_url` (https), `interview_mode` (single/group) | `occupation_status` (10), `career_level` (8), `study_field` (9) | ja: `check_format_details` prüft jeden Schlüssel gegen `is_vocab_key`, nur diese drei Felder erlaubt |
| **Company Tour, Stopp** (`TourStopp`, PART-048) | `company_tour_stop.target_profile` (jsonb) | dasselbe `target_profile`; dazu Kontakt, Adresse, Zeitfenster, Snacks, Hinweise, Fotoerlaubnis | dieselben drei | ja: `partner_update_tour_stop` prüft gegen dieselben Felder |
| **Hackathon-Challenge** (`/partner/hackathon`, HACK-015) | `hack_challenge.target_skills`, `target_study_fields` (text[]), `target_profile` (Freitext ≤ 500) | **Wunschprofil** | `skill` (15), `study_field` (9) | ja: `set_hack_challenge_profile`; Track `hack_track` (3) |
| **Masterclass** | `session.format_details` | nur `goodies_planned` (Angabe fürs Team) — **kein** Profil | — | — |
| **Side-Event** | `session.format_details` | `location_text`, `image_asset_id` — **kein** Profil | — | — |
| **Eure Daten** (`/partner/daten`) | `organization` | `industry` (14), `partner_category`, `description_de/en`; Adresse, Website | `industry`, `partner_category` | `industry` gebunden (Swapcard-Branche) |
| **„Wen sucht ihr?“ (PART-107)** | — | **nicht gebaut** (offen, wartet auf dieses Konzept): stellt ihr ein, je Eintrag Kategorie, Fachbereich, Freitext zur Rolle, mehrere Einträge | gewünscht: Kategorie (Entry Level, Trainee …), Fachbereich (IT, Marketing …) | — |
| **Masterclass/Company Tour/Side-Event/Interview Table als Format** | `session.format` | `session_format` (Typ des Formats) | — | ja |

Weitere Partner-Vokabulare ohne Matching-Bezug: `company_tour_type` (6, ADM-045 „welche Tour“, Zuordnung durch das Team), `partner_format` (9, gebuchte Formate).

## 2 · Befunde für das Matching

1. **Die Partner-Seite sucht heute nach anderen Feldern als die Hackathon-Seite — und beide nach anderen als das Matching-Kern-Vorschlag vom 08.10.** Interview Tables und Company Tour fragen `occupation_status` (Stand: Student, Berufstätig, …), `career_level` (Karrierestufe) und `study_field`. Die Hackathon-Challenge fragt `skill` und `study_field`. Der Vorschlag 08.10. nannte als Kern `study_field`, `skill`, `function_area` (Fachbereich) und `career_opportunities` (Kategorie). Gemeinsam ist heute **nur `study_field`**.
2. **`career_level` ist Selbstauskunft** („wo jemand steht“); Partner wollen oft das **Gesuchte** („Trainee“, „Werkstudium“) — das ist `career_opportunities` (10) am Teilnehmerprofil. Interview Tables fragen deshalb heute nach einem Feld, das das Gesuchte nur ungefähr trifft. Es gibt **kein** Feld „Fachbereich“ in den Partner-Profilen; `function_area` (16) kommt bei Speakern vor, am Teilnehmerprofil wird es nicht benutzt (Befund 08.10. Nr. 3).
3. **Zwei Speicherformen für dasselbe:** als jsonb `target_profile` (Interview Table, Stopp) mit Schlüsseln `occupation_status/career_level/study_field` und als getrennte Spalten `target_skills/target_study_fields` (Hackathon). Ein Abgleich müsste beide lesen; die jsonb-Form lässt sich erweitern (Whitelist in `check_format_details`/`partner_update_tour_stop`, je eine Stelle), die Spalten nicht ohne Migration.
4. **Whitelist an drei Stellen:** `check_format_details` (Interview Table), `partner_update_tour_stop` (Stopp) und die Oberfläche (`PROFIL_FELDER` in `components/partner/profil.ts`). Soll ein Feld dazukommen (`skill`, `function_area`, `career_opportunities`), sind es genau diese drei plus ein Test; das Vokabular selbst ist schon da.
5. **Masterclass und Side-Event haben kein Profil** (PART-140 will es für beide und für Company Tour/Interview Table nach dem Muster der Hackathon-Abfrage). Für Masterclass wäre `format_details` der Ort: `format_detail_keys('masterclass')` kennt heute nur `goodies_planned`.
6. **PART-107 braucht einen Ort:** mehrere Einträge je Organisation und Edition mit Kategorie, Fachbereich und Rolle — dafür gibt es keine Tabelle und keine Spalte (`job_title`/`job_posting_*` hängen an Interview-Tisch-Sessions, nicht an der Organisation). Vorschlag für das Konzept: eine Tabelle `org_hiring` (org_edition, `career_opportunity` aus `career_opportunities`, `function_area`, `role_text`, optional Skills/Studienfelder), damit das Wunschprofil **eine** Quelle hat und die Formate darauf verweisen oder sie überschreiben; Entscheidung bei Plan und Partner-Chat.
7. **Einwilligung:** Partner-Seiten greifen auf Bewerbungen zu (Interview Table, Tour-Wünsche `company_tour_wish`). PART-129 (Weitergabe als Pflichthaken, gebaut #403) gilt für die vier Formate; ein Matching **ohne** Bewerbung (Vorschläge aus dem Profil) bräuchte eine **eigene** Einwilligung (`consent_share` ≠ Bewerbungs-Weitergabe) — in der Teilnehmer-Befund §2 steht der Vorschlag.

## 3 · Folgerung für das Konzept (Vorschlag)

- **Ein gemeinsamer Kern** auf beiden Seiten: `study_field`, `skill`, `function_area`, `career_opportunities`; Partner tragen ihn je Eintrag (PART-107) oder je Format (PART-140) ein.
- **Interview Tables und Company Tour** auf den Kern umstellen oder erweitern: `career_level` → `career_opportunities` (Abbildung nötig, Bestand prüfen), `function_area` und `skill` hinzu; `occupation_status` bleibt als Filter.
- **Hackathon:** `hack_skill` in `skill` überführen (Befund 08.10. Nr. 1), danach ist die Challenge-Seite kongruent.
- Reihenfolge: Vokabular-Abbildungen und Whitelists (kleine Migration), dann Oberfläche je Format; PART-107 als eigener Baustein danach.

## 4 · Was ich nicht geprüft habe

Live-Bestände je Partner (wie viele Interview-Tische oder Stopps tragen heute ein `target_profile`), also ob eine Abbildung `career_level` → `career_opportunities` Datenbestand migrieren müsste: das ist eine Abfrage für Plan oder den Partner-Chat.
