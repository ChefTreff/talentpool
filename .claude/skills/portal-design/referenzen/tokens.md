# Tokens

Definiert in `app/globals.css` (`:root` als `--ct-*`, gemappt in `@theme inline`).
**In Komponenten wird immer die Tailwind-Klasse benutzt, nie der Hex-Wert und nie `var(--ct-…)` direkt** — außer in `globals.css` selbst.

Kontrastwerte unten sind gemessen, nicht geschätzt: `node .claude/skills/portal-design/referenzen/kontrast.mjs`.

## Flächen und Schrift

| Klasse | Hex | Verwendung |
|---|---|---|
| `bg-navy` / `text-navy` | `#081A35` | Sidebar, Topbar, Login-Grund; zugleich die Tintenfarbe auf Hell |
| `text-on-navy` | `#F5F4F2` | Text auf Navy (15,8:1) |
| `text-on-navy-muted` | `#A0AAB9` | Hilfstext auf Navy (7,4:1) |
| `border-navy-border` | `#1E3250` | Trennlinien auf Navy |
| `bg-canvas` | `#F5F4F2` | Seitengrund |
| `bg-surface` | `#FFFFFF` | Karten, Eingabefelder |
| `bg-surface-hover` | `#F0F1F4` | Zeilen-/Listen-Hover |
| `text-ink` | `#081A35` | Fließtext auf Hell (15,8:1 auf Grund) |
| `text-muted` | `#5C6878` | Hilfstext auf Hell (5,2:1) |
| `text-muted-soft` | `#8A94A6` | **nur deaktivierte Elemente** — siehe Warnung unten |
| `border-border` | `#DCDFE5` | dekorative Linien, Kartenkanten, Tabellenraster |
| `border-border-strong` | `#7F8A9C` | Ränder von Bedienelementen: Felder, Checkboxen, Schalter (3,5:1 / 3,2:1) |

## Akzent (Events)

| Klasse | Hex | Verwendung | Kontrast |
|---|---|---|---|
| `accent` | `#6262DC` | Flächen, Ränder, Fokusring, Icons, Linien; **weißer** Text darauf erlaubt | 4,88:1 auf `#FFFFFF` |
| `accent-strong` | `#5B5BD9` | Text und Links auf Hell, Button-Füllung, Hover | 4,85:1 auf Grund |
| `accent-deep` | `#4A4AC5` | gedrückt/aktiv, Text auf `accent-soft` | 6,2:1 auf Grund |
| `accent-soft` | `#E8E8FC` | ausgewählte Zeile, Hover-Fläche, Badge-Grund | Navy darauf 14,4:1 |

Drei Regeln dazu:

1. **Auf einer Akzentfläche steht weißer Text `#FFFFFF`, nicht `#F5F4F2`.** Off-White erreicht nur 4,44:1.
2. **Akzenttext auf dem Off-White-Grund `bg-canvas` ist `accent-strong`**, nicht `accent` (dort nur 4,44:1). Auf weißen Karten trägt `accent` Text.
3. Semantik bleibt vom Akzent getrennt: Fortschritt, Auswahl, Fokus = Akzent; Ergebnis = success/warning/error.

## Semantik

| Klasse | Hex | Verwendung |
|---|---|---|
| `success` / `success-soft` / `success-ink` | `#34D399` / `#E7FAF3` / `#0B7A5A` | erledigt, bestätigt (Chip 4,9:1) |
| `warning` / `warning-soft` / `warning-ink` | `#FDC422` / `#FEF6DE` / `#8A6100` | offen, Frist, Code (5,1:1) |
| `error` / `error-soft` / `error-ink` / `error-deep` | `#EF4444` / `#FDECEC` / `#C22B2B` / `#A81F1F` | überfällig, Fehler (5,0:1) |

Chips immer als Soft-Fläche + `*-ink`-Text + Wortlaut. Die Vollfarben `success`/`warning`/`error` sind Flächen- und Linienfarben, keine Textfarben.

## Typografie-Rollen

Definiert in `app/globals.css`, seit dem Design-Durchgang (F7, 14.09.2026) in **`@layer components`** — dadurch gewinnt jede Tailwind-Utility, und eine Rolle lässt sich mit einer Farbklasse kombinieren (`ct-help text-on-navy-muted`). Ohne Layer standen die Regeln ausserhalb jeder Cascade-Layer und schlugen jede Utility; Hilfstext auf der Navy-Leiste wäre dunkel und unlesbar geblieben.

