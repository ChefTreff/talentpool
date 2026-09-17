# Website-Blöcke — Katalog und Übersetzung ins Portal

Gelesen am 17.09.2026 aus Figma „REBRANDING CHEFTREFF“ (Datei `ZmpM9E7Cj8I8JUgPxh4IS3`), Seite **Blocks Website** (13 Blöcke × Desktop und Mobil) und vier Marken-Referenzen von der Seite **Website – CI Vorgaben**. Auftrag: `docs/design-system-v2-auftrag.md` §3–§4.

**Wozu diese Datei.** Die Website ist der Entwerfer, den es sonst nicht gibt. Sie sagt, wie ein Abschnitt bei uns aussieht: welche Zeile oben steht, wie viel Luft dazwischen ist, wo ein Bild hingehört. Die Portale übernehmen den **Aufbau und den Rhythmus**, nicht die Fläche: die Website ist dunkel und zentriert, das Portal bleibt hell und linksbündig (`SKILL.md`, „Marke ≠ Portal“). Pro Block steht deshalb unten, was übernommen wird und was nicht.

## Drei Regeln, die für jeden Block gelten

1. **Farbe übersetzen, Aufbau übernehmen.** Ein Teil der Blöcke stammt von Academy-Seiten und ist gelb (`#FFCD40`) gesetzt. Gelb ist im Brandbook **Education**; für uns gilt Events. Jedes Gelb wird zum Akzent (`accent`-Ramp), jedes `#6D6DEF` ebenfalls — die Website ist noch mit dem alten Akzentwert gebaut (Entscheidung 17.09.2026, `referenzen/tokens.md`). **Keinen Hex-Wert von dort kopieren.**
2. **Maße herunterrechnen.** Website-Desktop ist 1440 breit mit 120 Rand und 82-px-Versalien; Sektionsabstände 52–120. Im Portal gilt die Skala aus `referenzen/tokens.md`: `.ct-h1` 28, Sektion ↔ Sektion 32–48, Inhalt 1200. Die Verhältnisse bleiben, die Zahlen nicht.
3. **Mobil ist die Website schon gestapelt** (Frames 393 breit, Rand 20). Wo ein Block mobil die Anordnung ändert — Step, Footer, Programm —, steht das unten; das ist die Vorlage für unsere Umbrüche.

## Gemeinsame Bausteine der Website

| Bestandteil | Website | Im Portal |
|---|---|---|
| **Sektionskopf** | Laica-Kursiv-Eyebrow → Extrabold-Versalien-Titel (2 Zeilen) → ein Absatz → **eine** Aktion, alles zentriert | `PageHeader`: `.ct-eyebrow` (Versalien, SB) statt Laica, `.ct-h1`, ein Satz, eine Aktion — **linksbündig**. Laica bleibt Login/Welcome |
| **Highlight-Wort** | ein Wort des Titels in Extrabold **Italic**, oft in Akzent oder Verlauf | `.ct-highlight text-highlight` (Pink), nur auf Navy: Login, Welcome, Begrüßung. Nie in Arbeitsansichten |
| **Aktion** | Rechteck ohne Radius, Padding 16/13.5; Hauptaktion Pink mit Navy-Text, sonst 1-px-Umriss | `<Button>` (8-px-Rechteck, `accent-strong`). Pink nur im Marketing-Moment |
| **Karte** | 1 px Umriss im Akzent, **kein** Radius, Innenabstand ~17–24, kein Schatten | `<Card>` (`rounded-ct-lg`, `border-border`, `p-6`). Der Umriss-im-Akzent ist die Auszeichnung für **eine** hervorgehobene Karte, nicht für alle |
| **Bulletzeichen** | Hexagon oder Kreis mit Pfeil, Fläche im Akzent | Hexagon-Marker im Akzent (Entscheidung 17.09.2026) |

---

## Die 13 Blöcke

### 1 · Header — `54:7910` (D) · `82:423` (M)
1440×117 auf Navy. Links Bildmarke, mittig sechs Links (SemiBold 16, Laufweite 1 px, Off-White), rechts ein Umriss-Button. Mobil: Marke links, Burger rechts, Off-Canvas.

**Portal:** Die **Seitenleiste bleibt** (Entscheidung 17.09.2026). Übernommen wird nur die Mobilfassung: unter 1024 px wird aus der Leiste ein Off-Canvas-Menü im Website-Header-Stil, statt der heutigen Liste über dem Inhalt. Die Linkreihe der Website wandert nicht in die Topbar — sie gäbe es sonst zweimal (`QS-009`).

