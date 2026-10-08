# Vorschlag PART-138 · „Eure Bühne“ — gebrandete Bühne neben der Standbühne

Stand 08.10.2026 (abends), Partner-Chat. **Befund und Vorschlag, nichts gebaut** (Auftrag von Plan: vor der Pause nur Befund und Arbeitsteilung mit dem Speaker-Chat). Code geprüft auf `main` (c85436ed, mit 0274 `v6_buehnen_stammdaten`), Live-Daten nur gelesen.

## Anlass

PART-138 (Konrad & Leopold 05.10.): Partner mit dem Produkt „Bühnen-Branding“ branden eine unserer Bühnen und geben Inhalte ein. Das Produkt soll die Seite freischalten, aus „Standbühne“ wird **„Eure Bühne“**. Standbühne und gebrandete Bühne sind zu unterscheiden: **Speaker einer gebrandeten Bühne sind normale Speaker** (Speaker-Portal, Pipeline, Onboarding), **Standbühnen-Gäste bleiben Gäste** (PART-081/091). Das Datenmodell lag mit ADM-085 vorab bei Plan — es ist seit 0274 live: `stage.kind` (generiert aus `type` und `partner_org_id`: `main`, `branded`, `booth`, `masterclass`, `interview_table`, `side_event`), `stage.valid_days`, `stage_blocked_time`. PART-138 liest `kind`.

## Befund

| Was | Stand heute |
|---|---|
| Seite `/partner/buehne` („Standbühne“) | Bühnen aus `my_partner_stages()`: Rolle `standbuehne_editor`, Scope `org` (über `stage.partner_org_id`) oder Scope `stage`. Darauf das Board (Rechte je Slot aus `can_edit_slot`), die Tabelle (PART-080) und der Reiter Gäste |
| Menüpunkt | `format_key = 'stage'` (live genau **ein** Produkt: I-79895 „Standbühne (18qm)“, vergibt `standbuehne_editor`) **oder** `has_stage` — in `partner_overview`: *irgendeine* aktive Bühne der Edition mit `partner_org_id` = Organisation, **jeder Art**, also auch Side-Event-Ort und Interview Table |
| „Stage Branding“ | vier Produkte: I-17188 Science, I-28763 Skills & Mindset, I-41996 Impact & Tech, I-52557 Insight Stage. Alle `format_key = 'branding'` (22 Produkte teilen ihn) und **ohne** `grants_role` — sie öffnen nur die Branding-Seite und geben keine Bühnenrolle |
| Gebrandete Bühne | `kind = 'branded'`: Bühne vom Typ `main`/`side` **mit** Partner. Live gibt es nur die Test-Bühne „Testdaten Partnerbühne“; die echten Hauptbühnen haben keinen Partner (ADM-106 bringt das Partnerfeld ins Bühnenformular) |
| Rechte auf einer gebrandeten Bühne (Rolle mit Scope `org`) | `can_edit_slot`: **ja** (jede Bühne mit `partner_org_id`). `can_edit_stage`: **nein** (Scope `org` gilt nur für `partner_booth`). Folge: der Partner kann **vorhandene** Slots bearbeiten, aber keine anlegen (`create_slot`) und keinen auf eine andere Bühne ziehen (`move_slot`) |
| Gäste | `partner_assign_stage_guest` ordnet Gäste nur Slots einer `partner_booth`-Bühne zu — für gebrandete Bühnen schon gesperrt |
| Speaker | `partner_add_speaker` verlangt `session.partner_org_id` = Organisation und ein Talk-Format; legt einen **regulären** Speaker an (Lead, `created_by_org_id`, Betreuung = Bühnenleitung, sonst offen → Liste „Neue Speaker“, 0273). Sessions, die das Team auf einer gebrandeten Bühne anlegt, tragen `partner_org_id` nicht von selbst — der Partner könnte dort keine Speaker eintragen |

## Was fehlt

| Nr. | Lücke |
|---|---|
| G1 | **Zugang:** das Produkt „Stage Branding“ öffnet die Seite nicht. Nur `has_stage` tut es (das Team weist die Bühne zu) — und das zählt auch Flächen für Side-Event und Interview Table, sodass „Standbühne“ im Menü steht, wo es keine gibt |
| G2 | **Rolle:** Stage Branding vergibt `standbuehne_editor` nicht |
| G3 | **Name:** „Standbühne“ in Menü, Seitentitel und Texten |
| G4 | **Speaker:** `partner_add_speaker` greift nur bei Sessions mit `partner_org_id`; auf einer gebrandeten Bühne trägt die Session ihn nicht |
| G5 | **Seite:** zeigt für jede Bühne den Reiter Gäste; auf einer gebrandeten Bühne wären das die falschen Leute |

## Vorschlag

Klein halten: keine neue Tabelle, keine neue Spalte.

1. **Zugang (G1, G2) ohne Code für den Anfang:** die vier Stage-Branding-SKUs bekommen `grants_role = 'standbuehne_editor'` (Feld im Produkteditor, Admin → Partner → Produkte; `sync_granted_roles` vergibt die Rolle beim Buchen, Scope `org`). Welche unserer Bühnen der Partner brandet, trägt das Team im Bühnenformular als Partner ein (ADM-106). Mit Rolle **und** Zuweisung steht „Eure Bühne“ im Menü; vorher fehlt der Punkt, wie heute bei der Standbühne ohne zugewiesene Fläche.
   `has_stage` in `partner_overview` zählt künftig nur Bühnen mit `kind in ('booth', 'branded')` — keine Flächen für Side-Event und Interview Table mehr (Migration, auf Basis des Snapshots, fn-diff).
