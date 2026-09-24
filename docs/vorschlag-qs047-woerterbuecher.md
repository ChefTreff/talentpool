# Vorschlag QS-047 · Wörterbücher ohne Zusammenstösse

**Befund (Architektur-Session, 24.09.):** Fünf PRs eines Nachmittags (#159, #163, #165, #167 und weitere) kollidierten an derselben Stelle in `lib/i18n/de.json` und `en.json`. Gebaut wird erst nach Freigabe.

## Warum es immer dieselbe Zeile trifft

- Zwei Dateien mit je **4.615 Zeilen**, **74 Namensräume**, rund **3.700 Schlüssel**. Die grössten sind `speaker` (497), `adminPartner` (418), `partner` (200) und `rpc` (197). `rpc` und `common` gehören allen Bereichen.
- Die Schlüssel stehen in **Einfügereihenfolge**. Wer etwas ergänzt, hängt es ans Ende eines Objekts und muss dafür die bisher letzte Zeile ändern, weil sie ein Komma bekommt. Zwei PRs, die denselben Namensraum ergänzen, ändern also dieselbe Zeile, und Git meldet einen Konflikt, obwohl die Inhalte unabhängig sind.
- Der Gleichlauf DE/EN ist heute nur durch den Typ gesichert (`en satisfies Dictionary`). Ein Schlüssel, den es **nur in EN** gibt, fällt nicht auf. Ein doppelter Schlüssel fällt ebenfalls nicht auf, denn `JSON.parse` nimmt stumm den letzten.

## Drei Wege

| | Weg | Wirkung | Aufwand | Kosten |
|---|---|---|---|---|
| **A** | **Schlüssel alphabetisch, erzwungen durch einen Test**, plus Sortier-Skript `node scripts/i18n-sortieren.mjs` | Neue Schlüssel landen mitten im Objekt, an ihrer Stelle im Alphabet, die Nachbarzeilen bleiben unberührt. Ein Konflikt entsteht nur noch, wenn zwei PRs im selben Namensraum alphabetisch direkt nebeneinander ergänzen. Das gilt auch für `rpc` und `common` | **ca. 1,5 h** (Skript, Test, Doku) | einmal ein grosser Umsortier-Diff: Jeder offene PR mit Wörterbuch-Änderung stösst einmal an, die Auflösung ist mechanisch (siehe C) |
| B | Wörterbuch je Bereich als eigene Datei (`lib/i18n/de/<namensraum>.json`), beim Laden zusammengeführt | trennt Bereiche voneinander, aber **nicht** die gemeinsamen Namensräume (`rpc`, `common`). Dort bräuchte es trotzdem A | ca. 2,5–3 h (148 Dateien, Lader, Typ aus den Teilen, Test, Doku) | grösserer Umbau: Jede Datei wird verschoben, und der Typ muss aus 74 Einzelimporten entstehen |
| C | **Werkzeug für den Konfliktfall:** `node scripts/i18n-zusammenfuehren.mjs` löst einen Wörterbuch-Konflikt als Drei-Wege-Vergleich der Objekte (Basis, unsere, ihre). Neue Schlüssel beider Seiten werden vereinigt, nur echte Konflikte (derselbe Schlüssel mit zwei Texten) werden gemeldet. Danach wird sortiert | macht jeden verbliebenen Konflikt zur Sache von Sekunden, auch den einmaligen aus A | **ca. 1 h** | keine. Optional als Git-Merge-Treiber (`.gitattributes` plus einmal `git config`), der dann in allen Worktrees dieses Macs von selbst greift. Merges auf GitHub selbst nutzen ihn nicht, nur Rebases und Merges lokal |

## Empfehlung: A + C (ca. 2,5 h), B nicht

A beseitigt die Ursache, auch in den gemeinsamen Namensräumen. C fängt den Rest ab und macht die einmalige Umstellung schmerzlos. B verlagert das Problem nur, denn `rpc` bliebe eine Datei, die alle ergänzen.

**Der Test** (`tests/woerterbuch.test.ts`) prüft in beiden Dateien auf jeder Ebene:
1. Die Schlüssel sind sortiert (`localeCompare`, Deutsch).
2. Es gibt keinen doppelten Schlüssel. Das prüft er im Rohtext, weil `JSON.parse` Dubletten schluckt.
3. DE und EN haben **genau** dieselben Schlüssel, auch keine zusätzlichen in EN.
4. Die Formatierung bleibt die bisherige (2 Leerzeichen, Zeilenende). Das ist geprüft: Einlesen und Zurückschreiben ergibt heute dieselbe Datei.

**Kein Risiko für die Anzeige:** Keine Stelle zeigt Einträge eines Wörterbuch-Objekts in dessen Reihenfolge. Die Listen, die über `Object.entries` laufen, lesen Vokabular aus der Datenbank (`labels.*`), nicht das Wörterbuch.

## Einführung

1. Ein PR, der **nur** Skript, Test und das einmalige Sortieren enthält, ohne inhaltliche Änderung. Der Test belegt, dass vorher und nachher dieselben Schlüssel mit denselben Texten da sind.
2. Merge zu einem ruhigen Zeitpunkt, den die Architektur-Session wählt, am besten wenn wenige PRs offen sind.
3. Jeder offene PR zieht `main`. Der Konflikt im Wörterbuch wird mit `node scripts/i18n-zusammenfuehren.mjs` gelöst, danach `node scripts/i18n-sortieren.mjs`.
4. Regel für alle Chats, in `AGENTS.md` (Build-Checkliste): neue Schlüssel an ihre alphabetische Stelle oder ans Ende und dann sortieren. Der Test im Gate erzwingt es.
