# Design-Vorschläge · 04.10.2026

Ein Punkt, für den der Design-Chat einen **Vorschlag** liefert und der zuständige Chat **baut** (nach Konrads Go). Alles ist aus vorhandenen Tokens und Bausteinen gebaut; neu ist ein Kit-Baustein ohne Daten (`Eckdaten`).

| Punkt | Seite | baut | Kern |
|---|---|---|---|
| [HACK-013](#1--hack-013-teilnehmer-app-die-startseite-als-event-seite-luma-als-vorbild) | `/hackathon` (Teilnehmer-App) | Talent-&-Hackathon-Chat | Eckdaten und eine Stand-Karte mit genau einer Aktion vor allem anderen; am Desktop eine schmale Seitenspalte für Veranstalter, Zahl und Discord |

Gemeinsam: `<h2>` als `.ct-h2`, Zustand immer in Form **und** Farbe (Design-Regel 4), kein neuer Radius, keine neue Farbe, DE und EN (der Bereich hat Englisch als Ausgangssprache, E7).

---

## 1 · HACK-013 Teilnehmer-App: die Startseite als Event-Seite (Luma als Vorbild)

**Anlass:** Emilio (Call mit Konrad, 24.09.) nennt Luma als Orientierung für die Teilnehmer-App — Übersicht, Event-Seite, Anmeldung. Das ist ein **Vorbild für den Aufbau**, keine Forderung, die Bewerbung über Luma laufen zu lassen. Die Bewerbung bleibt in unserem Portal.

**Was die Event-Seite von Luma ausmacht** (öffentliche Event- und Entdecken-Seiten, am 04.10.2026 nur lesend angesehen; nichts davon wird kopiert, übernommen wird der Aufbau):

1. **Ein Blick genügt.** Auf den Titel folgen zwei Eckdaten-Zeilen — das Datum in einer kleinen Marke mit Monat über dem Tag, der Ort mit Stecknadel, jeweils zwei Zeilen Text — und direkt darunter **eine Karte mit dem Stand und genau einer Aktion**: ein Satz, ein Knopf. Wer die Seite öffnet, weiß in drei Sekunden, was, wann, wo und was er jetzt tun kann.
2. **Zweispaltig am Desktop:** eine schmale Seitenspalte (Veranstalter, Zahl der Zusagen, Kontakt) und eine breite Hauptspalte (Eckdaten, Anmeldekarte, „Über das Event“). Am Handy eine Spalte in derselben Reihenfolge: Titel, Eckdaten, Anmeldekarte, Beschreibung.
3. **Die Anmeldekarte kennt jeden Zustand** (offen, ausgebucht, angemeldet) und ändert Satz und Knopf, nicht den Ort. Man sucht nie nach „wo bin ich jetzt“.
4. **Die Übersicht ist eine ruhige Liste:** Zeit oben links, Titel, Veranstalter, ein kleines Bild rechts — keine Karten mit Schatten, keine Kacheln.

### Zuordnung auf unsere Bausteine

| Bei Luma | Bei uns | Baustein | Neu? |
|---|---|---|---|
| Titel mit Kontext | Band mit Eyebrow, Titel, einem Satz | `HeroBand` | nein (steht schon) |
| Eckdaten-Zeilen (Datum, Ort) | **Wann und wo**, direkt unter dem Band | **`Eckdaten`** | **ja, Kit — in diesem PR** |
| Anmeldekarte (Stand, ein Satz, ein Knopf) | Stand der eigenen Teilnahme mit der nächsten Aktion | `NextStepBanner` (einmal pro Seite, unter dem Band) | nein |
| Veranstalter in der Seitenspalte | Ansprechperson des Hackathons mit Name, Foto, Mail, Telefon (Serviceversprechen 17.09.) | `ContactCard` | nein |
| „Über das Event“ | Karte mit `<h2>` und `InfoList` (Dauer, Teamgröße, Abgabe, Preise) | `Card` + `CardHeader ebene="h2"` + `InfoList` | nein |
| Zahl der Zusagen | „63 angenommen · 14 Teams“, nur Zahlen | Text in der Seitenspalte | nein (braucht Daten, siehe unten) |
| Terminliste der Übersicht | Zeitplan (`/hackathon/schedule`), je Tag eine Liste | `DateRow` in `DateList` | nein |

**Nicht übernommen:** die dunkle Entdecken-Seite (kein Dark Mode); ein Titelbild als Pflicht (das Band trägt die Marke, Fotos nur aus der Penno-Serie); **Avatare und Namen anderer Teilnehmender** (Datenminimierung — Namen und Fotos anderer erscheinen nur in der Teamsuche und nur mit Einwilligung); Kategorien-Kacheln mit Symbolen (Verbotsliste); „Veranstalter kontaktieren“ und „Event melden“ als Links (bei uns steht die Ansprechperson mit Namen, Mail und Telefon da).

### Die Stand-Karte: ein Satz, eine Aktion

Die Zustände ergeben sich aus `my_hack` (Bewerbung, Team, Challenge, Abgabe); die Karte ist `NextStepBanner` (Weiß auf Akzent, 4,88:1), die Aktion ein `ButtonLink variant="onAccent"`. Der Satz steht im Wörterbuch (EN zuerst):

| Stand | Satz (Vorschlag) | Aktion |
|---|---|---|
| keine Bewerbung | Applications are open | Apply (springt zum Formular darunter) |
| `applied` | Your application is under review | View application |
| `accepted`, kein Team | You are in — find a team | Find a team |
| Team, keine Challenge | Choose your challenge | Choose challenge |
| Challenge, keine Abgabe | Build and submit by <Frist> | Open submission |
| abgegeben | Your submission is in (verspätet: … after the deadline) | View submission |
| `declined` | We could not offer you a place this time | — (kein Knopf) |
| `withdrawn` | You withdrew your application | — |

Die bisherigen Karten (Bewerbung, Team, Challenge, Abgabe, Discord) bleiben **darunter**, in derselben Reihenfolge und mit denselben Bedingungen — der Umbau ändert, was oben steht, nicht, was man tun kann.

### Aufbau

```
Desktop (≥ 1024 px)                                    Handy
┌─────────────────────────────────────────────┐        ┌──────────────────────┐
│ HeroBand: SUMMIT 27 · HACKATHON, Titel      │        │ HeroBand             │
├───────────────┬─────────────────────────────┤        ├──────────────────────┤
│ HOSTED BY     │ [APR 16] Fr 16.–Sa 17.4.    │        │ [APR 16] Fr 16.–Sa … │
│ ContactCard   │ [ Ort ]  Ort, Halle         │        │ [ Ort ]  Ort, Halle  │
│               │ ┌─ Stand-Karte (Akzent) ┐   │        │ ┌─ Stand-Karte ────┐ │
│ PARTICIPANTS  │ │ Satz      [ Knopf ]   │   │        │ │ Satz             │ │
│ 63 · 14 Teams │ └───────────────────────┘   │        │ │ [ Knopf ]        │ │
│               │ Karte: Über den Hackathon   │        │ └──────────────────┘ │
│ TALK TO US    │ Karte: Team, Challenge,     │        │ Karte: Über den Hack…│
│ [Open Discord]│        Abgabe (bedingt)     │        │ Karten …             │
└───────────────┴─────────────────────────────┘        └──────────────────────┘
```

Die Seitenspalte steht am Desktop **links** (wie bei Luma die Veranstalterspalte) und am Handy **nach** der Hauptspalte (sonst stünde der Veranstalter vor der Aktion). Raster `lg:grid-cols-3` (Seitenspalte 1, Hauptspalte 2), Lücke `gap-8`; ein roher Wert kommt nicht vor.

### Was gebaut ist (dieser PR) und was nicht

- **Gebaut:** `Eckdaten` im Kit (`components/ui/Eckdaten.tsx`): Liste aus Zeilen mit Marke (Datum: Monat über Tag; Ort: Stecknadel) und zwei Textzeilen. Reine Darstellung, kein Datenzugriff. Die Marke gleicht der Datumsmarke der `DateRow` und trägt eine weiße Fläche: `text-accent-strong` erreicht darauf **5,33:1** (auf dem Seitengrund 4,85:1), beide über der Schwelle für Fließtext. Test `tests/eckdaten.test.ts`.
- **Nicht gebaut:** der Umbau von `/hackathon` — er hängt an Daten, die es im Teilnehmer-Modell noch nicht gibt (nächster Abschnitt), und die Seite gehört dem Hackathon-Chat.

### Was dafür im Datenmodell fehlt (HACK-020, Hackathon-Chat)

Die Teilnehmer-App kennt heute weder Termin noch Ort: `my_hack` liefert Bewerbung, Team, Challenge und Abgabe, keine Angaben zur Veranstaltung selbst.

1. **Beginn und Ende** des Hackathons (Datum und Uhrzeit), dazu Kick-off und Demos als Zusatzzeile.
2. **Ort** (Veranstaltungsort, Halle oder Fläche).
3. **Ansprechperson** des Hackathons (Name, Foto, Mail, Telefon) — dieselbe Quelle wie die Ansprechpersonen im Partner-Portal (`Admin → Medien → Ansprechpersonen`), mit Einwilligung bei Freelancern.
4. **Zahl der angenommenen Bewerbungen und der Teams** — nur Zahlen, über eine Zähl-RPC ohne Namen.
5. **Abgabeschluss** liegt je Challenge schon vor (`submission_deadline`); für die Stand-Karte genügt der der eigenen Challenge.

Bis die Daten da sind, trägt die Seite **nichts Erfundenes**: ohne Angabe fehlt die jeweilige Eckdaten-Zeile, die Stand-Karte steht trotzdem.

### Fragen an Konrad

1. Soll die Startseite so aufgebaut werden (Eckdaten und Stand-Karte zuerst, Seitenspalte links)?
2. Die **Zahl der Angenommenen und der Teams** zeigen? (Nur Zahlen, keine Namen — schafft Zugehörigkeit, kann aber bei wenigen Zusagen dünn wirken.)
3. Soll die gleiche Struktur später auch für die Event-Seiten der anderen Formate gelten (Masterclass, Side-Event, Company Tour)? `Eckdaten` und `NextStepBanner` sind formatneutral.
