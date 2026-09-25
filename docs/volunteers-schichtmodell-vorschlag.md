# Schichtmodell Volunteers · Vorschlag (VOL-002)

Stand: 25.09.2026 · Talent-Chat · Runde 26.09. · **Vorschlag an Konrad vor dem Bau**

**Quelle:** Airtable-Base 2026 `appRrXacJe9PQ748O` (Konrad 25.09.), gelesen am 25.09. — Tabellen *Einsatz* (222 Planstellen × 105 Stundenfelder), *Volunteers (Confirmed)* (245 Felder), *Feedback_*, *Feedback Team Leads*. **Ausgewertet wurden nur Anzahlen** (Stunden, Schichten, Planstellen je Bereich), keine Namen oder Kontaktdaten; die Auswertung lief per Skript auf den verlinkten Datensatz-Ids, nichts davon liegt im Repo.

---

## 1 · Wie 2026 geplant wurde

- Eine **Planstelle** = eine Zeile in *Einsatz* mit Kapazität 1 (z. B. „Sustainability Hero Field 5“, „Zutrittskontrolle, Gate 4“). Je Stunde (7.–12.4., 7–24 Uhr) ist in einem eigenen Feld ein Volunteer verlinkt; dieselbe Belegung steht gespiegelt in *Volunteers (Confirmed)* noch einmal (119 Stunden-Spalten + „Zuteilung <Tag>“).
- Eine **Schicht** gab es als Objekt nicht — sie ergibt sich aus aufeinanderfolgenden Stunden mit derselben Person.
- Bestätigung, Absage, Nachfassen liefen über Checkboxen und Hilfstabellen (*Non Confirmed*, *Ohne Account*, Spalte „ANRUFER“).

### Zahlen 2026 (200 von 222 Planstellen ausgewertet)
| | |
|---|---|
| Personen-Stunden je Tag | 07.4.: 64 · 08.4.: 203 · 09.4.: 398 · **10.4.: 1 243** · **11.4.: 1 115** · 12.4.: 141 |
| Schichtlänge (Median) | **6 Stunden**; 79 % zwischen 3 und 9 Stunden; **30 Schichten ≥ 12 Stunden** (bis 17) |
| Größte Bereiche (Std.) | Stage Management 550 · Akkreditierung 442 · Construction 427 · Sustainability 299 · Speakers Care 265 · Marketing 247 · Zutrittskontrolle 141 · Hackathon 99 · Cloakroom 85 · Afterparty 78 · Masterclasses 68 · Info Point 66 |
| Vor-/Nachlauf | Construction und Hackathon an Auf- und Abbautagen (7.–9. und 12.4.), alle anderen an den zwei Summit-Tagen |
| Leads | 27 Planstellen mit „Lead“ im Namen, am dichtesten im Stage Management (12) |

**Was daraus folgt:** Die Stunde ist die falsche Einheit. Geplant wird in **Blöcken von 4–6 Stunden je Position**, mit mehreren Plätzen je Block; überlange Schichten sind die Ausnahme, die man sehen muss (Team-Lead-Feedback fragte eigens nach Schichtlängen und Pausen).

---

## 2 · Was das Portal heute hat

`shift` (Edition, Tag, **Bereich** und **Position** als Freitext, Beginn/Ende, **Kapazität**, **Überbuchung**, Ort, Lead-Person, Briefing als Text, aktiv) und `shift_assignment` (Status mit **Bestätigung/Absage**, Grund, Erinnerung, zugeteilt von). Das trägt das Grundmodell bereits — **kein Neubau**, sondern Ergänzung.

---

## 3 · Vorschlag

