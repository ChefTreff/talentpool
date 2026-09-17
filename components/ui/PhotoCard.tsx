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
 * entschuldigen. **Nicht** als Kachelwand für Daten: eine Karte je Eintrag
 * sieht bei drei Einträgen grosszügig aus und ist ab dem fünften unlesbar
 * (Archetyp A, `referenzen/muster.md`).
 *
 * Das kursive Wort ist hier die Überschrift der Karte, nicht der eine
 * Laica-Moment des Screens — drei Karten nebeneinander tragen drei Wörter,
 * das ist das Muster. Ausserhalb dieser Dreiergruppe gilt weiter: ein
 * `.ct-laica` pro Screen.
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
    <div className={cn("flex flex-col", className)}>
      <div className="relative h-[180px] overflow-hidden rounded-ct-md bg-navy">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- Bilder liegen in Supabase Storage, ohne feste Größe.
          <img src={imageUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <span
            aria-hidden
            className="absolute -right-6 -top-10 h-[200px] w-[200px]"
            style={{
              background: "var(--ct-gradient-shape)",
              clipPath: "var(--ct-shape-triangle)",
              transform: "rotate(var(--ct-tilt-mask))",
            }}
          />
        )}
      </div>
      <p className="ct-laica mt-4 text-accent-strong">{word}</p>
      {title && <p className="ct-h3 mt-1 text-ink">{title}</p>}
      <p className="ct-small mt-1 text-muted">{description}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
