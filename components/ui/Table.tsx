import type { ReactNode } from "react";
import { cn } from "./cn";

/**
 * Dichte Tabelle: Zebra aus, dünne Linien, sticky Header, Zahlen rechts +
 * tabular, Hover #F0F1F4 (Design-Briefing §5).
 * Breite Tabellen scrollen im eigenen Container, nie die Seite.
 *
 * **Zeilenhöhe 44, mit Bedienelementen 56** (Konrad, 17.09.2026, nach dem
 * Team-Portal-Walkthrough): 44 gilt für reine Datenzeilen. Sobald ein Knopf
 * oder ein Feld in der Zeile steht, braucht sie die Höhe des Bedienelements
 * plus Abstand — ein 32-px-Knopf in einer 44-px-Zeile sitzt mit 6 px Luft
 * oben und unten und klebt. Dafür trägt `<Tr>` das Attribut `controls`.
 */
export function Table({
  children,
  className,
  stapeln = false,
}: {
  children: ReactNode;
  className?: string;
  /**
   * Unter 640 px werden die Zeilen zu Blöcken (QS-058): Jede Zelle trägt ihre
   * Beschriftung (`<Td label="E-Mail">`), die Kopfzeile bleibt nur für
   * Vorlesegeräte, die Aktionen stehen unter dem Namen. **Für Tabellen mit
   * Aktionen in der letzten Spalte:** Auf 375 px lag „Bearbeiten“ bei den
   * Kontakten 730 px rechts, bei der Gästeliste 979 px — außerhalb des Bildes,
   * und eine festgehaltene erste Spalte hätte daran nichts geändert. Die
   * Regeln stehen in `globals.css` (`.ct-stapeln`). Ab 640 px bleibt es die
   * Tabelle.
   */
  stapeln?: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded-ct-lg border bg-surface">
      <table className={cn("w-full border-collapse text-left", stapeln && "ct-stapeln", className)}>
        {children}
      </table>
    </div>
  );
}

export function Thead({ children }: { children: ReactNode }) {
  return (
    <thead className="sticky top-0 z-10 bg-surface">
      <tr className="border-b">{children}</tr>
    </thead>
  );
}

export function Th({
  children,
  numeric,
  /**
   * Sortierrichtung dieser Spalte. Gehört an die Zelle, nicht an den Knopf
   * darin: `aria-sort` ist nur für `columnheader` definiert.
   */
  sort,
  className,
}: {
  children?: ReactNode;
  numeric?: boolean;
  sort?: "ascending" | "descending" | "none";
  className?: string;
}) {
  return (
    <th
      scope="col"
      aria-sort={sort}
      className={cn(
        "ct-eyebrow px-4 py-3 text-muted",
        numeric && "text-right",
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Tbody({ children }: { children: ReactNode }) {
  return <tbody>{children}</tbody>;
}

export function Tr({
  children,
  controls,
  className,
}: {
  children: ReactNode;
  /**
   * Stehen Bedienelemente in dieser Zeile (Knöpfe, Auswahl, Felder)? Dann 56
   * statt 44 — siehe Kopf dieser Datei. Gehört an die Zeile und nicht an die
   * einzelne Zelle: die Höhe ist eine Eigenschaft der Zeile, und zwei Zellen
   * mit verschiedener Höhenangabe ergeben eine Zeile, die niemand vorhersagt.
   */
  controls?: boolean;
  className?: string;
}) {
  return (
    <tr
      data-controls={controls || undefined}
      className={cn(
        "border-b last:border-0 hover:bg-surface-hover",
        controls && "[&>td]:h-14",
        className,
      )}
    >
      {children}
    </tr>
  );
}

export function Td({
  children,
  numeric,
  /** Über mehrere Spalten, z. B. für eine Eingabezeile am Tabellenende. */
  colSpan,
  /**
   * Beschriftung der Zelle, sobald die Tabelle gestapelt ist (`<Table stapeln>`,
   * unter 640 px). Ohne Angabe steht die Zelle ohne Beschriftung da — richtig für
   * den Namen, der die Zeile ausmacht, und für die Aktionen.
   */
  label,
  className,
}: {
  children?: ReactNode;
  numeric?: boolean;
  colSpan?: number;
  label?: string;
  className?: string;
}) {
  return (
    <td
      colSpan={colSpan}
      data-label={label}
      className={cn(
        "h-11 px-4 align-middle text-ink",
        numeric && "text-right tabular-nums",
        className,
      )}
    >
      {children}
    </td>
  );
}
