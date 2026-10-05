# Design-Vorschläge · 06.10.2026

Fünf Punkte aus dem Durchgang Konrad & Leopold im Partner-Portal (05.10.), für die der Design-Chat einen **Vorschlag** liefert und der Partner-Chat **baut** (nach Konrads Go). Alles ist aus vorhandenen Tokens und Bausteinen gebaut: **in diesem Dokument ist kein neuer Kit-Baustein nötig.** PART-128 (aufklappbare Mehrfachauswahl) folgt als eigener Kit-PR am 08.10.; dort liegt der Baustein `MehrfachAuswahl` schon im Kit, es geht um die zugeklappte Fassung mit Zusammenfassung.

| Punkt | Seite | baut | Kern |
|---|---|---|---|
| [PART-104](#1--part-104-wiki-überarbeiten-gilt-für-alle-portale) | Wiki (`components/wiki`, alle Portale) | Partner-Chat (Darstellung, Wächter), Redaktion (Texte) | **Der Artikel ist die Seite:** sein Titel ist der Seitentitel, die Abschnitte sind Überschriften, die man sieht (heute so groß wie der Fließtext), die Unterabschnitte stehen als Überschrift statt als Fettdruck, der gewählte Artikel ist in der Liste erkennbar |
| [PART-106](#2--part-106-eure-daten-vier-abschnitte-statt-vier-stationen) | `/partner/onboarding` („Eure Daten“) | Partner-Chat | **Vier Abschnitte statt vier Stationen:** Fortschritt als Zahl und Balken, jeder Abschnitt eine anklickbare Zeile mit Stand; keine Linie, kein „Weiter“; die Abschnitte stehen von selbst im Menü |
| [PART-109](#3--part-109-dateien-eine-zeile-je-datei) | `/partner/dateien` | Partner-Chat | **Eine Zeile je Datei** (Name, Stand, Frist, Aktion), Beschreibung und Upload im Schubfach; **Angebot & Rechnungen** je eine Zeile mit Download |
| [PART-113](#4--part-113-so-löst-ihr-eure-tickets-ein) | `/partner/tickets` | Partner-Chat | **Eine Reihenfolge, eine Gestalt:** zwei nummerierte Schritte in einer Karte, die zwei Regeln wandern in die Schritte, die sie betreffen — keine Aufzählung auf dem Seitengrund mehr |
| [PART-136](#5--part-136-talk-hierarchie-und-dichtere-speaker-zeilen) | `/partner/talk` | Partner-Chat | **Session-Titel > „Wer spricht“ > Name:** Speaker als dichte Tabellenzeilen, Bearbeiten im Schubfach, die immer gleichen Sätze einmal statt je Person |

Gemeinsam: `<h2>`/`<h3>` mit Pflicht-Ebene wie bei `CardHeader`, Zustand immer in Form **und** Wort (Design-Regel 4), kein neuer Radius, keine neue Farbe, Touch-Ziele 44 px, DE und EN, Meldungen zu einer Aktion im Schubfach oder Fenster bleiben dort (`Drawer error`, ADM-062). Die Skizzen sind Textzeichnungen; Bilder zu den Vorschlägen bekommt Konrad als Datei.

**Admin-Weg:** keiner der fünf Punkte ist eine Admin-Funktion. Die Seiten sind Partner-Seiten; was sie anzeigen, pflegt das Team an den bestehenden Stellen (`/admin/partner/…`, `/admin/wiki`). Beim Wiki gilt es doppelt: der Editor in `/admin/wiki` zeigt seine Vorschau mit derselben `Markdown`-Komponente und damit sofort die neue Hierarchie.

---

## 1 · PART-104 Wiki überarbeiten (gilt für alle Portale)

**Anlass:** Konrad & Leopold: „unübersichtlich, Abschnitte und Überschriften nicht klar erkennbar, auch in den Texten unsaubere Überschriften, schwer intuitiv zu navigieren“. Verlangt ist ein Vorschlag für Struktur, Inhaltsverzeichnis je Artikel und Typo-Hierarchie, gültig für das Wiki aller Portale (`WikiPage` mit `audience`: Partner, Speaker, Volunteers, Team).

### Was heute da ist (am Quelltext gelesen, 05.10.)

- **Die Navigation ist gut angelegt:** links die Artikel nach Thema (PART-058, sieben Themen), Suche über Titel und Text, Adresse `#slug/abschnitt`, am Handy Liste **oder** Artikel, im Artikel „Auf diesem Artikel“ ab vier Abschnitten und „Mehr zu …“. Daran ändert dieser Vorschlag nichts.
- **Die Schrift trennt die Ebenen nicht.** Der Artikeltitel ist 18/24 in Versalien (`ct-h2`), ein Abschnitt (`##`) 16/24 halbfett (`ct-h3`) — **so groß wie der Fließtext (16/24)** —, ein Unterabschnitt (`###`) 14/20 halbfett (`ct-label`) — **kleiner als der Fließtext**. Von oben nach unten: 18 → 16 → 16 → 14. Ein Abschnitt unterscheidet sich vom Text allein durch das Gewicht.
- **Die Texte gliedern flach** (gezählt in den Quelldateien `content/wiki/*.md`, dem Stand der Importe; die Artikel in der Datenbank sind daraus entstanden und im Editor änderbar — der Partner-Chat zählt vor dem Umschreiben gegen die Datenbank nach): 26 Artikel mit 144 Abschnitten, **alle `##`**, kein `#`, kein `###`. Die Unterabschnitte stehen als **fette Zeilen** (ein Absatz, der nur aus `**…**` besteht): 26 Stück in 9 Artikeln (Pfand 6, Masterclasses 5, Anlieferung und Aufbau 4, Recruiting-Tipps 3, …), etwa „A) Offizielle Getränkepartner“, „Schritt 1: Code eingeben und Ticket einlösen“, „Mittwoch, 14. April 2027 – nur externe Messebauer“, „Beispiel 3: …“. Sie sehen aus wie Betonung, nicht wie Überschrift, und sie fehlen in „Auf diesem Artikel“.
- **Die Überschriften sind uneinheitlich:** Fragen („Wie besetzt ihr den Stand am besten?“), Substantive („Abbau“, „Das Grundprinzip“), Satzteile mit Doppelpunkt oder Klammer („Besonderheit: Silent Masterclass Stages“, „Anleitung zur Einlösung (zwei Schritte)“).
- **Der gewählte Artikel ist in der Liste kaum zu erkennen:** `bg-surface-hover` auf dem Seitengrund, Kontrast **1,03 : 1**; es bleibt der Farbunterschied des Textes.
- Der Fließtext läuft über die ganze Breite der Karte, ohne begrenzte Zeilenlänge.

### Die Idee in einem Satz

**Der Artikel ist die Seite: sein Titel ist der Seitentitel, seine Abschnitte sind Überschriften, die man sieht, und seine Gliederung steht im Text als Gliederung — nicht als Fettdruck.**

### 1 · Vier Ebenen, vier Größen (Darstellung, wirkt in allen Portalen und in der Editor-Vorschau)

| Ebene | heute | Vorschlag |
|---|---|---|
| Seitentitel | „Wiki“ (`ct-h1`); der Artikeltitel darunter in der Karte (`ct-h2`) | **Der Artikeltitel** (`ct-h1`, `<h1>`); davor als Eyebrow das Thema, darunter „Stand: 3. Okt. 2026“. „Wiki“ steht schon in der Seitenleiste und im Laica-Wort. In der Liste ohne offenen Artikel (Handy) bleibt „Wiki“ der Titel; der Einleitungssatz („Antworten auf das, was immer wieder gefragt wird.“) steht dort darunter und am Desktop über der Suche |
| Abschnitt (`##`) | `<h3>` `ct-h3` 16/24 halbfett | **`<h2>` `ct-h2`** 18/24 Versalien, dazu eine **Linie darüber** (`border-t`, Abstand oben 40 px, der erste Abschnitt ohne Linie) |
| Unterabschnitt (`###`) | `<h4>` `ct-label` 14/20 | **`<h3>` `ct-h3`** 16/24 halbfett, Abstand oben 24 px |
| Fließtext | 16/24, volle Breite | 16/24, Breite `max-w-text` (Zeilenlänge begrenzt) |

Das sind **keine neuen Rollen**, nur eine andere Zuordnung der vorhandenen. Abschnitte heißen dann überall im Portal gleich aus: `h2` = `ct-h2`. Nebenwirkung für Vorlesesoftware: die Überschriftenebenen stimmen (heute: `h1` Wiki, `h2` Artikeltitel, `h3` Abschnitt).

```
Desktop                                                       Handy (Artikel)
┌─────────────────────────────────────────────────────┐       ┌───────────────────────────┐
│ Wissen                          (Laica, Akzent)     │       │ < Alle Artikel            │
│ TICKETS UND AKKREDITIERUNG      ct-h1               │       │ TICKETS UND               │
│ Thema: Tickets & Einlass · Stand 3. Okt. 2026       │       │ AKKREDITIERUNG            │
│                                                     │       │ Stand 3. Okt. 2026        │
│ [Suche …]            Auf diesem Artikel (5)         │       │ [ Auf diesem Artikel (5) v]│
│ TICKETS & EINLASS    1 Wie bekommt ihr eure Tickets │       │                           │
│ ▌Tickets und Akkr…   2 Für wen sind die Tickets …   │       │ ─────────────────────     │
│  Pfand               3 Anleitung zur Einlösung      │       │ WIE BEKOMMT IHR EURE      │
│ STAND & AUFBAU       …                              │       │ TICKETS?        ct-h2     │
│  Anlieferung …       ─────────────────────────      │       │ Text …                    │
│                      WIE BEKOMMT IHR EURE TICKETS?  │       │ ─────────────────────     │
│                      Text … (max. Zeilenlänge)      │       │ ANLEITUNG ZUR EINLÖSUNG   │
│                      ─────────────────────────      │       │ Schritt 1: Code eingeben  │
│                      ANLEITUNG ZUR EINLÖSUNG        │       │          ct-h3, halbfett  │
│                      Schritt 1: Code eingeben       │       └───────────────────────────┘
│                      Schritt 2: Personalisierung    │
└─────────────────────────────────────────────────────┘
```

Zur Liste links: der gewählte Artikel bekommt einen **Balken links** (`border-l-2 border-accent`, 3 : 1 gegen den Grund ist verlangt, der Akzent trägt ihn), weiße Fläche (`bg-surface`) und Text in `text-ink`; die anderen bleiben `text-muted`. `aria-current` bleibt wie es ist.

**Gerüst im Code** (`components/wiki`): Der Titel hängt vom offenen Artikel ab; deshalb zieht der `PageHeader` von `WikiPage` (Server) in `WikiView` (Client) um. Der Rest bleibt: Liste, Suche, Anker, Fokus, `AbschnittsNavigation`. In `Markdown.tsx` ändern sich drei Zuordnungen (Ebene 1 bleibt als Absicherung `h2`, falls ein Text doch ein `#` hat).

### 2 · Die Gliederung im Text (Redaktion, mit Wächter)

- **Die 26 fetten Zeilen werden `###`** — nur die Markierung ändert sich, nicht der Wortlaut. Gefunden mit `^\*\*[^*]+\*\*:?$` in `content/wiki/*.md`; der Partner-Chat listet die Stellen in der PR-Beschreibung. Die Datenbank-Artikel (Editor) werden im Admin nachgezogen; `scripts/wiki-import.mjs` setzt bei künftigen Notion-Importen `###`.
- **Eine Regel für Überschriften** (steht im Hilfetext des Editors): *Frage*, wenn der Abschnitt eine Frage beantwortet; sonst *ein Substantiv oder eine kurze Nominalgruppe*. Keine Doppelpunkte, keine Klammern, keine Nummern im Text — die Nummer macht die Übersicht.
- **Höchstens bis `###`.** Eine Ebene tiefer ist ein Zeichen, dass der Artikel zwei Artikel ist.
- **Wächter:** ein Test über `content/wiki/*.md`, der fehlschlägt, wenn ein Absatz nur aus `**…**` besteht oder eine Ebene übersprungen wird (`##` → `####`). Derselbe Hinweis erscheint im **Editor** beim Speichern („Fette Zeile als Überschrift gemeint? Mit `###` markieren“), damit neue Texte nicht wieder so entstehen.

### 3 · Inhaltsverzeichnis und Navigation

Bleibt in der Anlage; zwei kleine Änderungen:

1. Der Ablauf „Auf diesem Artikel“ bleibt ab vier Abschnitten (darunter ist das Verzeichnis länger als der Text). Mit den `###` aus Punkt 2 gewinnt er nichts, denn er führt nur die `##`; die Unterabschnitte stehen im Text darunter und tragen **keine** eigene Ziffer.
2. Der gewählte Artikel in der Liste (siehe oben) und die Linie über jedem Abschnitt geben dem Auge die zwei Orientierungen, die heute fehlen: *Wo bin ich in der Liste?* und *Wo beginnt der nächste Abschnitt?*

### Bausteine

| Zweck | Baustein | Neu? |
|---|---|---|
| Seitentitel | `PageHeader` (`eyebrow`, `word`, `title`, `description`) | nein |
| Inhaltsverzeichnis | `AbschnittsNavigation` | nein |
| Überschriften | `ct-h1` / `ct-h2` / `ct-h3` | nein, nur anders zugeordnet |
| Hinweis im Editor | Textzeile unter dem Feld (`Field hint`) | nein |

---

## 2 · PART-106 „Eure Daten“: vier Abschnitte statt vier Stationen

**Anlass:** „Der Fortschritt sieht aus wie eine Zeitleiste: man erkennt nicht, dass Beschreibung oder Rechnungsdaten klickbar sind; ‚Schritt 4 erledigt, Schritt 3 fehlt‘ wirkt falsch.“ Gewünscht: eine Darstellung ohne Linie, unabhängige Schritte mit Stand, klar als Links — und die Unterseiten zusätzlich als Unterpunkte im Menü. (Die Seite heißt im Menü „Eure Daten“, ihre Adresse ist `/partner/onboarding`.)

### Was heute da ist

`OnboardingWizard`: ein Kasten mit einem Satz, dem Gesamtstand als Badge und der **`StepBar`** — eine durchgehende Linie mit vier nummerierten Sechsecken (Unternehmen, Beschreibung, Logo, Rechnungsdaten). Darunter **immer genau eine Karte**, unten „Zurück“ und „Weiter“. Was daran stört:

- Linie und Ziffern sagen „Ablauf“. Die vier sind aber **unabhängig**: Rechnungsdaten kann man vor der Beschreibung ausfüllen, und der Haken kommt aus dem Inhalt, nicht aus der Position. Dann steht Schritt 4 grün neben einem offenen Schritt 3 — ein Zustand, den die Linie als Fehler liest.
- Die Schritte sind Knöpfe, sehen aber nicht so aus (kein Rand, kein Pfeil; als Hinweis auf Klickbarkeit bleibt nur eine leichte Abdunklung beim Darüberfahren).
- „Weiter“ verlangt eine Reihenfolge, die es fachlich nicht gibt.

### Die Idee in einem Satz

**Vier Abschnitte einer Seite, jeder mit Stand und Kurzfassung in der Zeile — oben die Zahl, wie weit alles ist.**

```
Desktop (max. 720 px)                                          Handy (375 px)
┌────────────────────────────────────────────────────────┐    ┌──────────────────────────┐
│ EURE DATEN                                             │    │ EURE DATEN               │
│ Hier pflegt ihr, was wir für den Summit brauchen.      │    │ 2 von 4 Bereichen        │
│                                                        │    │ ███████░░░░░             │
│ 2 von 4 Bereichen ausgefüllt   ██████████░░░░░░░░░░    │    │ [Teilweise ausgefüllt]   │
│ [ Teilweise ausgefüllt ]                               │    │ Es fehlt noch: Logo (SVG)│
│ Es fehlt noch: Logo (SVG) · Rechnungs-E-Mail           │    │ · Rechnungs-E-Mail       │
│                                                        │    │                          │
│ Auf dieser Seite: Unternehmen · Beschreibung · Logo ·… │    │ ┌──────────────────────┐ │
│                                                        │    │ │Unternehmen [Fertig] v│ │
│ ┌────────────────────────────────────────────────────┐ │    │ │Muster GmbH · Musterst│ │
│ │ Unternehmen   [Fertig]  Muster GmbH · Musterstr. 1 v │ │    │ ├──────────────────────┤ │
│ ├────────────────────────────────────────────────────┤ │    │ │Beschreibung [Fertig] │ │
│ │ Beschreibung  [Fertig]  412 Zeichen · Branche …   v  │ │    │ ├──────────────────────┤ │
│ ├────────────────────────────────────────────────────┤ │    │ │Logo [1 von 2]     ^  │ │
│ │ Logo          [1 von 2] SVG da · PNG fehlt        ^  │ │    │ │ (offen: Kacheln SVG, │ │
│ │   [Kachel SVG]  [Kachel PNG]  Einwilligung Logowand  │ │    │ │  PNG, Einwilligung)  │ │
│ ├────────────────────────────────────────────────────┤ │    │ ├──────────────────────┤ │
│ │ Rechnungsdaten [Offen]  Rechnungs-E-Mail fehlt    v  │ │    │ │Rechnungsdaten [Offen]│ │
│ └────────────────────────────────────────────────────┘ │    │ └──────────────────────┘ │
│ ════════ klebt, nur bei Ungespeichertem ═══════════════ │    │ ═══════ klebt ═══════════ │
│ [ Änderungen speichern ]   Verwerfen                   │    │ [ Änderungen speichern ] │
└────────────────────────────────────────────────────────┘    └──────────────────────────┘
```

### Aufbau

1. **Oben die Zahl:** `Fortschritt` (Balken, immer mit Zahl) „2 von 4 Bereichen ausgefüllt“, daneben der Gesamtstand als `Badge` (heute dasselbe), darunter die Zeile „Es fehlt noch: …“ (heute `MissingHint`, derselbe Text).
2. **Vier `Block karte`** (`ebene="h2"`), feste Reihenfolge wie heute: Unternehmen, Beschreibung, Logo, Rechnungsdaten. Jede Zeile trägt **Stand und Kurzfassung**: `Badge` *Fertig* (success) oder *Offen* (warning), beim Logo *1 von 2* (warning); die Kurzfassung sagt, was drinsteht („Muster GmbH · Musterstraße 1, 80331 München“; „412 Zeichen · Branche Automobil“; „SVG da · PNG fehlt“; „rechnung@muster.de“) oder was fehlt. Die ganze Zeile ist das Ziel (44 px, Pfeil, Fläche beim Darüberfahren) — so erkennt man, **dass** sie klickbar ist; das leistet der Baustein `Block` schon.
3. **Der erste offene Abschnitt steht offen**, die erledigten zu. Man kann jeden öffnen, in jeder Reihenfolge, und mehrere zugleich. Ein Stand „erledigt“ verlangt keinen Vorgänger.
4. **Eine klebende Leiste „Änderungen speichern · Verwerfen“, nur wenn es Ungespeichertes gibt** (Archetyp B; `useUngesichert` warnt beim Verlassen). Das passt, weil die vier Abschnitte **einen** Entwurf teilen (`EureDatenEntwurf`) und `saveOnboarding` ihn gesammelt speichert. Der Logo-Upload und die Einwilligung für die Logowand wirken wie heute sofort und stehen nicht im Entwurf.
5. **„Auf dieser Seite“** (`AbschnittsNavigation`: Unternehmen, Beschreibung, Logo, Rechnungsdaten) — und damit auch **der Wunsch nach Unterpunkten im Menü**: die Seitenleiste zeigt die Abschnitte der aktiven Seite automatisch als dritte Ebene unter „Eure Daten“ (QS-026). Es entstehen keine neuen Seiten und keine neuen Routen; ein Klick im Menü springt zum Abschnitt und **öffnet ihn** (`Block` öffnet sich beim Anker).

**Es entfallen:** der Zustand `step`, „Zurück“/„Weiter“, die `StepBar` an dieser Stelle. **Ein Text ändert sich mit:** `onboardingStepsHint` sagt heute „Zwischenstand wird gespeichert — ihr könnt jederzeit aufhören“, und das stimmt nur, weil „Weiter“ jedes Mal speichert. Künftig speichert die Leiste; der Satz heißt etwa „Ihr könnt jederzeit aufhören — was ihr geändert habt, speichert ihr unten.“ Die Marken „Fertig“ und „Offen“ lesen aus dem **Entwurf**, wie heute die Haken, und sind deshalb schon beim Tippen aktuell. Die `StepBar` bleibt für echte Abläufe (Event-App-Schritte, Reisekostenantrag), wo die Reihenfolge stimmt.

**Handy:** dieselbe Reihenfolge in einer Spalte; die Zeile bricht um (Titel und Stand oben, Kurzfassung darunter); die Leiste klebt unten und hat zwei Knöpfe.

### Bausteine

| Zweck | Baustein | Neu? |
|---|---|---|
| Wie weit alles ist | `Fortschritt` (Balken) | nein |
| Abschnitt mit Stand und Kurzfassung | `Block` mit `karte`, `ebene="h2"`, `marke`, `kurz`, `offen` | nein (#351) |
| Stand | `Badge` (success / warning) | nein |
| Übersicht und Menü | `AbschnittsNavigation` | nein |
| Speichern | klebende Leiste, `useUngesichert` | nein |
| Logo-Kacheln, Einwilligung | `UploadKachel`, `LogoWandEinwilligung` — unverändert im Block Logo | nein |

---

## 3 · PART-109 Dateien: eine Zeile je Datei

**Anlass:** „Struktur unübersichtlich, die Texte machen die Sektionen zu lang → jede Datei eine Zeile (Name, Stand, Frist, Aktion); Angebot & Rechnungen je eine Zeile mit Download.“

### Was heute da ist

- **Uploads:** ein Raster aus zwei Spalten, je Datei eine **Kachel**: Formatzeichen (56 px), Leistung als Eyebrow, Titel, Beschreibung, Frist, Vorschau (112 px), Dateiname, Version, Stand, Datum, Hinweis der Prüfung, dazu der Upload mit seinem Regeltext. Eine Kachel ist damit mehrere Zeilen hoch; bei acht Dateien stehen vier solche Reihen untereinander (nicht gemessen, mit Anmeldung nachzusehen).
- **Belege:** drei Kästen nebeneinander (Angebot, Rechnung, Messeshop-Rechnung), in jedem eine Liste „Öffnen — Datum“ oder ein Satz, wenn nichts da ist.
- Zwei Überschriften mit je einem Einleitungssatz, dazwischen 40 px.

### Die Idee in einem Satz

**Eine Tabelle, in der man den Stand jeder Datei in einer Zeile liest — alles Weitere liegt hinter der Zeile.**

```
Desktop
Eure Dateien                                                   3 von 8 hochgeladen
Eine Zeile je Datei. Was wir dazu brauchen, steht hinter dem Namen.
┌─────────────────────────────────────────────────────────────────────────────────┐
│ Datei                          Stand               Frist             Aktion     │
├─────────────────────────────────────────────────────────────────────────────────┤
│ Rückwand (PDF)                 [Überfällig]        gestern           [Hochladen]│
│ Messestand                                                                      │
│ Standgrafik (PNG)              [Offen]             in 12 Tagen       [Hochladen]│
│ Messestand                                                                      │
│ Logo (PNG)                     [Zurückgewiesen]    —                 [Hochladen]│
│ Allgemein                      „Hintergrund nicht freigestellt“                 │
│ Logo (SVG)                     [Eingereicht] v1    —                 [Öffnen]   │
│ Allgemein                                                                       │
│ Firmenbeschreibung (PDF)       [Angenommen] v2     —                 [Öffnen]   │
└─────────────────────────────────────────────────────────────────────────────────┘

Angebot & Rechnungen
┌─────────────────────────────────────────────────────────────────────────────────┐
│ Beleg                           Datum              Größe            Aktion      │
├─────────────────────────────────────────────────────────────────────────────────┤
│ Angebot                         12.09.2026         182 KB           [Herunterladen]│
│ Rechnung                        03.10.2026          96 KB           [Herunterladen]│
│ Messeshop-Rechnung              Noch nicht da — sie erscheint hier, sobald sie vorliegt.│
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Aufbau

- **Spalten Uploads:** *Datei* (Titel in `ct-label`, darunter Leistung in `ct-help`; das Formatzeichen steht in Klammern im Namen statt als 56-px-Kachel), *Stand* (`Badge` in Wort und Farbe: Offen warning, Überfällig error, Eingereicht accent, Angenommen success, Zurückgewiesen error; Version daneben; die Begründung einer Zurückweisung in `ct-help` unter dem Badge, rot), *Frist* (`FristMarke kompakt`, wie heute), *Aktion* (`Button size="sm" variant="secondary"`: **Hochladen** bei Offen, Überfällig, Zurückgewiesen — dort darf der Partner hochladen, wie heute `HOCHLADBAR` —, sonst **Öffnen**).
- **Der Name der Datei öffnet das Schubfach** („Details“, `.ct-ziel` auf der ganzen Zelle, wie in `/admin/grafiken`). Das Schubfach (`Drawer`) trägt, was die Zeile nicht trägt: Beschreibung der Datei, was wir brauchen (Formate, höchste Größe aus den Dateiregeln), die Vorschau mit Schachbrett, die aktuelle Datei mit Datum und Version, die Begründung der Prüfung und **den Upload** (`FileButton`, zweistufig: wählen, dann hochladen). Fehler und Erfolg stehen im Schubfach neben dem Knopf (`Drawer error`, Statuszeile bleibt stehen — ADM-062).
- **Reihenfolge:** was etwas von euch braucht, steht oben — Überfällig, Offen und Zurückgewiesen, dann Eingereicht, dann Angenommen; innerhalb einer Gruppe nach Frist. Der Zähler „3 von 8 hochgeladen“ bleibt am Kopf.
- **Angebot & Rechnungen:** eine Zeile je Beleg, Spalten *Beleg · Datum · Größe · Aktion*; die Aktion heißt **Herunterladen** und ist, was heute der Link „Öffnen — Datum“ ist (`useDateiOeffnen`, die Adresse wird beim Klick geholt). Eine Belegart ohne Datei steht als **eine gedämpfte Zeile** mit dem Satz „Noch nicht da — sie erscheint hier, sobald sie vorliegt“, nicht als gestrichelter Kasten. Gibt es zwei Rechnungen, sind es zwei Zeilen.
- **Texte:** die Einleitungssätze bleiben je einer; die langen Beschreibungen und Regeln wandern ins Schubfach (damit entfällt der Text, der „die Sektionen zu lang“ macht).

**Handy:** `Table stapeln` — jede Zeile wird eine Karte mit Beschriftung je Zelle (Stand, Frist), die Aktion eine volle 44-px-Zeile darunter; der Name bleibt der Kopf der Karte.

**Was bleibt:** `UploadKachel` bleibt im Block *Logo* auf „Eure Daten“ (zwei Kacheln mit großer Vorschau, wo die Vorschau gebraucht wird); die Haken (`usePflichtUpload`, `useVorschau`, `useDateiOeffnen`) sind dieselben, nur die Hülle ist eine Zeile mit Schubfach statt einer Kachel.

### Bausteine

| Zweck | Baustein | Neu? |
|---|---|---|
| Tabelle | `Table stapeln`, `Tr` (mit Bedienelementen 56 px), `Th`, `Td label` | nein |
| Stand, Frist | `Badge`, `FristMarke kompakt` | nein |
| Details und Upload | `Drawer` mit `error`, `FileButton` | nein |
| Aktion in der Zeile | `Button size="sm"` | nein |

---

## 4 · PART-113 „So löst ihr eure Tickets ein“

**Anlass:** „Überschriften unklar; erst zwei Schritte, dann Aufzählungszeichen auf grauem Grund wirkt eigenartig → eine Reihenfolge, eine Gestalt.“

### Was heute da ist

Ganz unten auf der Seite (nach den Kontingenten und dem Zusatzkontingent): `h2` „So löst ihr eure Tickets ein“; zwei **weiße Karten** („1 · Code im Ticketshop einlösen“, „2 · Tickets personalisieren — nicht vergessen“); darunter, **ohne Rahmen auf dem grauen Seitengrund**, eine Aufzählung mit zwei langen Regeln. Was daran stört:

1. **Zwei Gestalten für eine Anleitung:** nummerierte Karten, dann Aufzählungspunkte ohne Fläche.
2. **Die Nummer steht im Titeltext** („1 · …“), der Titel ist ein Satz mit Gedankenstrich („— nicht vergessen“).
3. **Die Aufzählung enthält zwei verschiedene Dinge ohne Überschrift:** *welcher Code für wen* (gehört zu Schritt 1) und *ein Ticket je Person* (gehört zu Schritt 2).
4. **Die Anleitung steht weit weg von den Codes**, um die es geht.

### Die Idee in einem Satz

**Eine Anleitung, eine Karte, zwei nummerierte Schritte — was zu einem Schritt gehört, steht in diesem Schritt.**

```
So löst ihr eure Tickets ein                                          <- h2 (ct-h2)
┌────────────────────────────────────────────────────────────────────┐
│ (1)  Code im Ticketshop einlösen                                   │  <- SchrittMarke + h3 (ct-h3)
│      Öffnet den Ticketshop, klickt auf „Tickets kaufen“ und gebt   │
│      euren Code ein. Jede Einlösung zählt gegen euer Kontingent.   │
│                                                                    │
│      Partner-Code    Standpersonal, Masterclass und alle, die      │  <- InfoList
│                      euch auf dem Summit vertreten                 │
│      Talent-Code     Studierende, Auszubildende, junge Talente     │
│                      und Bewerberinnen und Bewerber                │
│ ────────────────────────────────────────────────────────────────── │
│ (2)  Tickets personalisieren              [ Nicht vergessen ]      │  <- Badge warning
│      Nach dem Einlösen gehört jedes Ticket einer Person — mit      │
│      eigener E-Mail-Adresse, sonst gibt es keinen Zugang zur       │
│      Event-App. Die Bändchen sind nicht übertragbar, auch nicht    │
│      bei wechselndem Standpersonal.                                │
└────────────────────────────────────────────────────────────────────┘
```

### Aufbau

- **Eine `Card`, darin eine geordnete Liste** (`<ol>`), je Schritt `SchrittMarke` (das nummerierte Sechseck, wie bei den Schrittlisten im Portal) und eine Überschrift `<h3>` in `ct-h3` — **ohne „1 ·“ im Text**; die Nummer macht die Marke. Zwischen den Schritten eine Linie, keine zweite Karte (keine Karte in der Karte).
- **Schritt 2 trägt „Nicht vergessen“ als `Badge` (warning)** hinter dem Titel statt als Teil des Titels; der Titel ist ein Verb mit Gegenstand: *Tickets personalisieren*.
- **Die zwei Regeln ziehen um:** „Partner-Code / Talent-Code“ wird eine `InfoList` in Schritt 1 (zwei Einträge, derselbe Wortlaut, aufgeteilt); „Jede Person braucht ein eigenes Ticket …“ wird der Schluss von Schritt 2. Damit gibt es **keine Aufzählung und keinen grauen Grund** mehr.
- **Die Anleitung steht direkt unter den Kontingenten** (den Karten mit den Codes) und vor „Zusatzkontingent“ und den Anfragen — wer die Codes sieht, liest als Nächstes, was er damit tut.
- **Der Wortlaut bleibt der aus PART-071** (Konrad); dieser Vorschlag teilt ihn nur auf. Wo er sich kürzen lässt (Schritt 1 und 2 haben je zwei Sätze, die dasselbe sagen wie die Seitenköpfe), entscheiden Konrad und der Partner-Chat.

**Handy:** die Schritte stehen untereinander, die Marke links, die `InfoList` bricht unter die Bezeichnung (`InfoList schmal` ist nicht nötig).

### Bausteine

| Zweck | Baustein | Neu? |
|---|---|---|
| Rahmen | `Card`, Überschrift `h2` mit `ct-h2` | nein |
| Nummer je Schritt | `SchrittMarke` | nein |
| Wer bekommt welchen Code | `InfoList` | nein |
| „Nicht vergessen“ | `Badge tone="warning"` | nein |

---

## 5 · PART-136 Talk: Hierarchie und dichtere Speaker-Zeilen

**Anlass:** „Mehrere Infos ohne erkennbare Ordnung, Speaker-Namen größer als die Überschrift ‚Wer spricht‘, Liste klobig durch hohe Zeilen → Hierarchie und dichtere Zeilen.“

### Was heute da ist

Eine Karte je Session: `h2` in `ct-h3` (16/24) mit zwei Badges; darunter zwei Felder (Termin, Bühne) als Definitionsliste in zwei Spalten; ein Hinweis, falls das Programm etwas zurückgegeben hat; dann „Wer spricht“ als **`ct-label` (14/20)** und darunter je Speaker ein Block mit dem Namen als **`<h3>` in `ct-h3` (16/24)** — also **größer als die Überschrift, unter der er steht**, und so groß wie der Session-Titel. Ein Speaker-Block hat Name und Badges, einen Satz (Jobtitel oder die Regel „Die Person pflegt ihre Angaben selbst“), bei verwalteten Slots **denselben Satz mit dem Namen des Kontakts bei jedem Speaker**, einen Knopf *Bearbeiten* — und beim Klick klappt ein Formular mit acht Feldern **in der Liste** auf. Jeder Block ist damit vier bis fünf Zeilen hoch (Name, Satz, Hinweis, Knopf), bevor das Formular aufklappt.

### Die Idee in einem Satz

**Der Session-Titel ist die Überschrift, „Wer spricht“ die Spaltenüberschrift darunter, die Namen sind Zeilen — und was für alle gilt, steht einmal.**

```
Desktop
┌────────────────────────────────────────────────────────────────────────────┐
│ KEYNOTE: DIE ZUKUNFT DER MOBILITÄT                  [Keynote] [Bestätigt] │  <- CardHeader ebene h2 (ct-h2)
│ Freitag, 16. April · 10:00–10:30        Main Stage                         │  <- Eckdaten in einer Zeile
│ ────────────────────────────────────────────────────────────────────────── │
│ Wer spricht (2)                                              ct-h3, 16/24  │
│ ┌────────────────────────────────────────────────────────────────────────┐ │
│ │ Dr. Anna Beispiel          [Bestätigt] [Verwaltet von Leo]  [Bearbeiten]│ │  <- Tr, 56 px; Name ct-label 14/20
│ │ Head of Talent · Beispiel GmbH                                          │ │     Zweitzeile ct-help
│ │ Max Muster                 [Eigener Zugang]                             │ │
│ │ Kein Jobtitel eingetragen                                               │ │
│ └────────────────────────────────────────────────────────────────────────┘ │
│ [ Speaker hinzufügen ]                                                     │
│ Wer sich im Portal angemeldet hat, pflegt seine Angaben selbst. Bei        │  <- einmal, ct-help
│ verwalteten Slots läuft die Kommunikation über Leo Beispiel.               │
└────────────────────────────────────────────────────────────────────────────┘
```

### Aufbau

- **Rangfolge der Größen:** Session-Titel `ct-h2` (18/24, über `CardHeader ebene="h2"`, wie jede Karte im Portal) > „Wer spricht“ `ct-h3` (16/24, `<h3>`) > Name `ct-label` (14/20) > Zweitzeile `ct-help` (13/20). Damit ist die Beschwerde („Namen größer als die Überschrift“) strukturell behoben, nicht nur um einen Punkt.
- **Termin und Bühne in einer Zeile** (`Eckdaten`, wie auf der Hackathon-Startseite) statt zwei Feldern in zwei Spalten — das spart eine Zeile Höhe und liest sich als ein Satz.
- **Speaker als `Table`** mit den Spalten *Wer spricht · Stand · Aktion*: Name und Zweitzeile in der ersten Zelle, die `Badge`s (*Bestätigt*, *Verwaltet von …*, *Eigener Zugang*) in der zweiten, *Bearbeiten* (`Button size="sm" variant="secondary"`) in der dritten, nur wenn der Partner pflegen darf (`darfPflegen`, wie heute). Zeilenhöhe 56 px (mit Bedienelement, Regel des Kits) statt vier bis fünf Zeilen je Speaker.
- **Bearbeiten im Schubfach** (`Drawer`, Titel „Speaker bearbeiten: Anna Beispiel“) statt aufgeklappt in der Liste — dieselben acht Felder, dieselben Hinweise; Speichern ist die eine primäre Aktion des Schubfachs, Fehler stehen darin (`Drawer error`). Die Liste bleibt beim Bearbeiten dicht.
- **Was für alle gilt, steht einmal:** die Sätze „Die Person pflegt ihre Angaben selbst“ und „Die Kommunikation läuft über …“ (heute je Speaker) wandern als **ein** Absatz unter die Tabelle. Je Speaker bleibt nur das `Badge`.
- **„Speaker hinzufügen“** bleibt als Nebenaktion unter der Tabelle (`SpeakerHinzufuegen` unverändert); der Hinweis `programmeHint` bleibt am Seitenende.
- **Leer** („noch kein Speaker eingetragen“) bleibt der Satz, mit dem Knopf direkt darunter.

**Handy:** `Table stapeln` — der Name bleibt der Kopf der Karte, *Stand* und die Aktion darunter; die Zweitzeile bleibt unter dem Namen; das Schubfach ist am Handy ein Vollbild-Blatt (Verhalten des Bausteins).

### Bausteine

| Zweck | Baustein | Neu? |
|---|---|---|
| Karte mit Titel | `Card`, `CardHeader ebene="h2"` | nein |
| Termin · Bühne | `Eckdaten` | nein |
| Speaker-Zeilen | `Table stapeln`, `Tr`, `Td label` | nein |
| Stand | `Badge` | nein |
| Bearbeiten | `Drawer` mit `error`, `Field`, `Input`, `Textarea` | nein |

---

## Zusammenfassung für den Partner-Chat

Reihenfolge, damit jeder Review klein bleibt und der größte Gewinn zuerst kommt:

1. **PART-136 Talk** (eine Seite, keine neuen Daten, Tabelle + Schubfach) und **PART-113 Tickets** (ein Abschnitt, nur Markup und Zuschnitt der Texte) — beide klein.
2. **PART-109 Dateien** (Tabelle + Schubfach; die Haken bleiben).
3. **PART-106 Eure Daten** (der Wizard wird eine Seite aus Blöcken; hier liegt das meiste Umbauen, und der Entwurf bleibt gemeinsam).
4. **PART-104 Wiki** zuletzt, weil es alle Portale trifft: erst `Markdown.tsx`/`WikiView.tsx`, dann Wächter und Editor-Hinweis, dann die 26 Textstellen als eigener Commit.

**Tests**, die ich dafür vorschlage (Quelltext-Tests wie bisher): Wiki — Zuordnung der Ebenen in `Markdown.tsx`, Wächter über `content/wiki/*.md`; Eure Daten — keine `StepBar` mehr in der Seite, vier `Block`; Dateien und Talk — `Table stapeln` mit der Zahl der Spalten; alle — Tailwind übersetzt die neuen Klassen. **Texte** (DE und EN) neu: Eure Daten (*Bereiche ausgefüllt*, *Es fehlt noch*, Marken *Fertig* / *Offen* / *n von m*), Dateien (*Details*, *Herunterladen*, *Noch nicht da*), Tickets (*Nicht vergessen*, die zwei Einträge der `InfoList`), Talk (*Wer spricht (n)*, die zwei Sätze unter der Tabelle, Titel des Schubfachs).

---

## Fragen

Konrad entscheidet; Plan vergibt die K-Nummern.

**An Konrad**

1. **Wiki (PART-104): „Der Artikel ist die Seite“** — der Artikeltitel wird der große Seitentitel (statt „WIKI“), die Abschnitte werden zu Überschriften in 18 px Versalien mit Linie darüber? Das ist die größte sichtbare Änderung des Vorschlags. Alternative ohne Umbau: Titel bleibt klein, die Abschnitte bekommen nur Linie und mehr Abstand (weniger Wirkung).
2. **Wiki: Wir dürfen die 26 fetten Zeilen in den Texten zu Zwischenüberschriften (`###`) machen** — Wortlaut bleibt, nur die Markierung ändert sich — und eine Regel für Überschriften (Frage oder Substantiv, keine Doppelpunkte) einführen?
3. **Eure Daten (PART-106): vier Abschnitte auf einer Seite statt vier Schritte mit „Weiter“,** mit einer Speichern-Leiste, die nur bei Änderungen erscheint — einverstanden? Mit „Unterpunkte im Menü“ ist gemeint, dass die vier Abschnitte unter „Eure Daten“ in der Seitenleiste erscheinen (ohne eigene Seiten) — oder wollt ihr vier eigene Unterseiten?
4. **Dateien (PART-109): Beschreibung, Regeln, Vorschau und Upload hinter dem Namen in einem Schubfach,** die Zeile zeigt nur Name, Stand, Frist, Aktion; „Offenes zuerst“ als Reihenfolge — einverstanden?
5. **Talk (PART-136): Speaker bearbeiten im Schubfach statt aufgeklappt in der Liste** — einverstanden?
6. **Tickets (PART-113):** Die Anleitung wandert **direkt unter die Codes**, und die zwei Regeln wandern in die Schritte, die sie betreffen — dürfen wir sie dafür auch ein wenig kürzen?
7. **Nebenfrage Favicon (QS-071, #361):** Das Icon ist die Bildmarke in Off-White auf einem **Navy**-Quadrat (wie in der Seitenleiste). Alternativ in **Violett `#5454C5`**, der Originalfarbe der Marke — Navy trägt auf hellen und dunklen Tab-Leisten, Violett fällt in einer Reihe grauer Tabs mehr auf. Das Bild zum Vergleich hat Konrad bekommen; Umstellen ist ein Lauf des Skripts `scripts/icons-erzeugen.mjs`.

**An den Partner-Chat**

1. **PART-113:** Stehen `ruleCodes` und `ruleOwnTicket` noch an anderer Stelle (Wiki-Artikel „Tickets und Akkreditierung“ sagt dasselbe)? Dann können die Schritte auf der Seite kürzer werden und auf das Wiki verweisen.
2. **PART-109:** Bleibt es bei den fünf Status der Pflichten (offen, eingereicht, angenommen, zurückgewiesen, überfällig)? Die Reihenfolge der Zeilen hängt daran.
3. **PART-136:** Gibt es Slots mit mehr als drei Speakern? Dann lohnt eine Zusammenfassung („+ 2 weitere“) statt einer langen Tabelle; sonst nicht.