2. **Name (G3):** „Eure Bühne“ in Menü (`navStage`), Seitentitel und Einleitung; je Bühne die Art als Überschrift („Eure Standbühne“ / „Eure gebrandete Bühne“). Das Produkt heißt weiter „Standbühne (18qm)“.
3. **Speaker (G4, G5):** `partner_add_speaker` nimmt zusätzlich Sessions, deren Slot auf einer gebrandeten Bühne der Organisation liegt (`stage.kind = 'branded'` und `partner_org_id` = Organisation), sonst unverändert (Snapshot-Basis, fn-diff, Test). Auf der Seite zeigt eine gebrandete Bühne statt des Reiters Gäste die Speaker-Verwaltung der Talk-Seite (`SpeakerHinzufuegen`, `SpeakerKarte` wiederverwendet); die Standbühne behält ihre Gäste. `partner_assign_stage_guest` bleibt auf `partner_booth` — dort besteht die Sperre schon.
4. **Rechte (V4):** der Partner bearbeitet die vorhandenen Slots seiner gebrandeten Bühne (heute schon so), **legt aber keine an und verschiebt keine** — die Programmleitung und die Bühnenleitung behalten die Hoheit über unsere Hauptbühne. Dafür ist keine Änderung nötig.
5. **Test und Testdaten:** SQL-Test (Rollenwechsel Partner/Team: Speaker auf gebrandeter Bühne ja, auf fremder Bühne und auf Hauptbühne ohne Partner nein; Gast auf gebrandeter Bühne nein; `has_stage` für Side-Event-Fläche falsch, für Standbühne und gebrandete Bühne wahr). Konrads Test-Organisation bekommt die gebrandete Test-Bühne und die Rolle (Schritt in `testdaten-konrad.mjs`).

**Admin-Weg:** vorhanden — Partner der Bühne im Bühnenformular (ADM-106), `grants_role` im Produkteditor, Rolle und Bühne in der Organisationsseite `/admin/partner/<Organisation>`.

## Offen

**Q1 (Konrad):** Reicht es, dass „Eure Bühne“ erst mit der Zuweisung der Bühne im Menü steht (Produkt allein schaltet noch nichts frei)? Wörtlich „das Produkt schaltet die Seite frei“ ginge nur mit einem eigenen `format_key` für Stage Branding — der ist aber von der Branding-Seite belegt (ein Produkt hat einen Schlüssel).

**Q2 (Konrad/Programm):** Soll der Partner auf seiner gebrandeten Bühne auch **neue** Slots anlegen und verschieben dürfen? Empfehlung: nein (V4).

**Q3 (Plan):** `grants_role` an den vier SKUs als Datenpflege im Admin (Empfehlung) oder als Datenzeile in der Migration?

## Arbeitsteilung mit dem Speaker-Chat

| | Speaker-Chat | Partner-Chat |
|---|---|---|
| Besitzt | Speaker-Portal, Pipeline, Onboarding, „Neue Speaker“ (0273, `partner_created_speakers`), Board (`components/programme/`), Bühnen-Stammdaten (0274) | Partner-Seiten (`/partner/buehne`), `partner_add_speaker`, `partner_overview`, Gästeverwaltung |
| Für PART-138 | nichts zu ändern, solange ein Speaker einer gebrandeten Bühne wie jeder von einem Partner angelegte Speaker ankommt (Lead, `created_by_org_id`, Betreuung = Leitung der Bühne, Liste „Neue Speaker“). **Frage an euch:** soll die Pipeline Speaker gebrandeter Bühnen anders behandeln? | die drei Punkte oben; Board liest `kind` nur, wenn es die Partner-Sicht unterscheiden soll — dann sprechen wir es ab |

> **Rückmeldung des Speaker-Chats (08.10.2026 abends, vorläufig):** Aus Sicht der Pipeline **keine Sonderbehandlung** für Speaker gebrandeter Bühnen — sie sind normale Partner-Speaker (Liste „Neue Speaker“, Pipeline, Onboarding, Speaker-Portal und Zusage-Weg wie bei jedem von einem Partner angelegten Speaker), im Board kein eigener Hinweis. `stage.kind` darf der Partner-Chat lesen, `components/programme/` bleibt unberührt; soll die Partner-Sicht dort etwas nach `kind` unterscheiden, wird es vorher abgesprochen. **Zwei Punkte prüft der Speaker-Chat nach der Pause**, bevor sie festgeschrieben werden: (1) „Betreuung = `stage_lead_person_id`“ setzt `owner_person_id`; der Stage Lead sieht den Speaker aber nur mit der Stage-gebundenen Rolle `speaker_manager` auf dieser Bühne — passt beides in `manager_speakers` zusammen? (2) Soll „Neue Speaker“ die Herkunft „gebrandete Bühne“ zeigen (kleiner Zusatz an `partner_created_speakers`, nur wenn Konrad es will)? Bis dahin wird nichts gebaut, was davon abhängt.

## Reihenfolge

1. Antworten Q1–Q3 und Freigabe dieses Vorschlags.
2. Migration als Vorschlag unter `supabase/migrations/vorschlag/` mit Test (`partner_overview.has_stage`, `partner_add_speaker`); der PR trägt „Migration enthalten“.
3. Nach „Migration live“: Seite („Eure Bühne“, Speaker statt Gäste), Testdaten-Schritt, Runbook-Zeile.
