# Marke — Auszug aus dem Brandbook Final

Quellen: Figma „REBRANDING CHEFTREFF" — Seite **Brandbook Final** (`node-id=262-1257`) und die **Events-Style-Guide-Fläche in Originalgröße** (`node-id=3-440`), beide gelesen am 12.09.2026. Beide nennen dieselben Werte; `3-440` ist die lesbarere Quelle, wenn es um Logo-Lockups und Formen geht.
Gilt für dieses Repo **nur im Teil Events**. Education und Media stehen hier, damit niemand ihre Farben oder Formen versehentlich ins Portal zieht.

## Markenarchitektur

**FUTURE LEADER CLUB** ist die Dachmarke — „der Ort, an dem die ChefTreff Community Zugang zu Orientierung, Weiterbildung, Netzwerk und persönlicher Entwicklung erhält". Darunter drei Divisionen:

| Division | Angebote | Akzent | Formensprache |
|---|---|---|---|
| **Events** | Future Leader Summit, Future of HR, Insight Session, Speakernight, Community Events | `#6262DC` | Dreiecke, spitze Winkel, Zickzack-Scribbles, Raport aus dem Wort EVENTS |
| Education | Future Leader Academy, Bootcamps | `#FFCD40` | Hexagone, Chevrons, sechseckige Fotoframes |
| Media | Podcast, Vlogs, Stage Talks | `#55C9B3` | organische Blobs, Wellen-Scribbles, runde Fotoframes |

Die Dachmarke selbst hat **keinen eigenen Akzent**: Weiß `#F5F4F2` auf Navy `#081A35`.

**Für dieses Projekt gilt ausschließlich Events.** Gelb und Türkis kommen in den Portalen nicht vor — auch nicht „als kleiner Akzent". Was farbig hervorgehoben wird, ist entweder Akzent (`#6262DC`-Ramp) oder Semantik (success/warning/error).

## Farben laut Brandbook

| | Hex | Rolle |
|---|---|---|
| Events-Akzent | `#6262DC` | die Markenfarbe der Division |
| Weiß | `#F5F4F2` | Schrift auf Navy, heller Grund |
| Hintergrund | `#081A35` | Navy, Markenflächen |
| Highlight-Pink | `#FF88CF` | im Brandbook für „Jetzt anmelden!" — in allen drei Divisionen dieselbe Farbe |

**Achtung, zwei Blautöne — und drei Quellen:**

| Quelle | Wert | Stand |
|---|---|---|
| Brandbook Final, Feld FARBEN (`262-1257`) | `#6262DC` | **gilt** |
| Events-Style-Guide in Originalgröße (`3-440`) | `#6262DC` | bestätigt |
| CI-Vorgaben A1 „Theme: Events" (`201-4`) und Website (`201-432`) | `#6D6DEF` | älter |

Maßgeblich ist **`#6262DC`**. Das ist auch der bessere Wert: `#6262DC` erreicht auf Weiß 4,88:1 und trägt damit Text, `#6D6DEF` nur 3,76:1. Einzelne Highlight-Marker im Brandbook selbst sind ebenfalls noch im alten Ton gesetzt — die Angabe im Feld FARBEN sticht.

Die CI-Vorgaben nennen zusätzlich die Ramp `Accent Hover #5B5BD9` und `Accent Soft #E8E8FC`; beide bleiben gültig, sie sind dunklere bzw. hellere Stufen und vom Brandbook nicht widerlegt.

Das Pink ist im Portal **keine** UI-Farbe. Wenn eine Marketing-Fläche im Portal (Landing, Welcome, Bewerbungs-Highlight) es braucht: Navy-Text darauf (8,0:1), nie weißer Text, nie als Statusfarbe.

## Typografie

- **Sharp Sans Display No. 1 Extrabold** — Headlines, Versalien, Tracking ~3 %.
- **Sharp Sans Display No. 1 Semibold** — Fließtext. Auch im Brandbook ist Semibold der Textschnitt („Sharp Sans Semibold – Dies ist ein Platzhalter-Fließtext …").
- **ABC Laica Regular Italic** — kursiver Akzent: Subline, ein Schlüsselwort, Datum. Nie für UI-Text.

Im Portal gilt die abgeleitete Skala aus `docs/design-briefing.md` §3, umgesetzt als `.ct-*`-Rollen in `app/globals.css`.
Offener Prüfpunkt: Lesbarkeit von Semibold bei 15–16 px in dichten Tabellen.

## Formensprache Events

Dreieck und spitzer Winkel, Verlauf im Akzent auf Navy, dünne Linienzüge, Zickzack-Scribbles, Foto in schiefem Dreiecksrahmen mit gesetztem Wort (ACCESS, DIRECTION, GROWTH), Raport (Wortwiederholung als Muster).

Im Portal davon erlaubt:
- Login/Welcome: eine großflächige Dreiecks-/Linienkomposition auf Navy, hinter nichts Lesbarem.
- Leerzustände: **eine** dezente Form, Strichstärke 1–2 px im Akzent.
- Fortschritt und Richtung: Chevron/Pfeil als Richtungselement.

Nicht erlaubt: Scribbles in Formularen, Raport-Typo hinter Tabellen, Fotoframes in Listen, Verläufe auf Arbeitsflächen.

**Korrektur zum alten Design-Briefing:** dort steht „Hexagon = Systemelement (Avatar-Maske, Marker, Icon-Container)". Das Hexagon gehört im finalen Brandbook zu **Education**. Für Events ist die Grundform das Dreieck/der Winkel. Bestehende Hexagone sind kein Fehler (das Logo-Mark ist sechseckig), aber neue Flächen, Masken und Marker werden nicht hexagonal gebaut.

## Logo

Sechs Events-Lockups, je dreimal in zwei Schnitten des Zusatzes (`node-id=3-440`):

| Grundform | Zusatz in Sharp Sans Extrabold Italic | Zusatz in ABC Laica Italic |
|---|---|---|
| Wortmarke gestapelt | `FUTURE LEADER CLUB` + `EVENTS` | `FUTURE LEADER CLUB` + `Events` |
| Wortmarke einzeilig | `FUTURE LEADER CLUB EVENTS` | `FUTURE LEADER CLUB Events` |
| Kurzform | `FLC EVENTS` | `FLC Events` |

Dazu die Marketing-Variante „Future Leader Club" im Sperrsatz über einem großen `EVENTS` (weiß oder im Akzent), die Bildmarke (liegendes Sechseck-Paar) und die Schreibschrift „Future Leader *club*" für Merch und Community-Momente.

Im Portal: **eine** Variante, oben links in der Sidebar, dazu der Bereichsname („CHEFTREFF SPEAKER PORTAL" / „FLC EVENTS · SPEAKER"), DE/EN. Naheliegend ist die Kurzform `FLC EVENTS`. Schreibschrift und Sperrsatz-Variante tauchen in Portalen nicht auf. Endgültige Wahl klärt Konrad, sobald die SVGs im Repo liegen.

## Haltung (Look & Feel)

Community, Augenhöhe, nahbar, „nicht distanziert". Für die Portale heißt das: Klartext statt Behördendeutsch, konkrete nächste Schritte, keine Ironie, keine Ausrufezeichen-Ketten — und keine Marketing-Sprache in Arbeitsansichten.
