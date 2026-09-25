import { cn } from "./cn";

export type SchrittZustand = "offen" | "aktuell" | "erledigt";

/**
 * Das nummerierte Sechseck aus den Website-Blöcken (Step Section `54:9522`),
 * 40 px — die Schrittmarke der Marke (`--ct-shape-hex`, Tokens „Formen“).
 *
 * Zustand in Form **und** Farbe: erledigt trägt ein Häkchen auf der vollen
 * Akzentfläche, der aktuelle Schritt die Nummer auf der Akzentfläche, offene
 * Schritte bleiben Umriss mit Nummer. Weiss auf Akzent 4,88:1.
 *
 * Als SVG und nicht als `clip-path`, weil der offene Schritt einen Rand
 * braucht — geclippte Flächen tragen keinen. Der gefüllte Grund liegt im
 * selben SVG, damit eine Verbindungslinie dahinter nicht durch die Fläche
 * scheint.
 *
 * Zuerst in `StepBar`, seit PART-074 auch in den Event-App-Schritten des
 * Partner-Portals — deshalb liegt sie hier.
 */
export function SchrittMarke({
  nummer,
  zustand,
  className,
}: {
  nummer: number;
  zustand: SchrittZustand;
  className?: string;
}) {
  const gefuellt = zustand !== "offen";
  return (
    <span className={cn("relative flex h-10 w-10 shrink-0 items-center justify-center", className)}>
      <svg
        aria-hidden
        focusable="false"
        viewBox="0 0 40 40"
        className={cn("absolute inset-0 h-full w-full", gefuellt ? "text-accent" : "text-border-strong")}
      >
        <polygon
          points="20,1 39,10.5 39,29.5 20,39 1,29.5 1,10.5"
          fill={gefuellt ? "currentColor" : "var(--ct-surface)"}
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>
      <span aria-hidden className={cn("relative ct-label tabular-nums", gefuellt ? "text-white" : "text-muted")}>
        {zustand === "erledigt" ? <Haken /> : nummer}
      </span>
    </span>
  );
}

function Haken() {
  return (
    <svg viewBox="0 0 12 12" className="h-3.5 w-3.5" aria-hidden fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M2.5 6.5 5 9l4.5-5.5" />
    </svg>
  );
}