### 2 · Hero — `54:6454` (D) · `82:462` (M)
1440×829 auf Navy, 12 Spalten, Inhalt links ab X 120. Laica-Eyebrow 38 (Akzent) → Titel Extrabold 82/120 % Caps, zwei Zeilen → Absatz SemiBold 16, Breite 590 → Pink-Aktion. Rechts eine Fotocollage aus drei Bildern mit einem dünnen Linien-Scribble, unten rechts eine Zertifikatszeile. Mobil 393×856: alles zentriert, Titel 40, Absatz 14, Collage darunter.

**Portal — `HeroBand`:** Navy-Band oben auf der Startseite eines Bereichs. Eyebrow → Titel mit **einem** Highlight-Wort → ein Satz → **eine** Aktion → rechts Bildfläche (Foto oder Gradient-Form). Höhe deutlich unter der Website: das Band ist eine Begrüßung, kein Bildschirm. Darunter beginnt sofort die helle Arbeitsfläche. Keine zweite Aktion, keine Kennzahlen im Band.

### 3 · Logo Section — `54:1927` (D) · `82:494` (M)
1440×391 auf Navy. Eine Zeile SemiBold 24.65 (Laufweite 3 %) in Akzent, darunter ein **Vollband** in Akzentfarbe (1521×85, läuft über den Rand) mit schwarzen Logos. Mobil 393×366, Zeile zweizeilig.

**Portal — Logo-Wand:** Aussteller- und Partnerlogos in Produktion/Admin, Programmpartner im Talent-Bereich. Das Laufband wird eine **ruhige Reihe** (kein Auto-Lauf, Verbotsliste); die Zahl davor bleibt („34 Partner bestätigt“). Auf hellem Grund, Logos in Originalfarbe auf Weiß.

### 4 · Detail Section — `54:2153` (D) · `82:728` (M)
1440×1202 auf Navy. Sektionskopf zentriert (Titel 82 mit kursivem Schlüsselwort), darunter **drei Fotokarten**: Foto 277×356, darunter ein einzelnes Wort in Extrabold **Italic** 58 im Akzent (DIRECTION · GROWTH · ACCESS), darunter drei Zeilen SemiBold 14. Dünne Ellipsen-Linien im Hintergrund. Mobil gestapelt.

**Portal — `PhotoCard`:** drei Karten nebeneinander für Einstiege, die man einmal liest und dann nicht mehr: Onboarding-Start, Wiki-Einstieg, erklärender Leerzustand. Das kursive Akzentwort ist die Überschrift der Karte (`.ct-laica`, **einmal pro Karte**, nicht pro Screen — hier ist es die Auszeichnung der Gruppe). Nie für Arbeitsdaten, nie als Kachelwand für Listen.

### 5 · Programm Section — `54:9655` (D) · `82:736` (M)
1440×1506 auf Navy, Auto-Layout, Abstand 52. Drei Karten à 1200 mit 1-px-Akzentumriss, Innenabstand 17: links Foto 565×292, rechts Titel Extrabold 32 Caps, rechts oben ein **schräger Tag** („Day 1“, Laica 32, Navy auf Pink), Absatz 14, darunter sechs Punkte in zwei Spalten — je ein Kreis 22 px im Akzent mit Navy-Pfeil und Text Extrabold 22. Mobil: Foto oben, Tag darunter, Punkte zweispaltig.

**Portal — Programm-Liste:** derselbe Zeilenaufbau ohne Foto für Sessions, Fristen und Termine. Der Tag wird `<Badge>`; die Pfeil-Punkte werden eine Liste mit Hexagon-Marker. Für Termine gilt zusätzlich die **Termin-Zeile** aus dem Social-Post (unten).

### 6 · Testimonial Section — `54:2987` (D) · `85:1222` (M)
1440×1303 auf Navy. Drei Video-Karten im Hochformat (333×593) mit Namensüberlagerung, darunter Name Extrabold 32 Caps, ein **Rollen-Chip** (Akzentfläche, Laica 30, Off-White) und die Organisation in Laica 16.

**Portal — Zitat-Karte:** Zitat mit 1-px-Akzentrahmen, darunter Hexagon-Bullet, Name in Versalien, Rolle. Für Welcome, Speaker-Reception und Erfolgsmeldungen. **Kein Video-Hochformat** im Portal; wo ein Video gehört (Speaker-Grußwort), liegt es im `EmbedGate`.

### 7 · Speaker Section — `54:6114` (D) · `85:1489` (M)
1440×1430 auf Navy. Sektionskopf, darunter drei Personen. Porträt in einer **Dreiecks-Maske mit Akzentverlauf**, darunter ein Chip (Akzentfläche, Laica Italic 17.5, Navy-Text), Name Extrabold 32 Caps, Organisation Laica 16.

**Portal — `PersonCard`:** Speaker-Listen, Ansprechpartner, Jury, Buddys, Team. Maske und Verlauf nach `3:20146` (siehe unten). Rolle in Sharp Sans SemiBold statt Laica — Laica bleibt Marketing. Die heutige `ContactCard` (rundes Foto, Akzent-Ring) ist die **dichte** Fassung für Arbeitsflächen; die Dreiecks-Maske ist die **repräsentative** Fassung für Listen, die nach außen wirken.

