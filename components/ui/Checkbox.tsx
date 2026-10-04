import type { ComponentProps, ReactNode } from "react";
import { cn } from "./cn";

/**
 * Kontrollkästchen mit einer Trefferfläche von 44 px am Handy (QS-065 (7), Plan 02.10.).
 *
 * Das Kästchen selbst ist 20 px groß; angetippt wird aber die Beschriftung drumherum, und die
 * stand in den rund 70 Stellen des Portals je nach Zeile bei 20 bis 28 px. Auf groben Zeigern
 * (Finger) sind es hier 44 (Skill-Regel 7, wie bei Knöpfen und Feldern seit QS-057); am
 * Desktop bleibt die Zeile dicht.
 *
 * **Zwei Gestalten:**
 *
 * - **Mit `label`** — Kästchen und Beschriftung als eine Zeile, der ganze Streifen schaltet um.
 *   `hint` ist der Hilfetext darunter. Das Kästchen sitzt an der ersten Zeile, auch wenn die
 *   Beschriftung umbricht; die 12 px Luft oben und unten (nur am Handy) machen eine einzeilige
 *   Zeile 44 hoch und halten den Text in der Mitte.
 * - **Ohne `label`** — nur das Kästchen, für Stellen, an denen die Beschriftung woanders steht:
 *   über dem Feld (`<Field label htmlFor>`, dann `id` übergeben) oder als Spaltenkopf einer
 *   Tabelle (dann `aria-label`). Die Fläche ist 44 × 44 und ragt mit negativem Rand über das
 *   Kästchen hinaus (`-m-3`), das Layout misst weiter 20 px — wie bei den Auswahlspalten der
 *   Bewerbungen und der Standcheckliste, die dasselbe von Hand bauten.
 *
 * Alles andere (`checked`, `onChange`, `disabled`, `name` …) reicht die Komponente an das
 * native Feld weiter; die Markenfarbe kommt aus der Basisregel in `globals.css` (QS-060).
 * Die Beschriftung steht im Wörterbuch, nicht hier.
 *
 * Wer eine Zeile von Hand als `<label>` baut, bekommt die 44 px trotzdem: eine Basisregel in
 * `globals.css` hebt jedes `<label>` mit Kästchen oder Optionsfeld auf grobem Zeiger auf
 * mindestens 44 px. Diese Komponente ist die Fassung für neue Stellen.
 */
export function Checkbox({
  label,
  hint,
  className,
  ...rest
}: Omit<ComponentProps<"input">, "type" | "children"> & {
  /** Beschriftung neben dem Kästchen. Ohne sie steht nur das Kästchen da (siehe oben). */
  label?: ReactNode;
  /** Hilfetext unter der Beschriftung. */
  hint?: ReactNode;
}) {
  const kaestchen = <input {...rest} type="checkbox" className="size-5 shrink-0" />;

  if (!label) {
    return (
      <label className={cn("-m-3 flex size-11 cursor-pointer items-center justify-center", className)}>
        {kaestchen}
      </label>
    );
  }

  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-2 pointer-coarse:py-3",
        rest.disabled && "cursor-not-allowed text-muted",
        className,
      )}
    >
      {kaestchen}
      <span className="min-w-0">
        <span className={cn("ct-label block", !rest.disabled && "text-ink")}>{label}</span>
        {hint && <span className="ct-help block">{hint}</span>}
      </span>
    </label>
  );
}
