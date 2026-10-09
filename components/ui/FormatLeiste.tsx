"use client";

import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { WERKZEUGE, flach, type WerkzeugKey } from "@/lib/markdown-werkzeuge";
import { naechsterKnopf } from "@/components/ui/format-leiste-ring";

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
 * * **Gruppen mit Trennstrich:** Verlauf | Zeichen | Listen | Einfügen. **Jede Gruppe ist ein eigenes Element mit dem Strich
 *   links** (nicht ein Strich zwischen den Knöpfen): bricht die Leiste am Handy um, bleibt kein Strich am Zeilenende
 *   stehen (09.10.2026, Abnahme Vorschlag 10-09). Der Strich der ersten Gruppe jeder Zeile liegt außerhalb des
 *   sichtbaren Rands (`-ml-px` im Inneren, `overflow-x-clip` außen) und fällt weg — nur in der Breite, damit die
 *   Fokusringe oben und unten nicht abgeschnitten werden.
 * * **Größe nach Kit-Regel:** `size-8` am Desktop, `size-11` bei grobem Zeiger (Touch) — am Desktop wären 44 px je Knopf
 *   eine Leiste von 550 px.
 *   Bei grobem Zeiger sitzen die Knöpfe enger (2 statt 4 px Abstand): Gruppen brechen als Ganzes um, und mit 4 px passten am Handy
 *   (343 px) die Gruppen „Verlauf“ und „Zeichen“ um 3 px nicht in eine Zeile — die Wiki-Leiste wurde eine Zeile länger (gemessen).
 * * **APG-Toolbar:** ein Tab-Stopp für die ganze Leiste (Roving Tabindex), Pfeiltasten wandern (`naechsterKnopf`),
 *   Pos1/Ende springen; `aria-controls` zeigt auf das Textfeld. Sonst wären es zwölf Tab-Stopps vor dem Text. **Der
 *   Umschalter am rechten Rand (z. B. „Vorschau“) gehört zum Ring**, sonst wären es zwei Tab-Stopps und die Pfeile
 *   erreichten ihn nicht.
 * * **Der Name bei Tastaturfokus:** `title` zeigt ihn nur der Maus; wer mit Tab und Pfeilen kommt, sieht ihn als kleine
 *   Zeile unter der Leiste (`:focus-visible`, nie bei der Maus). Die Zeile liegt außerhalb des geclippten Elements.
 * * Der Klick nimmt dem Textfeld den Fokus nicht (`onMouseDown`), sonst ginge die Cursorposition verloren, bevor das
 *   Werkzeug sie liest.
 */
export function FormatLeiste({
  gruppen,
  onAnwenden,
  steuert,
  t,
  umschalter,
}: {
  gruppen: WerkzeugKey[][];
  onAnwenden: (key: WerkzeugKey) => void;
  /** Id des Textfelds, das die Leiste bedient (`aria-controls`). */
  steuert: string;
  /** Beschriftungen `tool_<key>` und `toolbar`. */
  t: Record<string, string>;
  /** Ein Umschalter am rechten Rand der Leiste (z. B. „Vorschau“); er hat `aria-pressed` und gehört zum Ring der Pfeiltasten. */
  umschalter?: { label: string; pressed: boolean; onToggle: () => void };
}) {
  const alle = flach(gruppen);
  const anzahl = alle.length + (umschalter ? 1 : 0);
  const [aktiv, setAktiv] = useState(0);
  const [fokusName, setFokusName] = useState<string | null>(null);
  const knoepfe = useRef<(HTMLButtonElement | null)[]>([]);

  function taste(e: KeyboardEvent) {
    const neu = naechsterKnopf(e.key, aktiv, anzahl);
    if (neu === null) return;
    e.preventDefault();
    setAktiv(neu);
    knoepfe.current[neu]?.focus();
  }

  function fokus(index: number, name: string, el: HTMLElement) {
    setAktiv(index);
    setFokusName(el.matches(":focus-visible") ? name : null);
  }

  let laufend = -1;
  return (
    <div className="relative">
      <div role="toolbar" aria-label={t.toolbar} aria-controls={steuert} onKeyDown={taste} className="overflow-x-clip rounded-ct-sm border bg-canvas">
        <div className="-ml-px flex flex-wrap items-center gap-y-1 py-1 pr-1">
          {gruppen.map((gruppe, gi) => (
            <div key={gi} className="flex items-center gap-1 border-l px-1 pointer-coarse:gap-0.5 pointer-coarse:px-0.5">
              {gruppe.map((key) => {
                const index = ++laufend;
                const name = t[`tool_${key}`] ?? WERKZEUGE[key].key;
                return (
                  <button
                    key={key}
                    ref={(el) => { knoepfe.current[index] = el; }}
                    type="button"
                    tabIndex={index === aktiv ? 0 : -1}
                    onFocus={(e) => fokus(index, name, e.currentTarget)}
                    onBlur={() => setFokusName(null)}
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
            </div>
          ))}
          {umschalter && (
            <div className="ml-auto pl-1">
              <button
                ref={(el) => { knoepfe.current[alle.length] = el; }}
                type="button"
                tabIndex={alle.length === aktiv ? 0 : -1}
                aria-pressed={umschalter.pressed}
                onFocus={(e) => fokus(alle.length, umschalter.label, e.currentTarget)}
                onBlur={() => setFokusName(null)}
                onClick={umschalter.onToggle}
                className={
                  "min-h-8 rounded-ct-sm px-2.5 ct-label transition-colors pointer-coarse:min-h-11 " +
                  (umschalter.pressed ? "bg-accent-soft text-accent-deep" : "text-muted hover:bg-surface-hover hover:text-ink")
                }
              >
                {umschalter.label}
              </button>
            </div>
          )}
        </div>
      </div>
      {fokusName && (
        <p aria-hidden className="absolute left-0 top-full z-10 mt-1 rounded-ct-sm bg-shell px-2 py-1 ct-small text-on-navy">
          {fokusName}
        </p>
      )}
    </div>
  );
}
