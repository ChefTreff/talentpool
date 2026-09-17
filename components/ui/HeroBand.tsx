import type { ReactNode } from "react";
import { cn } from "./cn";

/**
 * Das Navy-Band über der Startseite eines Bereichs.
 *
 * Website-Vorbild: Hero Section (`54:6454`) — Eyebrow, Versalien-Titel mit
 * einem hervorgehobenen Wort, ein Satz, **eine** Aktion, rechts eine Bildfläche.
 * Auf der Website füllt das einen Bildschirm; hier ist es ein Band, und
 * darunter beginnt sofort die helle Arbeitsfläche. Wer die Seite öffnet, soll
 * wissen, wo er ist und was als Nächstes dran ist — nicht scrollen müssen.
 *
 * Die dunkle Fläche ist hier erlaubt (Entscheidung 17.09.2026: „Hell mit
 * Marken-Momenten"): Hero-Band, Login und Welcome dürfen Navy tragen, alles,
 * wo gearbeitet wird, bleibt hell.
 *
 * Genau **eine** Aktion. Ein zweiter Knopf im Band macht aus der Begrüssung
 * eine Auswahl, und die gehört auf die Arbeitsfläche darunter.
 */
export function HeroBand({
  eyebrow,
  title,
  highlight,
  lead,
  action,
  aside,
  className,
}: {
  /** Kleine Zeile über dem Titel, Versalien — der Bereichsname. */
  eyebrow?: string;
  /** Der Titel ohne das Highlight-Wort. Wird in Versalien gesetzt. */
  title: string;
  /**
   * **Ein** Wort, das hervorgehoben wird (Highlight-Regel, CI-Vorgaben):
   * ExtraBold Italic im Highlight-Pink. Es steht hinter dem Titel — auf der
   * Website ist es typischerweise das letzte Wort oder ein Aktionswort.
   */
  highlight?: string;
  /** Ein Satz. Nicht zwei. */
  lead?: string;
  /** Genau eine Aktion. */
  action?: ReactNode;
  /** Rechte Fläche: Kennzahl, Frist, Bild. Fällt unter 768 px weg. */
  aside?: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "relative isolate mb-8 overflow-hidden rounded-ct-lg px-6 py-8 text-on-navy sm:px-8",
        className,
      )}
      // Der Verlauf steht als Token in `globals.css` (A2, 110°). Eine
      // Tailwind-Klasse gibt es dafür nicht, weil Tailwind v4 nur Farben
      // themed, keine Verläufe — deshalb hier die einzige erlaubte Stelle
      // mit `var(--ct-…)` ausserhalb von `globals.css`.
      style={{ background: "var(--ct-gradient-hero)" }}
    >
      <BandShapes />
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="max-w-[46ch]">
          {eyebrow && <p className="ct-eyebrow text-on-navy-muted">{eyebrow}</p>}
          <h1 className="ct-band-title mt-2 text-on-navy">
            {title}
            {highlight && (
              <>
                {" "}
                {/* Der Akzent trägt auf Navy keinen Text (3,56:1). Das
                    Highlight-Wort steht im Highlight-Pink (8,0:1). */}
                <em className="ct-highlight text-highlight">{highlight}</em>
              </>
            )}
          </h1>
          {lead && <p className="mt-3 text-on-navy-muted">{lead}</p>}
          {action && <div className="mt-6">{action}</div>}
        </div>
        {aside && <div className="hidden md:block">{aside}</div>}
      </div>
    </section>
  );
}

/**
 * Die Events-Formen als Hintergrund des Bands: eine Dreiecksfläche im
 * Akzentverlauf, ein Linienzug. Beide sitzen am rechten Rand und liegen
 * hinter nichts Lesbarem (Brandbook: „nie hinter Text"); unter 768 px
 * verschwinden sie.
 */
function BandShapes() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 hidden md:block">
      <div
        className="absolute -right-10 -top-16 h-[260px] w-[260px] opacity-70"
        style={{
          background: "var(--ct-gradient-shape)",
          clipPath: "var(--ct-shape-triangle)",
          transform: "rotate(var(--ct-tilt-mask))",
        }}
      />
      <svg
        className="absolute right-40 top-6 h-20 w-[180px] text-accent"
        viewBox="0 0 180 80"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        focusable="false"
      >
        <path d="M0 60 30 20l30 40 30-40 30 40 30-40 30 40" />
      </svg>
    </div>
  );
}

/**
 * Eine Kennzahl für die rechte Seite des Bands — dieselbe Rolle wie
 * `StatCard`, aber auf Navy. Zahl gross, Beschriftung darunter.
 */
export function BandStat({
  value,
  label,
  hint,
}: {
  value: ReactNode;
  label: string;
  hint?: string;
}) {
  return (
    <div className="rounded-ct-md border border-on-navy/40 px-5 py-4 text-right">
      <div className="ct-band-title tabular-nums text-on-navy">{value}</div>
      <div className="ct-eyebrow mt-1 text-on-navy-muted">{label}</div>
      {hint && <p className="ct-help mt-1 text-on-navy-muted">{hint}</p>}
    </div>
  );
}
