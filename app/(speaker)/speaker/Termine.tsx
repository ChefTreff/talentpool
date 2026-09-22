import { DateList, DateRow } from "@/components/ui/DateRow";
import { Menu, MenuItem } from "@/components/ui/Menu";

/** Ein Termin, fertig formatiert und mit den drei Wegen in den Kalender. */
export type Termin = {
  key: string;
  /** Datum, fertig formatiert — die Liste rechnet nicht mehr. */
  datum: string;
  /** Uhrzeit oder Spanne, wenn der Termin eine hat. */
  zeit?: string;
  titel: string;
  ort?: string;
  google: string;
  outlook: string;
  /** Unsere eigene `.ics` — das ist der Apple-Weg (SPK-014). */
  ics: string;
};

/**
 * „Termine" auf der Startseite (SPK-026).
 *
 * Konrad: alle wichtigen Daten an einer Stelle, jeder Termin einzeln in den
 * Kalender, mit Google, Microsoft und Apple zur Auswahl.
 *
 * **Drei Wege, aber nur ein Knopf je Zeile.** Neun Schaltflächen auf einer
 * Übersicht wären lauter als alles andere darauf; das Menü zeigt die Auswahl
 * erst, wenn jemand sie sucht.
 *
 * **Apple bekommt keine eigene Adresse.** Google und Microsoft öffnen einen
 * vorausgefüllten Termin per Link, Apple kennt das nicht — dort importiert man
 * eine Datei. Das ist genau die `.ics`, die es seit SPK-014 gibt.
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
          action={
            <Menu
              label={t.add}
              width="w-64"
              align="end"
              trigger={<span className="ct-link">{t.add}</span>}
            >
              <MenuItem href={termin.google}>{t.google}</MenuItem>
              <MenuItem href={termin.outlook}>{t.outlook}</MenuItem>
              <MenuItem href={termin.ics}>{t.apple}</MenuItem>
            </Menu>
          }
        />
      ))}
    </DateList>
  );
}
