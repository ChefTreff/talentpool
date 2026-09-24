# Profilfelder Teilnehmer-Portal · Vorschlag (TAL-013)

Stand: 24.09.2026 · Talent-Chat · **Vorschlag an Konrad vor dem Bau** — bitte je Zeile in der Spalte „Konrad“ mit ja / nein / später antworten (oder die Fragen unten beantworten).

**Quellen.** Meeting-Paket „_TERMIN — Teilnehmer-Felder & Flows“ (Drive, Stand 22.07.: Teil A Entscheidungen, Teil B Feldreferenz, Teil C V1-Vorschlag), das Arbeitsdokument dazu (die Antwortfelder sind leer; nur die Notizen oben sind ausgefüllt), die Feld-Eigentümer-Matrix (`docs/feld-matrix-2026-09.md`, Stand 17.09.), der Abgleich `docs/abgleich/talent.md` (17.09.), Entscheidungslog Abschnitt G (08.09.) und der Code von `/onboarding` und `/profil`.

**Maßstab (Konrad, 24.09.).** „Mehr Daten sind besser, aber nicht überlasten.“ Daraus folgen drei Regeln:
1. **Kauf und Onboarding bleiben schlank**, das Profil wird tiefer. Neue Felder kommen fast alle ins **Profil**, nicht ins Onboarding (Kerngedanke V1: Kauf schlank für die Conversion, Profil tief für Matching und Segmentierung).
2. **Nur erheben, was schon jemand nutzt:** Segmentierung im Marketing, Bewerbungen bei Partnern, Badge und Event-App. Felder für ein Job-Matching, das es 2027 noch nicht gibt, warten auf dieses Produkt (der Nachbau der Event-App ist fürs Folgejahr vorgesehen).
3. **Kontrollierte Listen statt Freitext**, wo gefiltert wird. Freitext nur für die Anzeige.

---

## 1 · Befund: was es heute gibt

| Bereich | Onboarding (4 Schritte) | Profil | Befund |
|---|---|---|---|
| Name, E-Mail, Sprache, Land, Stadt | ja | ohne **Stadt** | Stadt ist nach dem Onboarding nicht mehr änderbar (Abgleich §2) |
| Status, Level, Arbeitgeber-Art/-Name, Startup-Phase | ja | ja | — |
| **Berufserfahrung** | **nein** | ja | Gehört laut Entscheidung 08.09. zur **Talent-Schwelle** (Pflicht), wird im Onboarding aber nicht abgefragt |
| Studienfeld, Studienrichtung, Uni, Selbsteinschätzung | teils | ja | Die **dritte Ebene** (Studiengang als Freitext, entschieden 08.09.) fehlt ganz |
| Interessen, Founder-Themen, Herkunftskanal | ja | ja | — |
| Geburtsdatum, Geschlecht, Nationalität, Telefon, LinkedIn | — | ja | — |
| Einwilligungen (AGB, Datenschutz, Foto, Newsletter) | ja | **nein** | Widerrufen oder nachträglich zustimmen geht nicht (Abgleich §5) |
| Porträt | — | kommt mit #139 (TAL-012) | — |

Vorhanden, aber ohne Weg in der Oberfläche: Vokabular `career_opportunities` (10 Werte, „Gesuchte Karrieremöglichkeiten“), Einwilligungsart `share_with_partner`, Spalten `invite_code` / `referred_by_person_id` (Empfehlung), `cv_url`.

---

## 2 · Vorschlag

Legende Aufwand: **UI** = nur Oberfläche · **M** = kleine Migration (Spalte oder Vokabular, Vorschlag unter `supabase/migrations/vorschlag/`) · **P** = eigenes Produkt/Prozess nötig.

### A · Aufnehmen (jetzt, zusammen ein PR „Profil-Felder“)