| Klasse | Größe/Zeile | Verwendung |
|---|---|---|
| `.ct-display` | 40/44, ab 768 px 52/56 | **nur** die Welcome-Headline — die einzige Marketing-Überschrift im Portal |
| `.ct-h1` | 28/32 (mobil 24/28) | Seitentitel, einmal je Seite; auch die Zahl in `StatCard` |
| `.ct-h2` | 18/24 | Abschnitt |
| `.ct-h3` | 16/24 | Karte, Untergruppe |
| `.ct-eyebrow` | 12/16, Versalien | Gruppenüberschrift, Sidebar-Abschnitt |
| `.ct-label` | 14/20, 600 | Feldbeschriftung, Listenpunkt, alles Hervorgehobene in Tabellen |
| `.ct-small` | 14/20 | gewöhnlicher Kleintext ohne Fettung — Optionen, Definitionen, Hinweiszeilen |
| `.ct-help` | 13/20, `muted` | Hilfstext. Farbe überschreibbar (siehe Layer oben) |
| `.ct-wordmark` | 16/24, Display, Versalien | Logo-Lockup in der Topbar, sonst nirgends |
| `.ct-laica` · `.ct-highlight` · `.ct-link` | — | kursiver Akzent, Highlight-Wort, Inline-Link |

**Keine rohen `text-[…px]` mehr im Code** (Stand 14.09.2026: null Treffer). Wer eine Größe braucht, die es nicht gibt, ergänzt die Rolle — `.ct-small` und `.ct-display` sind so entstanden, weil 23 bzw. 2 Stellen sie von Hand nachgebaut hatten.

## Maß

| | Werte |
|---|---|
| Abstand (8-pt) | 4 · 8 · 16 · 24 · 32 · 48 · 64 · 80 · 120 → Tailwind `1 2 4 6 8 12 16 20 30` |
| Radius | `rounded-ct-sm` 6 · `rounded-ct-md` 8 (Portal-Standard) · `rounded-ct-lg` 12 · `rounded-full` nur für Avatare und Punkte |
| Höhen | Bedienelement 40 px (`h-10`), in Tabellen 32 px (`h-8`), Tabellenzeile 44 px |
| Breiten | Inhalt 1200 (Admin-Tabellen 1400), Textspalte 800, Formular 640 |
| Raster | ≥ 1280: 12 Spalten / 24 Gutter / 80 Rand · 768–1279: 8 / 20 / 40 · < 768: 4 / 16 / 20 |

Karten-Innenabstand 24, Karte ↔ Karte 16–24, Sektion ↔ Sektion 32–48.

## Bekannte Abweichungen

- **Akzent entschieden (12.09.2026):** `--ct-accent` steht im Code auf `#6262DC` (Brandbook Final), Ramp `#5B5BD9 / #4A4AC5 / #E8E8FC` unverändert; Eintrag im Entscheidungslog und Briefing v0.5. Website und ältere CI-Vorgaben zeigen noch `#6D6DEF` — nicht kopieren.
- **`text-muted-soft` (`#8A94A6`) erreicht auf Weiß nur 3,06:1** und trägt damit keinen lesbaren Text. Für Text `text-muted` nehmen; `muted-soft` bleibt für deaktivierte Zustände und rein dekorative Zeichen (so verwendet in `components/ui/Stepper.tsx`). Die zwei Stellen mit echtem Inhalt (`admin/vokabular`, `admin/personen/[id]`) sind am 12.09.2026 auf `text-muted` korrigiert. Platzhalter in Feldern sind in Ordnung — `Input`/`Textarea` setzen `placeholder:text-muted`.
- Das Design-Briefing kennt noch die Themes FLC/Education/Media. Für dieses Repo gilt Events allein (Entscheidung 08.09.2026).
- **Akzent trägt auf Navy keinen Text** (3,56:1). Das Highlight-Wort der Welcome-Headline stand so und ist am 14.09.2026 auf `accent-soft` (14,4:1) gezogen; die kursive Auszeichnung trägt die Hervorhebung. Offen für Konrad: ob stattdessen eine Akzentfläche mit weißem Text oder das Highlight-Pink des Brandbooks gewünscht ist.
- **Das Hexagon im Leerzustand ist weg** (14.09.2026). Es gehört im Brandbook Final zu Education; Events ist das Dreieck. `components/ui/EmptyState.tsx` zeigt jetzt ein Dreieck, `components/layout/BrandBackdrop.tsx` die großflächige Komposition für Login und Welcome.
