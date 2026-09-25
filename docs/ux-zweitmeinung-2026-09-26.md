# UX-Zweitmeinung · 26.09.2026 (QS-014)

**Auftrag (Konrad, 25.09.):** ein Durchgang mit einem externen Skill als Zweitmeinung; `/portal-design` bleibt die Autorität.

**Quelle:** die *Web Interface Guidelines* von Vercel ([vercel-labs/web-interface-guidelines](https://github.com/vercel-labs/web-interface-guidelines), Datei `command.md`), auf denen der Skill „web-design-guidelines“ beruht. Der Skill selbst ist **nicht installiert**, das wäre eine dauerhafte Einstellung am Rechner. Gelesen wurde sein Regelwerk, geprüft mit `scripts/ux-zweitmeinung.mjs` (Code-Suche über `app/` und `components/`, JSX-Tags über mehrere Zeilen, Kommentare ausgenommen) und von Hand, wo sich eine Regel nicht suchen lässt.

**Regel für Widersprüche:** Wo die Guidelines etwas anderes verlangen als `/portal-design`, gilt `/portal-design`. Das betrifft drei Punkte (unten „abgelehnt“).

Ergänzt `docs/ux-durchgang-2026-09-24.md` (QS-034), der dieselben Oberflächen gegen `/portal-design` geprüft hat.

## Ergebnis auf einen Blick

| | Anzahl |
|---|---|
| Regeln erfüllt, ohne Befund | 33 |
| Befunde behoben (dieser PR) | 8 |
| Befunde ins Backlog (QS-050, QS-051) | 2 |
| abgelehnt — Widerspruch zu `/portal-design` | 3 |
| zurückgestellt / nicht anwendbar | 9 |

## Behoben in diesem PR

| Regel (Guidelines) | Befund | Behebung |
|---|---|---|
| Forms · `autocomplete`, Rechtschreibung aus bei E-Mail | 11 E-Mail-Felder mit Rechtschreibprüfung, 9 ohne `autoComplete` | Kit: `Input type="email"` setzt `spellCheck={false}`, `autoCapitalize="none"`, `autoComplete="off"` (fast immer die Adresse **einer anderen Person**); die Anmeldung setzt `email` selbst, Übergebenes gewinnt |
| Typography · `text-wrap: balance` auf Überschriften | nicht gesetzt | `.ct-display`, `.ct-band-title`, `.ct-h1` … `.ct-h3` in `globals.css` |
| Touch · `touch-action: manipulation` | nicht gesetzt | auf Links, Knöpfen, Feldern (`@layer base`); Zwei-Finger-Zoom bleibt |
| Touch · `-webkit-tap-highlight-color` bewusst setzen | Standard-Grau | 15 % Akzent |
| Touch · `overscroll-behavior: contain` in Dialogen | fehlte in `Modal` und `Drawer` | `overscroll-contain` |
| Navigation · Links statt `onClick`-Navigation | „Zurücksetzen“ im Mail-Protokoll per `router.push` | `ButtonLink` (Strg-/Cmd-Klick geht) |
| Images · feste Maße gegen Springen | Shop-Produktbild ohne Höhe | `aspect-4/3` |
| Typography · typografische Anführungszeichen | 8 gerade Schlusszeichen in 7 deutschen Texten („aktiv\") | „aktiv“ |

Dazu die Leertaste an der Backlog-Karte im Programm-Board (`role="button"` reagierte nur auf Enter). Die Änderung steht in #238, weil sie dieselbe Datei betrifft.

## Ins Backlog

- **QS-050 Filter und Suche in die URL** (Guidelines „Navigation & State“: *URL reflects state*). Zehn Listen halten Filter nur im Zustand. Nach dem Neuladen oder über einen geteilten Link sind sie weg: `PipelineView` (Status, Suche, Prio, Kategorie), `SpeakerListe`, `ProgrammeTable`, `OrdersView`, `ApplicationTable`, `GrafikenView`, `VokabularView`, `RolesView`, `WikiView`, `ProductEditor`. Das Mail-Protokoll macht es schon richtig (`useSearchParams`). Vorschlag: ein Kit-Baustein `useUrlFilter` (Zustand ↔ `searchParams` über `router.replace`), danach je Liste umstellen. `/portal-design` sieht das ebenso (Team-Portal-Muster „Filter im URL-Zustand“).
- **QS-051 Warnung vor dem Verlassen mit ungesicherten Änderungen** (Guidelines „Forms“). Keine Seite warnt: Wer im Profil, bei „Eure Daten“ oder im Session-Schubfach tippt und dann wegklickt, verliert die Eingabe ohne Hinweis. Vorschlag: ein Kit-Baustein `useUngesichert(dirty)` (`beforeunload` plus Rückfrage beim Wechsel im Portal), eingesetzt in den langen Formularen.

## Abgelehnt — `/portal-design` gilt

| Regel (Guidelines) | Warum nicht |
|---|---|
| Content · *Title Case for headings/buttons* | Die Portale setzen Satzschreibung. Überschriften stehen ohnehin in Versalien (`.ct-h1`/`.ct-h2`); Englisch folgt dem Deutschen („Go to the pipeline“) |
| Forms · Platzhalter enden mit `…` | Platzhalter zeigen im Portal ein Beispiel („z. B. Main Stage“), kein Auslassungszeichen. Rolle `placeholder:text-muted` bleibt |
| Dark Mode · `color-scheme: dark`, `theme-color` je Schema | Kein Dark Mode (Entscheidung 08.09.2026). `color-scheme: light` steht in `:root` |

## Erfüllt, ohne Befund

Sprunglink zum Inhalt (`#content`) · sichtbarer Fokus überall (`:focus-visible`, `outline-none` nie ohne Ersatz, geprüft in QS-034) · `prefers-reduced-motion` global · kein `transition-all` · kein `autoFocus` · kein `onPaste` · keine Klicks auf `div`/`span` ohne Rolle · Symbol-Knöpfe mit Namen · Bilder mit `alt` · `aria-live` für Meldungen (`Toast`) · Überschriften-Hierarchie (Rollen `.ct-h1` → `.ct-h3`) · `scroll-margin` an Ankern (`Card id`) · Knopf mit Ladezustand (`Button loading`, `aria-busy`) · Fehler am Feld (`Field`) · `tabular-nums` global · Zeilen kürzen mit `truncate`/`line-clamp` und `min-w-0` · Leerzustände als Seite (Regel 9) · Datum und Zahl über `Intl` · Sprache aus Profil, Cookie, `Accept-Language` · Löschen mit Rückfrage (`ConfirmDialog`) · Ziehen mit Alternative (Board: Doppelklick, Zeiten im Schubfach) · Hover-Zustände an Knöpfen und Links · Du/Ihr-Ansprache · Fehlertexte mit nächstem Schritt (Regel 8) · kein `user-scalable=no` · Schriften über `next/font` (Vorladen) · `<select>` mit eigener Fläche und Farbe · `alt=""` bei Schmuckbildern · Pfeile und Zeichen `aria-hidden` · Links nach draussen mit `neuesFenster` · Dialoge als natives `<dialog>` · Tabellenzeilen mit festen Höhen · Kontraste gemessen (`kontrast.mjs`).

## Zurückgestellt / nicht anwendbar

- **`<meta name="theme-color">`** (Navy wie die mobile Kopfleiste): Die Angabe braucht einen rohen Hex-Wert in den Metadaten, CSS-Variablen greifen dort nicht (Regel 2). Das bringt wenig und ist zurückgestellt.
- **Datum von Hand** (6 Treffer): Das sind Werte für `datetime-local`-Felder (`YYYY-MM-DDTHH:MM`), keine Anzeige. Sie rechnen in Browserzeit; laut Kommentar im Schubfach ist das bewusst so („für eine Frist genau genug“).
- **Bilder ohne `width`/`height`** (10 Treffer): Alle sitzen in bemessenen Rahmen (`aspect-video`, `h-32`, `size-*`, `absolute inset-*`). Nur das Shop-Produktbild sprang, es ist oben behoben.
- **Listen > 50 Einträge virtualisieren:** Die Admin-Listen laden seitenweise oder bleiben unter der Schwelle; beim Altdaten-Import neu ansehen (ADM-003).
- **`translate="no"` an Markennamen:** kein Befund in der Praxis, die Portale sind nicht maschinell übersetzt.
- **`preconnect` für CDN, Video statt GIF, Safe Areas:** keine GIFs, keine vollflächigen Layouts, Assets vom eigenen Host.
- Treffer in der Kit-Schau (`KitSchau.tsx`, roter Knopf ohne Rückfrage) sind Vorführung.

## Nachlaufen lassen

```bash
node scripts/ux-zweitmeinung.mjs
```

Erwartet nach diesem PR: nur noch die Einträge aus QS-050, die Datumswerte und die bemessenen Bilder (siehe oben).
