"use client";

import { useEffect, useState } from "react";

/** Restzeit bis zu einer Frist — `null` vor dem Einhängen und nach Ablauf. */
export type Restzeit = { art: "tage" | "stunden" | "gleich"; n: number } | null;

/**
 * Die Rechnung hinter jeder Restzeit-Anzeige, einmal.
 *
 * Im Browser gerechnet und erst nach dem Einhängen gefüllt: „jetzt" ist auf dem
 * Server ein anderer Zeitpunkt als im Browser, und eine Zeitangabe, die beim
 * Hydrieren springt, ist schlechter als eine, die einen Wimpernschlag später
 * erscheint. Unter 48 Stunden zählt sie Stunden, darunter Tage — „noch 1 Tag"
 * wäre bei 47 Stunden eine Beruhigung, die nicht stimmt.
 *
 * Eigener Hook, seit die Frist auch **groß** erscheint (PART-066): die große
 * Anzeige braucht Zahl und Einheit getrennt, die kleine einen Satz. Beide
 * rechnen hier, nicht jede für sich.
 */
export function useRestzeit(dueAt: string): Restzeit {
  const [restzeit, setRestzeit] = useState<Restzeit>(null);

  useEffect(() => {
    const due = new Date(dueAt).getTime();
    const update = () => {
      const ms = due - Date.now();
      if (!Number.isFinite(ms) || ms <= 0) {
        setRestzeit(null);
        return;
      }
      const totalHours = Math.floor(ms / 3_600_000);
      if (totalHours < 1) setRestzeit({ art: "gleich", n: 0 });
      else if (totalHours < 48) setRestzeit({ art: "stunden", n: totalHours });
      else setRestzeit({ art: "tage", n: Math.floor(totalHours / 24) });
    };
    update();
    // Minütlich genügt: die nächste Frist liegt Wochen entfernt.
    const timer = setInterval(update, 60_000);
    return () => clearInterval(timer);
  }, [dueAt]);

  return restzeit;
}

/**
 * Restzeit bis zu einer Frist, als Satz zum Datum daneben. Das Datum selbst
 * steht serverseitig daneben, es fehlt also nie etwas.
 */
export function Countdown({
  dueAt,
  days,
  hours,
  soon,
  separator,
}: {
  dueAt: string;
  /** „noch {n} Tage" */
  days: string;
  /** „noch {n} Stunden" */
  hours: string;
  /** Trenner „ · " voranstellen (Inline-Verwendung hinter einem Datum). */
  separator?: boolean;
  /** unter einer Stunde */
  soon: string;
}) {
  const restzeit = useRestzeit(dueAt);
  if (!restzeit) return null;
  const text =
    restzeit.art === "gleich"
      ? soon
      : (restzeit.art === "stunden" ? hours : days).replace("{n}", String(restzeit.n));
  // `separator` ist der Trenner, wenn die Restzeit **hinter** einem Datum in
  // derselben Zeile steht. Steht sie für sich (F9.2, grosse Frist), fällt er
  // weg — ein führendes „·" ohne etwas davor sieht nach einem Fehler aus.
  return separator ? <> · {text}</> : <>{text}</>;
}
