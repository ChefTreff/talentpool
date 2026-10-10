# Konzept: Matching Partner ↔ Teilnehmende (QS-070)

Stand 09.10.2026, Architektur-Session. **Vorschlag vor dem Bau** — Konrads Go (K-94) entscheidet, was davon gebaut wird. Grundlage: Konrads Gedanken vom 05.10. (Durchgang Partner-Portal mit Leopold), die zwei Inventare `docs/befund-part129-qs070-2026-10-08.md` (Teilnehmer-Seite, Talent-Chat) und `docs/befund-qs070-partnerseite-2026-10-09.md` (Partner-Seite, Talent-Chat), PART-107 („Wen sucht ihr?“), PART-140 (Wunschprofil je Format), PART-129/K-78 (Weitergabe in Bewerbungen), K-72 (Vereinbarung zur Weitergabe), ADM-083 (Fragenkatalog).

## 1 · Ziel und Leitplanken

- **Partner** sagen, wen sie suchen; **Teilnehmende** sagen, was sie können und wollen. Daraus entstehen **Vorschläge**: dem Partner passende Profile, der Teilnehmerin passende Partner und Formate. Kein Automatismus ersetzt die Bewerbung — ein Vorschlag ist eine Einladung, sich zu bewerben oder anzusprechen.
- **Keine Daten ohne Einwilligung.** Die Weitergabe in Bewerbungen (PART-129, Weg B, K-78) deckt nur die Bewerbung ab. Ein Vorschlag **ohne** Bewerbung braucht eine **eigene, versionierte Einwilligung** (`matching`), getrennt vom Bewerbungs-Haken; ohne sie erscheint niemand in einer Partner-Liste. Namen, Foto und Kontakt erst, wenn die Person selbst den Schritt macht (Bewerbung oder „Partner darf mich ansprechen“).
- **Ein gemeinsames Vokabular** auf beiden Seiten, sonst gibt es keine Schnittmenge. Heute ist nur `study_field` gemeinsam (Befund 09.10. Nr. 1).
- **Erklärbar statt klug:** jeder Treffer nennt, warum er passt („Studienfeld, 2 Skills, Praktikum“). Keine Gewichte, die niemand nachvollziehen kann; kein maschinelles Lernen; keine externen Daten.

## 2 · Der gemeinsame Kern

| Schlüssel | Vokabular (Einträge) | Teilnehmer-Seite heute | Partner-Seite heute | Soll |
|---|---|---|---|---|
| **Studienfeld** | `study_field` (9) | `person.study_field` | `target_profile.study_field`, `hack_challenge.target_study_fields` | bleibt, Vorbild |
| **Skills** | `skill` (15) | `person_interest` (TAL-013) | `hack_challenge.target_skills` | bleibt; `hack_skill` (6) wird auf `skill` abgebildet und läuft aus |
| **Fachbereich** | `function_area` (16) | am Profil ungenutzt | fehlt; `company_tour_type` (6) meint dasselbe | neu als Liste am Profil (`person_interest`) und im Wunschprofil; `company_tour_type` bleibt Team-Zuordnung der Tour, kein Matching-Feld |
| **Kategorie (das Gesuchte)** | `career_opportunities` (10: Praktikum, Werkstudium, Abschlussarbeit, Trainee, Einstieg …) | `person_interest` | fehlt; Interview Tables/Stopps fragen `career_level` (Selbstauskunft) | neu im Wunschprofil; `career_level` bleibt Selbstauskunft am Profil und zählt nicht fürs Matching |

Freiwillige **Filter** (kein Kern, nur Einschränkung): `occupation_status` (bleibt auf der Partner-Seite), `job_openness` (Teilnehmende: „aktuell nicht offen“ ⇒ keine Vorschläge an Partner), `availability`, `mobility`.

**Nicht Teil des Matchings:** die fünf Themenlisten (`interests`, `session_topic`, `award_topic`, `topic_cluster`, `notification_topic`) — sie steuern Programm und Benachrichtigungen; die Abbildung `interests` ⇄ `session_topic` (Befund 08.10. Nr. 2) ist eine eigene, kleine Aufgabe für die Programm-Empfehlung, nicht für das Partner-Matching.

