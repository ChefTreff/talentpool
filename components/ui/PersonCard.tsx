import type { ReactNode } from "react";
import { cn } from "./cn";

/**
 * Eine Person, wie die Marke sie zeigt: Porträt in einer Dreiecks-Maske mit
 * Akzentverlauf, darunter Rollen-Chip, Name in Versalien, Organisation.
 *
 * Marken-Referenz `3:20146`. Der Aufbau dort ist genauer, als er aussieht:
 * die Maske ist ein Dreieck, das um −16,6° gekippt ist, und **darüber** liegt
 * ein zweites, nur umrissenes Dreieck mit +4,7°. Die Spannung entsteht aus
 * der Differenz der Winkel; eine einzelne gekippte Fläche wirkt flach. Beide
 * Winkel stehen als Token in `globals.css`.
 *
 * Wann diese Karte, wann `ContactCard`? Diese hier ist die **repräsentative**
 * Fassung: Speaker-Listen, Jury, Team — überall, wo die Person das Thema ist.
 * `ContactCard` ist die **dichte** Fassung mit rundem Foto und Mail und
 * Telefon als Links: „wer ist für mich zuständig". Beides nebeneinander auf
 * einer Seite wäre ein Fehler.
 */
export function PersonCard({
  name,
  role,
  organization,
  photoUrl,
  action,
  className,
}: {
  name: string;
  /** Rollenbezeichnung im Chip. Im Portal Sharp Sans, nicht Laica. */
  role?: string | null;
  organization?: string | null;
  photoUrl?: string | null;
  /** Optional unter der Organisation: ein Link ins Detail. */
  action?: ReactNode;
  className?: string;
}) {
  const initiale = name.trim()[0]?.toUpperCase() ?? "?";
  return (
    <div className={cn("flex flex-col items-center text-center", className)}>
      <div className="relative h-[168px] w-[168px]">
        {/* Verlaufsfläche hinter dem Porträt: der Akzent blendet aus
            transparent ein (A2, 110°), gekippt im Masken-Winkel. */}
        <span
          aria-hidden
          className="absolute inset-0"
          style={{
            background: "var(--ct-gradient-shape)",
            clipPath: "var(--ct-shape-triangle)",
            transform: "rotate(var(--ct-tilt-mask))",
          }}
        />
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- Bilder liegen in Supabase Storage, ohne feste Größe.
          <img
            src={photoUrl}
            alt=""
            className="absolute inset-x-2 bottom-0 top-3 object-cover"
            style={{ clipPath: "var(--ct-shape-triangle)" }}
          />
        ) : (
          <span
            aria-hidden
            className="absolute inset-x-2 bottom-0 top-3 flex items-end justify-center bg-accent-soft pb-5 ct-band-title text-accent-deep"
            style={{ clipPath: "var(--ct-shape-triangle)" }}
          >
            {initiale}
          </span>
        )}
        {/* Das Umriss-Dreieck im zweiten Winkel. Als SVG, nicht als
            `clip-path`: ein geclipptes Element trägt keinen Rand, und zwei
            geschachtelte Flächen müssten die Hintergrundfarbe der Seite
            kennen — auf `bg-surface` und `bg-canvas` wäre sie verschieden. */}
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

      {role && (
        <span className="mt-4 inline-flex items-center rounded-ct-sm bg-accent px-2.5 py-1 ct-label text-white">
          {role}
        </span>
      )}
      <p className="ct-h2 mt-2 text-ink">{name}</p>
      {organization && <p className="ct-laica mt-0.5 text-muted">{organization}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
