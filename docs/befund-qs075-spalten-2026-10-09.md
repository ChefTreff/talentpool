# Befund QS-075 (Vorarbeit): ungenutzte Spalten in `person`, `organization`, `org_edition`

Stand 09.10.2026, Admin-Chat, im Auftrag von Plan. **Nur lesen:** keine Migration, kein Entfernen. Das ist die Vorarbeit für das Inventar in QS-075 (`docs/feedback/querschnitt.md`); die Entscheidung, was gestrichen wird, liegt bei Plan und Konrad.

Verwandt: `docs/security-check-2026-09.md` §4 (Feldinventur 09/2026, 16 Spalten ohne Fundstelle), `docs/feld-matrix-2026-09.md`, `docs/talent-felder-vorschlag.md`.

## 1 · Methode und ihre Grenzen

- Spaltenliste aus `docs/schema.md` (Stand 08.10. 14:31 UTC): `person` 48, `organization` 23, `org_edition` 23 Spalten.
- Je Spaltenname eine Wortsuche (ganzes Wort) in `app/`, `lib/`, `components/`, `scripts/`, `supabase/snapshot/functions/` (780 Live-Funktionen), `supabase/migrations/` (ohne `vorschlag/`), `tests/`, `docs/`.
- **Kein Leser** sind: `anonymize_person` (setzt auf null), `person_merge_core` (listet Spalten beim Zusammenführen), `person_vocab_guard` (prüft nur Vokabularwerte), Übersetzungsdateien, `gen-feld-matrix`, `testdaten-konrad`, `verify-*`. Sie zählen nicht als Nutzung.
- Grenzen: Die Wortsuche sieht nicht, **welche Tabelle** gemeint ist. Bei Allerweltsnamen (`type`, `slug`, `website`, `active`, `source`, `country`, `city`, `created_at`, `updated_at`, `deleted_at`) ist sie wertlos und bestätigt nur „kommt vor“. Einzeln geprüft habe ich `title`, `tier`, `source_first`, `notes_internal`, `pipeline_stage` und alle Spalten in §2 und §3. Dynamische Zugriffe (`row[spalte]`) und die Admin-Personenseite (`select("*")` auf `person`, `app/(admin)/admin/personen/[id]/page.tsx`) zeigen nur, was die Seite auch ausgibt; ich habe die Fundstellen dort einzeln gelesen.
- **Livedaten helfen kaum:** 348 Personen (fast nur Test- und Newsletterdaten), 4 Organisationen, 4 `org_edition`-Zeilen, kein Altdatenimport. Eine leere Spalte heißt hier also nicht „ungenutzt“. Die Zählung (nur „wie viele Zeilen sind nicht leer“, keine Werte) steht je Spalte unten.

## 2 · Spalten ohne jede Nutzung im Betrieb (Kandidaten zum Streichen)

| Tabelle · Spalte | Befund | Zeilen mit Wert | Zu beachten beim Entfernen |
|---|---|---|---|
| `person.invite_code` | Weder Leser noch Schreiber. Kommentar der Anlage: „Referral (roh übernommen, keine Logik)“. Nur `anonymize_person` setzt sie auf null. | 0 | **Vor dem Altdatenimport klären:** „roh übernommen“ heißt, der Import war als Ziel vorgesehen. `docs/segmentierung-2026-09.md` (Zeilen 85/86) nennt sie als „Wer hat geworben“. |
| `person.referred_by_person_id` | Nur `person_merge_core` (Verweise beim Zusammenführen umhängen). Kein Weg, sie zu füllen (`docs/talent-felder-vorschlag.md` B1: „Spalten liegen, Weg fehlt“). | 0 | Fremdschlüssel auf `person`, Index `person_referred_by_idx`; `person_merge_core` und `anonymize_person` anpassen. |
| `person.is_ambassador` | Nur `person_merge_core`. | 348 (alle `false`, der Standardwert) | Wie oben; Spalte ist `not null default false`. |
| `person.engagement_score` | Nur `person_merge_core`; `scripts/verify-write.mjs` nutzt sie als Beispiel für „Spalte ist für Nutzer gesperrt“. Kommentar der Anlage: „berechnet (später), keine Logik jetzt“. | 0 | Beispiel in `verify-write.mjs` auf eine andere gesperrte Spalte umstellen. |
| `organization.logo_dark`, `organization.logo_light` | Kein Schreiber (weder App noch Funktion). Gelesen nur in `partner_overview` (wird in die Rückgabe kopiert) und im Typ `partner/types.ts`; keine Oberfläche gibt sie aus. Logos leben über `partner_asset` und die Logo-Wand. | 0 | `partner_overview` (Live-Fassung aus dem Snapshot!) und `partner/types.ts` anpassen. |
| `org_edition.notes_internal` | Kein Leser, kein Schreiber. Die Treffer im Code gehören zu `volunteer_profile.notes_internal`, nicht hierher. | 0 | Reine Spaltenentfernung. |

