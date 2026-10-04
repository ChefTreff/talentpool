import { cn } from "./cn";

export type Eckdatum =
  | {
      key: string;
      art: "datum";
      /** Monat als Kürzel, drei bis vier Zeichen („Apr“, „Sept.“). Das Wort steht in `titel`, die Marke ist Wiedererkennung. */
      monat: string;
      /** Der Tag, bei mehreren Tagen der erste. */
      tag: string;
      titel: string;
      zusatz?: string;
    }
  | { key: string; art: "ort"; titel: string; zusatz?: string };

/**
 * Eckdaten einer Veranstaltung: Wann und wo, in je einer Zeile mit Marke (HACK-013, Vorbild: die Event-Seite
 * von Luma). Links eine Marke in fester Größe — das Datum als Monat über dem Tag, der Ort als Stecknadel —,
 * rechts zwei Zeilen: der Satz, auf den es ankommt („Freitag, 16. – Samstag, 17. April 2027“), und ein
 * Zusatz, der klein darunter steht („Kick-off 14:00“, „Halle 2“).
 *
 * Gedacht für die Stelle direkt unter dem Hero-Band einer Event-Seite, **über** der Stand-Karte
 * (`NextStepBanner`): erst „was und wann und wo“, dann „wo stehst du“. Eine Liste dieser Zeilen im Fließtext
 * ist ein Satz; eine Tabelle mit vielen Terminen ist eine `DateRow`-Liste, keine Eckdaten.
 *
 * Die Marke gleicht der Datumsmarke der `DateRow` (8-px-Rechteck, Rand und Schrift im Akzent) und trägt
 * `bg-surface`, damit `text-accent-strong` auch auf dem Seitengrund 4,5:1 hält (5,33:1 auf Weiß; auf dem
 * Grund `bg-canvas` nur 4,85:1). Die Marken sind für Vorlesesoftware verborgen: der Text sagt alles, die
 * Marke ist nur Wiedererkennung.
 */
export function Eckdaten({ items, className }: { items: Eckdatum[]; className?: string }) {
  if (items.length === 0) return null;
  return (
    <ul className={cn("flex flex-col gap-4", className)}>
      {items.map((e) => (
        <li key={e.key} className="flex items-center gap-4">
          <span
            aria-hidden
            className="flex size-12 shrink-0 flex-col items-center justify-center rounded-ct-md border border-accent bg-surface text-accent-strong"
          >
            {e.art === "datum" ? (
              <>
                <span className="ct-eyebrow">{e.monat}</span>
                <span className="ct-label tabular-nums">{e.tag}</span>
              </>
            ) : (
              <Stecknadel />
            )}
          </span>
          <div className="min-w-0">
            <p className="ct-label text-ink">{e.titel}</p>
            {e.zusatz && <p className="ct-help">{e.zusatz}</p>}
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Die Stecknadel der Ortsmarke: eine Linie wie die übrigen Symbole des Kits, `currentColor`. */
function Stecknadel() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
    >
      <path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </svg>
  );
}
