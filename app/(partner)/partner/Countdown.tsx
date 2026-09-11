"use client";

import { useEffect, useState } from "react";

/**
 * Restzeit bis zu einer Frist, als Zusatz zum Datum daneben.
 *
 * Im Browser gerechnet und erst nach dem Einhängen sichtbar: „jetzt" ist auf
 * dem Server ein anderer Zeitpunkt als im Browser, und eine Zeitangabe, die
 * beim Hydrieren springt, ist schlechter als eine, die einen Wimpernschlag
 * später erscheint. Das Datum selbst steht serverseitig daneben, es fehlt
 * also nie etwas.
 */
export function Countdown({
  dueAt,
  days,
  hours,
  soon,
}: {
  dueAt: string;
  /** „noch {n} Tage" */
  days: string;
  /** „noch {n} Stunden" */
  hours: string;
  /** unter einer Stunde */
  soon: string;
}) {
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    const due = new Date(dueAt).getTime();
    const update = () => {
      const ms = due - Date.now();
      if (!Number.isFinite(ms) || ms <= 0) {
        setText(null);
        return;
      }
      const totalHours = Math.floor(ms / 3_600_000);
      if (totalHours < 1) setText(soon);
      else if (totalHours < 48) setText(hours.replace("{n}", String(totalHours)));
      else setText(days.replace("{n}", String(Math.floor(totalHours / 24))));
    };
    update();
    // Minütlich genügt: die nächste Frist liegt Wochen entfernt.
    const timer = setInterval(update, 60_000);
    return () => clearInterval(timer);
  }, [dueAt, days, hours, soon]);

  if (!text) return null;
  return <> · {text}</>;
}
