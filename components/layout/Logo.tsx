import { cn } from "@/components/ui/cn";

/**
 * Die Marke in der Seitenleiste — dauerhaft sichtbar, **monochrom**
 * (Feedback-Runde 2, F8.2).
 *
 * Heute steht hier die Wortmarke als Text. Die Logo-SVGs liegen nicht im
 * Repo; `referenzen/marke.md` hält fest: „Endgültige Wahl klärt Konrad,
 * sobald die SVGs im Repo liegen." Diese Komponente ist der Platz dafür —
 * kommt das SVG, wird hier **eine** Zeile getauscht und nichts sonst.
 *
 * Monochrom heisst: eine Farbe, geerbt von `currentColor`. Auf Navy also
 * Off-White, nicht die Akzentfarbe — die Marke soll in der Arbeitsfläche
 * ruhig bleiben (Design-Briefing „Marke ≠ Portal").
 */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("ct-wordmark inline-flex items-center gap-2", className)} aria-hidden>
      {/* Bildmarke: liegendes Sechseck-Paar (Brandbook, Bildmarke). Erbt die
          Textfarbe, damit dieselbe Datei auf Navy und auf Hell trägt. */}
      <svg viewBox="0 0 28 16" className="h-4 w-7 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M4.6 1.6h6.2l3.1 6.4-3.1 6.4H4.6L1.5 8z" />
        <path d="M17.2 1.6h6.2L26.5 8l-3.1 6.4h-6.2L14.1 8z" />
      </svg>
      FLC EVENTS
    </span>
  );
}
