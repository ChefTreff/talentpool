# Design-Briefing — ChefTreff Portale (v0.8, Stand 24.09.2026)

> Verbindlich für alle Portale (Talent, Speaker, Speaker-Manager, Partner inkl. Messeshop, Hackathon, Volunteers, Initiativen, Admin).
> Quellen: Figma „REBRANDING CHEFTREFF" — exportierte Frames A1 Farben (ChefTreff-Basis, Events), A2 Gradients, A3 Fonts, A4 Buttons, A6 Layout & Abstände, Hero-Highlight-Regel, Logos, Formen-SVGs; `ChefTreff_PartnerPortal_Design_v1.html`; Schriftordner.
> v0.1 → v0.2: exakte Hex-Werte, Typo-Skala, Spacing-Skala, Button-States, Gradient-Definition; Abschnitt 0 „Brand → Produkt" neu.
> v0.5 (12.09.2026): Akzent `#6262DC` nach Brandbook Final, Formen-Korrektur (§5), kein Dark Mode bestätigt. **Ausführende Schicht für jede UI-Arbeit ist der Skill `.claude/skills/portal-design/` (laden mit `/portal-design`):** Quellenrang, Regeln 1–10, Verbotsliste, Muster, Kontrastmessung (`referenzen/kontrast.mjs`). Dieses Briefing bleibt die Quelle für Tokens, Schriften, kein Dark Mode, DE/EN und wird mit dem Skill synchron gehalten. Quellenrang für Markenfakten: Brandbook Final > Website/CI > Briefing > Code; Portal-Entscheidungen (Entscheidungslog, §0, v0.4 „Kontrast schlägt Token") gehen vor.

## 0 · Grundsatz: Brand-Styleguide ≠ Portal-UI — so übersetzen wir
Der Styleguide ist ein **Website-/Marken-Styleguide** (Navy-Vollfläche, alles zentriert, 82-px-Versalien, Pfeil-Buttons in Laica-Kursive). Portale sind **Arbeitswerkzeuge**: minimalistisch, clean, UX-first, „Backend-Charakter" (Konrad, Partner-Portal-Design v1). Deshalb gilt:

| Brand (Website) | Portal (App) |
|---|---|
| Navy `#081A35` als Vollfläche | Navy für **Sidebar/Topbar, Login-/Welcome-Screens, Marken-Momente**; Arbeitsflächen hell |
| Alles zentriert | **Linksbündig**, Formulare und Tabellen lesen sich links → rechts |
| H1 82 px Versalien | H1 **28–32 px**, Versalien nur für Seitentitel/Sektions-Header |
| Pfeil-Buttons mit Laica-Kursive („Apply Now!") | **nur** für Marketing-CTAs (Landing, Welcome, Bewerbungs-Highlight); Formular-/Tabellen-Buttons = Pille/Rechteck mit Sharp Sans SemiBold |
| Hero-Highlight-Wort (Extrabold Italic + Akzent) | nur auf Login/Welcome/Dashboard-Begrüßung — **nie** in Datenansichten |
| Gradient-Dreiecke, Winkel, Scribbles / Line-Art als Hintergrund | dezent auf Login/Welcome/Empty-States; nie hinter Text oder Tabellen |
| Akzent „ChefTreff-Basis" = Weiß `#F5F4F2` | funktioniert nur auf Navy → Portale nutzen einen **farbigen Aktions-Akzent** (siehe 2) |

## 1 · Haltung
- Eine primäre Aktion pro Screen. Progressive Disclosure. Leere Zustände erklären den nächsten Schritt.
- Zustand in **Form und Farbe** (Chip/Pille/Fortschritt), nie Farbe allein.
- Du/ihr-Ansprache; Buttons sagen, was passiert („Speichern" → „Gespeichert"); Fehler sagen, was zu tun ist.
- Keine dekorativen Animationen; Bewegung nur als Feedback (≤ 200 ms), `prefers-reduced-motion` respektieren.

## 2 · Farben (Figma-Variables-Collection „Colors", exakt)
**Global (alle Themes)**
| Token | Hex | Portal-Verwendung |
|---|---|---|
| `navy` / Background | `#081A35` | Sidebar, Topbar, Login-Grund, Text auf hellen Flächen (Ink) |
| `text-light` | `#F5F4F2` | Text auf Navy; **Seitengrund** heller Flächen (Off-White) |
| `text-muted` | `#A0AAB9` | Hilfstexte auf Navy; auf Hell abdunkeln → `#5C6878` (Kontrast ≥ 4.5:1) |
| `border` | `#1E3250` | Trennlinien auf Navy; auf Hell → `#DCDFE5` |
| `success` | `#34D399` | erledigt / bestätigt |
| `warning` | `#FDC422` | offen / Frist / Code |
| `error` | `#EF4444` | überfällig / Fehler / kritisch |
| Weiß | `#FFFFFF` | Karten, Eingabefelder auf Off-White |

**Themes (Accent · Hover · Soft)**
| Theme | Accent | Hover | Soft |
|---|---|---|---|
| ChefTreff-Basis | `#F5F4F2` | `#E5E4E2` | `#FAFAF9` |
| Events | `#6262DC` (Brandbook Final; Website und ältere CI-Vorgaben: `#6D6DEF`) | `#5B5BD9` | `#E8E8FC` |
| FLC · Education · Media | *noch nicht exportiert* — Board zeigt Indigo/Violett · Gelb · Türkis | | |

**Portal-Entscheidung (Frage 50, entschieden; Akzentwert aktualisiert 12.09.2026):** Aktions-Akzent = **Indigo `#6262DC`** (Brandbook Final, Feld FARBEN; Website und ältere CI-Vorgaben nennen noch `#6D6DEF`). Ramp: `#5B5BD9` (Text, Links, Button-Füllung, Hover), `#4A4AC5` (gedrückt, Text auf Soft), `#E8E8FC` (Soft für Selected/Hover-Flächen). Gemessen: `#6262DC` auf Weiß 4,88:1 — trägt weißen Text `#FFFFFF`, nicht Off-White `#F5F4F2` (4,44:1); auf dem Off-White-Grund 4,44:1 → **Text/Links in Akzent auf `#F5F4F2` immer `#5B5BD9`** (4,85:1), Flächen/Ränder/Fokusring dürfen `#6262DC`. Semantik (success/warning/error) bleibt vom Akzent getrennt. Neutrale: Grau mit Navy-Stich (`#5C6878`; `#8A94A6` nur deaktiviert/dekorativ; `#DCDFE5`, `#F0F1F4`), keine reinen Mittelgrau-Töne. Farben anderer Divisionen (Gelb, Türkis) kommen in den Portalen nicht vor — auch nicht als kleiner Akzent (v0.3).

## 3 · Typografie (A3 Fonts + A6)
**Familien:** Sharp Sans Display No1 (ExtraBold, ExtraBold Italic, SemiBold, SemiBold Italic vorhanden) · ABC Laica Regular Italic (vorhanden, woff2).
**Website-Skala (Referenz):** H1 82 EB Caps · H2 52 EB Caps · H3 32 EB Caps · H4 22 EB Caps / 22 SB · H5 16 EB Caps / 16 SB · H6 14 SB Caps / 14 SB · Laica: 38 / 20 / 16 Regular Italic · Body Sharp Sans **Medium** 16–17, letter-spacing 0.66 px · Headline letter-spacing 3 %.

**Portal-Skala (abgeleitet, 8-pt-Rhythmus)**
| Rolle | Schrift | Größe/Zeile | Regel |
|---|---|---|---|
| Seitentitel (H1) | Sharp Sans EB, VERSALIEN, tracking 3 % | 28/32 (mobil 24/28) | einmal pro Seite |
| Sektions-Header (H2) | Sharp Sans EB, Versalien | 18/24 | sparsam |
| Karten-/Gruppentitel (H3) | Sharp Sans SB | 16/24 | Mixed Case |
| Labels, Tabs, Buttons | Sharp Sans SB | 14/20 (Eyebrow 12/16, tracking 6 %, Versalien) | |
| Fließtext, Formulare, Tabellen | Sharp Sans **Medium** — *fehlt im Ordner* → bis dahin Systemstapel `-apple-system, "Segoe UI", "Helvetica Neue", Arial` | 15–16/24, max. 70 Zeichen | Zahlen `tabular-nums` |
| Laica-Moment | ABC Laica Regular Italic | 20/28 (Welcome 32/40) | **ein** kursives Wort/Halbsatz pro Screen; nie UI-Text |

Highlight-Regel (nur Welcome/Login/Landing): ein Schlüsselwort im Titel Sharp Sans **ExtraBold Italic** in Akzentfarbe, Rest ExtraBold Weiß, alles Versalien, Navy-Grund — Beispiel „THREE WAYS WE'LL PUSH YOU *FORWARD*".
Einbindung: `@font-face` aus `/public/fonts` als WOFF2 (`font-display: swap`); Sharp Sans liegt nur als OTF → Web-Lizenz + Konvertierung klären (Frage 49); Fallbacks immer setzen.

## 4 · Layout & Abstände (A6, exakt)
- **Grid:** Desktop ≥ 1280: 12 Spalten · 24 Gutter · 80 Rand · Tablet 768–1279: 8 · 20 · 40 · Mobile < 768: 4 · 16 · 20. Breakpoints 768 / 1280 / 1440.
- **Breiten:** Content max 1200 (Admin-Tabellen dürfen 1400), Text-/Formularspalte 800 (Formulare 640 bevorzugt).
- **Spacing-Skala (8-pt):** 4 micro · 8 xs · 16 s · 24 m · 32 l · 48 xl · 64 2xl · 80 3xl · 120 4xl. Portal: Karten-Innenabstand 24, Abstand Karte↔Karte 16–24, Sektion↔Sektion 32–48 (Website: 80–120).
- **Ausrichtung:** Portal linksbündig; zentriert nur Login/Welcome/Empty-States.
- **Navigation:** Partner/Speaker/Volunteer: Sidebar (Navy) mit Gruppen *Übersicht · Euer Unternehmen/Profil · Euer Summit · Eure Formate · Support*. Talent-Portal: Top-Nav, mobile-first. Admin/Manager: Desktop-first, dichte Tabellen, Filterleiste oben, sticky Header.
- **Dashboard-Muster:** Checkliste „3 von 5 erledigt", Fristen mit Countdown, Ansprechpartner-Karte, Kennzahl-Kacheln.

## 5 · Komponenten
**Buttons (A4, Events-Theme → Portal-Akzent)**
| Variante | Default | Hover | Disabled |
|---|---|---|---|
| Primary | Fill `#5B5BD9` (`accent-strong`), Text `#F5F4F2`, kein Border | Fill `#4A4AC5` | Fill 40 % · Text 60 % Opacity |
| Secondary | transparent, Text `#5B5BD9`, Border `#6262DC` 2 px | Fill `#6262DC` 10 % | 40 % Opacity gesamt |
| Ghost/Text | Text `#5B5BD9` | Underline | 40 % |
| Destructive | `#EF4444` | dunkler | 40 % |
Form: Pille (`border-radius: 999px`) oder 8-px-Rechteck — **eine** Form pro Portal konsequent; Höhe 40 (Tabellen 32); Label Sharp Sans SB 14. Marketing-CTA („Apply Now!"): Pfeilform + Laica Italic — nur Landing/Welcome/Bewerbungs-Highlight.
**Inline-Links:** Wort in Akzent `#5B5BD9` + Underline, kein Fett/Italic.
**Formen:** Grundform der Division Events ist das **Dreieck / der spitze Winkel** (Brandbook Final): Verlauf im Akzent auf Navy, dünne Linienzüge, Zickzack-Scribbles, Raport — nur dekorativ (Login/Welcome/Empty-States), nie hinter Text. **Korrektur 12.09.2026:** Das Hexagon ist im Brandbook Final das Formelement von **Education**, nicht von Events; bestehende Hexagone (Logo-Mark) bleiben, neue Avatar-Masken, Marker und Icon-Container werden nicht hexagonal gebaut. Chevron als Richtungs-/Fortschritts-Element; Line-Art (Stroke Akzent 2 px) nur dekorativ.
**Gradient (A2):** 110°, Fill-Opacity 60 %, Stops 0 % → Akzent 0 % Opacity, 100 % → Akzent 100 %. Nur auf Navy-Hintergründen (Login/Welcome).
**Status-Chips:** success/warning/error als Soft-Fläche (Farbe 15 %) + Text in Farbe (abgedunkelt für Kontrast) + Icon/Text — nie nur Farbe.
**Tabellen:** Zebra aus, dünne `border` Linien, sticky Header, Zahlen rechts + tabular, Zeilenhöhe 44, Hover `#F0F1F4`.
**Formulare:** Label über Feld (SB 14), Hilfetext darunter (muted 13), Fehler in `error` mit Text, Feldhöhe 40, Radius 8, Fokus-Ring 2 px Akzent. Pflicht mit „*" **und** Hinweis im Label.
**Leere Zustände:** kurze Erklärung + eine primäre Aktion; optional dezente Form-Grafik.

## 6 · Themes & Zugänglichkeit
- **Light-first, kein Dark Mode** (Off-White Grund, weiße Karten, Navy Ink; v0.3, bestätigt 12.09.2026: der Akzent erreicht auf Navy nur 3,56:1, eine Dark-Variante bräuchte eine eigene hellere Akzentstufe ohne Markenquelle). Tokens bleiben theme-fähig, ausgeliefert wird nur Light.
- Kontrast ≥ 4.5:1 (Text), ≥ 3:1 (UI-Elemente); sichtbarer Fokus; volle Tastatur-Bedienbarkeit; Touch-Ziele ≥ 44 px.
- DE/EN-Umschalter; alle Labels aus `vocab_term`, nie hartcodiert.

## 7 · Umsetzung im Code
- Tokens als CSS-Variablen `--ct-*` in `app/globals.css` (`:root`, gemappt in `@theme inline`); **in Komponenten nur Tailwind-Klassen** (`bg-accent`, `text-muted` …), nie Hex-Werte und nie `var(--ct-…)` direkt. Ein anderer Akzentwert ist eine Zeile in `globals.css`.
- Gemeinsames UI-Kit in `components/ui/` (Export über `components/ui/index.ts`) für alle Portale; der externe Designer themed **Tokens**, nicht Komponenten.
- Jede Komponente liefert: Focus, Hover, Disabled, Loading, Empty, Error — nur Light. Kontrast wird gemessen, nicht geschätzt: `node .claude/skills/portal-design/referenzen/kontrast.mjs`.

## 8 · Offen (→ Fragenkatalog)
- Frage 48 (Themes FLC/Education/Media) **entfällt** — Theme = Events, ausschließlich (v0.3).
- Frage 49 (Sharp Sans, Web-Lizenz) **entschieden** (v0.3); offen bleibt der Prüfpunkt Lesbarkeit SemiBold in dichten Tabellen (UI-Kit-Review).
- Frage 50 (Portal-Akzent, Dark Mode) **entschieden**: `#6262DC` (v0.5), kein Dark Mode (v0.3, bestätigt v0.5).
- Einstieg Designer / Token-Übergabe (Frage 51) — offen, siehe Abschluss-Checkliste „Designer-Loop".

## 9 · Änderungen v0.3 (08.09.2026, Konrad)
- **Theme = Events, ausschließlich.** FLC/Education/Media entfallen (Plattform bewegt sich nur im Bereich Events/FLS). Portal-Akzent damit **final**: `#6D6DEF` · Hover `#5B5BD9` · Soft `#E8E8FC`; Text in Akzent auf Hell `#5B5BD9`. Abschnitt 2 „Portal-Entscheidung" gilt. *(Akzentwert seit v0.5: `#6262DC`, Ramp unverändert.)*
- **Kein Dark Mode.** Tokens bleiben theme-fähig, ausgeliefert wird nur Light.
- **Typografie:** Lizenz deckt Web-Einbettung ab. **Sharp Sans Display No.1 SemiBold ist der Textschnitt** (Fließtext, Formulare, Tabellen); ExtraBold für Titel/Sektionen; Laica Italic als Akzent. Umsetzung: OTF → WOFF2, `@font-face` mit `font-display: swap`, Systemstapel nur als Fallback. **Prüfpunkt UI-Kit-Review:** Lesbarkeit von SemiBold bei 15–16 px in dichten Tabellen — falls zu schwer, Book/Medium nachlizenzieren.
- **Felder:** alle Matching-Felder optional aufnehmen (Wizard-Schritt „Karriere & Matching"); keine sensiblen Felder.
- **Onboarding:** 3-Schritt-Wizard + Fortschritt + Progressive Profiling (bestätigt).

## v0.4 (08.09.2026, aus dem Review PR #1) — Kontrast schlägt Token
- **Primärfläche mit weißem Text:** `#5B5BD9` (4,9:1). `#6D6DEF` (3,76:1 auf Weiß) nur für Nicht-Text-Akzente (Badges-Rand, Fokusring, Icons, Linien) und für Text ab 24 px. Gleiches Muster für Destructive (dunklere Stufe für Text) und für Text auf `#E8E8FC` (Navy statt Akzent). *(Seit v0.5 ist `accent` = `#6262DC` mit 4,88:1 auf Weiß — weißer Text darauf ist erlaubt; die Regel „Akzenttext auf Off-White in `#5B5BD9`" bleibt, weil `#6262DC` dort nur 4,44:1 erreicht.)*
- **Bedienelemente:** neues Token `--ct-border-strong: #7F8A9C` (3,0:1 auf Weiß, WCAG 1.4.11) für Feldränder, Checkboxen, Schalter. `#DCDFE5` bleibt für Trennlinien, Karten, Tabellenraster.
- **Regel:** Wo Token und Kontrastvorgabe kollidieren, gewinnt die Kontrastvorgabe; die Abweichung wird hier notiert.

## v0.5 (12.09.2026) — Brandbook Final, Skill als ausführende Schicht
- **Akzent `#6262DC`** (Brandbook Final, Feld FARBEN) ersetzt `#6D6DEF`; Ramp `#5B5BD9 / #4A4AC5 / #E8E8FC` unverändert. Auf Akzentflächen steht weißer Text `#FFFFFF` (4,88:1), nicht Off-White; Akzenttext auf dem Off-White-Grund bleibt `#5B5BD9`; Primär-Buttons bleiben `accent-strong`/`accent-deep`. `accent` und `accent-strong` liegen jetzt nah beieinander — die Trennung ist funktional (Kontrast), nicht gestalterisch. Umgesetzt in `app/globals.css` (`--ct-accent`).
- **Formen:** Dreieck/Winkel statt Hexagon (§5); Hexagon = Education.
- **Kein Dark Mode** bestätigt (§6).
- **Skill `/portal-design`** (`.claude/skills/portal-design/`, PR #27) ist für jede UI-Arbeit verbindlich zu laden: Quellenrang, „Marke ≠ Portal", Regeln 1–10, Verbotsliste, Muster, Kontrastmessung. Briefing und Skill werden synchron gehalten; Abweichungen stehen im Entscheidungslog.
- **`text-muted-soft` (`#8A94A6`, 3,06:1) trägt keinen Text:** nur deaktivierte Zustände und rein dekorative Zeichen (Stepper). Zwei Stellen mit echtem Inhalt (`admin/vokabular`, `admin/personen/[id]`) auf `text-muted` korrigiert.

## v0.6 (14.09.2026) — Design-Durchgang F7 auf der Bereichs-Shell (PR #34)
- **Typo-Rollen in `@layer components`**, damit sich jede Rolle mit einer Farbklasse kombinieren lässt (unlayered hatten sie jede Utility geschlagen — auf der Navy-Seitenleiste wäre `ct-help` dunkel geblieben). Neue Rollen `.ct-small` (14/20, ohne Fettung), `.ct-display` (40/44, ab 768 px 52/56 — die Welcome-Headline), `.ct-wordmark` (16/24, Logo-Lockup). 88 rohe Schriftgrößen in 38 Dateien entfernt; Regel präzisiert: fehlt eine Größe, kommt sie als Rolle nach `globals.css`, nie als `text-[…px]` in eine Seite.
- **Token `highlight` `#FF88CF`** (Highlight-Pink des Brandbooks) einzig für das Highlight-Wort auf Navy (Login, Welcome, Begrüßung): 8,0:1 auf Navy; auf Weiß nur 2,2:1 und dort verboten; nie UI- oder Statusfarbe. Die Highlight-Regel aus §3 lautet damit: Schlüsselwort Sharp Sans ExtraBold Italic in `text-highlight`, Rest ExtraBold Off-White, Navy-Grund — der Akzent selbst trägt auf Navy keinen Text (3,56:1).
- **Events-Form statt Hexagon:** `EmptyState` zeigt ein Dreieck (2 px Umriss im Akzent); `BrandBackdrop` (drei geschachtelte Dreiecke, ein Zickzack-Linienzug, `accent-soft`, nur Umriss) auf Login und Welcome, ab 768 px, nie hinter Text.

## v0.7 (17.09.2026) — Design-System v2 abgenommen (PR #53)

Konrads Abnahme auf der Preview und seine acht Entscheidungen. Grundlage: `docs/design-system-v2-auftrag.md`, Team-Portal-Walkthrough vom selben Tag. Was hier steht, ist im Skill `/portal-design` ausgeführt.

1. **Hero-Band auf jeder Startseite**, auch Admin und Produktion — nicht nur in den Kundenportalen. Damit ist die Frage aus dem Auftrag §7 beantwortet: kein flacherer Kopf für interne Bereiche.
2. **Eine Porträt-Form für alle Personen.** Das gekippte Dreieck mit Akzentverlauf (`PortraitShape`) gilt für Speaker, Jury, Team, Ansprechpartner und Buddys. Das runde Foto mit Akzent-Ring entfällt. `PersonCard` und `ContactCard` unterscheiden sich in der **Dichte**, nicht in der Form.
3. **Highlight-Pink als Dringlichkeits-Chip erlaubt**, auf dunklem Grund: `<Badge tone="highlight">` mit Navy-Text (8,0:1) für knappe Kontingente und Restplätze („Noch 2 Plätze frei", Vorbild Social-Post `319:692`). Auf hellem Grund bleibt Pink verboten (2,2:1); dort trägt `warning`. Der Ton ist eine Dringlichkeit, kein Status.
4. **Design-System v2 gilt**, die alte Gestaltung wird abgelöst (Rollout D2). Die Kit-Schau unter `/design` bleibt als Nachschlagewerk.
5. **Die Seitenleiste bleibt Navy.** Das Team-Portal hat eine helle Leiste; übernommen wird sie nicht. `QS-001` und `QS-007` bleiben damit gültig.
6. **Knöpfe und Chips bleiben 8-px-Rechtecke.** Die Pillen des Team-Portals werden nicht übernommen — eine Form konsequent (§5).
7. **Zeilenhöhe 44, mit Bedienelementen 56.** 44 gilt für reine Datenzeilen; sobald ein Knopf oder Feld in der Zeile steht, braucht sie die Höhe des Bedienelements plus Abstand (`<Tr controls>`).
8. **Fotos:** die Penno-Serie der Website ist freigegeben, unbeschränkte Nutzungsrechte bei ChefTreff. Bilder erscheinen in Hero-Band, Detail-Karten und Personen-Karten — sonst nirgends.

**Rechtstexte:** Impressum und Datenschutz verweisen auf die Hauptwebsite (`chef-treff.de/impressum/`, `chef-treff.de/datenschutzerklärung/`), Ziel in neuem Tab. Offen bleibt als P1 auf Konrads Checkliste, ob die Erklärung der Website die Verarbeitung **im Portal** abdeckt (Magic-Link, Supabase, Vercel, Resend, Assistent, Speicherfristen) — `QS-018`.

## v0.8 (24.09.2026) — Talent-Startseite als Vorbild (QS-037)

Konrad, Feedback-Runde 24.09.: Die Startseite des Teilnehmer-Portals zeigt *„klare farbliche Hierarchien"*, nutzt die Schriften besser (*„bspw. die Italic Schrift"*) und setzt Platzhalter für Bilder — alle übrigen Portale werden danach umgestaltet, ein PR je Portal (Speaker, Partner, Speaker-Leads, Admin). Ausgeführt im Skill, `referenzen/muster.md` → „Das Talent-Muster".

1. **Drei Farbstufen auf jeder Startseite:** Navy (Band) → Akzent (das kursive Wort, die Aktion) → Akzent-Soft (Bildflächen der Einstiege) → Weiss (die Arbeit).
2. **Hero-Band mit Gruss, einem Highlight-Wort und genau einer Aktion** — dem nächsten offenen Schritt.
3. **Drei Einstiege als `PhotoCard`** unter dem Band; ihre Bildflächen sind der Platz für die Penno-Fotos (Entscheidung 8 von v0.7 gilt weiter: Bilder nur in Band, Detail- und Personenkarten).
4. **Laica im Seitenkopf** (`PageHeader word`): Das Portal übernimmt den Sektionskopf der Website jetzt vollständig. Bis v0.7 stand im Arbeitsbereich eine Versalienzeile statt Laica. Die Regel „ein Laica-Moment pro Screen" bleibt, das Wort ist dieser Moment.
5. **`<h2>` ist `.ct-h2`**, auch in Karten; `.ct-h3` für Titel innerhalb eines Abschnitts, Meldungen, Dialoge. Eine Karte je Seite darf den Akzent-Umriss tragen.
6. **`PhotoCard` liegt unter 640 px quer** (Bildfläche als Quadrat links), damit drei Einstiege auf dem Telefon nicht tausend Pixel vor der Arbeit stehen.
7. **Die Seitenleiste bleibt Navy — ausser im Admin** (QS-046, Konrad 24.09.: „farblich abgrenzen, z. B. der Kontrastton Lila statt Dunkelblau"). Der Admin trägt `accent-deep`, damit man sofort sieht, dass man in der Verwaltung ist; Entscheidung 5 vom 17.09. gilt für alle anderen Portale weiter. Dazu drei Ebenen in jeder Leiste (QS-045) und im Admin die Portale unten statt oben.
