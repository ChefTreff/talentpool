# Design-Vorschläge · 24.09.2026

Vier Punkte aus der Feedback-Runde vom 24.09., für die der Design-Chat **Vorschläge** liefert und die zuständigen Chats **bauen** (Arbeitsauftrag Welle 6, „Runde 24.09.“, Design Nr. 3). Alles ist aus vorhandenen Tokens und Bausteinen gebaut. Wo ein Baustein neu wäre, steht es dabei. Die Kontrastwerte sind mit `.claude/skills/portal-design/referenzen/kontrast.mjs` gemessen.

| Punkt | Seite | baut | Kern |
|---|---|---|---|
| [LEAD-017](#1--lead-017-programm-board-kalender-moderner-status-auf-einen-blick) | Programm-Board (`components/programme/Board.tsx`) | Speaker-Domäne-Chat (Board-Kern, QS-039) | Status als volle Fläche und Form, Legende oben mit Zahlen, eigene Bühne hervorgehoben |
| [PART-060](#2--part-060-logo-zwei-uploads-auf-einen-blick) | `/partner/onboarding`, Schritt Logo | Partner-Chat | zwei gleichrangige Kacheln mit grossem Formatzeichen, Knöpfe „SVG-Logo hochladen“ |
| [PART-074](#3--part-074-event-app-schritte-führung-statt-liste) | `/partner/event-app`, Schritte | Partner-Chat | nummerierte Marken mit Verbindungslinie, Fortschritt oben, Erledigtes klappt zusammen |
| [PART-058](#4--part-058-wiki-kategorien-statt-phasen-antwort-zuerst) | Wiki aller Portale (`components/wiki`) | Partner-Chat; Chat-Kern ADM-044 beim Admin-Chat | Suche zuerst, Kategorien nach Aufgaben statt Phasen, Artikel mit Antwort oben |

Gemeinsam für alle vier: `<h2>` als `.ct-h2`, Zustand immer in Form **und** Farbe (Design-Regel 4), kein neuer Radius, keine neue Farbe, DE und EN.

---

## 1 · LEAD-017 Programm-Board: Kalender moderner, Status auf einen Blick

**Konrad (24.09.):** „Die Kalenderansicht würde ich gern etwas moderner gestalten … Das bisherige ist super von der Funktionalität, insofern nicht zu sehr anpassen“. Dazu: Legende nach oben, Statusfarben in unseren Farben oder knalliger, damit der Status sofort erkennbar ist. Vorlage: [Modern Calendar UI (Dribbble)](https://dribbble.com/shots/26593113-Modern-Calendar-UI).

**Was die Vorlage ausmacht** (gelesen am 24.09.): farbcodierte Termine mit **voller Fläche**, eine hervorgehobene Spalte (dort der heutige Tag), eine klare Hierarchie in der Karte (klein: Kategorie · Nummer, fett: Titel, darunter Zeit und Person) und ein **schraffierter** Zustand für „ausstehend“.

**Übernommen:** volle Flächen statt Pastell, die hervorgehobene Spalte (bei uns die eigene Bühne, LEAD-015), die Hierarchie in der Karte, die Schraffur als Form für „noch nicht bestätigt“.
**Nicht übernommen:** Verlauf auf jeder Karte (Verläufe gehören zur Marke, und die erscheint in Datenansichten nie — Skill, Grundsatz „Marke ≠ Portal“), weiche Schatten (Verbotsliste: gestapelte Schatten), Porträts in der Karte (bei 20-Minuten-Slots unlesbar; Personen stehen im Slot-Fenster).

### Status-Kodierung

Heute unterscheiden sich die Status nur in blassen Flächen (`warning-soft`, `accent-soft`, `success-soft`). Ihre Ränder waren bis #145 wirkungslos. Vorschlag: jeder Status hat eine **Fläche, eine Form und ein Wort**.

| Status | Fläche | Form | Text | Kontrast |
|---|---|---|---|---|
| `open` frei | `bg-surface` | Rand gestrichelt `border-border-strong` | `text-muted`, bei bearbeitbaren Bühnen „+ Slot“ | 5,67:1 |
| `requested` angefragt | `bg-warning-soft` mit **Schraffur** (diagonale Streifen) | Leiste links 4 px `border-l-warning-ink` | `text-warning-ink` | 5,13:1; Leiste 5,13:1 |
| `confirmed_title_open` bestätigt, Titel offen | `bg-accent-soft` | Leiste links 4 px `border-l-accent` | `text-accent-deep`, Titelzeile „Titel offen“ | 5,65:1; Leiste 4,04:1 |
| `final` final | **`bg-accent-strong`** (volle Fläche) | keine Leiste; ✓ vor der Zeit | `text-on-navy` (Weiss) | 5,33:1 |
| `unused` ungenutzt | `bg-canvas` | Rand gestrichelt `border-border` | `text-muted`, Titel durchgestrichen | 5,15:1 |

- **Final ist die knalligste Fläche**, und das ist gewollt: Das fertige Programm soll nach Marke aussehen. Wer auf das Board schaut, sieht sofort, was steht (Akzent), was wartet (gelb, schraffiert) und was offen ist (gestrichelt).
- Die Leiste für „angefragt“ ist `warning-ink`, nicht `warning`: das Gelb käme als Randleiste auf Weiss nur auf **1,60:1** (WCAG 1.4.11 verlangt 3:1 für Grafik, die Information trägt).
- Die Schraffur liegt **schon im Kit** (mit diesem PR): Utility `bg-hatch-pending`, Token `--ct-hatch-pending` in `globals.css`, aus `warning-soft` und `warning` gemischt, so dass `text-warning-ink` auf dem dunkleren Streifen noch **4,54:1** hält. Das Board setzt nur die Klasse.
- „Veröffentlicht“ (heute `●`) wird ein kleines Zeichen mit `aria-label` **und** sichtbarem Text im Slot-Fenster. Ein Punkt allein ist Farbe ohne Form.

### Legende oben, mit Zahlen

```
PROGRAMM-BOARD                                         Summit · [Freitag] Samstag
┌──────────────────────────────────────────────────────────────────────────────┐
│ ▦ Final 18   ▨ Angefragt 4   ▤ Bestätigt, Titel offen 3   ┆ Frei 11   ┆ Ungenutzt 2 │  ← Legende = Kopf des Boards
└──────────────────────────────────────────────────────────────────────────────┘
```

- Die Legende steht **über** dem Raster, nicht darunter (Konrad), und zählt je Status. So wird aus der Legende eine Kurzbilanz: „4 angefragt“ ist eine Aufgabe, „2 ungenutzt“ eine Frage.
- Jedes Musterfeld zeigt Fläche **und** Form wie im Raster (Schraffur, Leiste, Strichelung) — sonst lernt man in der Legende etwas anderes, als man im Raster sieht.
- Später möglich, nicht jetzt: ein Klick auf einen Status blendet die übrigen ab (Filter im URL-Zustand, Team-Portal-Muster). Das verändert Funktion, und Konrad hat „nicht zu sehr anpassen“ gesagt.

### Eigene Bühne und Kopfzeile (zusammen mit LEAD-015)

```
        ┃ MAIN STAGE (eigene)            ┃ Stage 2        ┃ Stage 3        ┃  ← Kopf klebt oben
        ┃ 12 / 16 Slots · Umbau 10′      ┃ 8/12 [nur lesen]┃ 6/10 [nur lesen]┃
────────╋━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╋────────────────╋────────────────┫
 10:00  ┃ ▌10:00–10:45 · Keynote         ┃ ┆ + Slot       ┃ ▨10:00–10:20   ┃
        ┃ ▌WARUM FÜHRUNG ZUHÖREN BRAUCHT ┃ ┆              ┃ ▨ Angefragt    ┃
        ┃ ▌Anna Beispiel                 ┃                ┃                ┃
 11:00  ┃                                ┃ ▦ 11:00–11:30 ✓┃                ┃
```

- **Eigene Bühne ganz links und doppelt so breit:** Spalten `minmax(360px, 2fr)` für die eigene, `minmax(180px, 1fr)` für alle anderen. Die fremden bleiben sichtbar, um zu sehen, was parallel läuft (Konrad).
- **Hervorgehoben durch Rahmen und Fläche:** 2 px `border-accent` um die ganze Spalte, Spaltengrund `bg-accent-soft/30`, im Kopf der Name in `ct-label text-accent-deep` und ein Badge „Deine Bühne“. Das ist die eine Karte je Seite mit Akzent-Umriss (Regel aus dem Talent-Muster). Fremde, nicht bearbeitbare Spalten behalten ihr Schloss-Badge (heute „nur lesen“).
- **Kopfzeile klebt:** `position: sticky; top: 0` greift nur, wenn das Raster **selbst** der Scroll-Container ist. Heute scrollt die Seite senkrecht und der Board-Rahmen waagerecht (`overflow-x-auto`), und in dieser Kombination klebt nichts. Deshalb bekommt der Board-Rahmen eine feste Höhe (`max-h` bis zum unteren Rand des Fensters) und `overflow-auto` in beide Richtungen, Kopf und Zeitachse kleben dann (`sticky top-0` für die Kopfzeile, `sticky left-0` für die Stundenspalte).

### Die Karte

| Zeile | Inhalt | Rolle |
|---|---|---|
| 1 | `10:00–10:45 · Keynote` (Zeit · Format) und bei final ✓ | `ct-help tabular-nums` |
| 2 | Titel, höchstens zwei Zeilen (`line-clamp-2`) | `ct-label` |
| 3 | Speaker, eine Zeile | `ct-help` |

Unter 30 Minuten nur Zeilen 1 und 2. Ziehen, Grösse ändern, Doppelklick bleiben wie gebaut.

**Abnahme:** Status ohne Farbe unterscheidbar (Schraffur, Leiste, Strichelung, Wort) · jede Textfarbe ≥ 4,5:1 auf ihrer Fläche (Werte oben) · Legende über dem Raster mit Zahl je Status · eigene Bühne links, doppelt breit, mit Rahmen · Kopfzeile und Zeitachse kleben beim Scrollen.

---

## 2 · PART-060 Logo: zwei Uploads auf einen Blick

**Konrad (21./24.09.):** „Beim Logo finde ich die Unterscheidung von SVG und PNG nicht so sichtbar. Wir haben überall keine klaren Hierarchien … Logo ist ja oben die Hauptüberschrift und dann SVG und PNG Unterüberschriften … dass sofort klar ist, dass man dort zwei Logos hochladen soll. Bitte benenne die Buttons auch entsprechend nach ‚SVG Logo hochladen‘.“

**Heute:** „Logo“ als Karte, darunter beide Dateien **untereinander** mit 14-px-Köpfen (`ct-label`), jede mit einem Knopf „Logo hochladen“. Dass es zwei sind, merkt man erst beim Scrollen. Seit #151 ist „Logo“ ein echter H2-Kopf, das war der erste Teil.

```
LOGO                                                        1 von 2 hochgeladen
Wir brauchen euer Logo zweimal: als Vektor für Druck und Bühne, als Bild für Web und App.

┌───────────────────────────────────┐  ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┐
│ ┌──────┐                          │    ┌──────┐
│ │ SVG  │  Logo als SVG            │  │ │ PNG  │  Logo als PNG          │
│ └──────┘  Für Druck und Bühne,    │    └──────┘  Für Web und Event-App,
│           beliebig skalierbar     │  │           transparenter Grund    │
│ ┌───────────────────────────────┐ │
│ │ ▦▦ Vorschau auf Schachbrett ▦▦│ │  │  Noch nichts hochgeladen          │
│ └───────────────────────────────┘ │
│ acme.svg · v2 · [✓ Angenommen]    │  │                                   │
│ [ SVG-Logo ersetzen ]             │    [ PNG-Logo hochladen ]
│ .svg · höchstens 5 MB             │  │ .png · höchstens 5 MB             │
└───────────────────────────────────┘  └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┘

☐ Logo-Wand: Ihr erlaubt uns, das Logo für die Logo-Wand weiss einzufärben.   (PART-053, bleibt)
```

- **Zwei gleichrangige Kacheln nebeneinander** (`grid gap-4 sm:grid-cols-2`, mobil untereinander). Die Zahl rechts im Kopf („1 von 2 hochgeladen“, `ct-help tabular-nums`) sagt, dass es zwei sind, bevor man die Kacheln liest.
- **Das Formatzeichen ist der Anker:** Quadrat `size-14 rounded-ct-md bg-accent-soft` mit „SVG“ bzw. „PNG“ in `ct-h2 text-accent-deep` (5,65:1). Das Format kommt aus `file_rules.ext[0]` und nicht aus dem Text, damit ein drittes Format (z. B. EPS) von selbst sein Zeichen bekommt.
- **Was fehlt, sieht anders aus:** Eine Kachel ohne Datei hat einen gestrichelten Rand (`border-dashed border-border-strong`) und den Satz „Noch nichts hochgeladen“. Eine mit Datei hat den normalen Rand, die Vorschau und das Status-Badge. Form und Text, nicht nur Farbe.
- **Vorschau auf Schachbrett:** Das Logo liegt auf dem Karomuster `bg-pattern-transparent` (liegt mit diesem PR im Kit). Nur so sieht man, ob das PNG wirklich freigestellt ist. Das braucht eine signierte Leseadresse für die aktuelle Datei; der Download ist heute schon gebaut (`onDownloadLogo`).
- **Knöpfe nach Format:** neuer Text `partner.logoUploadFormat` „{format}-Logo hochladen“ / „Upload {format} logo“ und `partner.logoReplaceFormat` „{format}-Logo ersetzen“ / „Replace {format} logo“. Der `FileButton` bleibt (Auswahl, dann Upload, QS-025).
- Der Titel der Kachel ist `<h3 class="ct-h3">` (heute `ct-label`): H2 „Logo“ → H3 je Datei → Text. Das ist die Hierarchie, die Konrad fehlt.

**Abnahme:** Beide Uploads ohne Scrollen sichtbar (ab 640 px nebeneinander) · Zahl „x von 2“ im Kopf · Knopftexte mit Format · fehlende Datei gestrichelt mit Satz · Vorschau zeigt Transparenz.

---

## 3 · PART-074 Event-App-Schritte: Führung statt Liste

**Konrad (21./24.09.):** „Ich finde die Checkliste noch etwas zu clean, haben wir da irgendwelche Designelemente oder Kontrastfarben, die wir einbringen können?“

**Vorbild:** das Muster „Step by step navigation“ des [GOV.UK Design System](https://design-system.service.gov.uk/patterns/step-by-step-navigation) für Wege mit festem Anfang und Ende, deren Schritte in einer Reihenfolge erledigt werden. Nummerierte Schritte hängen an einer durchgehenden Linie und sind eingeklappt, bis man sie braucht. Genau das sind die Event-App-Schritte: App laden, Profil prüfen, Lead-Scanning einrichten, Team einladen.

```
SCHRITTE IN DER EVENT-APP                                        3 von 7 erledigt
■■■□□□□                                                          (Zahl steht daneben)
Die Haken setzt ihr selbst — wir sehen nicht, was ihr in Swapcard getan habt.

  ✓━━  App laden und anmelden                                     Anna · 12.09.
  ┃
  ✓━━  Profil eurer Organisation prüfen                           Ben · 14.09.
  ┃
  ③──  Lead-Scanning einrichten        [Wichtig]                  ▸
  │    Ohne diese Einstellung kommt ihr nach dem Summit nicht an eure Kontakte.
  │
  ④──  Team in die App einladen                                   ▸
  ┆
  ▸ ERLEDIGT · 2                                                   (klappt zusammen)
```

- **Marke je Schritt:** Kreis 32 px (die Form der Haken im Portal, `CheckMark`). Offen mit Umriss `border-accent` und der Nummer in `text-accent-deep` (6,82:1 auf Weiss), erledigt gefüllt `bg-accent` mit Haken. Der Kreis bleibt der Haken zum Anklicken, so wie heute.
- **Die Linie verbindet die Marken:** 2 px, erledigte Strecke in `bg-accent`, offene in `bg-border`. Man sieht den Fortschritt als Weg, der von oben nach unten voller wird. Das ist das „Designelement“, das der Liste fehlt, und es kommt aus der Marke: der Linienzug des Events-Themes.
- **„Wichtig“ als Wort:** Neben der Akzentleiste (seit #145 sichtbar) ein `<Badge tone="warning">Wichtig</Badge>`, damit die Hervorhebung nicht nur Farbe ist.
- **Fortschritt oben:** Die vorhandene Zahl „3 von 7“ bekommt eine Segmentleiste daneben (7 Felder, erledigte gefüllt `bg-accent`). Nie Balken ohne Zahl (Verbotsliste).
- **Erledigtes klappt zusammen** (Team-Portal-Muster „▸ ERLEDIGT · 3“ als `<details>`): Was fertig ist, ist Nachschlagewerk. Wer oder wann steht rechts in der Zeile, heute schon in den Daten (`done_by_name`, `done_at`).
- **Bildfläche** (optional, wenn das Marketing ein Motiv liefert): rechts oben eine Fläche wie in `PhotoCard` für einen Screenshot der Swapcard-App. So sieht man, wo man gleich klickt.

**Abnahme:** nummerierte Marken mit Verbindungslinie, Fortschritt als Weg sichtbar · „Wichtig“ als Wort und Leiste · Zahl und Segmentleiste im Kopf · erledigte Schritte eingeklappt mit Zahl · Tastatur: Haken und Aufklappen je eigener Knopf (heute schon so).

---

## 4 · PART-058 Wiki: Kategorien statt Phasen, Antwort zuerst

**Konrad (21./24.09.):** Dynamisches FAQ statt Chatbot; „Alle Phasen“ ist kein Filter → echter Chat (Kern **ADM-044**, Admin-Chat), bessere Kategorisierung statt Phasen; „Ich würde gern hier nochmal online nach UI und Design best practices für Wikis suchen … damit es etwas besser aussieht, aber gleichzeitig accessible ist.“

**Recherche (24.09.), was gute Wissensseiten gemeinsam haben:**
- **Die Antwort steht oben**, die Hauptaktion ist sofort da, die Überschriften bilden eine saubere Gliederung, und nichts scrollt seitlich ([Knowledge Base UX Guide](https://knowledge-base.software/guides/ux-and-layout-tips/)).
- **Kategorien nach Aufgaben**, nicht nach internen Begriffen, in der Tiefe passend zur Menge, immer zusammen mit einer sichtbaren Suche, Treffern mit Auszug, einem hilfreichen Leerzustand und einem Weg zu einem Menschen (ebd.).
- **Die Suche muss man nie suchen müssen** — sie ist einer der Hauptwege, sich zurechtzufinden ([Nielsen Norman Group, Artikel](https://www.nngroup.com/articles/), [Strategic Design for FAQs](https://www.nngroup.com/reports/strategic-design-faqs/)).
- **Barrierefreiheit ist Teil der Suche**, keine Schicht darüber: Tastatur, Fokus, Beschriftungen, Zielgrössen und die Rückmeldung zu Treffern entscheiden, ob Suchen überhaupt funktioniert. Kopf, Brotkrumen und Suche bleiben auf Artikelseiten gleich, damit die Startseite keine Einbahnstrasse ist (ebd., Knowledge Base UX Guide).

### Wiki-Start

```
Wissen
WIKI
Alles, was ihr vor und am Summit wissen müsst.

┌──────────────────────────────────────────────────────────────┐
│ Suchen: Frage oder Stichwort — z. B. „Aufbauzeiten“           │   ← gross, mit sichtbarem Label
└──────────────────────────────────────────────────────────────┘
Häufig gefragt:  Aufbauzeiten · Parken · WLAN · Lunch-Paket · Tickets verteilen   (Beispiel)

┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│ Anreise & Aufbau │ │ Stand & Ausstatt.│ │ Tickets & Zugang │
│ 6 Artikel        │ │ 9 Artikel        │ │ 4 Artikel        │
│ Aufbauzeiten     │ │ Rückwand-Maße    │ │ Codes verteilen  │
│ Parken, Anfahrt  │ │ Strom und Technik│ │ Einlass          │
└──────────────────┘ └──────────────────┘ └──────────────────┘
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│ Marke & Sichtbar.│ │ Programm & Form. │ │ Vor Ort          │
└──────────────────┘ └──────────────────┘ └──────────────────┘

┌ Frag uns ─────────────────────────────────────────────────────┐
│ [Chat öffnen] (ADM-044)      oder direkt: ◭ Lisa Muster · Mail · Telefon │
└───────────────────────────────────────────────────────────────┘
```

- **Suche zuerst**, volle Breite, mit sichtbarem Label und Beispielen im Platzhalter. Darunter „Häufig gefragt“ als Linkreihe (die fünf meistgelesenen oder von Hand gesetzten Artikel).
- **Kategorien als Kacheln** (`Card`, Titel `ct-h3`, Zahl der Artikel, zwei bis drei Artikelnamen als Links). Sechs bis acht Kategorien, nach Aufgaben benannt. Vorschlag für Partner: *Anreise & Aufbau · Stand & Ausstattung · Tickets & Zugang · Marke & Sichtbarkeit (Logo, Event-App) · Programm & Formate · Vor Ort (Zeiten, Catering, WLAN) · Abrechnung*. Speaker und Volunteers bekommen ihre eigenen Listen aus demselben Vokabular.
- **Die Phasen bleiben als Eigenschaft**, nicht als Filter: ein kleines Tag am Artikel („Vor dem Summit“), und in einer Kategorie optional als Chip-Reihe. Die Auswahlliste „Alle Phasen“ neben der Suche entfällt, sie las sich wie eine Einstellung und nicht wie ein Filter.
- **Frag uns:** der Einstieg in den Chat (ADM-044, nicht modal wie heute die Assistent-Blase, QS-028) und daneben die Ansprechperson mit Porträt, Mail und Telefon (`ContactCard`). Nie eine Wissensseite ohne Weg zu einem Menschen.

### Suche

- Treffer **während des Tippens** als Liste mit Links (keine Karten mit `onClick`): Titel, Kategorie, der erste Satz als Auszug, der Suchbegriff als `<mark>` (Farbe `bg-accent-soft`, Text bleibt `text-ink`, 14,37:1).
- Die Zahl der Treffer als Text über der Liste **und** für Vorlesesoftware (`aria-live="polite"`: „5 Artikel gefunden“).
- **Leerzustand ist eine Seite:** „Nichts gefunden zu ‚…‘“ plus genau eine Aktion: den Chat mit dieser Frage öffnen (Regel 9).

### Artikel

```
Wiki › Stand & Ausstattung                                  Stand: 12.09.2026
RÜCKWAND: MASSE UND DRUCKDATEN                               (Beispiel, Werte erfunden)
┌ Kurz gesagt ──────────────────────────────────────────────────┐
│ Masse, Dateiformat und Frist in einem Satz.                    │   ← die Antwort zuerst
└───────────────────────────────────────────────────────────────┘
Auf dieser Seite: [Masse] [Datei] [Frist] [Druck]                    ← AbschnittsNavigation (QS-026)

MASSE …                                       (Lesebreite max-w-text)
…
Verwandt: Strom und Technik · Standplan · Logo-Wand
War das hilfreich?  [Ja] [Nein]          Frag uns: [Chat] · ◭ Lisa Muster
```

- **Brotkrumen** (Wiki › Kategorie) und dieselbe Suche oben: die Artikelseite ist kein Endpunkt.
- **„Kurz gesagt“:** der erste Absatz als Hinweiskasten (den `Markdown`-Hinweiskasten gibt es schon). Wer nur die Zahl sucht, hat sie, ohne zu lesen.
- **„Auf dieser Seite“** ab drei Abschnitten, mit derselben Abschnittsübersicht wie die Portalseiten (`AbschnittsNavigation`, QS-026). Dadurch erscheinen die Abschnitte auch eingerückt in der Seitenleiste.
- Lesebreite `max-w-text`, Überschriften `h2`/`h3` in der Reihenfolge, Stand-Datum sichtbar, `lang="en"` am Artikel, wenn er englisch ist.
- **Verwandt** (gleiche Kategorie) und **Frag uns** am Ende. „War das hilfreich?“ nur, wenn jemand die Antworten auswertet — sonst ist es eine Frage ins Leere (braucht Speicher, Entscheidung beim bauenden Chat).

### Was dafür im Datenmodell fehlt

Ein Feld **Kategorie** am Wiki-Artikel (Vokabular `wiki_category`, je Zielgruppe gepflegt, DE/EN) und optional eine Reihenfolge je Kategorie. Das ist kein Oberflächenthema: der bauende Chat reicht es als Migrationsvorschlag ohne Nummer ein (`supabase/migrations/vorschlag/`). Alles andere hier ist Oberfläche.

**Abnahme:** Suche oben und auf jeder Artikelseite · Kategorien statt Phasen-Auswahl · Treffer mit Auszug und gezählt, auch für Vorlesesoftware · Leerzustand mit Chat · Artikel mit „Kurz gesagt“, Abschnittsübersicht ab drei Abschnitten, Stand-Datum, Verwandt, Frag uns.
