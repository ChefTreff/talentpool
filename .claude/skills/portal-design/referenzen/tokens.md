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