## 3 · Partner-Seite: eine Quelle, Formate verweisen darauf

- **`org_hiring`** (neu, PART-107): je Organisation und Edition mehrere Einträge — `career_opportunity` (Kategorie), `function_area` (Fachbereich), `role_text` (Freitext ≤ 120, „Werkstudent Data Engineering“), optional `skills[]`, `study_fields[]`, `published` (Partner schaltet frei), `created_by`. Rechte: `partner_can_edit`; Team sieht alles. Das ist der Ort, der heute fehlt (Befund 09.10. Nr. 6).
- **Formate (PART-140):** Interview Table, Tour-Stopp, Masterclass und Challenge tragen **dasselbe Wunschprofil** — Vorgabe aus `org_hiring` (die Einträge der Organisation), je Format überschreibbar. Speicherform bleibt `target_profile` (jsonb) für Tisch/Stopp/Masterclass (`format_detail_keys('masterclass')` erhält `target_profile`), erweitert um `skill`, `function_area`, `career_opportunities`; `career_level` wird nicht mehr angeboten. Hackathon behält `target_skills`/`target_study_fields` (Spalten) und bekommt `target_function_areas`/`target_opportunities` nur, wenn die Challenge-Seite es braucht — zunächst nicht.
- **Whitelist an genau drei Stellen** (`check_format_details`, `partner_update_tour_stop`, `PROFIL_FELDER`) plus Test: dort kommen die drei Schlüssel dazu, `career_level` fällt aus der Whitelist.
- **Bestand:** 20 Tour-Stopps mit `target_profile`, 0 Interview Tables, 1 Challenge (Live-Zählung 09.10., vermutlich Testdaten). Abbildung `career_level` → `career_opportunities` ist bei 20 Zeilen eine Datenkorrektur in der Migration, keine Oberfläche nötig.

## 4 · Teilnehmer-Seite

- Profil bekommt **Fachbereich** (`function_area`, mehrere) als Liste wie Skills; `career_opportunities` und `study_field` bleiben, `skill` bleibt. Onboarding fragt die vier Kernfelder in einem Schritt („Was suchst du?“), alles freiwillig.
- **Einwilligung `matching`** (`consent_record`, Version, Text K-72-Stil): „Partner dürfen mein Profil ohne Namen und Foto als Vorschlag sehen; Name und Kontakt erst, wenn ich mich bewerbe oder den Partner freigebe.“ Opt-in, nicht vorangekreuzt, jederzeit widerrufbar (Widerruf = sofort aus allen Listen). `job_openness` = „aktuell nicht offen“ wirkt wie kein Opt-in.
- **„Passende Partner“** unter `/programm` oder `/start`: Partner mit freigegebenen `org_hiring`-Einträgen, sortiert nach Schnittmenge, je Partner die Formate, bei denen man sich bewerben kann; ein Klick führt zur Bewerbung (dort gilt PART-129). Teilnehmende sehen Partnerdaten, die ohnehin öffentlich sind (Name, Branche, Beschreibung, Einträge).

## 5 · Treffer und Darstellung

- **Treffer** = Schnittmenge der vier Kernfelder zwischen einem `org_hiring`-Eintrag (oder Format-Profil) und einem Profil, gezählt je Feld; ein Profil passt, wenn mindestens **zwei** Felder übereinstimmen oder Kategorie **und** Fachbereich. Reihenfolge: Zahl der Felder, dann Zahl der Skills, dann Aktualität des Profils. Keine Gewichte; die Schwelle steht in einer Funktion, nicht in der Oberfläche.
- **Partner sieht** je Treffer eine **anonyme Karte**: Studienfeld, Skills, Fachbereiche, Kategorie, Semester/Stand (Selbstauskunft), „passt wegen …“. **Kein** Name, Foto, Kontakt, Hochschule, Freitext. Dazu zwei Zahlen: „N passende Profile, davon M mit Bewerbung bei euch“. Aktion: „Zu unserem Format einladen“ erzeugt eine **Einladung an die Person** (Portal-Nachricht/Mail aus unserer Warteschlange, Absender ChefTreff, Partner namentlich genannt) — der Partner erfährt erst bei Bewerbung oder Freigabe, wer es ist. Keine Exporte, kein CSV.
- **Teilnehmerin sieht** die Partner-Karte mit den Einträgen und den Formaten; Einladungen erscheinen in `/meine` mit „Bewerben“ / „Partner darf mich ansprechen“ (gibt Name und E-Mail frei, Nachweis in `consent_record`, einmalige Kontaktaufnahme wie K-72) / „Ablehnen“.
- **Team/Admin** (ADM-083): der Fragenkatalog zeigt die vier Kernfelder als Pflichtbestandteil der Bewerbungsfragen je Format („Bewerbungsfragen“, PART-145), Admin-Übersicht „Matching“ je Edition: Partner mit Einträgen, Zahl der Opt-ins, Treffer je Partner, Einladungen und Antworten — nur Zahlen und Namen, die das Team ohnehin sieht.

