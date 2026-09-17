# Auftrag Design-System v2 — Website-Blöcke als Fundament der Portale (17.09.2026)

> **Für die Design-Session** (Chat „FLS27 · Design“, Branch-Präfix `design/`, Port 3005). Auftraggeber Konrad (COO). Architektur-Session prüft die PRs, Konrad nimmt auf der Vercel-Preview ab. Grundlage: `docs/plan-ergaenzung-2026-09-17.md` §6 und Konrads Entscheidungen vom 17.09. (unten). Verbindlich bleibt der Skill `/portal-design` (`.claude/skills/portal-design/`) — dieser Auftrag **ändert ihn**, er umgeht ihn nicht: jede Regel, die hier fällt oder neu dazukommt, wird im Skill und in `docs/design-briefing.md` (v0.7) nachgezogen.

## 1 · Ausgangslage
Konrad ist mit dem Design der Portale sehr unzufrieden: „So könnte ich das niemals an unsere Partner senden.“ Das Fundament steht (Sharp Sans und ABC Laica als WOFF2 in `public/fonts`, Logo-SVGs in `public/brand`, Tokens in `app/globals.css`, UI-Kit in `components/ui`, Kontrastmessung), aber die Seiten wirken dünn, textlastig und generisch. Das Rebranding ist durch; die Website-Blöcke im Figma „REBRANDING CHEFTREFF“ sind das neue Fundament. **Ein Portal ist keine Website:** übersichtlicher, interaktiver, ein Werkzeug. Gesucht ist der Mittelweg — und Konrads Maßstab ist: „dass man gut damit arbeiten kann.“

## 2 · Konrads Entscheidungen (17.09.2026, verbindlich)
1. **Richtung „Hell mit Marken-Momenten“** überall, wo gearbeitet wird. Welcome, Login und Hero-Bänder dürfen im dunklen Branding stehen. Am Ende zählt die Arbeitstauglichkeit.
2. **Sidebar bleibt** — auch wenn die Website ein Header-Menü hat.
3. **Nur Events-Branding.** Alles Gelb der Website (`#FFCD40`, Academy) wird zur Events-Primärfarbe **`#6262DC`** (Brandbook Final; Ramp `#5B5BD9 / #4A4AC5 / #E8E8FC`, siehe Skill `referenzen/tokens.md`). Keine Farben anderer Divisionen, auch nicht als kleiner Akzent.
4. **Formen:** das **Hexagon aus den Website-Blöcken** für Aufzählungs- und Schrittmarker (Step-Section-Marker, Bullets, Nummern) — im Akzent statt Gelb. Die **Gradient-Elemente** (Pfeil-/Chevron-Hexagone mit Akzentverlauf, Dreiecke) **nur für Hintergrundflächen und Porträt-Masken** (Speaker-Formen), nie hinter Text. Line-Art-Scribbles nur dekorativ. Damit ist die Entscheidung vom 12.09. („Dreieck statt Hexagon“) für die Portale präzisiert: Hexagon als Marker ja; Porträt-Maske und Hintergrund nach den Marken-Referenzen unten.
5. **Pink `#FF88CF`** nur für Marketing-Momente (Login, Welcome, Hero-CTA, Hinweis-Badge auf dunklem Grund wie „Noch 2 Plätze frei“). Nie als Arbeits-Button, nie auf hellem Grund (2,2:1).
6. **Reihenfolge:** Struktur der Portale zuerst (Abgleich-Matrizen, andere Chats), dann dieses Design-System, dann Feinfeedback je Portal. Die Build-Chats bauen mit dem **heutigen** Kit weiter; ihr tauscht Kit und Tokens.
7. **Team-Portal als zweite Quelle** für alles, was die Website nicht hat (Tabellen, Filter, Formulare): Konrad zeigt es im Walkthrough (er loggt sich ein, ihr lest über Claude in Chrome, nur lesend).

## 3 · Quellen im Figma (Datei `ZmpM9E7Cj8I8JUgPxh4IS3`, über den Figma-MCP lesen: `get_design_context`, `get_screenshot`, `get_variable_defs`)

**Website-Blöcke (Desktop · Mobil), Konrads Liste vom 17.09.:**

| Block | Desktop | Mobil |
|---|---|---|
| Header | `54:7910` | `82:423` |
| Hero | `54:6454` | `82:462` |
| Logo Section | `54:1927` | `82:494` |
| Detail Section | `54:2153` | `82:728` |
| Programm Section | `54:9655` | `82:736` |
| Testimonial Section | `54:2987` | `85:1222` |
| Speaker Section | `54:6114` | `85:1489` |
| CTA Banner | `54:10521` | `85:1867` |
| Ticket Section | `54:4052` | `85:1897` |
| Step Section | `54:9522` | `85:2567` |
| Special Section | `54:9008` | `85:1899` |
| FAQ Section | `54:3972` | `85:2769` |
| Footer Section | `54:9869` | `85:2843` |

