import { cn } from "./cn";

/**
 * Wie weit etwas ist — als Balken oder als Ring, **immer mit der Zahl**
 * (QS-038; Verbotsliste: „Fortschrittsbalken ohne Zahl").
 *
 * Der Ring ist das wiederkehrende Element der Dashboards, die Konrad als
 * Vorlage genannt hat (dribbble.com/search/dashboard): ein Kreis, der sich
 * füllt, die Zahl in der Mitte. Er passt dorthin, wo **eine** Zahl den Stand
 * sagt — „4 von 7" auf einer Übersicht. Der Balken passt in Zeilen und Karten,
 * wo daneben Text steht.
 *
 * Für Vorlesesoftware ist beides eine `progressbar` mit Wert, Höchstwert und
 * dem Satz aus `label` („3 von 8 Aufgaben erledigt") — der Kreis allein sagte
 * ihr nichts.
 *
 * `ton`: `hell` auf Karte und Grund (Spur `border`, Füllung `accent`, 4,88:1
 * auf Weiss), `navy` auf der Leiste oder im Band (Spur `on-navy` blass,
 * Füllung `accent-soft`, 14,37:1).
 */
export function Fortschritt({
  wert,
  gesamt,
  label,
  form = "balken",
  ton = "hell",
  className,
}: {
  wert: number;
  gesamt: number;
  /** Der ganze Satz, z. B. „3 von 8 Aufgaben erledigt". Steht beim Balken sichtbar daneben. */
  label: string;
  form?: "balken" | "ring";
  ton?: "hell" | "navy";
  className?: string;
}) {
  const anteil = gesamt > 0 ? Math.min(1, Math.max(0, wert / gesamt)) : 0;
  const aria = {
    role: "progressbar" as const,
    "aria-valuemin": 0,
    "aria-valuemax": gesamt,
    "aria-valuenow": wert,
    "aria-valuetext": label,
  };
  const spur = ton === "navy" ? "text-on-navy/20" : "text-border";
  const fuellung = ton === "navy" ? "text-accent-soft" : "text-accent";

  if (form === "ring") {
    // Umfang eines Kreises mit r = 15.9155 ist 100 — die Füllung ist dann
    // einfach der Anteil in Prozent, ohne Rechnen mit π im Markup.
    return (
      <div {...aria} aria-label={label} className={cn("relative size-16 shrink-0", className)}>
        <svg viewBox="0 0 36 36" className="size-full -rotate-90" aria-hidden focusable="false">
          <circle cx="18" cy="18" r="15.9155" fill="none" strokeWidth="3.5" stroke="currentColor" className={spur} />
          <circle
            cx="18"
            cy="18"
            r="15.9155"
            fill="none"
            strokeWidth="3.5"
            strokeLinecap="round"
            stroke="currentColor"
            strokeDasharray={`${anteil * 100} 100`}
            className={fuellung}
          />
        </svg>
        <span
          aria-hidden
          className={cn(
            "absolute inset-0 flex items-center justify-center ct-label tabular-nums",
            ton === "navy" ? "text-on-navy" : "text-ink",
          )}
        >
          {wert}/{gesamt}
        </span>
      </div>
    );
  }

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div
        {...aria}
        aria-label={label}
        className={cn(
          "h-2 min-w-0 flex-1 overflow-hidden rounded-ct-sm",
          ton === "navy" ? "bg-on-navy/20" : "bg-surface-hover",
        )}
      >
        <div
          className={cn("h-full", ton === "navy" ? "bg-accent-soft" : "bg-accent")}
          style={{ width: `${Math.round(anteil * 100)}%` }}
        />
      </div>
      <span aria-hidden className={cn("ct-help shrink-0 tabular-nums", ton === "navy" && "text-on-navy-muted")}>
        {label}
      </span>
    </div>
  );
}
