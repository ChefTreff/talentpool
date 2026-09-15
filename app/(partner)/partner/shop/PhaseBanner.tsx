import { Card } from "@/components/ui/Card";
import { cn } from "@/components/ui/cn";
import type { ShopPhase } from "../types";

type Strings = Record<string, string>;

/** Was gerade geht, und bis wann. Auf jeder Shop-Seite dasselbe. */
export function PhaseBanner({
  phase,
  dateLocale,
  t,
}: {
  phase: ShopPhase;
  dateLocale: string;
  t: Strings;
}) {
  const closed = phase.phase === 0;
  const dateTime = new Intl.DateTimeFormat(dateLocale, {
    dateStyle: "medium",
    timeStyle: "short",
  });
  return (
    <Card
      className={cn(
        "mb-6",
        closed ? "border-warning-soft bg-warning-soft" : "border-accent-soft bg-accent-soft",
      )}
    >
      <h2 className={cn("ct-h3", closed ? "text-warning-ink" : "text-accent-deep")}>
        {closed
          ? t.phaseClosed
          : (t[`phase_${phase.phase}`] ?? t.phaseOpen).replace("{n}", String(phase.phase))}
      </h2>
      <p className={cn("ct-help mt-1", closed ? "text-warning-ink" : "text-accent-deep")}>
        {closed ? t.phaseClosedBody : phase.late_only ? t.phaseLateOnly : t.phaseOpenBody}
      </p>
      {phase.ends_at && !closed && (
        <p className="ct-help mt-1 text-accent-deep">
          {t.phaseEnds} {dateTime.format(new Date(phase.ends_at))}
        </p>
      )}
    </Card>
  );
}