**Marken-Referenzen (Konrad, 17.09.):** `3:20146` Personen-Karte mit **Dreiecks-Maske im Akzentverlauf** (Speaker-Form) · `3:20352` **A2 Gradients — Events**: Formen-Gradient für Pfeil-/Chevron-Hexagone, 110°, Fill-Opacity 60 %, Stops 0 % → Akzent 0 % Opacity, 100 % → Akzent 100 %, Verwendung „Hintergrundfläche auf Navy, Akzentfarbe blendet aus transparent ein“ (dort noch mit `#6D6DEF` — es gilt der Token) · `3:19981` **Line-Art**: Dreiecke, Zickzack, Spiralen, Ellipsen als dünne Akzentlinien auf Navy · `319:692` **Social-Media-Post „Next up…“** als Orientierung: Laica-Kursiv-Titel im Akzent, Termin-Zeilen mit Datum-Pille (Akzent-Umriss), „KOSTENLOS“ in Akzent-Versalien, Titel in Extrabold-Versalien, Untertitel, Pink-Badge, Pfeil-CTA mit Laica-Kursive — ein gutes Muster für **Termin- und Fristenlisten**.
Weiter gültig: Brandbook Final (Seite im selben Figma, Auszug `referenzen/marke.md`), Website-Design `201:432`, CI-Vorgaben `201:4`.

**Befund aus der Stichprobe der Architektur-Session (17.09., Hero · Speaker · Step · Detail):** Variablen `Background blue #081A35`, `Light Gray #F5F4F2`, `Yellow #FFCD40`; Typo Sharp Sans H1 82 Extrabold Caps · H3 32 Extrabold Caps · H5 16 Semibold, ABC Laica 38 und 16 Regular Italic — deckungsgleich mit `docs/design-briefing.md` §3. Hero: Laica-Eyebrow, Caps-Titel, ein Satz, Pink-CTA, Fotocollage mit Linien-Scribble. Speaker: Porträts in Hexagon-Masken mit Verlauf, Laica-Rollen-Chip, Name Caps, Organisation kursiv. Step: nummerierte Hexagon-Marker auf einer Linie. Detail: drei Fotokarten mit großem kursivem Akzentwort, Ellipsen-Linien. Die Blöcke stammen teils aus Academy-Seiten (Gelb) — Farbe nach Entscheidung 3 übersetzen, Aufbau übernehmen.

## 4 · Übersetzung Block → Portal-Baustein (Arbeitsgrundlage, in D0 festziehen)

| Website-Block | Portal-Baustein (Komponente) | Einsatz |
|---|---|---|
| Header | Sidebar bleibt; mobil Off-Canvas-Menü im Website-Header-Stil | alle Bereiche |
| Hero | **`HeroBand`**: Navy-Band oben auf der Startseite jedes Bereichs — Laica-Eyebrow, Caps-Titel mit einem Highlight-Wort, ein Satz, **eine** Aktion, Bildfläche rechts (Fotocollage oder Gradient-Form) | Startseiten, Login, Welcome |
| Logo Section | Logo-Wand | Produktion/Admin (Aussteller), Talent-Programm |
| Detail Section | **`PhotoCard`** ×3 mit kursivem Akzentwort | Onboarding-Einstieg, Leerzustände, Wiki-Start |
| Programm Section | Programm-Liste; **Termin-Zeile** nach Social-Post (Datum-Pille, Caps-Titel, Untertitel) | `/programm`, Speaker-Session, Fristen |
| Testimonial | Zitat-Karte | Welcome, Speaker-Reception |
| Speaker Section | **`PersonCard`**: Porträt in Dreiecks-Maske mit Verlauf (`3:20146`), Rollen-Chip, Name Caps, Organisation | Speaker-Listen, Ansprechpartner, Jury, Buddys, Team |
| CTA Banner | **`NextStepBanner`** (Akzentfläche, Navy-Text) | Startseiten: „3 von 8 Aufgaben offen“ |
| Ticket Section | **`TicketCard`** (Kontingent, Codes, QR) | Partner-, Speaker-, Talent-, Volunteer-Tickets |
| Step Section | **`StepBar`**: nummerierte Hexagon-Marker auf Linie = Stepper/Onboarding-Fortschritt | Wizard, Onboarding, Checklisten-Kopf |
| Special Section | Hervorhebungs-Karte für Sonderformate | Hackathon, Masterclass, Company Tour |
| FAQ | **`Accordion`** (`<details>`/`<summary>` oder Button + `aria-expanded`) | Wiki, Hilfe je Bereich |
| Footer | **`PortalFooter`** (Impressum, Datenschutz, Support-Postfach) | alle |

Portal-eigene Bausteine ohne Website-Vorbild — Tabellen, Filterleisten, Formulare, Drawer, Statuschips, Datei-Upload, Board/Kalender — folgen Archetyp A (`referenzen/muster.md`) und dem Team-Portal.

## 5 · Etappen und Ergebnisse

