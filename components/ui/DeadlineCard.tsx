"use client";

import { Card } from "./Card";
import { Countdown } from "./Countdown";

/**
 * Eine Frist, so gross, dass man sie nicht übersieht — Datum, darunter die
 * Restzeit.
 *
 * Sie stand zuerst nur auf der Ticketseite (F9.2: „deutlich grösser und als
 * Countdown"). Mit dem Messestand gibt es sie zweimal, deshalb liegt sie hier.
 * Die Restzeit rechnet der Browser, das Datum steht serverseitig daneben — es
 * fehlt also nie etwas, auch ohne JavaScript.
 */
export function DeadlineCard({
  dueAt,
  label,
  dateText,
  days,
  hours,
  soon,
  note,
}: {
  dueAt: string;
  label: string;
  dateText: string;
  days: string;
  hours: string;
  soon: string;
  /** Ein Satz darunter, z. B. was nach der Frist gilt. */
  note?: string;
}) {
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
