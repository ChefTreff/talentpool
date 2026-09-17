# Wonach wir segmentieren können — Übersicht fürs Marketing

*Stand 17.09.2026 · Für: Marketing · Von: Plattform-Team · Antwort bitte als Liste gewünschter Segmente (siehe unten §6)*

---

## 1 · Worum es geht

Im Talentpool steht zu jeder Person eine Reihe von Merkmalen — was sie macht, was sie interessiert, woher sie kam, an welchen Veranstaltungen sie teilgenommen hat. Damit lassen sich Gruppen bilden: „alle Masterstudierenden mit Interesse an Finance, die 2026 dabei waren und den Newsletter erlaubt haben".

**Dieses Dokument listet, was da ist.** Es enthält **keine** Personendaten — nur die Feldnamen und die Werte, die vorkommen können.

Was wir von euch brauchen: **welche Gruppen ihr wirklich ansprechen wollt.** Aus jeder Antwort bauen wir eine feste Auswertung („View") und ein Tag in ActiveCampaign, sodass ihr die Gruppe dort direkt auswählen könnt, ohne sie jedes Mal neu zu beschreiben.

---

## 2 · Zuerst das Wichtigste: die Einwilligung

Eine Gruppe zu bilden ist eine Sache, sie anzuschreiben eine andere. Für Werbung gilt **ausschliesslich** die Einwilligung `newsletter`. Wer sie nicht erteilt oder widerrufen hat, wird nicht angeschrieben — auch dann nicht, wenn die Person perfekt ins Segment passt.

| Einwilligung | Was sie erlaubt |
|---|---|
| `newsletter` | **Werbliche Mails.** Ohne diese Einwilligung kein Marketing, keine Ausnahme. |
| `terms`, `privacy` | Nutzung der Plattform überhaupt — keine Marketing-Grundlage. |
| `share_with_partner` | Weitergabe der Bewerbung an den Partner einer Session. Nicht für eigene Werbung. |
| `photo_video` | Foto- und Videoaufnahmen auf der Veranstaltung. |
| `speaker_release`, `slides_publication` | Veröffentlichung von Speaker-Auftritt und Folien. |
| `hospitality_data` | Hotel- und Reisedaten für die Buchung. |

Jede Einwilligung wird **versioniert und mit Zeitstempel** gespeichert: wir können jederzeit belegen, wer wann welcher Fassung zugestimmt hat. Ein Widerruf wirkt sofort.

Zusätzlich gibt es eine **Sperrliste**: wer sich abgemeldet hat oder dessen Adresse hart zurückkam, bleibt gesperrt — selbst wenn die Person später erneut in einer Liste auftaucht.

> **Folge für eure Planung:** Jedes Segment, das ihr benennt, hat zwei Grössen — wie viele Personen es umfasst, und wie viele davon anschreibbar sind. Die zweite Zahl ist die, die zählt.

---

## 3 · Die Merkmale der Person

### 3.1 Wer sie ist

| Feld | Was es sagt | Mögliche Werte |
|---|---|---|
| `occupation_status` | Was die Person gerade macht | Dualer Student · Bachelor · Master · Staatsexamen · Postgraduate · Founder · Berufstätig · Azubi · Schüler · Auszeit/Sonstiges |
| `work_experience` | Berufsjahre | 0–1 · 2–3 · 4–5 · 6–7 · 8–9 · 10+ |
| `career_level` | Position | Praktikum · Junior · Mid · Senior · Team-Lead · Head of · Director · C-Level |
| `employer_type` | Art des Arbeitgebers | Startup · Kleinunternehmen · Mittelstand · Corporate · NGO · Öffentlich/Uni · Investor/VC · Agentur · Selbstständig · Ohne · Sonstiges |
| `employer_name` | Firmenname | Freitext |
| `city`, `country` | Wohnort | Freitext · Ländercode |
| `preferred_language` | Sprache der Ansprache | Deutsch · Englisch |
| `gender` | Geschlecht | männlich · weiblich · divers · keine Angabe |
| `birthdate` | Geburtsdatum → daraus **u35 ja/nein** | Datum |

### 3.2 Was sie studiert (hat)

| Feld | Mögliche Werte |
|---|---|
| `study_field` | BWL · Finance/VWL · Wirtschaftsinformatik · Wirtschaftsingenieurwesen · Naturwissenschaften · Marketing/Medien · Sozialwissenschaften/Recht · Medizin/Gesundheit · Sonstiges |
| `study_program` | Studiengang, abhängig vom Feld |
| `university` | Hochschule (Freitext) |
| `self_assessment` | Selbsteinschätzung: Top 1 % · Top 10 % · Top 25 % · Top 50 % · Sonstiges · keine Angabe |

### 3.3 Gründerinnen und Gründer

| Feld | Mögliche Werte |
|---|---|
| `startup_phase` | Idee · Pre-Seed · Seed · Early Stage · Scale-up · Later Stage · Post-Exit |
| `interests_founder` | Fundraising · Product Building · Verträge · Growth Hacks · Team & Kultur · Sales & Scaling · Ideation · MVP · Legal/IP/Steuern · Co-Founder-Suche *(Mehrfachauswahl)* |

### 3.4 Interessen und Ziele

| Feld | Mögliche Werte |
|---|---|
| `interests` | Finance & Banking · Tech & KI · Strategy & Consulting · Impact & Nachhaltigkeit · Marketing & Brand · Leadership · Entrepreneurship · Health & Wellbeing · Sales & Growth · Engineering · Logistik & Operations · Psychologie · Politik & Gesellschaft · Recht & Ethik *(Mehrfachauswahl)* |
| `career_opportunities` | Praktikum · Werkstudium · Abschlussarbeit · Trainee · Einstieg Vollzeit · Senior Vollzeit · Lead Vollzeit · Gründungsförderung · Teilzeit · nicht interessiert *(Mehrfachauswahl)* |

**Das sind die wertvollsten Felder für euch.** Beide erlauben Mehrfachauswahl — „Interesse an Finance **oder** Consulting" ist genauso möglich wie „**und**".

### 3.5 Woher sie kam

| Feld | Mögliche Werte |
|---|---|
| `acquisition_channel` | Instagram · LinkedIn · Uni-Professor · Studentische Initiative · Freunde/Kollegen · Aussteller/Partner · frühere Events · Websuche · Social Ads · Sonstiges *(Mehrfachauswahl)* |
| `source_first` | Erster Kontaktkanal im System |
| `invite_code` / `referred_by_person_id` | Wer hat geworben |
| `is_ambassador` | Botschafterin/Botschafter ja/nein |

### 3.6 Status im Lebenszyklus

| Feld | Mögliche Werte |
|---|---|
| `tier` | **Lead** (bekannt, nie eingeloggt) · **Talent** (hat sich eingeloggt) |
| `lifecycle_status` | Lead · Interested · Applicant · Participant · Alumni |

---

## 4 · Teilnahme und Tickets

| Feld | Was es sagt | Werte |
|---|---|---|
| `registration.status` | Anmeldung je Veranstaltung | angemeldet · Warteliste · bestätigt · abgesagt · keine Antwort · teilgenommen · nicht erschienen · storniert |
| `registration.event_id` | **Welche** Veranstaltung | FLS26, FLS27, weitere Formate |
| `application.status` | Bewerbung auf eine Session | beworben · Shortlist · angenommen · bestätigt · teilgenommen · nicht erschienen · Warteliste · nachgerückt · abgelehnt · verfallen · zurückgezogen |
| `ticket.pass_type` | Ticketart | Student · Talent · Startup · Professional · Investor · Supporter · Partner · Speaker · Crew |
| `ticket.checked_in_at` | **War die Person wirklich da?** | Zeitpunkt oder leer |
| `ticket.price_cents` | Gezahlter Preis | Betrag (auch 0 bei Freitickets) |

> **Der Unterschied zwischen „angemeldet" und „da gewesen" ist der wichtigste Filter überhaupt.** `checked_in_at` ist der ehrliche Nachweis der Teilnahme — Anmeldungen ohne Erscheinen sind ein eigenes, gut ansprechbares Segment („war angemeldet, kam nicht").

Über mehrere Editionen hinweg ergibt sich daraus die Treue: einmal · zweimal · jedes Mal dabei.

---

## 5 · Was wir **nicht** für Marketing verwenden

Diese Felder existieren, sind aber für Werbung gesperrt — teils rechtlich, teils weil es unangemessen wäre:

- **Ernährung und Unverträglichkeiten** (`diet`, `diet_note`): Gesundheitsangaben nach Art. 9 DSGVO. Sie verlassen die Catering-Planung nicht und werden nie zusammen mit einem Namen ausgegeben.
- **Bewerbungstexte** (`application.answers`): Inhalte, die jemand für eine Bewerbung geschrieben hat.
- **Lebenslauf** (`cv_url`), **Telefonnummer**, **private Adressen**.
- **Reise- und Hoteldaten** der Speaker.

Wenn ein Segment eines dieser Felder brauchen würde, sagt es uns — dann suchen wir einen anderen Weg zum selben Ziel.

---

## 6 · Was wir von euch brauchen

Bitte beschreibt die Gruppen, die ihr **tatsächlich** ansprechen wollt — in euren Worten, nicht in Feldnamen. Ein Beispiel:

> **„Studentische Interessierte Finance"** — Bachelor oder Master, Interesse Finance & Banking, hat noch nie teilgenommen, Newsletter erlaubt.
> Zweck: Einladung zur Anmeldephase FLS27.

Für jede Gruppe hilft uns:

1. **Name** der Gruppe (so heisst später das Tag in ActiveCampaign)
2. **Beschreibung** in einem Satz
3. **Wozu** ihr sie anschreibt — daran erkennen wir, ob die Abgrenzung stimmt
4. **Wie oft** sie gebraucht wird: einmalig, je Kampagne, dauerhaft

Drei Fragen, die wir uns nicht selbst beantworten können:

- **Wie fein soll es sein?** Fünf grosse Gruppen sind pflegeleicht; dreissig kleine werden mit der Zeit ungenau, weil niemand sie nachzieht. Was passt zu eurer Arbeitsweise?
- **Sollen Gruppen sich automatisch aktualisieren** (wer neu passt, rutscht hinein) oder zum Stichtag festliegen?
- **Braucht ihr Alumni getrennt** nach Jahr der Teilnahme, oder reicht „war schon mal dabei"?

---

## 7 · Wie es danach weitergeht

1. Ihr schickt die Liste der Gruppen.
2. Wir bauen je Gruppe eine Auswertung in der Datenbank und ein Tag in ActiveCampaign.
3. Die Gruppen aktualisieren sich mit den Daten — ihr wählt in AC nur noch aus.
4. Neue Gruppe gebraucht? Eine Nachricht genügt, kein neues Konzept.

**Wichtig zu wissen:** Personen, die ihr Profil löschen, verschwinden aus allen Gruppen — sofort und überall. Eine Sperrliste verhindert, dass sie über einen Import wieder auftauchen.
