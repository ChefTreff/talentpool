import type { KalenderTermin } from "@/lib/kalender-links";
import { DateList, DateRow } from "@/components/ui/DateRow";
import { KalenderKnoepfe } from "@/components/ui/KalenderKnoepfe";

/** Ein Termin, fertig formatiert und mit den drei Wegen in den Kalender. */
export type Termin = {
  key: string;
  /** Datum, fertig formatiert — die Liste rechnet nicht mehr. Mehrere Tage als Liste: je Tag eine Zeile. */
  datum: string | string[];
  /** Uhrzeit oder Spanne, wenn der Termin eine hat. */
  zeit?: string;
  titel: string;
  ort?: string;
  /** Was in den Kalender geht — Google und Microsoft baut `KalenderKnoepfe` daraus. */
  kalender: KalenderTermin;
  /** Unsere eigene `.ics` — das ist der Apple-Weg (SPK-014). */
  ics: string;
};

/**
 * „Termine" auf der Startseite (SPK-026).
 *
 * Konrad: alle wichtigen Daten an einer Stelle, jeder Termin einzeln in den
 * Kalender, „am besten jeweils mit einem kleinen Icon, dann erkennt man das
 * sofort".
 *
 * **Die drei Zeichen stehen offen in der Zeile.** Zuerst lagen sie in einem
 * Menü — das war falsch: ein Menü zeigt seine Einträge erst nach dem Klick,
 * und genau das „sofort erkennen" fiel damit weg (Konrad, 23.09.: „wollte dort
 * noch die Kalender-Icons, wo sind die?"). Drei kleine Marken nebeneinander
 * sind schmaler als ein Knopf mit Beschriftung und sagen mehr.
 *
 * **Apple bekommt keine eigene Adresse.** Google und Microsoft öffnen einen
 * vorausgefüllten Termin per Link, Apple kennt das nicht — dort importiert man
 * eine Datei. Das ist genau die `.ics` aus SPK-014.
 *
 * Die Reihe selbst ist seit QS-043 die gemeinsame `KalenderKnoepfe` im Kit:
 * dieselben drei Zeichen am Slot und an der Einladung. Die Zeichen liegen in
 * `components/brand/KalenderMarken.tsx`, mit ihrer Herkunft; das ist auch die
 * einzige Stelle im Portal mit rohen Farbwerten — eine Marke hat ihre Farbe.
 */
export function Termine({
  termine,
  t,
}: {
  termine: Termin[];
  t: {
    empty: string;
    add: string;
    google: string;
    outlook: string;
    apple: string;
  };
}) {
  if (termine.length === 0) return <p className="ct-help">{t.empty}</p>;

  return (
    <DateList>
      {termine.map((termin) => (
        <DateRow
          key={termin.key}
          date={termin.datum}
          note={termin.zeit}
          title={termin.titel}
          subtitle={termin.ort}
          action={<KalenderKnoepfe termin={termin.kalender} ics={termin.ics} t={t} />}
        />
      ))}
    </DateList>
  );
}