### 8 · CTA Banner — `54:10521` (D) · `85:1867` (M)
1440×922, dreiteilig: oben eine helle Fläche mit Papiertextur (Bild, Multiply, 30 %) mit Logo, einer Laica-Großzeile 74 in Navy (ein Wort mit Scribble unterstrichen) und Pink-Aktion; darunter ein Fotoband; darunter eine **Merkmalsleiste**: Vollfläche im Akzent, 106 hoch, drei Einträge aus Hexagon 26 px + SemiBold 25, alles in Navy.

**Portal — `NextStepBanner`:** nur die Merkmalsleiste. Akzentfläche, Navy-Text, links der Stand („3 von 8 Aufgaben offen“), rechts eine Aktion. Steht auf Startseiten unter dem Hero-Band. Papiertextur, Fotoband und Laica-Großzeile bleiben auf der Website.

### 9 · Ticket Section — `54:4052` (D) · `85:1897` (M)
1440×1215 auf Navy. Vier Karten à 285×747 im Auto-Layout (Abstand 20, Innenabstand 24) mit **Farbverlauf als Fläche** — je Karte eine Divisionsfarbe. Aufbau: Titelzeile Extrabold Caps + „PASS“ in Extrabold Italic, Beschreibung, Preiszeile (alter Preis durchgestrichen, Pink-Rabatt-Chip, neuer Preis Extrabold Italic), gestrichelte Trennlinie, Häkchenliste, unten ein Button über die volle Breite. Zwischen den Karten **runde Aussparungen** in Navy: die Perforation eines Tickets.

**Portal — `TicketCard`:** Kontingent, Pass-Typ, Code, QR, verbleibende Plätze. Übernommen wird die **Ticketform** (Perforation an den Seiten, gestrichelte Trennlinie zwischen Kopf und Liste) und der Aufbau Kopf → Zahlen → Liste → Aktion. **Nicht übernommen:** die vier Verlaufsflächen — das sind Divisionsfarben (Verbot, `referenzen/marke.md`). Im Portal: weiße Karte, Akzentkopf.

### 10 · Step Section — `54:9522` (D) · `85:2567` (M)
1440×922 auf Navy. Eine **waagerechte 1-px-Linie** über die volle Breite, darauf drei **Hexagon-Marker** (Polygon, 6 Ecken, 65 px, Akzentfläche) mit Ziffer in Laica Italic 32 in Navy. Unter jedem Marker Titel Extrabold 22 Caps (zentriert) und zwei Zeilen SemiBold 16. **Mobil 393×904: die Linie steht senkrecht links, Marker 44 px, Titel und Text rechts daneben linksbündig.**

**Portal — `StepBar`:** der Fortschritt in Wizard, Onboarding und Checklisten-Kopf. Desktop waagerecht auf der Linie, mobil senkrecht mit linker Linie — genau der Umbruch der Website. Ziffer im Hexagon, erledigte Schritte mit Häkchen statt Ziffer (Zustand in Form **und** Farbe). Ersetzt die Knopfreihe des heutigen `Stepper`.

### 11 · Special Section — `54:9008` (D) · `85:1899` (M)
1440×2544, Auto-Layout, Abstand 72. Drei Blöcke à Textspalte links und Foto 691×516 rechts. Die Textspalte besteht aus drei Zeilen Extrabold Caps untereinander (EVENTS / EDUCATION / PODCAST), von denen **je Block eine farbig hervorgehoben** ist, darunter ein Absatz SemiBold 18 und eine Pink-Aktion.

**Portal — Hervorhebungs-Karte:** für Sonderformate, die nicht in eine Liste passen: Hackathon, Masterclass, Company Tour. Übernommen wird die **Gliederung** (breite Karte, Text links, Bild rechts, eine Aktion) und die Idee, dass die Überschrift die Auswahl zeigt: das aktive Format im Akzent, die anderen gedämpft. Die drei Divisionsnamen und ihre Farben bleiben auf der Website.

### 12 · FAQ Section — `54:3972` (D) · `85:2769` (M)
1440×778 auf Navy. Titel zentriert, letztes Wort Extrabold **Italic**. Darunter fünf Zeilen à 1160 breit mit 1-px-Akzentumriss, kein Radius: Frage in SemiBold 16 Versalien, Chevron rechts; geöffnet erscheint die Antwort in derselben Größe, mehrere Absätze. Nur eine Zeile ist offen.

**Portal — `Accordion`:** Wiki und Hilfe je Bereich. Umsetzung `<details>/<summary>` oder Button mit `aria-expanded` — nie ein reiner CSS-Trick. Auf Hell: `border-border`, Frage `.ct-label` (Mixed Case, nicht Versalien — eine Frage in Versalien liest sich als Schild), Chevron dreht beim Öffnen.

