"use client";

import { cn } from "./cn";
import { SchrittMarke } from "./SchrittMarke";

export type BarStep = {
  label: string;
  /** Ein Halbsatz unter dem Titel — was in diesem Schritt passiert. */
  hint?: string;
  /**
   * Ist dieser Schritt **fachlich** erledigt? Ohne die Angabe gilt die
   * Position. Sobald die Schritte anklickbar sind, stimmt die Position nicht
   * mehr: wer nach vorn springt, bekäme Haken für Schritte, die er nie
   * ausgefüllt hat.
   */
  done?: boolean;
};

/**
 * Der Fortschritt eines Ablaufs — Wizard, Onboarding, Checklisten-Kopf.
 *
 * Website-Vorbild: Step Section (`54:9522`). Eine durchgehende Linie, darauf
 * nummerierte Sechsecke, darunter Titel und ein Halbsatz. **Mobil dreht die
 * Website das Ganze um 90°**: die Linie steht links, Marker und Text laufen
 * nach unten. Genau diesen Umbruch macht diese Komponente — waagerecht ab
 * 640 px, darunter senkrecht.
 *
 * Sie ersetzt die Knopfreihe des alten `Stepper`: dort waren die Schritte
 * Kacheln nebeneinander, und man sah den Weg nicht, nur die Stationen. Die
 * Linie ist der Unterschied zwischen „vier Knöpfe" und „ein Ablauf".
 *
 * Zustand in Form **und** Farbe: erledigt trägt ein Häkchen, der aktuelle
 * Schritt eine gefüllte Fläche, offene Schritte bleiben Umriss.
 */
export function StepBar({
  steps,
  current,
  srLabel = "Fortschritt",
  onSelect,
  className,
}: {
  steps: BarStep[];
  current: number;
  srLabel?: string;
  /** Gesetzt: die Schritte sind wählbar. */
  onSelect?: (index: number) => void;
  className?: string;
}) {
  return (
    <ol
      aria-label={srLabel}
      className={cn(
        "relative flex flex-col gap-6 sm:flex-row sm:gap-4",
        // Die Linie: senkrecht links (mobil), waagerecht auf Markerhöhe
        // (ab 640 px) — wie die Website es mobil umbricht.
        "before:absolute before:bg-border before:content-['']",
        "before:left-5 before:top-5 before:h-[calc(100%-2.5rem)] before:w-px",
        "sm:before:left-0 sm:before:top-5 sm:before:h-px sm:before:w-full",
        className,
      )}
    >
      {steps.map((s, i) => {
        const done = s.done ?? i < current;
        const active = i === current;
        const inhalt = (
          <>
            <SchrittMarke nummer={i + 1} zustand={done ? "erledigt" : active ? "aktuell" : "offen"} />
            <span className="min-w-0 sm:mt-3">
              <span className={cn("ct-label block", active || done ? "text-ink" : "text-muted")}>
                {s.label}
              </span>
              {s.hint && <span className="ct-help mt-0.5 block">{s.hint}</span>}
            </span>
          </>
        );
        const klassen = cn(
          "flex w-full items-start gap-3 rounded-ct-md text-left",
          "sm:flex-col sm:items-start sm:gap-0",
          onSelect && "transition-opacity hover:opacity-80",
        );
        return (
          <li key={s.label} className="relative flex-1">
            {onSelect ? (
              <button
                type="button"
                onClick={() => onSelect(i)}
                aria-current={active ? "step" : undefined}
                className={cn(klassen, "min-h-11")}
              >
                {inhalt}
              </button>
            ) : (
              <span aria-current={active ? "step" : undefined} className={klassen}>
                {inhalt}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
