"use client";

import { Fragment, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { WERKZEUGE, flach, type WerkzeugKey } from "@/lib/markdown-werkzeuge";

/** Zeichen und Symbole der Werkzeuge — als Zeichnung, nicht als ausgeschriebenes Wort (ADM-103 g). */
const SYMBOL: Record<WerkzeugKey, ReactNode> = {
  undo: <Zeichnung><path d="M4 6h5.5a3 3 0 0 1 0 6H6M4 6l2.5-2.5M4 6l2.5 2.5" /></Zeichnung>,
  redo: <Zeichnung><path d="M12 6H6.5a3 3 0 0 0 0 6H10M12 6l-2.5-2.5M12 6l-2.5 2.5" /></Zeichnung>,
  h2: <span className="font-semibold">H2</span>,
  h3: <span className="font-semibold">H3</span>,
  bold: <span className="font-bold">B</span>,
  italic: <span className="italic">I</span>,
  code: <Zeichnung><path d="m6 5-3 3 3 3M10 5l3 3-3 3" /></Zeichnung>,
  ul: <Zeichnung><path d="M6 4h7M6 8h7M6 12h7" /><circle cx="2.5" cy="4" r=".6" /><circle cx="2.5" cy="8" r=".6" /><circle cx="2.5" cy="12" r=".6" /></Zeichnung>,
  ol: <Zeichnung><path d="M6 4h7M6 8h7M6 12h7M2 3l1-.5V6M2 9.5c.2-.8 1.6-.8 1.6.1 0 .8-1.6 1-1.6 2.4h1.7" /></Zeichnung>,
  quote: <Zeichnung><path d="M3 4v8M6 5h7M6 8h7M6 11h4" /></Zeichnung>,
  link: <Zeichnung><path d="M6.5 9.5a2.5 2.5 0 0 0 3.5 0l2-2a2.5 2.5 0 0 0-3.5-3.5l-.7.7M9.5 6.5a2.5 2.5 0 0 0-3.5 0l-2 2a2.5 2.5 0 0 0 3.5 3.5l.7-.7" /></Zeichnung>,
  table: <Zeichnung><rect x="2" y="3" width="12" height="10" rx="1" /><path d="M2 7h12M2 10h12M6.5 3v10" /></Zeichnung>,
  rule: <Zeichnung><path d="M2 8h12" /></Zeichnung>,
  button: <Zeichnung><rect x="2" y="5" width="12" height="6" rx="3" /><path d="M5.5 8h5" /></Zeichnung>,
};

function Zeichnung({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden focusable="false" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

/**
 * Die Formatierungsleiste (ADM-103 g, ADM-102 f), nach dem Muster des Design-Chats:
 *
 * * **Symbole statt ausgeschriebener Wörter**; der Name steht als `title` (Maus) und `aria-label` (Vorlesen) am Knopf.
 * * **Gruppen mit Trennstrich:** Verlauf | Zeichen | Listen | Einfügen.
 * * **Größe nach Kit-Regel:** `size-8` am Desktop, `size-11` bei grobem Zeiger (Touch) — am Desktop wären 44 px je Knopf
 *   eine Leiste von 550 px.
 * * **APG-Toolbar:** ein Tab-Stopp für die ganze Leiste (Roving Tabindex), Pfeiltasten wandern, Pos1/Ende springen;
 *   `aria-controls` zeigt auf das Textfeld. Sonst wären es zwölf Tab-Stopps vor dem Text.
 * * Der Klick nimmt dem Textfeld den Fokus nicht (`onMouseDown`), sonst ginge die Cursorposition verloren, bevor das
 *   Werkzeug sie liest.
 */
export function FormatLeiste({
  gruppen,
  onAnwenden,
  steuert,
  t,
  ende,
}: {
  gruppen: WerkzeugKey[][];
  onAnwenden: (key: WerkzeugKey) => void;
  /** Id des Textfelds, das die Leiste bedient (`aria-controls`). */
  steuert: string;
  /** Beschriftungen `tool_<key>` und `toolbar`. */
  t: Record<string, string>;
  /** Steht am rechten Rand der Leiste (z. B. „Vorschau“). */
  ende?: ReactNode;
}) {
  const alle = flach(gruppen);
  const [aktiv, setAktiv] = useState(0);
  const knoepfe = useRef<(HTMLButtonElement | null)[]>([]);

  function taste(e: KeyboardEvent) {
    const richtung = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!richtung && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    const neu = e.key === "Home" ? 0 : e.key === "End" ? alle.length - 1 : (aktiv + richtung + alle.length) % alle.length;
    setAktiv(neu);
    knoepfe.current[neu]?.focus();
  }

  let laufend = -1;
  return (
    <div role="toolbar" aria-label={t.toolbar} aria-controls={steuert} onKeyDown={taste} className="flex flex-wrap items-center gap-1 rounded-ct-sm border bg-canvas p-1">
      {gruppen.map((gruppe, gi) => (
        <Fragment key={gi}>
          {gi > 0 && <span aria-hidden className="mx-1 h-5 w-px bg-border" />}
          {gruppe.map((key) => {
            const index = ++laufend;
            const name = t[`tool_${key}`] ?? WERKZEUGE[key].key;
            return (
              <button
                key={key}
                ref={(el) => { knoepfe.current[index] = el; }}
                type="button"
                tabIndex={index === aktiv ? 0 : -1}
                onFocus={() => setAktiv(index)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onAnwenden(key)}
                title={name}
                aria-label={name}
                className="flex size-8 items-center justify-center rounded-ct-sm ct-label text-muted transition-colors hover:bg-surface-hover hover:text-ink pointer-coarse:size-11"
              >
                {SYMBOL[key]}
              </button>
            );
          })}
        </Fragment>
      ))}
      {ende && <div className="ml-auto">{ende}</div>}
    </div>
  );
}
