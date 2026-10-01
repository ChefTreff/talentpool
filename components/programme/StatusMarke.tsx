import { cn } from "@/components/ui/cn";
import type { KartenStil } from "@/components/programme/types";

/**
 * Ein Programm-Status mit dem **Musterfeld des Boards** (LEAD-017): dieselbe
 * Fläche und Form wie die Karte im Raster — volle Akzentfläche für Final und
 * Veröffentlicht, Akzentleiste, Schraffur, Strichelung — und daneben das Wort.
 *
 * Vorher sprachen Tabelle, Schubfach und Partner-Tabelle in Badge-Tönen
 * („Final“ grün), das Board in Formen und CI-Farben. Wer zwischen Board und
 * Tabelle wechselte, lernte zweimal. Jetzt steht überall dasselbe Zeichen.
 *
 * - `rahmen` (Vorgabe): als Chip wie in der Legende — für Legenden, Köpfe und
 *   das Schubfach.
 * - `rahmen={false}`: nur Musterfeld und Wort — für Tabellenzellen, wo ein
 *   Rahmen je Zeile zu laut wäre.
 * - `anzahl`: die Zahl je Status, wie in der Board-Legende.
 */
export function StatusMarke({
  stil,
  text,
  anzahl,
  rahmen = true,
  className,
}: {
  stil: KartenStil;
  text: string;
  anzahl?: number;
  rahmen?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 ct-help text-ink",
        rahmen && "min-h-8 rounded-ct-sm border border-border bg-surface py-1 pl-1 pr-2",
        className,
      )}
    >
      <StatusMuster stil={stil} />
      <span className="whitespace-nowrap">{text}</span>
      {anzahl !== undefined && <span className="ct-label tabular-nums text-ink">{anzahl}</span>}
    </span>
  );
}

/** Nur das Musterfeld — vor einem Auswahlfeld, dessen Wort schon im Feld steht. */
export function StatusMuster({ stil }: { stil: KartenStil }) {
  return <span aria-hidden className={cn("inline-block h-5 w-6 shrink-0 rounded-ct-sm", stil.flaeche)} />;
}
