"use client";

import { Card } from "./Card";
import { Countdown, useRestzeit } from "./Countdown";

/**
 * Eine Frist, so gross, dass man sie nicht übersieht — Datum, darunter die
 * Restzeit.
 *
 * Sie stand zuerst nur auf der Ticketseite (F9.2: „deutlich grösser und als
 * Countdown"). Mit dem Messestand gibt es sie zweimal, deshalb liegt sie hier.
 * Die Restzeit rechnet der Browser, das Datum steht serverseitig daneben — es
 * fehlt also nie etwas, auch ohne JavaScript.
 *
 * **`prominent` dreht die Gewichtung um** (PART-066, Konrad 21.09.: „größer und
 * prominenter, als Countdown — dynamisches Element, wirkt immer super"): die
 * Restzeit steht als grosse Zahl vorn, das Datum darunter. Nur die Ticketseite
 * nutzt das — dort ist die Frist die eine Zahl, auf die es ankommt. Messestand,
 * Branding und Hackathon bleiben bei der ruhigen Fassung; wer das ändern will,
 * ändert es dort ausdrücklich, nicht über diese Komponente nebenbei.
 */
export function DeadlineCard({
  dueAt,
  label,
  dateText,
  days,
  hours,
  soon,
  note,
  prominent,
  unitDays,
  unitHours,
  unitHour,
  expired,
}: {
  dueAt: string;
  label: string;
  dateText: string;
  days: string;
  hours: string;
  soon: string;
  /** Ein Satz darunter, z. B. was nach der Frist gilt. */
  note?: string;
  /** Restzeit gross vorn, Datum darunter (Ticketseite, PART-066). */
  prominent?: boolean;
  /** Nur mit `prominent`: Einheiten neben der grossen Zahl. */
  unitDays?: string;
  unitHours?: string;
  unitHour?: string;
  /**
   * Nur mit `prominent`: Frist verstrichen — vom Server bestimmt, nicht vom
   * Countdown. Der kennt „abgelaufen" und „noch nicht eingehängt" nicht
   * auseinander; beides ist bei ihm `null`.
   */
  expired?: string | null;
}) {
  if (!prominent) {
    return (
      <Card className="border-accent-soft bg-accent-soft">
        <p className="ct-eyebrow text-accent-deep">{label}</p>
        <p className="ct-h2 mt-1 text-ink">{dateText}</p>
        <p className="ct-label mt-1 text-accent-deep">
          <Countdown dueAt={dueAt} days={days} hours={hours} soon={soon} />
        </p>
        {note && <p className="ct-small mt-2 leading-6 text-accent-deep">{note}</p>}
      </Card>
    );
  }
  return (
    <Card className="border-accent-soft bg-accent-soft">
      <p className="ct-eyebrow text-accent-deep">{label}</p>
      {expired ? (
        <p className="ct-h2 mt-2 text-ink">{expired}</p>
      ) : (
        <GrosseRestzeit dueAt={dueAt} soon={soon} unitDays={unitDays} unitHours={unitHours} unitHour={unitHour} />
      )}
      <p className="ct-h3 mt-2 text-ink">{dateText}</p>
      {note && <p className="ct-small mt-2 leading-6 text-accent-deep">{note}</p>}
    </Card>
  );
}

/**
 * Die grosse Zahl. Die Mindesthöhe hält den Platz frei, bis der Browser die
 * Restzeit gerechnet hat — sonst rutscht beim Einhängen alles darunter nach
 * unten, und genau das würde man bei einem so grossen Element sehen.
 */
function GrosseRestzeit({
  dueAt,
  soon,
  unitDays,
  unitHours,
  unitHour,
}: {
  dueAt: string;
  soon: string;
  unitDays?: string;
  unitHours?: string;
  unitHour?: string;
}) {
  const restzeit = useRestzeit(dueAt);
  return (
    <div className="mt-2 flex min-h-16 flex-wrap items-baseline gap-x-3" aria-live="polite">
      {restzeit &&
        (restzeit.art === "gleich" ? (
          <span className="ct-h2 text-ink">{soon}</span>
        ) : (
          <>
            <span className="ct-display tabular-nums text-ink">{restzeit.n}</span>
            <span className="ct-h3 text-accent-deep">
              {restzeit.art === "tage"
                ? unitDays
                : restzeit.n === 1
                  ? (unitHour ?? unitHours)
                  : unitHours}
            </span>
          </>
        ))}
    </div>
  );
}
