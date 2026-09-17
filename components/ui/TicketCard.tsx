import type { ReactNode } from "react";
import { cn } from "./cn";

/**
 * Ein Kontingent oder Ticket: Pass-Typ, Menge, Code, was drin ist.
 *
 * Website-Vorbild: Ticket Section (`54:4052`). Übernommen ist die **Form**
 * eines Tickets — die runden Aussparungen an den Seiten und die gestrichelte
 * Linie zwischen Kopf und Liste. Das ist der Grund, warum man die Karte auf
 * einer vollen Seite sofort als Ticket erkennt, ohne dass „Ticket"
 * danebenstehen muss.
 *
 * **Nicht** übernommen sind die vier Verlaufsflächen der Vorlage: das sind
 * die Farben der vier Divisionen (Events, Education, Media, Club), und die
 * kommen in den Portalen nicht vor, auch nicht als kleiner Akzent
 * (`referenzen/marke.md`). Der Kopf trägt stattdessen die Akzentfläche.
 */
export function TicketCard({
  passType,
  title,
  count,
  countLabel,
  status,
  includes,
  footer,
  className,
}: {
  /** Kleine Zeile im Kopf, Versalien: „Partner Pass", „Speaker Pass". */
  passType: string;
  /** Die Sache selbst — meist der Name des Kontingents. */
  title: string;
  /** Die Zahl, gross: „12 / 20". */
  count?: string;
  countLabel?: string;
  /** `<Badge>` im Kopf rechts. */
  status?: ReactNode;
  /** Was enthalten ist, als Liste mit Hexagon-Marker. */
  includes?: string[];
  /** Code, Link, Knopf. */
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("relative overflow-hidden rounded-ct-lg border bg-surface", className)}>
      {/* Kopf auf Akzentfläche mit **weissem** Text (4,88:1). Navy erreicht
          dort nur 3,56:1 und trägt keinen Fliesstext, auch wenn das
          Brandbook ihn so zeigt — Kontrast schlägt Token. */}
      <div className="flex items-start justify-between gap-4 bg-accent px-6 py-4 text-white">
        <div>
          <p className="ct-eyebrow text-white">{passType}</p>
          <p className="ct-h3 mt-0.5 text-white">{title}</p>
        </div>
        {status}
      </div>

      {/* Die Perforation: zwei Aussparungen in Seitengrundfarbe auf der
          Trennhöhe, dazwischen die gestrichelte Linie. */}
      <div className="relative">
        <span
          aria-hidden
          className="absolute -left-2.5 -top-2.5 h-5 w-5 rounded-full bg-canvas"
        />
        <span
          aria-hidden
          className="absolute -right-2.5 -top-2.5 h-5 w-5 rounded-full bg-canvas"
        />
        <div className="mx-6 border-t border-dashed border-border" />
      </div>

      <div className="px-6 py-5">
        {count && (
          <div className="mb-4">
            <p className="ct-h1 tabular-nums text-ink">{count}</p>
            {countLabel && <p className="ct-eyebrow mt-1 text-muted">{countLabel}</p>}
          </div>
        )}
        {includes && includes.length > 0 && (
          <ul className="flex flex-col gap-1.5">
            {includes.map((i) => (
              <li key={i} className="flex items-start gap-2 ct-small text-ink">
                <span
                  aria-hidden
                  className="mt-1.5 h-3 w-3 shrink-0 bg-accent"
                  style={{ clipPath: "var(--ct-shape-hex)" }}
                />
                {i}
              </li>
            ))}
          </ul>
        )}
        {footer && <div className="mt-5">{footer}</div>}
      </div>
    </div>
  );
}