## 6 · Datenmodell-Kurzfassung (Migrationen, je als Vorschlag mit Test)

1. **Vokabular und Whitelists** (Partner-Chat mit Talent-Chat): `hack_skill` → `skill` (Abbildung 6 → 15 in `person_interest`, Hackathon-Bewerbung und Teamsuche auf `skill`; `hack_skill` inaktiv), `target_profile`-Whitelist um `skill`, `function_area`, `career_opportunities`, ohne `career_level` (Datenkorrektur der 20 Stopps), `format_detail_keys('masterclass')` + `target_profile`, `function_area` als Liste am Profil (`person_interest`-Bindung). Keine neue Tabelle.
2. **`org_hiring`** (Partner-Chat, PART-107): Tabelle mit RLS (Lesen: Organisation, Team, und — nur `published` — authenticated mit Opt-in; Schreiben nur über `set_org_hiring`), Audit `org_hiring.*` ohne Personenbezug.
3. **Einwilligung und Treffer** (Talent-Chat mit Plan): `consent_record` Art `matching` (Version 1, Text DE/EN), `set_matching_consent(bool)`; Lesefunktionen `matching_profiles_for_org(org_edition, hiring_id)` (Partner mit Bearbeitungsrecht und Team; liefert **nur** die anonymen Felder und eine opake Treffer-Id, nie `person`-Spalten direkt; SECURITY DEFINER, gepinnt), `matching_partners_for_me()` (eigene Person), `invite_match(hiring_id, match_id)` (Partner; erzeugt Einladung über die Mail-Warteschlange, Audit mit `person_id`, ohne Adresse), `respond_match_invite(invite_id, action)` (Person). Treffer-Id ist ein Hash aus Person, Eintrag und Edition — kein Rückschluss auf `person.id`.
4. **Oberfläche** nach Design-Muster (Karte ohne Namen, „passt wegen“-Zeile, Einladungs-Dialog); Admin-Übersicht.

Reihenfolge und Zuständigkeit: 1 → 2 → 3 → 4; jede Stufe ein PR; Stufe 1 ist auch ohne Matching nützlich (Vokabular wird sauber) und kann sofort nach Konrads Go beginnen.

## 7 · Fragen an Konrad (K-94)

1. **Eigene Einwilligung „Matching“** als Opt-in, getrennt vom Bewerbungs-Haken — ja? (Empfehlung ja; ohne Opt-in nur die Partner-Seite für Teilnehmende, d. h. „Passende Partner“ geht immer, „Passende Profile“ beim Partner nur mit Opt-in.)
2. **Anonyme Karten** beim Partner bis zur Bewerbung oder Freigabe — ja? (Empfehlung ja; das ist der Kern des Datenschutzes.)
3. **Einladung durch den Partner** über uns (Absender ChefTreff, Partner genannt, einmalig) — ja? (Empfehlung ja.)
4. **Kategorien in PART-107** = die zehn Einträge von `career_opportunities` (Praktikum, Werkstudium, Abschlussarbeit, Trainee, Einstieg …) und **Fachbereiche** = die 16 von `function_area` — reicht das, oder fehlen Einträge? (Liste im Admin → Vokabular.)
5. **Schwelle** „zwei Felder oder Kategorie + Fachbereich“ — in Ordnung als Start? (Empfehlung ja; nach der ersten Runde mit echten Daten nachziehen.)
6. **Reihenfolge:** Stufe 1 (Vokabular) sofort, Stufe 2 (PART-107) danach, Stufe 3/4 (Einwilligung, Treffer, Oberfläche) erst **nach dem Go-live**, da sie den Prozessstart nicht blockieren — einverstanden?

