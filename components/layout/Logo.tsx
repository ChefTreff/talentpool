import { cn } from "@/components/ui/cn";

/**
 * Die Marke in der Seitenleiste — dauerhaft sichtbar, **monochrom**
 * (Feedback-Runde 2, F8.2).
 *
 * Die Bildmarke kommt aus `public/brand/cheftreff-logo.svg` (Konrad,
 * 14.09.2026). Sie trägt `fill="currentColor"` statt des Marken-Violetts und
 * erbt damit die Textfarbe: auf Navy Off-White, auf Hell Navy. Das ist
 * Absicht — die Marke bleibt in der Arbeitsfläche ruhig (Design-Briefing,
 * „Marke ≠ Portal"), und dieselbe Datei trägt auf beiden Gründen.
 *
 * Als `<svg>` eingebettet und nicht als `<img>`: nur so greift `currentColor`.
 * Ein `<img>` brächte die Datei in ihrer eigenen Farbe mit, und man müsste
 * zwei Fassungen pflegen.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("ct-wordmark inline-flex items-center gap-2", className)}>
      <svg viewBox="0 0 199 114" className="h-5 w-auto shrink-0" aria-hidden fill="currentColor">
        <path d="M44.1275 25.2653L68.6257 11.1229L49.3969 0L0 28.5005V85.5015L49.3969 114.002L68.6257 102.91L44.1275 88.7675V25.2653Z" />
        <path d="M129.64 11.1229L154.138 25.2653V88.7675L151.519 90.2773L129.64 102.91L148.9 114.002L198.266 85.5015V28.5005L148.9 0L129.64 11.1229Z" />
        <path d="M49.7667 28.5005V85.5015L99.1327 114.002L148.499 85.5015V28.5005L99.1327 0L49.7667 28.5005Z" />
      </svg>
      <span className="sr-only">ChefTreff</span>
    </span>
  );
}
