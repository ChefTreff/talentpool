import type { ReactNode } from "react";
import { cn } from "./cn";

/**
 * Ein Einstieg mit Bild und einem kursiven Schlüsselwort.
 *
 * Website-Vorbild: Detail Section (`54:2153`) — Foto, darunter **ein** Wort
 * in ExtraBold Italic im Akzent (DIRECTION · GROWTH · ACCESS), darunter drei
 * Zeilen Text.
 *
 * Wofür im Portal: Dinge, die man einmal liest und dann nicht mehr —
 * Onboarding-Einstieg, Wiki-Start, ein Leerzustand, der erklärt statt zu
 * entschuldigen, und die **Einstiege** unter dem Hero-Band jeder Startseite
 * (Talent-Muster, QS-037). **Nicht** als Kachelwand für Daten: eine Karte je
 * Eintrag sieht bei drei Einträgen grosszügig aus und ist ab dem fünften
 * unlesbar (Archetyp A, `referenzen/muster.md`).
 *
 * Das kursive Wort ist hier die Überschrift der Karte, nicht der eine
 * Laica-Moment des Screens — drei Karten nebeneinander tragen drei Wörter,
 * das ist das Muster. Ausserhalb dieser Dreiergruppe gilt weiter: ein
 * `.ct-laica` pro Screen.
 *
 * **Unter 640 px liegt die Karte quer:** die Bildfläche wird ein Quadrat
 * links, der Text steht daneben. Übereinander gestapelt brauchten drei Karten
 * gut tausend Pixel Höhe, bevor die Startseite zu dem kommt, was zu tun ist —
 * auf dem Telefon ist das die halbe Sitzung Scrollen. Die Fläche bleibt
 * trotzdem da, weil sie der Platz für das Foto ist (Entscheidung 8 vom
 * 17.09.: Bilder in Hero-Band, Detail- und Personenkarten).
 */
export function PhotoCard({
  word,
  title,
  description,
  imageUrl,
  action,
  className,
}: {
  /** Das kursive Schlüsselwort im Akzent. Ein Wort, kein Halbsatz. */
  word: string;
  /** Optional darunter eine gewöhnliche Überschrift. */
  title?: string;
  description: string;
  /** Ohne Bild trägt die Karte eine Formfläche — das ist kein Fehlerfall. */
  imageUrl?: string | null;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex gap-4 sm:flex-col sm:gap-0", className)}>
      <div className="relative size-24 shrink-0 overflow-hidden rounded-ct-md bg-accent-soft sm:h-45 sm:w-full">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- Bilder liegen in Supabase Storage, ohne feste Größe.
          <img src={imageUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <span
            aria-hidden
            className="absolute -right-4 -top-6 size-28 sm:-right-6 sm:-top-10 sm:size-50"
            style={{
              background: "var(--ct-gradient-shape-light)",
              clipPath: "var(--ct-shape-triangle)",
              transform: "rotate(var(--ct-tilt-mask))",
            }}
          />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="ct-laica text-accent-strong sm:mt-4">{word}</p>
        {title && <p className="ct-h3 mt-1 text-ink">{title}</p>}
        <p className="ct-small mt-1 text-muted">{description}</p>
        {action && <div className="mt-3">{action}</div>}
      </div>
    </div>
  );
}
