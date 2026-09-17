import type { ReactNode } from "react";
import { cn } from "./cn";

/**
 * Was als Nächstes dran ist — eine Akzentfläche mit weissem Text.
 *
 * Website-Vorbild: die Merkmalsleiste im CTA-Banner (`54:10521`) — Vollfläche
 * im Akzent, Hexagon-Bullets, Navy-Text. Im Portal trägt sie keine drei
 * Werbeversprechen, sondern **den Stand und den nächsten Schritt**: „3 von 8
 * Aufgaben offen" plus eine Aktion.
 *
 * **Auf der Akzentfläche steht Weiss, nicht Navy.** Das Brandbook zeigt
 * Navy-Text auf der Akzentfläche; gemessen erreicht er nur 3,56:1 und trägt
 * damit keinen Fliesstext (`referenzen/kontrast.mjs`). Weiss kommt auf
 * 4,88:1. Kontrast schlägt Token — die Abweichung steht in
 * `referenzen/tokens.md`.
 *
 * Und es gibt hier **keine zweite, gedämpfte Textebene**: jede Abschwächung
 * von Weiss fällt durch (weiss bei 90 % Deckkraft nur noch 4,28:1). Die
 * Hierarchie kommt aus Grösse und Versalien, nicht aus Helligkeit.
 *
 * Sie steht **einmal** pro Seite, direkt unter dem Hero-Band. Zwei solche
 * Leisten heben sich gegenseitig auf.
 */
export function NextStepBanner({
  label,
  title,
  hint,
  action,
  className,
}: {
  /** Kleine Zeile, Versalien: worum es geht („Onboarding", „Fristen"). */
  label?: string;
  /** Der Stand als Satz: „3 von 8 Aufgaben offen". */
  title: string;
  /** Ein Halbsatz mehr, wenn nötig. */
  hint?: string;
  /** Eine Aktion — als `ButtonLink variant="onAccent"`. */
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mb-6 flex flex-wrap items-center justify-between gap-4 rounded-ct-lg bg-accent px-6 py-5 text-white",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <Hex />
        <div>
          {label && <p className="ct-eyebrow text-white">{label}</p>}
          <p className="ct-h3 text-white">{title}</p>
          {hint && <p className="ct-small mt-0.5 text-white">{hint}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

/**
 * Der Hexagon-Marker der Marke, als Aufzählungszeichen.
 *
 * Das Sechseck kommt aus den Website-Blöcken (Step-Marker, Merkmalsleiste)
 * und ist seit dem 17.09.2026 für Marker und Aufzählungen gesetzt — die
 * Regel vom 12.09. („Dreieck statt Hexagon") gilt weiter für Flächen und
 * Masken, nicht für Marker.
 */
function Hex() {
  return (
    <span
      aria-hidden
      className="mt-1 h-4 w-4 shrink-0 bg-white"
      style={{ clipPath: "var(--ct-shape-hex)" }}
    />
  );
}
