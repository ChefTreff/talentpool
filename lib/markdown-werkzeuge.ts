/**
 * Die Werkzeuge der Formatierungsleiste (ADM-103 g, ADM-102 f): was ein Klick in den Markdown-Text schreibt.
 * Reine Funktionen ohne React, damit `npm test` sie prüft; die Leiste (`components/ui/FormatLeiste.tsx`) und die
 * Editoren (Wiki, Mail) benutzen dieselben.
 *
 * Dahinter steht Markdown, kein Rich-Text-Feld: der Text landet in Portalen und Mails fremder Zielgruppen, und unsere
 * Renderer erzeugen ausschließlich React-Knoten bzw. escapetes HTML. Die Leiste schreibt also Zeichen in den Text.
 */

/** Eine Schaltfläche der Leiste: Präfix je Zeile, Klammer um die Auswahl oder eigener Block. */
export type Werkzeug =
  | { key: WerkzeugKey; kind: "prefix"; value: string }
  | { key: WerkzeugKey; kind: "wrap"; value: string }
  | { key: WerkzeugKey; kind: "block"; value: string }
  /** Ein Link mit der Auswahl als Text: `[Auswahl](https://)`; mit `titel` als CommonMark-Titel (`[Auswahl](https:// "knopf")`). */
  | { key: WerkzeugKey; kind: "link"; titel?: string }
  /** Ein Befehl des Browsers (Rückgängig, Wiederholen) — schreibt nichts in den Text, die Leiste ruft ihn am Feld auf. */
  | { key: WerkzeugKey; kind: "befehl"; befehl: "undo" | "redo" };

export type WerkzeugKey =
  | "undo" | "redo" | "h2" | "h3" | "bold" | "italic" | "code" | "ul" | "ol" | "quote" | "link" | "table" | "rule" | "button";

/** Der Titel, an dem der Mail-Renderer einen Link als Knopf erkennt. */
export const KNOPF_TITEL = "knopf";

export const WERKZEUGE: Record<WerkzeugKey, Werkzeug> = {
  undo: { key: "undo", kind: "befehl", befehl: "undo" },
  redo: { key: "redo", kind: "befehl", befehl: "redo" },
  h2: { key: "h2", kind: "prefix", value: "## " },
  h3: { key: "h3", kind: "prefix", value: "### " },
  bold: { key: "bold", kind: "wrap", value: "**" },
  italic: { key: "italic", kind: "wrap", value: "*" },
  code: { key: "code", kind: "wrap", value: "`" },
  ul: { key: "ul", kind: "prefix", value: "- " },
  ol: { key: "ol", kind: "prefix", value: "1. " },
  quote: { key: "quote", kind: "prefix", value: "> " },
  link: { key: "link", kind: "link" },
  table: { key: "table", kind: "block", value: "| Spalte | Spalte |\n| --- | --- |\n|  |  |" },
  rule: { key: "rule", kind: "block", value: "---" },
  // Knopf in der Mail (ADM-102 f, Muster Design-Chat): ein gewöhnlicher CommonMark-Link mit dem Titel „knopf“ — in jedem
  // anderen Renderer (Wiki, Textfassung der Mail) bleibt es ein Link; der Mail-Renderer baut daraus den Knopf.
  button: { key: "button", kind: "link", titel: KNOPF_TITEL },
};

/**
 * Die Leisten als Gruppen (Trennstrich dazwischen): Verlauf | Zeichen | Listen | Einfügen. Die Wiki-Leiste hat alles, die
 * Mail-Leiste kein Code, keine Tabelle, keine Trennlinie (der Mail-Renderer kennt sie nicht).
 */
export const WIKI_LEISTE: WerkzeugKey[][] = [
  ["undo", "redo"],
  ["h2", "h3", "bold", "italic", "code"],
  ["ul", "ol", "quote"],
  ["link", "table", "rule"],
];
export const MAIL_LEISTE: WerkzeugKey[][] = [
  ["undo", "redo"],
  ["h2", "bold", "italic"],
  ["ul"],
  ["link", "button"],
];

