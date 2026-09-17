import { cn } from "./cn";

/**
 * Das Porträt einer Person in der Events-Form: ein gekipptes Dreieck mit
 * Akzentverlauf, darüber ein zweites, nur umrissenes Dreieck im Gegenwinkel.
 *
 * Marken-Referenz `3:20146`. Die Spannung entsteht aus der Differenz der
 * Winkel — eine einzelne gekippte Fläche wirkt flach. Beide Winkel stehen als
 * Token in `globals.css`.
 *
 * **Eine Form für alle Personen** (Konrad, 17.09.2026): Speaker, Jury, Team,
 * Ansprechpartner, Buddys. Vorher trug die repräsentative Karte das Dreieck
 * und die dichte Kontaktkarte ein rundes Foto — zwei Formen für dieselbe
 * Sache, und auf einer Seite mit beidem sah es nach Zufall aus. Die Dichte
 * unterscheidet die Fälle, nicht die Form.
 *
 * Deshalb liegt die Form hier und nicht in einer der beiden Karten: sie wird
 * an zwei Stellen gebraucht, und eine kopierte Maske wäre beim ersten
 * Nachschärfen wieder auseinandergelaufen.
 */
export function PortraitShape({
  name,
  photoUrl,
  size = "lg",
  className,
}: {
  /** Für die Initiale, wenn kein Foto da ist. Nie als Text ausgegeben. */
  name: string;
  photoUrl?: string | null;
  /** `lg` = repräsentativ (168 px), `sm` = dicht, in einer Zeile (56 px). */
  size?: "lg" | "sm";
  className?: string;
}) {
  const initiale = name.trim()[0]?.toUpperCase() ?? "?";
  const gross = size === "lg";
  return (
    <div
      className={cn(
        "relative shrink-0",
        gross ? "h-[168px] w-[168px]" : "h-14 w-14",
        className,
      )}
    >
      {/* Verlaufsfläche hinter dem Porträt, gekippt im Masken-Winkel. Auf
          hellem Grund die helle Fassung des Verlaufs (Soft → voll): der
          Navy-Verlauf aus A2 blendet aus transparent ein und verschwände
          hier fast ganz. */}
      <span
        aria-hidden
        className="absolute inset-0"
        style={{
          background: "var(--ct-gradient-shape-light)",
          clipPath: "var(--ct-shape-triangle)",
          transform: "rotate(var(--ct-tilt-mask))",
        }}
      />
      {photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- Bilder liegen in Supabase Storage, ohne feste Größe.
        <img
          src={photoUrl}
          alt=""
          className={cn(
            "absolute object-cover",
            gross ? "inset-x-2 bottom-0 top-3" : "inset-x-1 bottom-0 top-1",
          )}
          style={{ clipPath: "var(--ct-shape-triangle)" }}
        />
      ) : (
        <span
          aria-hidden
          className={cn(
            "absolute flex items-end justify-center bg-accent text-white",
            gross
              ? "inset-x-2 bottom-0 top-3 pb-5 ct-band-title"
              : "inset-x-1 bottom-0 top-1 pb-1 ct-label",
          )}
          style={{ clipPath: "var(--ct-shape-triangle)" }}
        >
          {initiale}
        </span>
      )}
      {/* Das Umriss-Dreieck im zweiten Winkel. Als SVG, nicht als `clip-path`:
          ein geclipptes Element trägt keinen Rand, und zwei geschachtelte
          Flächen müssten die Hintergrundfarbe der Seite kennen — auf
          `bg-surface` und `bg-canvas` wäre sie verschieden. */}
      <svg
        aria-hidden
        focusable="false"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full text-accent"
        style={{ transform: "rotate(var(--ct-tilt-outline))" }}
      >
        <polygon
          points="50,1 99,99 1,99"
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