**D0 · Analyse (bis 19.09.)**
- Alle 26 Blöcke und die vier Marken-Referenzen lesen; je Block: Aufbau, Typo-Rollen, Abstände, Farben (mit Übersetzung Gelb → Akzent), Formen, Mobil-Stapelung.
- Team-Portal-Walkthrough mit Konrad (Termin erbitten): Tabellen-Dichte, Filterleisten, Formularaufbau, Farbeinsatz, Navigationstiefe → Notizen für Archetypen B und C.
- Ergebnis: `.claude/skills/portal-design/referenzen/website-bloecke.md` (Block-Katalog mit Übersetzung) und eine Liste offener Fragen an Konrad (höchstens acht).

**D1 · System und Referenz (bis 26.09.)**
- Tokens ergänzen (`app/globals.css`): Verlauf, Masken, Hero-Band, Termin-Pille; keine neuen Graustufen, keine neue Schrift.
- Kit erweitern (`components/ui`): `HeroBand`, `PersonCard`, `StepBar`, `NextStepBanner`, `TicketCard`, `Accordion`, `PhotoCard`, `PortalFooter`, Termin-Zeile; bestehende Komponenten (Button, Card, Table, Badge, Drawer, Modal, Stepper …) an die Blöcke angleichen, Namen und Schnittstellen stabil halten, damit die Build-Chats nichts umschreiben müssen.
- Archetypen **B Detail · C Formular · D Übersicht** entwerfen (`referenzen/muster.md`), mit Team-Portal als Vorbild.
- **Vier Referenzseiten** auf Branch `design/system-v2` als Vercel-Preview: Partner-Startseite (D), „Eure Daten“ `/partner/onboarding` (C), Speaker-Detail im Admin `/admin/speaker/[id]` (B), Login. Screenshots 1440 und 375 im PR.
- Zwei Review-Runden mit Konrad auf der Preview; jedes neue Farbpaar mit `referenzen/kontrast.mjs` gemessen.
- Ergebnis: PR „Design-System v2 — Referenz“, Skill und `docs/design-briefing.md` v0.7 aktualisiert, Abweichungen vom Brandbook benannt.

**D2 · Rollout (bis 05.10.)**
- Shell zuerst (Sidebar, Kopf, Footer, Login, Welcome, Umschalter), dann je Cluster ein PR: Partner → Speaker-Domäne → Talent & Hackathon → Volunteers/Produktion/Check-in → Admin. Seiten, die das Kit regelkonform nutzen, ziehen automatisch mit; handgestrickte Seiten einzeln nachziehen.
- Screenshots 1440 und 375 je Seite im PR; Konrad nimmt je Bereich ab (Backlog des Bereichs, Status `abgenommen`).
- Absprache mit den Build-Chats über die Backlog-Dateien: keine gleichzeitigen Änderungen an Seiten eines Clusters, der gerade konvertiert wird.

**D3 · Feinfeedback (06.–12.10.)** — Nacharbeit aus den Feedback-Runden der Bereiche.

## 6 · Regeln
- Skill `/portal-design` vor jeder Arbeit laden; Regeln 1–10 und Verbotsliste gelten. Was ihr ändert, ändert ihr **im Skill**, nicht daran vorbei.
- Keine rohen Hex-Werte, keine rohen px; Kontrast ≥ 4,5:1 Text, ≥ 3:1 UI; **Kontrast schlägt Token**, Abweichung notieren.
- **Kein Dark-Mode-Schalter.** Dunkle Flächen nur dort, wo sie gestaltet sind (Login, Welcome, Hero-Band, Marken-Momente).
- DE und EN in jeder Komponente; Begriffe aus `vocab_term`/`getI18n`.
- Keine Migrationen, keine RPC-Änderungen, keine Änderungen an Rechten — reine Oberfläche. Wenn eine Seite Daten braucht, die es nicht gibt: ins Backlog des Bereichs, nicht selbst bauen.
- Ein PR je Etappe/Cluster gegen `main`; Review durch die Architektur-Session (talentpool-a9), Abnahme durch Konrad auf der Preview. `npm run lint` und `npm run build` grün.
- **Claude Design** optional: das Kit als Design-System-Projekt spiegeln (`/design-sync`), damit Konrad Bausteine dort ansieht; erst nach D1 und nur, wenn es hilft.

## 7 · Offen (an Konrad, in D0 klären)
- Hero-Band auf **jeder** Startseite oder nur bei Kundenportalen (Partner, Speaker, Talent)? Admin und Produktion könnten flacher bleiben.
- Fotos: Bestand aus der Website (Penno-Agency-Serie) für Hero und Detail-Karten nutzbar? Rechte?
- Porträt-Maske: Dreieck (`3:20146`) für alle Personen oder nur Speaker; Team und Ansprechpartner rund?
- Termin-Zeile mit Pink-Badge („Noch 2 Plätze frei“) für Kontingente im Portal erlaubt (dunkler Grund) oder Badge nur Marketing?
