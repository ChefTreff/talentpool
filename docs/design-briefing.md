# Design-Briefing — ChefTreff Portale (v0.3, Stand 08.09.2026)

> Verbindlich für alle Portale (Talent, Speaker, Speaker-Manager, Partner inkl. Messeshop, Hackathon, Volunteers, Initiativen, Admin).
> Quellen: Figma „REBRANDING CHEFTREFF" — exportierte Frames A1 Farben (ChefTreff-Basis, Events), A2 Gradients, A3 Fonts, A4 Buttons, A6 Layout & Abstände, Hero-Highlight-Regel, Logos, Formen-SVGs; `ChefTreff_PartnerPortal_Design_v1.html`; Schriftordner.
> v0.1 → v0.2: exakte Hex-Werte, Typo-Skala, Spacing-Skala, Button-States, Gradient-Definition; Abschnitt 0 „Brand → Produkt" neu.

## 0 · Grundsatz: Brand-Styleguide ≠ Portal-UI — so übersetzen wir
Der Styleguide ist ein **Website-/Marken-Styleguide** (Navy-Vollfläche, alles zentriert, 82-px-Versalien, Pfeil-Buttons in Laica-Kursive). Portale sind **Arbeitswerkzeuge**: minimalistisch, clean, UX-first, „Backend-Charakter" (Konrad, Partner-Portal-Design v1). Deshalb gilt:

