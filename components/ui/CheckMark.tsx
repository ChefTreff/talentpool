import { cn } from "./cn";

/**
 * Der Haken links in einer Listenzeile. Zustand in Form **und** Farbe: ein
 * erledigter Punkt trägt das Häkchen, ein offener einen leeren Ring — wer
 * Farben nicht unterscheidet, sieht den Unterschied trotzdem (Design-Regel 4).
 *
 * Er stand zuerst nur in der Checkliste. Seit die Event-App-Schritte abhakbar
 * sind, gibt es ihn zweimal — deshalb liegt er hier und nicht in der Seite.
 */
export function CheckMark({
  done,
  label,
  className,
}: {
  done: boolean;
  label: string;
  className?: string;
}) {
  return (
    <span
      title={label}
      className={cn(
        done
          ? "flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-success-ink text-surface"
          : "h-5 w-5 shrink-0 rounded-full border-2 border-border-strong",
        className,
      )}
    >
      {done && (
        <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M2.5 6.5 5 9l4.5-5.5" />
        </svg>
      )}
      <span className="sr-only">{label}</span>
    </span>
  );
}
