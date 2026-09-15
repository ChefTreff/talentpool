import { cn } from "./cn";

export type InfoEintrag = { key: string; label: string; value: string };

/**
 * Allgemeine Auskünfte als Beschreibungsliste: Öffnungszeiten, Einlass,
 * Aufbau.
 *
 * Bewusst `<dl>` und keine Tabelle — es sind Paare aus Begriff und Auskunft,
 * keine Datenmatrix. Vorlesende Software sagt dann „Einlass: Freitag 12 Uhr"
 * statt „Zeile zwei, Spalte zwei".
 */
export function InfoList({ items, className }: { items: InfoEintrag[]; className?: string }) {
  if (items.length === 0) return null;
  return (
    <dl className={cn("grid gap-x-6 gap-y-2 sm:grid-cols-[minmax(0,14rem)_1fr]", className)}>
      {items.map((i) => (
        <div key={i.key} className="contents">
          <dt className="ct-label text-muted">{i.label}</dt>
          <dd className="ct-small text-ink">{i.value}</dd>
        </div>
      ))}
    </dl>
  );
}