Diese sechs Gruppen (acht Spalten) sind ohne Daten und ohne Funktion. Die Entscheidung „perspektivisch behalten“ oder „streichen“ ist fachlich: Empfehlungs-/Botschafterlogik (`invite_code`, `referred_by_person_id`, `is_ambassador`) ist als Wunsch dokumentiert (TAL-005ff.), aber nie gebaut.

## 3 · Gelesen, aber (fast) nie gefüllt: kein Streichen, sondern ein Fund

| Spalte | Befund | Wirkung |
|---|---|---|
| `person.linkedin_normalized` | Einziger Leser: `duplicate_scan` (Signal „LinkedIn“, Gewicht 0,9). Schreiber: nur das Testdatenskript und die Import-Staging-Tabelle. **Nichts normalisiert die Adresse, wenn ein Mensch `linkedin_url` im Portal oder im Admin einträgt.** | Das Dubletten-Signal „LinkedIn“ greift nur für importierte Personen, nicht für Personen aus dem Portal. 2 Zeilen gefüllt. |
| `person.phone_e164` | Leser: `duplicate_scan` und das Speaker-Profil. Schreiber: nur das Speaker-Profil (`update_my_speaker_profile`, Speaker-Formular). Das Talentprofil und die Stammdaten im Admin (`update_person_master`, ADM-092, von mir) schreiben `phone`, nicht `phone_e164`. | Das Signal „Telefon“ in `duplicate_scan` greift nur für Speaker und Importierte. 0 Zeilen gefüllt. |

Empfehlung: **nicht entfernen**, sondern beim Speichern ableiten (Trigger oder in den Schreibfunktionen) und einmalig nachfüllen. Dann wirkt `duplicate_scan` auch für Portal-Personen. Das ist ein Baustein für Admin- oder Talent-Chat; ich bereite ihn nicht vor, ohne dass Plan es zuteilt.

## 4 · Nur Eingabe und Anzeige, keine Auswertung

Spalten, die ein Mensch im Talentprofil oder Onboarding einträgt und die der Admin auf der Personenseite sieht, die aber **keine Funktion, kein Filter, kein Export und keine Suche** verwendet:

| Spalte | Eingabe | Admin-Anzeige | Auswertung |
|---|---|---|---|
| `person.work_experience` | Talentprofil, Onboarding | Personenseite | keine (nur Vokabularprüfung) |
| `person.employer_type` | Talentprofil | Personenseite | keine |
| `person.study_program` | Talentprofil | Personenseite | keine |
| `person.startup_phase` | Talentprofil | Personenseite | keine |
| `person.self_assessment` | Talentprofil | Personenseite | keine |
| `person.job_openness`, `person.mobility` | Talentprofil | Personenseite | keine (nur Vokabularprüfung) |
| `person.function_area`, `person.graduation_year` | Talentprofil | Personenseite | nur die Hackathon-Bewerbungsliste (`hack_applications_admin`) |
| `person.cv_path` | Talentprofil (`set_my_cv`) | Personenseite (Signed URL) | keine |

Alle sind **Talent-Schwelle** (Entscheidung 08.09., Berufserfahrung, Studienfeld, Studiengang) oder Matching-Daten für das spätere Talentpool-Angebot an Partner. Sie sind erfasst, aber heute nicht ausgewertet; das ist beabsichtigt und kein Streichkandidat. Falls QS-075 den Maßstab „nur genutzt oder perspektivisch gebraucht“ anlegt: hier ist die Perspektive die Partnersuche im Talentpool, die Plan bestätigen müsste.

