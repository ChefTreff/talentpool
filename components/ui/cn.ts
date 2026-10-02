/** Klassen zusammenfügen; falsy Werte fallen raus. */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/**
 * `w-full` für ein Feld — nur, wenn der Aufrufer keine eigene Breite setzt.
 *
 * `cn` fügt Klassen bloss aneinander. Stehen `w-full` und `w-44` zugleich am
 * Feld, entscheidet die Reihenfolge im erzeugten CSS, und dort gewann `w-full`:
 * jede feste Breite an `Input`, `Select` oder `Textarea` (58 Stellen) wurde zur
 * vollen Breite, Filterzeilen standen untereinander (LEAD-049, gemessen
 * 25.09.). Breiten mit Variante (`sm:w-44`) stehen in einer Media-Query und
 * setzen sich ohnehin durch.
 */
export function feldBreite(className?: string): string | false {
  return !/(^|\s)w-/.test(className ?? "") && "w-full";
}

/**
 * Innenabstand einer Karte — `p-6`, **nur wenn der Aufrufer keinen eigenen
 * setzt** (QS-055, Befund Partner-Chat 01.10.).
 *
 * Gleiche Ursache wie bei `feldBreite`: `cn` fügt Klassen bloss aneinander.
 * Stehen `p-6` und `p-0` zugleich am Element, entscheidet die Reihenfolge im
 * erzeugten CSS, nicht im `class`-Attribut — und dort kommt der grössere
 * Zahlenwert später. `<Card className="p-0">` zeigte deshalb 24 px (gemessen),
 * ebenso jedes `p-4`. 74 Karten setzen ein eigenes Padding: 22-mal `p-0` für
 * Listen und Tabellen bis zum Rand (ihre Zeilen tragen längst `px-4 py-2.5` und
 * sassen 24 px zu weit innen), 27-mal `p-4` für kompakte Karten, 25-mal `p-6`
 * (das ist der Standard und ändert nichts).
 *
 * Gezählt wird nur das Kürzel `p-` (auch `p-[…]`, `!p-0`). `px-4`, `py-2`,
 * `pt-0` überschreiben `p-6` ohnehin — Tailwind sortiert die Einzelseiten hinter
 * das Kürzel — und Varianten (`sm:p-8`) stehen in einer Media-Query.
 *
 * Gilt für **dieses** Problem. Allgemein gewinnt bei einer Eigenschaft, die der
 * Baustein selbst setzt, der grössere Zahlenwert, egal in welcher Reihenfolge
 * die Klassen stehen; `tailwind-merge` in `cn` würde es grundsätzlich lösen
 * (Vorschlag an die Architektur-Session, `package.json` gehört ihr).
 */
export function kartenPadding(className?: string): string | false {
  return !/(^|\s)!?p-/.test(className ?? "") && "p-6";
}

/**
 * Eine Karte **ohne** Innenabstand (`p-0`: Liste oder Tabelle bis zum Rand)
 * beschneidet ihren Inhalt an der Rundung (QS-055). Sonst läuft der Hintergrund
 * einer Zeile oder die rote Leiste einer überfälligen Frist eckig in die
 * gerundete Ecke — das fiel erst auf, als die Zeilen wirklich am Rand lagen.
 *
 * Nicht, wenn der Aufrufer `overflow-…` selbst setzt (eine scrollende Karte
 * beschneidet ohnehin). Geprüft: in den 22 Karten dieser Art hängen keine
 * Menüs oder Popover, die der Beschnitt abschnitte; `Drawer` und `Modal` sind
 * `<dialog>` in der obersten Ebene. Ein `position: sticky` in einer solchen
 * Karte hielte nicht mehr am Seitenrand — keine der Karten braucht das.
 */
export function kartenRand(className?: string): string | false {
  const k = className ?? "";
  return /(^|\s)!?p-0(\s|$)/.test(k) && !/(^|\s)[a-z:]*overflow-/.test(k) && "overflow-hidden";
}

