# Entwurf A1 · Formate und „Partner am Slot" — Tabellen, Vokabular, `format_details`

> **Zur Prüfung durch die Architektur-Session, vor den RPCs.** Grundlage: `docs/arbeitsauftrag-welle-6.md` §A1, Backlog PART-034 und PART-044–048, Konrads Walkthrough-Antworten vom 17.09.
> Dies ist der Schema-Teil. RPCs (`partner_create_session`, `partner_update_session`, `partner_add_speaker`, Export) kommen erst nach der Freigabe dieses Entwurfs.

---

## 0 · Was schon da ist (nicht neu bauen)

Drei Befunde aus dem Bestand, die den Entwurf kürzer machen als den Auftrag:

1. **`session_format` kennt schon `masterclass` (12), `company_tour` (13) und `side_event` (17).** Der Auftrag bat, `side_event` zu prüfen — es existiert seit dem Vokabular-Seed vom 08.09. **Nur `interview_table` fehlt.**
2. **`session_question` trägt bereits `approved_by`/`approved_at`** und erlaubt eigene Fragen neben Katalogfragen (`sq_catalog_or_custom`). Die Freigabe-Mechanik für „neue Frage auf Antrag" ist also im Ansatz vorhanden — siehe §6, wo ich vorschlage, auf die eigene Tabelle `question_request` zu verzichten.
3. **`product.format_key`** (seit `20260917190103`) sagt schon, welches Produkt welches Format öffnet. Der Anspruch lässt sich daraus zählen, ohne ein zweites Feld.

---

## 1 · Die eine Frage, die das Schema entscheidet: wo stehen die Zeiten?

Der Auftrag (A1.5) schreibt für Interview Tables „`starts_at`/`ends_at`" an die `session`. **Diese Spalten gibt es dort nicht.** Zeiten hängen im Datenmodell ausschließlich am `slot` (`slot.start_at`, `slot.end_at`), und `session.slot_id` ist `unique` — eine Session, ein Slot.

Damit stehen zwei Wege offen, und die Entscheidung prägt alles Weitere:

**Weg A — Zeiten bleiben am Slot (mein Vorschlag).**
Interview Tables und Side-Events bekommen echte `slot`-Zeilen. Dafür braucht jedes einen Ort, an dem es hängt:

- **Interview Table:** eine `stage` je Tisch (`stage.type` um `interview_table` erweitern, `partner_org_id` = der Partner). Der Ausschluss-Constraint `slot_no_overlap` verhindert dann von selbst, dass ein Partner zwei Gespräche zur selben Zeit an denselben Tisch legt — genau die Regel, die man sonst von Hand programmieren müsste.
- **Side-Event:** findet außerhalb statt (eigener Ort, eigene Zeit). Eine Pseudo-Bühne „Side-Events" je Edition, auf der die Slots liegen; der wirkliche Ort steht als Text in `format_details.location_text`. Der Überlappungsschutz stört hier: zwei Partner dürfen gleichzeitig Side-Events haben. Deshalb **je Partner eine eigene Side-Event-Bühne**, oder `slot_type = 'frame'` (Rahmenblöcke sind vom Constraint ausgenommen — siehe `slot_no_overlap`).

**Weg B — `session` bekommt eigene Zeitspalten** für Formate ohne Bühne.
Kürzer zu bauen, aber es entstehen zwei Wahrheiten über Zeiten: Das Programm-Board, die Regie, der Kollisionsprüfer und der Swapcard-Sync lesen `slot`. Ein Format, dessen Zeit woanders steht, fällt aus allen vieren heraus — und zwar still.

**Empfehlung: Weg A.** Der Preis ist eine Zeile mehr Struktur (`stage` je Tisch), der Gewinn ist, dass Interview Tables und Side-Events im Programm-Board, in der Regie und im Export ohne Sonderbehandlung auftauchen. Weg B spart zwei Tage und kostet sie bei jedem Werkzeug wieder, das Zeiten liest.

**Das braucht deine Entscheidung, bevor ich weiterschreibe.**

---

## 2 · Vokabular

| Vokabular | Schlüssel | Anmerkung |
|---|---|---|
| `session_format` | **`interview_table`** (neu, sort 19) | „Interview Table" / „Interview table"; die übrigen vier Formate existieren |
| `stage_type` | **`interview_table`** (neu, nur bei Weg A) | heute kennt `stage.type` `main` und `partner_booth` |
| `partner_format` | unverändert | seit `20260917190103`; `interview_table` steht dort schon, das Produkt legt Konrad an |