## 8 · Was ausdrücklich nicht kommt

Keine Weitergabe von Namen oder Kontaktdaten an Partner ohne Handlung der Person; keine Exporte; keine externen Daten (LinkedIn-Scraping, Swapcard-Profile); keine Bewertung von Personen durch Partner; kein Matching für Volunteers oder Speaker (eigene Prozesse).

## 9 · Stand der Umsetzung (Partner-Chat, 10.10.2026)

- **K-94 beantwortet** (Konrad 09.10., „wie empfohlen“): Stufe 1 und 2 baut der Partner-Chat, Stufe 3/4 nach dem Go-live.
- **Stufe 1, Teil A (Partner-Seite): gebaut #480** (0306 `v6_matching_vokabular`). Abweichungen und Befunde gegenüber §3 und §6: die Whitelist von `target_profile` steht an **vier** Stellen (`check_format_details`, `partner_update_tour_stop`, `PROFIL_FELDER`, `targetProfileLabels` auf der Talent-Programmseite), nicht an drei; der Bestand ist leer — alle 21 Tour-Stopps haben `target_profile = {}`, keine Session hat eines, die „Datenkorrektur der 20 Stopps“ entfällt (der Helfer `matching_career_level_entfernen()` läuft trotzdem einmal, defensiv); `career_opportunities` enthält `nicht-interessiert` („Ich bin aktuell nicht interessiert an Jobangeboten“) — ein Wert der Teilnehmerseite, im Wunschprofil **gesperrt** (Datenbank und Oberfläche); die Masterclass trägt `target_profile`, ihre Maske kommt mit PART-140 in Stufe 2.
- **Stufe 1, Teil B (Teilnehmer-/Hackathon-Seite): gebaut #483 und #485** (Talent-Chat, 0308 und 0309; Vorgabe unten blieb die Grundlage). Vorgabe für die Abbildung `hack_skill` → `skill`: frontend/backend → `programming`, data → `data_analysis` + `ai_ml`, design → `design`, business → `strategy` + `communication`, hardware ohne Abbildung (nie benutzt, kein neuer `skill`-Eintrag). Bestand: 1 Team (`looking_skills` frontend, backend), 2 Bewerbungen ohne Skills; `apply_hackathon` und `set_hack_team_looking` prüfen noch gegen `hack_skill`. `function_area` am Teilnehmerprofil über `person_interest`.
- **Stufe 2a** (`org_hiring`, PART-107): **geplant #500** (Migration `v6_org_hiring`). Plan-Go 10.10. mit den Entscheidungen: kein eigenes Feld „stellt ihr ein“ — kein Eintrag heißt „nein“; `published` („Teilnehmenden zeigen“) schon in 2a, Voreinstellung aus, wirksam erst mit dem Matching; Kategorie (`career_opportunities`, ohne `nicht-interessiert`) und Fachbereich (`function_area`) Pflicht, Freitext zur Rolle ≤ 120 optional, Skills und Studienfelder optional, höchstens zehn Einträge je Organisation und Edition; Platzierung als fünfter Block auf „Eure Daten“ bis K-95. Eine Tabelle (RLS, kein Tabellenrecht für `anon` und `authenticated`), drei Funktionen (`partner_org_hiring`, `set_org_hiring`, `delete_org_hiring`), Audit ohne Freitext, Admin-Weg unter `/admin/partner/<Organisation>`.
- **Stufe 2b** (PART-140): **Vorbelegung statt Verweis** — „Aus ‚Wen sucht ihr?‘ übernehmen“ füllt das `target_profile` von Masterclass, Tour-Stopp und Interview Table; kein Fremdschlüssel vom Format auf `org_hiring`, das Format behält sein eigenes `target_profile`. Folgt als eigener PR nach „Migration live“ von 2a, zusammen mit der Maske `target_profile` an der Masterclass.
