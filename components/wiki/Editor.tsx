"use client";

import { useId, useMemo, useRef, useState } from "react";
import { Markdown } from "./Markdown";
import { fetteUeberschriften } from "./markdown-parse";
import { FormatLeiste } from "@/components/ui/FormatLeiste";
import { ersetzeAlsEingabe, verlaufBefehl } from "@/components/ui/textfeld-bearbeiten";
import { WERKZEUGE, WIKI_LEISTE, wendeAn, type WerkzeugKey } from "@/lib/markdown-werkzeuge";

type Strings = Record<string, string>;

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
  // Eine Zeile nur aus **…** sieht aus wie Betonung, nicht wie Überschrift, und die Seite gliedert sie nicht (PART-104 Teil 2).
  const fette = useMemo(() => fetteUeberschriften(value), [value]);

  function anwenden(key: WerkzeugKey) {
    const el = ref.current;
    if (!el) return;
    const w = WERKZEUGE[key];
    if (w.kind === "befehl") {
      verlaufBefehl(el, w.befehl);
      return;
    }
    const neu = wendeAn(w, value, el.selectionStart, el.selectionEnd, t.sampleText);
    // Als Eingabe ins Feld schreiben, damit Strg+Z weiter geht; nur wenn der Browser das ablehnt, den Zustand setzen.
    if (!ersetzeAlsEingabe(el, neu.text)) onChange(neu.text);
    // Nach dem Neurendern die Auswahl zurücksetzen, sonst springt der Cursor ans Ende.
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(neu.start, neu.end);
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <FormatLeiste
        gruppen={WIKI_LEISTE}
        steuert={id}
        onAnwenden={anwenden}
        t={t}
        umschalter={{ label: t.preview, pressed: vorschau, onToggle: () => setVorschau((v) => !v) }}
      />

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

      {fette.length > 0 && (
        <p className="ct-small text-warning-ink">
          {t.boldHeadingHint.replace("{text}", fette[0].text).replace("{zeile}", String(fette[0].zeile))}
          {fette.length > 1 && ` ${t.boldHeadingMore.replace("{n}", String(fette.length - 1))}`}
        </p>
      )}

      <p className="ct-help">{t.editorHint}</p>
    </div>
  );
}