---

## 3 · Spalten an `session`

```sql
alter table session add column if not exists partner_org_id uuid references organization (id) on delete set null;
alter table session add column if not exists format_details jsonb not null default '{}'::jsonb;
create index if not exists session_partner_org_idx on session (partner_org_id) where partner_org_id is not null;
```

**`partner_org_id` neben `host_org_id` — warum beides?** `host_org_id` gibt es seit Welle 1 und steuert heute `/partner/bewerber` (`sessions_count`, `can_decide_session`). Zwei Felder für „gehört einem Partner" wären genau die Doppelung, die der Backend-Walkthrough sucht. Drei Möglichkeiten:

1. **`host_org_id` weiterverwenden**, kein neues Feld. Dann heißt „Partner am Slot" schlicht: der Partner ist Gastgeber. Für Masterclass, Company Tour, Side-Event und Interview Table trifft das zu.
2. **`partner_org_id` neu**, für den Fall Talk: Bei einer gebuchten Keynote ist der Partner **nicht** Gastgeber der Session — die Bühne gehört ChefTreff, der Partner stellt den Speaker. `host_org_id` würde dort eine falsche Aussage treffen (er würde in `sessions_count` zählen und `/partner/bewerber` öffnen, obwohl es bei einer Keynote nichts zu bewerben gibt).
3. Beides, mit klarer Bedeutung: `host_org_id` = „der Partner richtet es aus" (Formate mit Bewerbungen), `partner_org_id` = „der Partner hat es gebucht" (auch Talk).

**Empfehlung: 3, aber mit einer Regel im Kommentar** — `host_org_id` impliziert `partner_org_id`; wo beide gesetzt sind, müssen sie gleich sein (CHECK). Damit bleibt `sessions_count` unverändert und der Talk kommt dazu, ohne bei den Bewerbern aufzutauchen.

---

## 4 · `format_details` je Format

Feste Schlüssel, in der RPC geprüft; keine freien Schlüssel, kein Personenbezug außer den ausdrücklich genannten Firmenkontakten.

| Format | Schlüssel | Typ | Anmerkung |
|---|---|---|---|
| `side_event` | `location_text` | text ≤ 200 | der wirkliche Ort; die Slot-Bühne ist nur Struktur |
| | `image_asset_id` | uuid | Hintergrundbild fürs Programm, `partner_asset` derselben Org — Pfadprüfung wie `partner_asset_path_allowed` |
| `interview_table` | `job_title` | text ≤ 120 | |
| | `job_posting_text` | text ≤ 2000 | |
| | `job_posting_url` | text | CHECK auf `https://` |
| | `target_profile` | objekt | siehe unten |
| `company_tour` | `contact_name`, `contact_email`, `contact_phone` | text | **dienstliche** Angaben des Partners; `contact_email` ohne Domain-CHECK (fremde Firma), aber Hinweis in der Oberfläche |
| | `address` | text ≤ 300 | Anfahrt zum Standort |
| | `time_note` | text ≤ 200 | Vorschlag 11:30–14:00, anpassbar |
| | `snacks` | boolean | |
| | `notes` | text ≤ 1000 | Anmeldung am Empfang, Personalausweis, Sicherheitskleidung |
| | `target_profile` | objekt | |
| | `photos_allowed` | boolean | |
| `masterclass`, `keynote`, `panel` | — | | Titel, Beschreibung DE/EN und Sprache stehen an `session` |

**`target_profile`** nutzt dieselben Vokabular-Schlüssel wie das Teilnehmerprofil, damit die Auswahl auf beiden Seiten dasselbe bedeutet: `occupation_status[]`, `career_level[]`, `study_field[]`. Geprüft gegen `is_vocab_key`. **Kein Freitext** — sonst steht in der Bewerberliste, was niemand auswerten kann.

**Zur Company-Tour-Ansprechperson:** Das sind Kontaktdaten einer dritten Person beim Partner. Nach der Regeländerung vom 17.09. dürfen Ansprechpersonen mit Kontaktdaten im Portal stehen; hier trägt der Partner sie über **seine eigene Person** ein. Sie sind nur für das Team und die zugeteilten Teilnehmenden sichtbar — `programme_public` gibt `contact_*` nicht heraus (A1.9).

---

## 5 · Anspruch: wer darf welches Format anlegen

Der Auftrag sieht `partner_entitlement(org, format)` vor: Summe `org_product.qty` mit passendem `format_key` minus vorhandene Sessions. Zwei Präzisierungen:

