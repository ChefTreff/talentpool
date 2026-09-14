"use client";

import { useId, useRef, useState } from "react";
import { Markdown } from "./Markdown";

type Strings = Record<string, string>;

/** Eine Schaltfläche der Leiste: Präfix je Zeile oder Klammer um die Auswahl. */
type Werkzeug =
  | { key: string; kind: "prefix"; value: string }
  | { key: string; kind: "wrap"; value: string }
  | { key: string; kind: "block"; value: string };

const WERKZEUGE: Werkzeug[] = [
  { key: "h2", kind: "prefix", value: "## " },
  { key: "h3", kind: "prefix", value: "### " },
  { key: "bold", kind: "wrap", value: "**" },
  { key: "italic", kind: "wrap", value: "*" },
  { key: "code", kind: "wrap", value: "`" },
  { key: "ul", kind: "prefix", value: "- " },
  { key: "ol", kind: "prefix", value: "1. " },
  { key: "quote", kind: "prefix", value: "> " },
  { key: "link", kind: "block", value: "[Text](https://)" },
  { key: "table", kind: "block", value: "| Spalte | Spalte |\n| --- | --- |\n|  |  |" },
  { key: "rule", kind: "block", value: "---" },
];

/**
 * Der Redaktionseditor für Wiki-Artikel (F9.7).
 *
 * Konrad wollte etwas, das sich wie der Notion-Editor anfühlt — „übliche
 * Formatierungen". Dahinter steht trotzdem **Markdown** und kein
 * Rich-Text-Feld, und das ist Absicht: der Text landet in Portalen fremder
 * Zielgruppen, und unser Renderer erzeugt ausschliesslich React-Knoten. Ein
 * HTML-Editor hiesse, HTML zu speichern und irgendwann einzufügen — das ist
 * genau der Weg, den wir uns nicht bauen wollen.
 *
 * Die Leiste schreibt also Zeichen in den Text, statt einen eigenen
 * Dokumentbaum zu führen. Wer Markdown kann, tippt weiter; wer nicht, klickt.
 * Die Vorschau zeigt beim Schreiben, was hinterher im Portal steht — ohne sie
 * wäre die Leiste ein Rätsel.
 */
export function Editor({
  value,
  onChange,
  rows = 18,
  t,
}: {
  value: string;
  onChange: (next: string) => void;
  rows?: number;
  t: Strings;
}) {
  const id = useId();
  const ref = useRef<HTMLTextAreaElement>(null);
  const [vorschau, setVorschau] = useState(false);

  function anwenden(w: Werkzeug) {
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const vor = value.slice(0, start);
    const auswahl = value.slice(start, end);
    const nach = value.slice(end);

    let neu = value;
    let cursor = end;

    if (w.kind === "wrap") {
      const inhalt = auswahl || t.sampleText;
      neu = `${vor}${w.value}${inhalt}${w.value}${nach}`;
      cursor = start + w.value.length + inhalt.length + w.value.length;
    } else if (w.kind === "prefix") {
      // Auf ganze Zeilen anwenden: eine Überschrift mitten im Wort wäre keine.
      const zeilenAnfang = vor.lastIndexOf("\n") + 1;
      const kopf = value.slice(0, zeilenAnfang);
      const rest = value.slice(zeilenAnfang);
      const grenze = rest.indexOf("\n", end - zeilenAnfang);
      const bereich = grenze === -1 ? rest : rest.slice(0, grenze);
      const schwanz = grenze === -1 ? "" : rest.slice(grenze);
      const bearbeitet = bereich
        .split("\n")
        .map((z) => (z.startsWith(w.value) ? z.slice(w.value.length) : w.value + z))
        .join("\n");
      neu = kopf + bearbeitet + schwanz;
      cursor = kopf.length + bearbeitet.length;
    } else {
      // Ein Block braucht eine eigene Zeile, sonst steht die Tabelle im Satz.
      const trenner = vor === "" || vor.endsWith("\n") ? "" : "\n";
      neu = `${vor}${trenner}${w.value}\n${nach}`;
      cursor = vor.length + trenner.length + w.value.length + 1;
    }

    onChange(neu);
    // Nach dem Neurendern den Cursor zurücksetzen, sonst springt er ans Ende.
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(cursor, cursor);
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1 rounded-ct-sm border bg-canvas p-1">
        {WERKZEUGE.map((w) => (
          <button
            key={w.key}
            type="button"
            onClick={() => anwenden(w)}
            title={t[`tool_${w.key}`] ?? w.key}
            className="min-h-11 rounded-ct-sm px-2.5 ct-label text-muted transition-colors hover:bg-surface-hover hover:text-ink"
          >
            {t[`tool_${w.key}`] ?? w.key}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={vorschau}
          onClick={() => setVorschau((v) => !v)}
          className={
            "ml-auto min-h-11 rounded-ct-sm px-2.5 ct-label transition-colors " +
            (vorschau ? "bg-accent-soft text-accent-deep" : "text-muted hover:bg-surface-hover hover:text-ink")
          }
        >
          {t.preview}
        </button>
      </div>

      <div className={vorschau ? "grid gap-3 lg:grid-cols-2" : ""}>
        <textarea
          ref={ref}
          id={id}
          rows={rows}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          spellCheck
          className="w-full rounded-ct-sm border bg-surface px-3 py-2 font-mono ct-small leading-6 text-ink focus:border-accent"
        />
        {vorschau && (
          <div className="rounded-ct-sm border bg-surface px-4 py-3 ct-small">
            {value.trim() === "" ? (
              <p className="ct-help">{t.previewEmpty}</p>
            ) : (
              <Markdown source={value} />
            )}
          </div>
        )}
      </div>

      <p className="ct-help">{t.editorHint}</p>
    </div>
  );
}
