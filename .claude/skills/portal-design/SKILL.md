---
name: portal-design
description: Gestaltungsregeln für alle ChefTreff-/FLC-Portale (Talent, Speaker, Speaker-Leads, Partner inkl. Messeshop, Volunteers, Hackathon, Produktion, Programm, Admin). Vor jeder Arbeit an UI laden — neue Seite, neue Komponente, Layout-, Farb-, Typo- oder Zustandsänderung, Formulare, Tabellen, Leerzustände, Login/Welcome. Enthält Tokens, Typo-Skala, Komponentenkatalog, Muster, Verbotsliste und die Kontrastprüfung.
---

# Portal-Design (FLC Events)

Verbindlich für jede sichtbare Oberfläche in diesem Repo. Ziel ist nicht „hübsch", sondern:
**ein Arbeitswerkzeug, das nach Future Leader Club aussieht und in neun Bereichen gleich funktioniert.**

## Rangfolge der Quellen

1. **Brandbook Final** (Figma „REBRANDING CHEFTREFF", Seite *Brandbook Final*) — Marke, Farben, Schriften, Formensprache. Auszug: `referenzen/marke.md`.
2. **Website FLS27** (`node-id=201-432`) und **CI-Vorgaben** (`node-id=201-4`) — Vorbild für Muster, die es auf der Website schon gibt: Sektionsrhythmus, Personen-Karte, Akkordeon, Footer. Beide sind älter als das Brandbook; bei Widerspruch gewinnt das Brandbook. Siehe `referenzen/muster.md`, Abschnitt „Vorbilder von der Website".
3. **`docs/design-briefing.md`** — Übersetzung Marke → Portal-UI.
4. **Code** (`app/globals.css`, `components/ui/*`) — das Ergebnis. Bei Widerspruch zu 1–3: nicht heimlich anpassen, sondern in der PR-Beschreibung melden.

**Kontrast schlägt Token.** Wo eine Markenfarbe die WCAG-Schwelle verfehlt, gewinnt der Kontrast; die Abweichung wird notiert. Prüfen:

```bash
node .claude/skills/portal-design/referenzen/kontrast.mjs
```

## Grundsatz: Marke ≠ Portal

Der Styleguide beschreibt Marketing (Navy-Vollfläche, zentriert, 82-px-Versalien, Pfeil-Buttons in Laica-Kursive). Portale sind Werkzeuge: **hell, linksbündig, dicht, ruhig.** Die Marke erscheint dort, wo nicht gearbeitet wird — Sidebar, Topbar, Login, Welcome, Leerzustand. In Datenansichten nie.

| Marke (Website) | Portal (App) |
|---|---|
| Navy als Vollfläche | Navy nur für Sidebar/Topbar/Login; Arbeitsfläche `bg-canvas`, Karten `bg-surface` |
| Alles zentriert | Linksbündig; zentriert nur Login/Welcome/Leerzustand |
| H1 82 px Versalien | `.ct-h1` = 28/32 (mobil 24/28), einmal pro Seite |
| Pfeil-Button + Laica | nur Marketing-CTA; Arbeits-Buttons = `<Button>` |
| Highlight-Wort kursiv im Akzent | nur Login/Welcome/Begrüßung, **ein** Wort |
| Dreiecke, Scribbles, Raport-Typo | dezent auf Login/Welcome/Empty-State; nie hinter Text oder Tabellen |

## Die Regeln

1. **Eine primäre Aktion pro Screen.** Alles Weitere ist `secondary` oder `ghost`. Progressive Disclosure statt Vollformular.
2. **Nie rohe Hex-Werte, nie rohe px-Abstände.** Nur Token-Klassen (`bg-surface`, `text-muted`, `border-border-strong`, `rounded-ct-md`) und das 8-pt-Raster. Kein neuer Radius, keine neue Schriftgröße, keine neue Graustufe — siehe `referenzen/tokens.md`.
3. **Nichts nachbauen, was es gibt.** Erst `components/ui/index.ts` lesen. Button, Input, Textarea, Select, Field, Card, CardHeader, StatCard, Badge, Table, Drawer, Modal, ConfirmDialog, Toast, EmptyState, PageHeader, Stepper sind da. Fehlt etwas, kommt es **dorthin** — nicht in die Seite.
4. **Zustand in Form *und* Farbe.** `<Badge>` trägt immer Text; Farbe allein ist nie die Information.
5. **Typo nur über die Rollen** `.ct-h1 .ct-h2 .ct-h3 .ct-eyebrow .ct-label .ct-help .ct-laica .ct-highlight .ct-link`. Versalien nur H1/H2/Eyebrow. `.ct-laica` und `.ct-highlight` höchstens **einmal pro Screen** und nie für UI-Text.
6. **Bewegung nur als Feedback, ≤ 200 ms**, ausschließlich `transition-colors`/`opacity`. Keine dekorative Animation, kein Parallax, kein Auto-Karussell. `prefers-reduced-motion` gilt global.
7. **Tastatur und Fokus.** Sichtbarer Fokus bleibt (nie `outline-none` ohne Ersatz), Touch-Ziele ≥ 44 px, Dialoge über `<Modal>`/`<Drawer>` (natives `<dialog showModal>` — Fokusfalle vom Browser).
8. **Text sagt, was passiert.** „Speichern" → „Gespeichert". Fehler sagen, was zu tun ist. Du/ihr-Ansprache. Alle Begriffe aus `vocab_term`, DE **und** EN, nie hartcodiert.
9. **Leerzustand ist eine Seite, kein Platzhalter:** ein Satz Erklärung + genau eine Aktion.
10. **Kein Dark Mode.** Tokens bleiben theme-fähig, ausgeliefert wird nur Light.

## Verbotsliste (so sieht „von der KI gebaut" aus)

Verlaufs-Hero über die ganze Seite · lila Farbverlauf als Fläche · Emoji als Icon · gestapelte Schlagschatten · Glassmorphismus · drei gleichwertige CTAs nebeneinander · Karte in Karte in Karte · zentrierter Fließtext · Zebra-Streifen in Tabellen · runde Pillen und 8-px-Rechtecke gemischt · generische Stock-Illustrationen · „Lorem ipsum" im PR · Icon-Set aus einer fremden Bibliothek · neue Schriftfamilie · Fortschrittsbalken ohne Zahl · Toast für Fehler, die im Formular stehen müssen.

## Muster

Seitenaufbau, Formular, Tabelle, Wizard, Leerzustand, Login/Welcome, Sidebar: `referenzen/muster.md`.
Marke, Formensprache, Divisionsfarben, Logo-Varianten: `referenzen/marke.md`.
Tokens mit geprüften Kontrastwerten: `referenzen/tokens.md`.

## Vor dem PR

- [ ] `npm run lint` und `npm run build` grün.
- [ ] Keine rohen Hex-/px-Werte im Diff (`git diff | grep -nE '#[0-9a-fA-F]{6}|\[[0-9]+px\]'`); Ausnahmen begründet.
- [ ] Neue Farbpaare durch `referenzen/kontrast.mjs` geprüft.
- [ ] Jede neue Komponente liefert: Default, Hover, Fokus, Disabled, Loading, Leer, Fehler.
- [ ] Mobil (375) und Desktop (1440) angesehen; kein horizontales Scrollen außer in `overflow-x-auto`-Containern.
- [ ] DE und EN vorhanden.
- [ ] Abweichung von Brandbook oder Design-Briefing in der PR-Beschreibung benannt.