- **Masterclass und Company Tour legt das Team an** (fester Slot), der Partner füllt sie. Dort zählt der Anspruch nichts — die Session existiert oder nicht.
- **Side-Event und Interview Table legt der Partner an.** Beim Side-Event ist die Zahl die gebuchte Menge. Beim Interview Table ist die gebuchte Menge der **Tisch für volle Tage**, nicht die Zahl der Gespräche: Der Partner legt beliebig viele Slots an, aber nur innerhalb der gebuchten Tage und ohne Überlappung. Der Anspruch prüft also **Tage**, nicht Stück — mit Weg A erledigt das der Slot-Constraint plus eine Prüfung gegen `stage_day`.

---

## 6 · Bewerbungsfragen: ohne neue Tabelle

Der Auftrag sieht `question_catalog.partner_selectable` plus eine Tabelle `question_request` vor. Der Bestand kann das zweite schon:

- `session_question` erlaubt **eigene Fragen** (`question_id is null`, dann `label_de` + `type`) und trägt `approved_by`/`approved_at`.
- Eine beantragte Frage ist also eine `session_question` mit `approved_at is null`. Die Oberfläche zeigt sie als „beim Team beantragt", das Formular der Bewerbung blendet sie aus, bis die Freigabe da ist.

**Vorschlag: `question_request` entfällt.** Neu wären dann nur:

```sql
alter table question_catalog add column if not exists partner_selectable boolean not null default false;
alter table session_question add column if not exists requested_by uuid references person (id) on delete set null;
alter table session_question add column if not exists purpose text;   -- Zweck, Pflicht bei beantragten Fragen
```

`purpose` ist die Stelle, an der Konrads Beispiel („Geschlecht für Frauen-Formate") begründet wird — ohne Zweck keine Freigabe. Die Regel „keine Art.-9-Fragen" prüft das Team bei der Freigabe, nicht die Datenbank: eine Freitext-Frage lässt sich nicht automatisch als sensibel erkennen.

Wenn du die eigene Tabelle trotzdem willst, weil ein Antrag ohne Session denkbar sein soll (Partner fragt vorab), baue ich sie — dann bitte kurz sagen.

---

## 7 · Talk: Partner trägt einen Speaker ein

```sql
alter table speaker_profile add column if not exists created_by_org_id uuid references organization (id) on delete set null;
alter table speaker_profile add column if not exists partner_editable_until_login boolean not null default false;
```

`partner_editable_until_login` aus dem Auftrag, dazu `created_by_org_id`, damit überhaupt prüfbar ist, **welcher** Partner pflegen darf. Ohne das zweite Feld müsste die RPC über die Session zurückrechnen, und ein Speaker mit zwei Sessions hätte zwei mögliche Partner.

**Das Flag fällt beim ersten Login des Speakers.** Vorschlag: in `claim_or_create_person` beim Verbinden von Auth-Konto und Person mitschreiben (`update speaker_profile set partner_editable_until_login = false where person_id = …`). Damit hängt es an dem Ereignis, das es beschreibt, statt an einem Cron.

---

## 8 · Was ich nicht entworfen habe

- **RPCs** — nach deiner Freigabe dieses Entwurfs.
- **Kapazität je Interview-Slot (D1)** und **Freigabe-Gate (D2)**: bleiben Parameter der RPC, wie du angeordnet hast; das Schema legt sich nicht fest (`session.capacity` existiert, `publish_status` auch).
- **Export-Umfang (D3)** — betrifft nur die RPC.
- **Company-Tour-Zeiten:** Konrad (17.09.): die echten Zeiten kommen erst in einigen Wochen, bis dahin **Dummy-Daten**. Der Entwurf braucht dafür nichts Eigenes; die Tour-Slots legt das Team an (ADM-026), und für den Walkthrough setze ich Wegwerf-Slots mit `notes = 'testdaten:…'` nach der Konvention.
- **Interview-Table-Produkt:** legt Konrad selbst an (17.09.). Bis dahin öffnet die Seite bei niemandem — das ist richtig und kein Fehler.

## 9 · Drei Fragen an dich

1. **Weg A oder B** bei den Zeiten (§1) — das ist die eine, die alles andere trägt.
2. **`partner_org_id` neben `host_org_id`** mit der CHECK-Regel, oder reicht `host_org_id` (§3)?
3. **`question_request` streichen** zugunsten von `session_question` mit `requested_by`/`purpose` (§6)?
