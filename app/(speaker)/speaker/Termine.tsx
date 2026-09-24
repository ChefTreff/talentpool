import { AppleMarke, GoogleKalenderMarke, MicrosoftMarke } from "@/components/brand/KalenderMarken";
import { DateList, DateRow } from "@/components/ui/DateRow";
import { neuesFenster } from "@/components/ui/neues-fenster";

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
 * Die Zeichen liegen in `components/brand/KalenderMarken.tsx`, mit ihrer
 * Herkunft; das ist auch die einzige Stelle im Portal mit rohen Farbwerten —
 * eine Marke hat ihre Farbe.
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
            <span className="flex items-center gap-1">
              {/* Der Zweck der Reihe steht für Vorlesesoftware einmal davor;
                  die drei Links tragen danach nur noch ihren Dienstnamen. */}
              <span className="sr-only">{`${t.add}: ${termin.titel}`}</span>
              <KalenderLink href={termin.google} name={t.google} extern>
                <GoogleKalenderMarke />
              </KalenderLink>
              <KalenderLink href={termin.outlook} name={t.outlook} extern>
                <MicrosoftMarke />
              </KalenderLink>
              <KalenderLink href={termin.ics} name={t.apple}>
                <AppleMarke />
              </KalenderLink>
            </span>
          }
        />
      ))}
    </DateList>
  );
}

/**
 * Ein Zeichen als Link — mit Namen für Vorlesesoftware und Mauszeiger.
 *
 * 44 Pixel Fläche, auch wenn das Zeichen nur 16 misst: ein Ziel, das man auf
 * dem Telefon nicht trifft, ist kein Ziel (Design-Regel 7).
 */
function KalenderLink({
  href,
  name,
  extern,
  children,
}: {
  href: string;
  name: string;
  /**
   * Gesetzt, wenn der Link aus dem Portal herausführt. Google und Microsoft
   * führen hinaus, die eigene `.ics` nicht: die lädt herunter, und ein Tab,
   * der sich sofort wieder schliesst, ist kein Gewinn. Neues Fenster, `rel`
   * und die Ansage für Vorlesesoftware kommen aus `neuesFenster` (QS-034) —
   * der Hinweis stand hier vorher im `aria-label` und würde neben dem
   * gemeinsamen Verweis doppelt vorgelesen.
   */
  extern?: boolean;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      title={name}
      {...(extern ? neuesFenster : {})}
      aria-label={name}
      className="flex h-11 w-11 items-center justify-center rounded-ct-sm transition-colors hover:bg-surface-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      {children}
    </a>
  );
}
