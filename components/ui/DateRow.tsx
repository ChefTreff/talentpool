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
  onTitleClick,
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
  /**
   * Macht den Titel anklickbar — fuer Listen, in denen eine Zeile ein Detail
   * oeffnet (Programm, Einreichungen). Ohne die Angabe bleibt der Titel Text.
   *
   * Warum nicht einfach einen ReactNode als `title` zulassen: dann setzt jede
   * Seite ihre eigene Schrift und die Liste laeuft auseinander. So bleibt die
   * Typografie hier und die Seite sagt nur, was beim Klick passiert.
   */
  onTitleClick?: () => void;
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

      {/* `basis-48` statt nur `flex-1`: bleiben weniger als 12 rem übrig,
          bricht der Status in die nächste Zeile, statt den Titel auf drei
          Zeilen zu quetschen. Genau das passierte bei 375 px. */}
      <div className="min-w-0 flex-1 basis-48">
        {onTitleClick ? (
          <button
            type="button"
            onClick={onTitleClick}
            className="block max-w-full text-left ct-label text-ink hover:underline"
          >
            {title}
          </button>
        ) : (
          <p className="ct-label text-ink">{title}</p>
        )}
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