| # | Ergänzung | Warum (2026) | Aufwand |
|---|---|---|---|
| S1 | **Bereiche als Vokabular** `volunteer_area` (Stage Management, Akkreditierung, Zutrittskontrolle, Construction, Sustainability, Speakers Care, Speaker Lounge, Cloakroom, Info Point, Marketing, Masterclasses, Hackathon, Afterparty, Production Help, Event Operations) statt Freitext | Namen liefen 2026 auseinander („Speakers Care“ / „Speakerscare“ / „Speaker Lounge“) — Filter und Auswertung brechen daran | S |
| S2 | **Schicht = Block mit Kapazität** (bestehendes `shift`), Standardlänge **4–6 h**; **Warnung ab 8 h** und bei zwei Schichten am selben Tag ohne 1 h Pause (nur Hinweis, keine Sperre) | Median 6 h, 30 Schichten ≥ 12 h | S |
| S3 | **Schicht-Vorlagen je Bereich und Tag** („Akkreditierung Fr 7–13 × 8 Plätze, 13–19 × 8“) — einmal anlegen, für Tage kopieren | 222 Einzelzeilen 2026; Kopierfunktion spart das meiste | M |
| S4 | **Bereichsleitung je Tag** (`shift.lead_person_id` gibt es; dazu: Lead sieht Liste und Anwesenheit seines Bereichs) | 27 Lead-Planstellen, Feedback „klare Ansprechpartner“ | M |
| S5 | **Briefing je Position**: Link auf das Briefing-Dokument + Pflicht-Häkchen „Sicherheitsunterweisung gelesen“ je Zuteilung (versioniert, Zeitpunkt) | 2026 als Anhang + Checkbox je Planstelle | S |
| S6 | **Wunschbereiche und Verfügbarkeit** aus der Bewerbung (`volunteer_profile`) in die Zuteilung einblenden; Vorschlag „passt“ je Schicht | Bewerbung fragte „Which areas are you interested in?“; Zuteilung lief von Hand | M |
| S7 | **Auf-/Abbautage** als eigene Tage der Edition (Konstruktion, Hackathon) | Construction 7.–9. und 12.4. | S (Daten) |
| S8 | **Bestätigung**: bestehende Status in `shift_assignment` + Erinnerung X Tage vorher; „nicht bestätigt“-Liste statt Hilfstabellen und Anrufliste | *Non Confirmed*, *Ohne Account*, „ANRUFER“ | S |

**Nicht übernehmen:** Stunden-Spalten, doppelte Buchführung in zwei Tabellen, Rabattcodes in der Personenzeile (läuft über die Volunteer-Tickets, 0086), T-Shirt/Unterkunft (eigene Punkte, falls gewünscht).

**Migration (nach Freigabe, als Vorschlag mit Test):** Vokabular `volunteer_area` + CHECK/Trigger auf `shift.area`; `shift_template` (Bereich, Position, Uhrzeiten, Plätze); `shift.max_hours_warning` nicht als Spalte, sondern als Regel in der Oberfläche; `shift_assignment.safety_ack_at`; Position-Briefing-Link an `shift` bzw. Vorlage.

**Admin-Weg:** alles unter `/admin/volunteers` (Schichten, Vorlagen, Zuteilung, Bestätigungen); die Bereichsleitung sieht ihren Ausschnitt zusätzlich im Volunteer-Portal.

---

## 4 · Fragen an dich
1. **Einheit:** einverstanden mit Blöcken von 4–6 h und einer *Warnung* (keine Sperre) ab 8 h?
2. **Bereichsliste S1:** passt sie, oder werden Bereiche zusammengelegt (z. B. Akkreditierung + Zutrittskontrolle = „Check-in“)?
3. **Vorlagen S3:** gleich mitbauen (Empfehlung) oder zuerst nur Einzelschichten?
4. **Sicherheitsunterweisung S5:** Pflicht für jede Zuteilung oder nur für bestimmte Bereiche (Construction, Zutritt)?
5. **Selbst eintragen:** sollen Volunteers sich 2027 **selbst** in freie Schichten eintragen (mit Freigabe durch Lead) — oder bleibt es bei Zuteilung durch das Team?
6. **Import 2026:** die Planstellen 2026 als Vorlage für 2027 übernehmen (Bereiche, Positionen, Uhrzeiten — **ohne** Personen)?