### 13 · Footer Section — `54:9869` (D) · `85:2843` (M)
1440×266 auf Navy. Oben eine 1-px-Trennlinie im Akzent über die Inhaltsbreite. Links Wortmarke und Mailadresse (SemiBold 14), rechts eine Linkreihe (SemiBold 16, Abstand 30), darunter links drei Sozial-Icons und rechts das Copyright in 14. **Mobil 393×482: alles zentriert gestapelt, Links in zwei Reihen à drei.**

**Portal — `PortalFooter`:** Impressum, Datenschutz, Support-Postfach, Sprachumschalter. Am Fuß jeder Seite innerhalb der Arbeitsfläche, hell, mit derselben Trennlinie oben. Keine Sozial-Icons (ein Portal wirbt nicht), kein Copyright-Slogan.

---

## Die vier Marken-Referenzen

### `3:20146` Personen-Karte mit Dreiecks-Maske
Der Aufbau, Ebene für Ebene: eine **Alpha-Maske** aus einem Dreieck (368×289, gedreht **−16,6°**) mit Verlaufsfüllung, darin das Porträt (leicht gedreht, 1,25°); dahinter ein zweites Dreieck im selben Winkel mit Verlauf und Vollton; darüber ein **Umriss-Dreieck** (366×351, gedreht **+4,7°**, 1 px, innen). Darunter zentriert: Rollen-Chip auf Akzentfläche, Name in Versalien, Organisation kursiv.

Es sind also **zwei gegeneinander gekippte Dreiecke** — die Spannung entsteht aus der Differenz der Winkel, nicht aus der Form allein. Das ist der Grund, warum eine einzelne gekippte Fläche flach wirkt.

### `3:20352` A2 Gradients — Events
Der Formen-Verlauf, wörtlich aus dem Frame: Richtung **110°** (links-oben → rechts-unten), Fill-Opacity **60 %**, Stops 0 % → Akzent mit **0 % Deckkraft**, 100 % → Akzent voll. Verwendung: „Hintergrundfläche auf Navy, Akzentfarbe blendet aus transparent ein“.

Zwei Anmerkungen. Der Frame nennt die Formen „Pfeil-Hexagone“, die Formen-Fläche daneben (`3:19973`) zeigt aber **Dreiecke und Pfeilspitzen**. Und die Stops stehen noch auf `#6D6DEF`; es gilt der Token. Im Portal: nur auf Navy, nur hinter nichts Lesbarem — Login, Welcome, Hero-Band, Porträt-Maske.

### `3:19981` Line-Art
Dünne Umrisse im Akzent auf Navy: Dreieckskette mit Pfeilspitze, Zickzack, Spiralen, konzentrische Ellipsen, Schraffur. Nur Kontur, nie Fläche. Im Portal dekorativ in `BrandBackdrop` und im Leerzustand, in Arbeitsflächen nicht.

### `319:692` Social-Media-Post „Next up…“ — Vorlage für Termin- und Fristenlisten
Der nützlichste Block für uns, weil er eine Liste ist. Eine Zeile besteht aus:

| Element | Website | Portal |
|---|---|---|
| **Datum-Pille** | Umriss-Pille im Akzent, SemiBold 33.8, Laufweite 4 %, feste Breite | Umriss-Pille im Akzent, `.ct-label`, feste Spaltenbreite, `tabular-nums` |
| **Zusatzzeile** | „KOSTENLOS“ Extrabold Caps im Akzent unter der Pille | Restzeit oder Zustand („noch 5 Tage“, „überfällig“) |
| **Titel** | Extrabold Caps ~48, Weiß | `.ct-label`, Mixed Case |
| **Untertitel** | SemiBold ~32, Off-White | `.ct-help` |
| **Badge** | Pink-Kreis, Navy-Text, gedreht −9° („Noch 2 Plätze frei!“) | `<Badge>` — gerade, nicht gedreht; Pink nur auf Navy, sonst `warning` |
| **Trennlinie** | 1 px im Akzent unter jeder Zeile | `border-b border-border` |

Aus diesem Muster wird die **Termin-Zeile** des Kits: Datum links in fester Spalte, Sache in der Mitte, Zustand rechts. Sie gilt für Fristen, Sessions, Kontingente und Programmpunkte.

## Was aus den Blöcken **nicht** ins Portal kommt

Navy als Arbeitsfläche · zentrierte Fließtexte · Versalien in Fragen und Tabellenzellen · 82-px-Titel · Verlaufsflächen in Divisionsfarben · Papiertextur · Logo-Laufbänder in Bewegung · Video-Hochformat als Layout · gedrehte Badges · Fotobänder als Sektionstrenner · Pink für Arbeits-Buttons.
