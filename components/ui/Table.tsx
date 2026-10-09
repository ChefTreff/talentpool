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
 * oben und unten und klebt.
 *
 * **Die Zeile erkennt ihre Bedienelemente selbst** (QS-065, 02.10.2026): Ein
 * Knopf, eine Auswahl, ein Feld oder ein Kontrollkästchen in der Zeile macht
 * sie 56 hoch, ohne dass die Seite daran denken muss — gezählt waren 28 Zeilen
 * mit und nur 10 mit `controls`, die Regel galt also nur dort, wo jemand sie
 * kannte. Die Erkennung ist reines CSS (`:has()`), `controls` bleibt für das,
 * was CSS nicht sieht. Die Ausnahme ist ausdrücklich: `dicht` an der Zeile
 * einer Arbeitstabelle.
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
  /**
   * Name einer Spalte ohne sichtbare Überschrift (die Spalte mit den Aktionen):
   * `<Th aria-label={t.colAction} />`. **Wird an die Zelle weitergegeben** (QS-077) —
   * vorher verwarf `Th` ihn still, und an 18 Stellen blieb der Kopf für
   * Vorlesesoftware leer.
   */
  "aria-label": ariaLabel,
  className,
}: {
  children?: ReactNode;
  numeric?: boolean;
  sort?: "ascending" | "descending" | "none";
  "aria-label"?: string;
  className?: string;
}) {
  return (
    <th
      scope="col"
      aria-sort={sort}
      aria-label={ariaLabel}
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

/**
 * Was die Zeile als Bedienelement erkennt: Knopf, Auswahl, mehrzeiliges Feld und
 * jedes Feld außer dem versteckten (Text, Kontrollkästchen, Optionsfeld, Datei)
 * sowie ein Link in Knopfgestalt (`ButtonLink`, `ButtonDownload` tragen
 * `data-knopf`). Ein Textlink bleibt außen vor — ein Name als Link ist Text,
 * kein Bedienelement.
 *
 * Als eine Zeichenkette und nicht aus Teilen zusammengesetzt: Tailwind liest die
 * Klassen aus dem Quelltext, und eine Klasse, die es nicht als Ganzes findet,
 * erzeugt es stillschweigend nicht. `tests/tabellen-zeilen.test.ts` übersetzt sie.
 */
const ERKENNT_BEDIENELEMENTE = "has-[button,select,textarea,input:not([type=hidden]),a[data-knopf]]:[&>td]:h-14";

export function Tr({
  children,
  controls,
  dicht,
  className,
}: {
  children: ReactNode;
  /**
   * Bedienelemente, die die Zeile nicht selbst erkennt (ein Element, das erst
   * nachgeladen wird, ein Bedienelement aus anderem Stoff): trotzdem 56 statt 44.
   * Wo ein Knopf, eine Auswahl, ein Feld oder ein `ButtonLink` in der Zeile
   * steht, braucht es das nicht — die Zeile sieht es selbst. Gehört an die Zeile und nicht an die einzelne
   * Zelle: die Höhe ist eine Eigenschaft der Zeile, und zwei Zellen mit
   * verschiedener Höhenangabe ergeben eine Zeile, die niemand vorhersagt.
   */
  controls?: boolean;
  /**
   * Ausnahme für Arbeitstabellen, in denen die Zeile **das** Bearbeitungsfeld ist
   * (Programm, Regie: je Zeile sechs bis zwölf Felder, hunderte Zeilen): sie
   * bleibt bei 44, auch mit Feldern darin. 56 hieße dort ein Viertel mehr
   * Scrollen für nichts, denn die Felder füllen die Zeile ohnehin aus. Für jede
   * andere Tabelle falsch: eine Zeile mit einem Knopf daneben ist 56.
   */
  dicht?: boolean;
  className?: string;
}) {
  return (
    <tr
      data-controls={controls || undefined}
      className={cn(
        "border-b last:border-0 hover:bg-surface-hover",
        controls && "[&>td]:h-14",
        !controls && !dicht && ERKENNT_BEDIENELEMENTE,
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
