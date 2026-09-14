import { cn } from "./cn";

export type Step = {
  label: string;
  /**
   * Ist dieser Schritt **fachlich** erledigt?
   *
   * Ohne die Angabe gilt die Position: alles vor dem aktuellen Schritt ist
   * erledigt. Das stimmt in einem Ablauf, den man nur vorwärts durchläuft —
   * sobald die Schritte anklickbar sind, stimmt es nicht mehr: wer nach vorn
   * springt, bekäme Haken für Schritte, die er nie ausgefüllt hat.
   */
  done?: boolean;
};

/**
 * Fortschritt im Onboarding-Wizard. Zustand in Form UND Farbe: erledigte
 * Schritte tragen ein Häkchen.
 *
 * Mit `onSelect` sind die Schritte **anklickbar** (Feedback-Runde 2, F12.2).
 * Vorher kam man nur über „Weiter" zu Beschreibung und Logo — wer oben einen
 * Schritt sieht, versucht ihn anzuklicken, und wenn nichts passiert, hält man
 * die Anzeige für kaputt. Ohne `onSelect` bleibt es eine reine Anzeige; dann
 * sind es `<span>` und keine Knöpfe, damit niemand ins Leere tabbt.
 */
export function Stepper({
  steps,
  current,
  srLabel = "Fortschritt",
  onSelect,
}: {
  steps: Step[];
  current: number;
  srLabel?: string;
  /** Gesetzt: Schritte sind wählbar. */
  onSelect?: (index: number) => void;
}) {
  return (
    <ol className="flex flex-wrap items-center gap-2" aria-label={srLabel}>
      {steps.map((s, i) => {
        const done = s.done ?? i < current;
        const active = i === current;
        const klassen = cn(
          "inline-flex min-h-11 items-center gap-2 rounded-ct-md border px-3 py-1.5 ct-label leading-5",
          done && "border-success-soft bg-success-soft text-success-ink",
          active && "border-accent bg-accent-soft text-accent-deep",
          !done && !active && "border-border bg-surface text-muted",
          onSelect && "transition-colors hover:border-border-strong",
        );
        const inhalt = (
          <>
            <span aria-hidden className="tabular-nums">
              {done ? "✓" : i + 1}
            </span>
            {s.label}
          </>
        );
        return (
          <li key={s.label} className="flex items-center gap-2">
            {onSelect ? (
              <button
                type="button"
                onClick={() => onSelect(i)}
                aria-current={active ? "step" : undefined}
                className={klassen}
              >
                {inhalt}
              </button>
            ) : (
              <span aria-current={active ? "step" : undefined} className={klassen}>
                {inhalt}
              </span>
            )}
            {i < steps.length - 1 && (
              <span aria-hidden className="text-muted-soft">
                ›
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
