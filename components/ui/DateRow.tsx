import type { ReactNode } from "react";
import { cn } from "./cn";

/**
 * Eine Zeile mit Datum: Frist, Session, Programmpunkt, Kontingent.
 *
 * Marken-Referenz `319:692` (Social-Post „Next up…") — der einzige Block der
 * Marke, der eine **Liste** ist, und deshalb der nützlichste für uns. Dort
 * steht links eine Datums-Marke in fester Breite, darunter eine kleine
 * Zusatzzeile, rechts Titel und Untertitel, dazu ein Badge und eine dünne
 * Trennlinie.
 *
 * Zwei Abweichungen von der Vorlage, beide bewusst: das Datum steht bei uns
 * im **8-px-Rechteck** statt in der runden Pille (das Portal führt eine
 * Form, Design-Briefing §5), und das Badge ist nicht gedreht — ein schräges
 * Element in einer Liste, die man überfliegt, ist Lärm.
 *
 * Die Datumsspalte hat eine **feste Breite**, damit die Titel untereinander
 * auf einer Kante stehen. Ohne das liest sich eine Liste aus zehn Fristen wie
 * zehn einzelne Zeilen.
 */
export function DateRow({
  date,
  note,
  title,
  subtitle,
  status,
  action,
  overdue,
  className,
}: {
  /** Das Datum, fertig formatiert. Kurzform: „22. Sept." */
  date: string;
  /** Kleine Zeile unter dem Datum: Restzeit, Uhrzeit, „ganztägig". */
  note?: ReactNode;
  title: string;
  subtitle?: string;
  /** Rechts: `<Badge>` mit Wortlaut. */
  status?: ReactNode;
  /** Ganz rechts: ein Link oder kleiner Knopf. */
  action?: ReactNode;
  /** Überfällig: linker Balken und Datum in Fehlerfarbe. */
  overdue?: boolean;
  className?: string;
}) {
  return (
    <li
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-3 last:border-0 sm:flex-nowrap",
        overdue && "border-l-2 border-l-error-ink bg-error-soft/40",
        className,
      )}
    >
      <div className="w-[7.5rem] shrink-0">
        <span
          className={cn(
            "inline-flex w-full items-center justify-center rounded-ct-md border px-2 py-1 ct-label tabular-nums",
            overdue ? "border-error-ink text-error-ink" : "border-accent text-accent-strong",
          )}
        >
          {date}
        </span>
        {note && (
          <span
            className={cn(
              "mt-1 block text-center ct-help",
              overdue && "font-semibold text-error-ink",
            )}
          >
            {note}
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="ct-label text-ink">{title}</p>
        {subtitle && <p className="ct-help mt-0.5">{subtitle}</p>}
      </div>

      {status}
      {action}
    </li>
  );
}

/** Die Liste drumherum — in einer `<Card className="p-0">`. */
export function DateList({ children, className }: { children: ReactNode; className?: string }) {
  return <ul className={cn("flex flex-col", className)}>{children}</ul>;
}