| # | Feld | Wo | Liste / Format | Aufwand | Warum | Konrad |
|---|---|---|---|---|---|---|
| A1 | **Berufserfahrung ins Onboarding** | Onboarding, Schritt „Arbeit“ | bestehende 6 Stufen | UI | Talent-Schwelle (08.09.) verlangt sie; ohne sie ist die Schwelle nie erfüllt | |
| A2 | **Stadt im Profil** | Profil | Freitext (wie Onboarding) | UI | Entscheidung 08.09. „wichtig für Auswertung“; heute nicht korrigierbar | |
| A3 | **Position / Jobtitel** | Profil (optional) | Freitext, nur Anzeige | M (`person.job_title`) | Badge und Event-App zeigen „Position“; vivenu liefert sie beim Ticket (`holder_position`) — das Profil soll sie einmal halten, nicht je Ticket | |
| A4 | **Studiengang als Freitext** (Ebene 3) | Profil (optional), bedingt auf Studienrichtung | Freitext, nur Anzeige | M (`person.study_program_label`) | am 08.09. entschieden, nie gebaut | |
| A5 | **Gesuchte Karrieremöglichkeiten** | Profil (optional) | Mehrfachauswahl, Vokabular liegt (10 Werte) | M (CHECK an `person_interest` erweitern) | stärkstes Signal für Partner (Masterclass/Company Tour) und Segmente „Praktikum“/„Einstieg“; war im Altsystem ein Swapcard-Feld | |
| A6 | **Offen für Jobangebote** | Profil (optional) | aktiv suchend / offen / nicht offen | M (`person.job_openness` + Vokabular) | stand im Masterclass-Formular; ein Feld statt jedes Jahr neu fragen | |
| A7 | **Funktionsbereich** | Profil (optional) | Einfachauswahl, 16 Werte (Meeting-Paket Teil B §5) | M (Vokabular + Spalte) | größter fehlender Filter für Partner und Marketing; Skills (C1) erst später | |
| A8 | **Ziele für den Summit** | Profil (optional), später auch Ticket-Bestätigung | Mehrfachauswahl: Netzwerk · Job/Recruiting · Lernen · Investoren · Kunden · Sonstiges | M (Vokabular, Ablage über `person_interest`) | beantwortet „warum kommst du?“ — Segmentierung und Programmplanung | |
| A9 | **Einwilligungen ändern** | Profil, Abschnitt „Daten und Einwilligungen“ | Newsletter, Foto/Video; Pflicht-Einwilligungen nur ansehen | UI | Widerruf muss so einfach sein wie die Zustimmung (DSGVO Art. 7 Abs. 3) | |
| A10 | **Porträt** | Profil | Bild | läuft (#139) | TAL-012 | — |

Sieben der zehn Punkte sind optional und stehen im Profil. Das Onboarding bekommt genau **ein** Feld dazu (A1).

### B · Prüfen mit Anlass (dein Entscheid, nicht dringend)

| # | Feld | Anlass | Empfehlung | Konrad |
|---|---|---|---|---|
| B1 | **Empfehlungs-Code** („bring a talent“) | Spalten liegen; Weg fehlt: persönlicher Link → Anmeldung → `referred_by_person_id` | eigener Punkt, wenn Marketing eine Kampagne damit plant; kein Formularfeld, sondern ein Link | |
| B2 | **„Von Partnern gefunden werden“** (`share_with_partner` am Profil) | heute gibt es die Einwilligung **je Bewerbung** (`consent_share`); eine Talent-Suche für Partner existiert nicht | erst mit der Talent-Suche für Partner — eine Einwilligung ohne Verwendung ist Datenhaltung ohne Zweck | |
| B3 | **CV-Upload** | Spalte `cv_url` liegt | nur, wenn Partner in Bewerbungen CVs sehen sollen — dann als Datei in einem privaten Bucket wie das Porträt, nicht als URL | |
| B4 | **Sprachen** (Muttersprache/Niveau) | Meeting-Paket „Bestand“ | später; `preferred_language` deckt die Kommunikation ab | |
| B5 | **Abschlussjahr** | Idee | ja, falls Marketing nach „Absolventen 2027“ segmentieren will — sonst weglassen | |

### C · Später (mit dem Produkt, das sie braucht)

| # | Feld | Wartet auf |
|---|---|---|
| C1 | Skills (~40, gruppiert), Tools | Job-Matching / Event-App-Nachbau (Folgejahr). Eine Liste mit 40 Einträgen ist genau die Überlastung, die du vermeiden willst |
| C2 | Verfügbarkeit, Work-Mode, Standort/Mobilität | Job-Matching |
| C3 | Portfolio-Links (GitHub, Website) | Hackathon / Tech-Formate |
| C4 | Community-Opt-in (WhatsApp) | Entscheidung 08.09.: „WhatsApp vorerst nicht“; hängt an TAL-009 (Benachrichtigungen) |
| C5 | Kommunikations-Präferenzen (Kanal, Frequenz) | **TAL-009** — dort gehört es hin, nicht ins Profil |

### D · Nicht erheben

| Feld | Grund |
|---|---|
| Gehalt, Demografie/Diversität, Barrierefreiheit | Art.-9-nah bzw. sensibel; Entscheidung 08.09. „weglassen“; kein Partner-Bedarf belegt |
| Rechnungsadresse, Adresszeilen | bleibt im vivenu-Kauf; Datenminimierung |
| T-Shirt-Größe | nur wenn es Merch gibt — dann beim Ticket, nicht im Profil |
| Ernährung | nur bei Catering (Speaker, Volunteers) mit Löschfrist; Teilnehmende nicht |
| Custom-URLs je Bewerbung | ersetzt durch Formate und `format_tag` |
| Pronomen, akademischer Titel | im Speaker-Profil sinnvoll, für Teilnehmende ohne Verwendung |

---

## 3 · Fragen an dich

1. **A1–A10 in einem PR?** Empfehlung ja: ein Migrationsvorschlag (A3–A8) und ein PR für Oberfläche und Onboarding.
2. **Funktionsbereich (A7):** Einfach- oder Mehrfachauswahl? Empfehlung **einfach** („Wo arbeitest du hauptsächlich?“) — Mehrfachauswahl macht den Filter wertlos.
3. **Pflicht oder optional?** Empfehlung: alles aus A optional, **außer** A1 (Berufserfahrung, Talent-Schwelle). Das Profil zeigt einen Hinweis „Je vollständiger, desto besser passen Angebote“ statt Pflichtsternen.
4. **Werden die Werte aus A5–A8 an Partner weitergegeben?** Vorschlag: nur innerhalb einer Bewerbung mit `consent_share` (wie heute), nie als Liste.
5. **Das Arbeitsdokument vom 22.07. ist unbeantwortet.** Soll ich die Teile 2 (Flows) und 3 (Stufen) als eigenen Vorschlag aufbereiten, oder erledigen sich die mit D11/D12 (Home, Luma)?

## 4 · Nach deiner Antwort

Zeilen mit „ja“ → Migrationsvorschlag + Test + Oberfläche als ein PR (TAL-013); „später“ → neue Punkte in `docs/feedback/talent.md` mit Status `zurückgestellt`; „nein“ → Vermerk für das Entscheidungslog über die Architektur-Session.