| Brand (Website) | Portal (App) |
|---|---|
| Navy `#081A35` als Vollfläche | Navy für **Sidebar/Topbar, Login-/Welcome-Screens, Marken-Momente**; Arbeitsflächen hell |
| Alles zentriert | **Linksbündig**, Formulare und Tabellen lesen sich links → rechts |
| H1 82 px Versalien | H1 **28–32 px**, Versalien nur für Seitentitel/Sektions-Header |
| Pfeil-Buttons mit Laica-Kursive („Apply Now!") | **nur** für Marketing-CTAs (Landing, Welcome, Bewerbungs-Highlight); Formular-/Tabellen-Buttons = Pille/Rechteck mit Sharp Sans SemiBold |
| Hero-Highlight-Wort (Extrabold Italic + Akzent) | nur auf Login/Welcome/Dashboard-Begrüßung — **nie** in Datenansichten |
| Gradient-Hexagone / Line-Art als Hintergrund | dezent auf Login/Welcome/Empty-States; nie hinter Text oder Tabellen |
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
| Events | `#6D6DEF` | `#5B5BD9` | `#E8E8FC` |
| FLC · Education · Media | *noch nicht exportiert* — Board zeigt Indigo/Violett · Gelb · Türkis | | |

**Portal-Entscheidung (Vorschlag, Frage 50):** Aktions-Akzent = **Indigo `#6D6DEF`** (Hover `#5B5BD9`, Soft `#E8E8FC` für Selected/Hover-Flächen). Auf Weiß erreicht `#6D6DEF` nur ~4.2:1 → **Text/Links in Akzent immer `#5B5BD9`**, Flächen dürfen `#6D6DEF`. Semantik (success/warning/error) bleibt vom Akzent getrennt. Neutrale: Grau mit Navy-Stich (`#5C6878`, `#8A94A6`, `#DCDFE5`, `#F0F1F4`), keine reinen Mittelgrau-Töne. Format-Farben der Sub-Brands nur als kleiner Akzent (Kachel-Kante, Tag), nie als Fläche.

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
| Primary | Fill `#6D6DEF`, Text `#F5F4F2`, kein Border | Fill `#5B5BD9` | Fill 40 % · Text 50 % Opacity |
| Secondary | transparent, Text `#5B5BD9`, Border `#6D6DEF` 2 px | Fill `#6D6DEF` 10 % | 40 % Opacity gesamt |
| Ghost/Text | Text `#5B5BD9` | Underline | 40 % |
| Destructive | `#EF4444` | dunkler | 40 % |
Form: Pille (`border-radius: 999px`) oder 8-px-Rechteck — **eine** Form pro Portal konsequent; Höhe 40 (Tabellen 32); Label Sharp Sans SB 14. Marketing-CTA („Apply Now!"): Pfeilform + Laica Italic — nur Landing/Welcome/Bewerbungs-Highlight.
**Inline-Links:** Wort in Akzent `#5B5BD9` + Underline, kein Fett/Italic.
**Formen:** Hexagon = Systemelement (Avatar-Maske, Marker, Icon-Container); Pfeil-Hexagon/Chevron als Richtungs-/Fortschritts-Element; Line-Art-Vektoren (Stroke Akzent 2 px) nur dekorativ.
**Gradient (A2):** 110°, Fill-Opacity 60 %, Stops 0 % → Akzent 0 % Opacity, 100 % → Akzent 100 %. Nur auf Navy-Hintergründen (Login/Welcome).
**Status-Chips:** success/warning/error als Soft-Fläche (Farbe 15 %) + Text in Farbe (abgedunkelt für Kontrast) + Icon/Text — nie nur Farbe.
**Tabellen:** Zebra aus, dünne `border` Linien, sticky Header, Zahlen rechts + tabular, Zeilenhöhe 44, Hover `#F0F1F4`.
**Formulare:** Label über Feld (SB 14), Hilfetext darunter (muted 13), Fehler in `error` mit Text, Feldhöhe 40, Radius 8, Fokus-Ring 2 px Akzent. Pflicht mit „*" **und** Hinweis im Label.
**Leere Zustände:** kurze Erklärung + eine primäre Aktion; optional dezente Form-Grafik.

## 6 · Themes & Zugänglichkeit
- **Light-first** (Off-White Grund, weiße Karten, Navy Ink). Dark Mode: Tokens theme-fähig anlegen (Navy-Welt existiert bereits), Aktivierung = Entscheidung (Frage 50).
- Kontrast ≥ 4.5:1 (Text), ≥ 3:1 (UI-Elemente); sichtbarer Fokus; volle Tastatur-Bedienbarkeit; Touch-Ziele ≥ 44 px.
- DE/EN-Umschalter; alle Labels aus `vocab_term`, nie hartcodiert.

## 7 · Umsetzung im Code
- Tokens als CSS-Variablen (`--color-navy`, `--color-accent`, `--color-accent-hover`, `--color-accent-soft`, `--color-success` …, `--space-1…9`, `--radius-sm/md/pill`), Tailwind-Theme darauf gemappt; Theme-Wechsel (Portal/Sub-Brand, Light/Dark) = Variablensatz tauschen.
- Gemeinsames UI-Kit (shadcn-Stil) für alle Portale; der externe Designer themed **Tokens**, nicht Komponenten.
- Jede Komponente liefert: Light + Dark, Focus, Hover, Disabled, Loading, Empty, Error.

## 8 · Offen (→ Fragenkatalog)
- Tokens der Themes **FLC, Education, Media** (Frage 48) — für Format-Akzente.
- Sharp Sans **Medium/Regular** für Fließtext + Web-Lizenz/WOFF2 (Frage 49).
- Portal-Akzent Indigo bestätigen oder je Portal themen; Dark Mode ja/nein (Frage 50).
- Einstieg Designer / Token-Übergabe (Frage 51).

## 9 · Änderungen v0.3 (08.09.2026, Konrad)
- **Theme = Events, ausschließlich.** FLC/Education/Media entfallen (Plattform bewegt sich nur im Bereich Events/FLS). Portal-Akzent damit **final**: `#6D6DEF` · Hover `#5B5BD9` · Soft `#E8E8FC`; Text in Akzent auf Hell `#5B5BD9`. Abschnitt 2 „Portal-Entscheidung" gilt.
- **Kein Dark Mode.** Tokens bleiben theme-fähig, ausgeliefert wird nur Light.
- **Typografie:** Lizenz deckt Web-Einbettung ab. **Sharp Sans Display No.1 SemiBold ist der Textschnitt** (Fließtext, Formulare, Tabellen); ExtraBold für Titel/Sektionen; Laica Italic als Akzent. Umsetzung: OTF → WOFF2, `@font-face` mit `font-display: swap`, Systemstapel nur als Fallback. **Prüfpunkt UI-Kit-Review:** Lesbarkeit von SemiBold bei 15–16 px in dichten Tabellen — falls zu schwer, Book/Medium nachlizenzieren.
- **Felder:** alle Matching-Felder optional aufnehmen (Wizard-Schritt „Karriere & Matching"); keine sensiblen Felder.
- **Onboarding:** 3-Schritt-Wizard + Fortschritt + Progressive Profiling (bestätigt).
