import { Card } from "@/components/ui/Card";
import { DeadlineCard } from "@/components/ui/DeadlineCard";
import { cn } from "@/components/ui/cn";
import type { ShopPhase } from "../types";

type Strings = Record<string, string>;

/** Texte des Countdowns — dieselben wie auf der Ticketseite (PART-066). */
export type CountdownTexte = {
  days: string;
  hours: string;
  soon: string;
  unitDays: string;
  unitHours: string;
  unitHour: string;
};

/**
 * Was gerade geht, und bis wann. Auf jeder Shop-Seite dasselbe.
 *
 * Läuft eine Phase mit Ende, steht die Frist als grosse, laufende Zahl da —
 * **identisch mit der Ticketseite** (PART-076, Konrad 24.09.; `DeadlineCard`
 * mit `prominent`, PART-066). Ist das Ende schon vorbei oder fehlt es, bleibt
 * es beim ruhigen Hinweis; ob die Frist verstrichen ist, entscheidet der
 * Server, nicht der Countdown.
 */
export function PhaseBanner({
  phase,
  dateLocale,
  t,
  countdown,
}: {
  phase: ShopPhase;
  dateLocale: string;
  t: Strings;
  countdown: CountdownTexte;
}) {
  const closed = phase.phase === 0;
  const titel = closed
    ? t.phaseClosed
    : (t[`phase_${phase.phase}`] ?? t.phaseOpen).replace("{n}", String(phase.phase));
  const text = closed ? t.phaseClosedBody : phase.late_only ? t.phaseLateOnly : t.phaseOpenBody;
  const dateTime = new Intl.DateTimeFormat(dateLocale, {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Europe/Berlin",
  });
  const laeuft = !closed && phase.ends_at !== null && new Date(phase.ends_at) > new Date();

  if (laeuft && phase.ends_at) {
    return (
      <div className="mb-6">
        <DeadlineCard
          prominent
          dueAt={phase.ends_at}
          label={titel}
          dateText={`${t.phaseEnds} ${dateTime.format(new Date(phase.ends_at))}`}
          days={countdown.days}
          hours={countdown.hours}
          soon={countdown.soon}
          unitDays={countdown.unitDays}
          unitHours={countdown.unitHours}
          unitHour={countdown.unitHour}
          note={text}
        />
      </div>
    );
  }

  return (
    <Card
      className={cn(
        "mb-6",
        closed ? "border-warning-soft bg-warning-soft" : "border-accent-soft bg-accent-soft",
      )}
    >
      <h2 className={cn("ct-h3", closed ? "text-warning-ink" : "text-accent-deep")}>{titel}</h2>
      <p className={cn("ct-help mt-1", closed ? "text-warning-ink" : "text-accent-deep")}>{text}</p>
      {phase.ends_at && !closed && (
        <p className="ct-help mt-1 text-accent-deep">
          {t.phaseEnds} {dateTime.format(new Date(phase.ends_at))}
        </p>
      )}
    </Card>
  );
}
