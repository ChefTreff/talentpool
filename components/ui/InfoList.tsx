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
export function InfoList({
  items,
  schmal = false,
  className,
}: {
  items: InfoEintrag[];
  /**
   * Schmale Begriffsspalte (9 statt 14 rem) für eine Liste in einer halben Spalte oder einem Fenster, in dem
   * sonst für die Auskunft zu wenig bliebe (LEAD-055: die Einordnung eines Speakers für den Stage Lead,
   * nur zum Lesen). Die Breite steht hier und nicht am Aufrufer: `cn` fügt Klassen nur aneinander, eine zweite
   * Spaltenvorlage am Aufrufer entschiede die Reihenfolge im erzeugten CSS.
   */
  schmal?: boolean;
  className?: string;
}) {
  if (items.length === 0) return null;
  return (
    <dl
      className={cn(
        "grid gap-x-6 gap-y-2",
        schmal ? "sm:grid-cols-[minmax(0,9rem)_1fr]" : "sm:grid-cols-[minmax(0,14rem)_1fr]",
        className,
      )}
    >
      {items.map((i) => (
        <div key={i.key} className="contents">
          <dt className="ct-label text-muted">{i.label}</dt>
          <dd className="ct-small text-ink">{i.value}</dd>
        </div>
      ))}
    </dl>
  );
}
