"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";

export type Schritt = { title: string; body: string; important?: boolean };

/**
 * Die Schritte in der Event-App — nach Archetyp A (Liste), aber ohne Haken.
 *
 * Wir können nicht sehen, was jemand in Swapcard getan hat. Ein Kästchen, das
 * niemand prüft, behauptet mehr, als wir wissen; die Nummer sagt dasselbe,
 * ohne zu lügen. Details klappen auf, genau eine Zeile gleichzeitig — dieselbe
 * Regel wie in der Checkliste.
 */
export function Schritte({
  title,
  lead,
  steps,
}: {
  title: string;
  lead: string;
  steps: Schritt[];
}) {
  const [offen, setOffen] = useState<number | null>(0);

  return (
    <section aria-labelledby="schritte">
      <div className="mb-2 flex flex-wrap items-baseline gap-2 border-b pb-2">
        <h2 id="schritte" className="ct-h3 text-ink">
          {title}
        </h2>
        <span className="ct-help ml-auto">{lead}</span>
      </div>

      <Card className="p-0">
        <ul className="flex flex-col">
          {steps.map((s, i) => {
            const auf = offen === i;
            return (
              <li key={s.title} className="border-b last:border-b-0">
                <div
                  className={
                    "flex items-center gap-3 border-l-2 py-2.5 pr-4 pl-4 transition-colors hover:bg-surface-hover " +
                    (s.important ? "border-l-accent bg-accent-soft/40" : "border-l-transparent")
                  }
                >
                  <span
                    aria-hidden
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-border-strong ct-help tabular-nums"
                  >
                    {i + 1}
                  </span>
                  <button
                    type="button"
                    aria-expanded={auf}
                    aria-controls={`s-${i}`}
                    onClick={() => setOffen(auf ? null : i)}
                    className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <span className="ct-label text-ink">{s.title}</span>
                    <svg
                      viewBox="0 0 12 12"
                      className={`ml-1 h-3 w-3 shrink-0 text-muted transition-transform ${auf ? "rotate-90" : ""}`}
                      aria-hidden
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                    >
                      <path d="M4.5 3 7.5 6 4.5 9" />
                    </svg>
                  </button>
                </div>
                {auf && (
                  <div id={`s-${i}`} className="border-t bg-canvas px-4 py-4 sm:pl-12">
                    <p className="ct-small leading-6">{s.body}</p>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </Card>
    </section>
  );
}