Weitere Spalten nur mit Schreib- und Anzeigeweg: `person.source_first` (gelesen nur von `luma_lead_stats`, nirgends in der Oberfläche), `org_edition.logo_whitening_consent_by` (nur von `set_logo_whitening_consent` geschrieben, nie gelesen oder angezeigt; **Rechtsnachweis „wer hat zugestimmt“, behalten**, ggf. in der Logo-Verwaltung anzeigen).

## 5 · Mögliche Doppelung (prüfen, nicht streichen)

| Spalten | Frage |
|---|---|
| `person.study_program` (Vokabular) und `person.study_program_label` (Freitext) | Bewusst zwei Ebenen (Entscheidung 08.09., Ebene 2 und 3). Kein Streichkandidat; im Formular verständlich benennen. |
| `person.linkedin_url` / `linkedin_normalized`, `person.phone` / `phone_e164` | Abgeleitete Paare (gewollt), aber die abgeleitete Spalte wird nicht gepflegt (siehe §3). |
| `org_edition.hubspot_deal_id` und Tabelle `partner_deal` | Beide führen die Deal-Id. Die Spalte liest `partner_admin_overview` (Partnerliste), die Deal-Liste im Detail kommt aus `partner_deals`. Prüfen, ob die Spalte nach dem HubSpot-Sync noch gebraucht wird (Partner-Chat). |
| `person.availability` (Talent) und `volunteer_profile.availability` | Gleicher Name in zwei Tabellen, verschiedene Bedeutung; kein Fund, nur Vorsicht bei Wortsuchen. |

## 6 · Beim späteren Entfernen nachziehen (Liste für Plan)

- **Funktionen aus dem Snapshot ändern** (`docs/db-konventionen.md` §1): `anonymize_person` (nullt `invite_code` und viele Spalten, Reihenfolge der Spaltenliste prüfen), `person_merge_core` (Spaltenliste `is_ambassador`, `engagement_score`, `referred_by_person_id`, `source_first`), `partner_overview` (`logo_dark`, `logo_light`); danach `sh scripts/db.sh fn-diff` (jede verschwindende Zeile erklären können).
- **Tests und Skripte:** `scripts/verify-write.mjs` (`engagement_score`), `tests/` mit Spaltenlisten (Quelltext-Tests auf Migrationen zählen Muster, siehe PORT4b-Schwelle), `docs/feld-matrix-2026-09.md` neu erzeugen (`scripts/gen-feld-matrix.mjs`), `docs/schema.md` neu erzeugen.
- **Rechte:** Spalten-Grants, die diese Spalten nennen, mit entfernen (`select … from information_schema.column_privileges`).
- **Daten:** Alle Kandidaten in §2 haben heute **keine Werte**; ein Löschkonzept ist damit jetzt nicht nötig. **Nach dem Altdatenimport neu zählen**, und `invite_code` vorher gegen den Importplan prüfen. Die Migration soll vor dem Import laufen oder gar nicht, sonst geht „roh übernommener“ Bestand verloren.
- Spalten mit Personenbezug werden nie ohne Löschkonzept entfernt (Auftrag QS-075); hier betrifft das nur `invite_code` und `referred_by_person_id`, beide leer.

## 7 · Zusammenfassung für die Entscheidung

1. **Sofort streichbar nach Plans Ja** (leer, kein Leser, kein Schreiber): `organization.logo_dark`, `organization.logo_light`, `org_edition.notes_internal`.
2. **Streichen oder bauen** (Empfehlungslogik nie gebaut, leer): `person.invite_code`, `referred_by_person_id`, `is_ambassador`, `engagement_score`; nach Konrads Entscheidung zur Empfehlungs-Kampagne und vor dem Altdatenimport.
3. **Behalten und reparieren:** `person.linkedin_normalized`, `person.phone_e164` (nicht gepflegt, Dubletten-Signale greifen für Portal-Personen nicht).
4. **Behalten, perspektivisch:** die Talentprofil-Felder aus §4; `logo_whitening_consent_by` (Nachweis).
5. Für den Rest der 94 Spalten habe ich mindestens eine Fundstelle außerhalb der Pflegefunktionen gefunden; bei Spalten mit Allerweltsnamen (§1) ist das nur ein Hinweis, kein Beweis.