/** Alle Werkzeuge einer Leiste in Bildschirmreihenfolge. */
export const flach = (gruppen: WerkzeugKey[][]): WerkzeugKey[] => gruppen.flat();

export type Ergebnis = { text: string; start: number; end: number };

/**
 * Wendet ein Werkzeug auf die Auswahl `start`–`end` an und liefert den neuen Text samt neuer Auswahl.
 * `muster` ist der Text, der bei leerer Auswahl eingesetzt wird („Text“ bei Fett, Kursiv, Code, Link).
 */
export function wendeAn(w: Werkzeug, value: string, start: number, end: number, muster: string): Ergebnis {
  const a = Math.max(0, Math.min(start, value.length));
  const b = Math.max(a, Math.min(end, value.length));
  const vor = value.slice(0, a);
  const auswahl = value.slice(a, b);
  const nach = value.slice(b);

  if (w.kind === "wrap") {
    const inhalt = auswahl || muster;
    const neu = `${vor}${w.value}${inhalt}${w.value}${nach}`;
    // Ohne Auswahl bleibt das Muster markiert: wer tippt, ersetzt es.
    const von = a + w.value.length;
    return { text: neu, start: von, end: von + inhalt.length };
  }

  if (w.kind === "link") {
    const inhalt = auswahl || muster;
    const url = "https://";
    const titel = w.titel ? ` "${w.titel}"` : "";
    const neu = `${vor}[${inhalt}](${url}${titel})${nach}`;
    // Der Cursor springt in die Adresse hinter „https://“ — der Text ist schon da, die Adresse fehlt.
    const pos = a + 1 + inhalt.length + 2 + url.length;
    return { text: neu, start: pos, end: pos };
  }

  if (w.kind === "befehl") return { text: value, start: a, end: b };

  if (w.kind === "prefix") {
    // Auf ganze Zeilen anwenden: eine Überschrift mitten im Wort wäre keine.
    const zeilenAnfang = vor.lastIndexOf("\n") + 1;
    const kopf = value.slice(0, zeilenAnfang);
    const rest = value.slice(zeilenAnfang);
    const grenze = rest.indexOf("\n", b - zeilenAnfang);
    const bereich = grenze === -1 ? rest : rest.slice(0, grenze);
    const schwanz = grenze === -1 ? "" : rest.slice(grenze);
    const bearbeitet = bereich
      .split("\n")
      .map((z) => (z.startsWith(w.value) ? z.slice(w.value.length) : w.value + z))
      .join("\n");
    const cursor = kopf.length + bearbeitet.length;
    return { text: kopf + bearbeitet + schwanz, start: cursor, end: cursor };
  }

  // Ein Block braucht eine eigene Zeile, sonst steht die Tabelle im Satz.
  const trenner = vor === "" || vor.endsWith("\n") ? "" : "\n";
  const cursor = vor.length + trenner.length + w.value.length + 1;
  return { text: `${vor}${trenner}${w.value}\n${nach}`, start: cursor, end: cursor };
}

/**
 * Was zwischen `alt` und `neu` tatsächlich anders ist: der gemeinsame Anfang und das gemeinsame Ende bleiben, dazwischen wird
 * ersetzt. Grundlage dafür, eine Änderung **als Eingabe** ins Textfeld zu schreiben (`execCommand("insertText")`), statt den
 * ganzen Text über den React-Zustand zu setzen — der leert den Rückgängig-Verlauf des Browsers.
 */
export function aenderungsbereich(alt: string, neu: string): { von: number; bisAlt: number; ersatz: string } {
  let von = 0;
  const max = Math.min(alt.length, neu.length);
  while (von < max && alt[von] === neu[von]) von++;
  let ende = 0;
  while (ende < max - von && alt[alt.length - 1 - ende] === neu[neu.length - 1 - ende]) ende++;
  return { von, bisAlt: alt.length - ende, ersatz: neu.slice(von, neu.length - ende) };
}
