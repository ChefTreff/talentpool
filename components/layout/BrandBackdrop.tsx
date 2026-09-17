/**
 * Die Events-Formensprache als Hintergrund: Dreieck, spitzer Winkel, dünne
 * Linienzüge (Brandbook Final, Division Events).
 *
 * Nur dort, **wo nicht gearbeitet wird** — Login und Welcome. In Arbeitsflächen
 * hat sie nichts zu suchen, und sie liegt hinter nichts Lesbarem: die
 * Komposition sitzt am Rand, die Formen bleiben Umriss statt Fläche, und unter
 * 768 px verschwindet sie ganz. Farbe nur aus der Akzent-Ramp; kein Verlauf,
 * keine Fläche über dem Inhalt.
 */
export function BrandBackdrop() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-10 hidden overflow-hidden md:block"
    >
      <svg
        className="absolute -right-24 top-1/2 h-[340px] w-[340px] -translate-y-1/2 text-accent-soft"
        viewBox="0 0 200 200"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        focusable="false"
      >
        <path d="M100 12 188 164H12z" />
        <path d="M100 52 158 152H42z" />
        <path d="M100 92 128 140H72z" />
      </svg>
      {/* Zickzack als Linienzug, unten links — der zweite erlaubte Baustein. */}
      <svg
        className="absolute -left-10 bottom-10 h-20 w-[260px] text-accent-soft"
        viewBox="0 0 320 96"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        focusable="false"
      >
        <path d="M0 72 40 24l40 48 40-48 40 48 40-48 40 48 40-48" />
      </svg>
    </div>
  );
}
