import { cn } from "./cn";

export type Step = { label: string };

/**
 * Fortschritt im Onboarding-Wizard (3 Schritte, Entscheidung 08.09.2026).
 * Zustand in Form UND Farbe: erledigte Schritte tragen ein Häkchen.
 */
export function Stepper({
  steps,
  current,
  srLabel = "Fortschritt",
}: {
  steps: Step[];
  current: number;
  srLabel?: string;
}) {
  return (
    <ol className="flex flex-wrap items-center gap-2" aria-label={srLabel}>
      {steps.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={s.label} className="flex items-center gap-2">
            <span
              aria-current={active ? "step" : undefined}
              className={cn(
                "inline-flex items-center gap-2 rounded-ct-md border px-3 py-1.5 text-[14px] font-semibold leading-5",
                done && "border-success-soft bg-success-soft text-success-ink",
                active && "border-accent bg-accent-soft text-accent-deep",
                !done && !active && "border-border bg-surface text-muted",
              )}
            >
              <span aria-hidden className="tabular-nums">
                {done ? "✓" : i + 1}
              </span>
              {s.label}
            </span>
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
