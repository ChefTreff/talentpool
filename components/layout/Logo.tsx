import { cn } from "@/components/ui/cn";

/**
 * Die Marke in der Seitenleiste — dauerhaft sichtbar, **monochrom**
 * (Feedback-Runde 2, F8.2).
 *
 * Hier steht die Wortmarke als Text, und das ist Absicht: Das ChefTreff-Logo
 * liegt nur als PDF vor. Eine nachgezeichnete Bildmarke sähe amtlich aus und
 * wäre es nicht — schlechter als ehrlicher Text. `referenzen/marke.md` hält
 * denselben Stand fest: „bis das SVG kommt, bleibt die Marke in der Topbar
 * Text."
 *
 * **Wenn das SVG kommt:** hier eintauschen, sonst nichts. Die Datei gehört
 * nach `public/brand/`, trägt `fill="currentColor"` wie die übrigen
 * Markendateien und erbt damit die Textfarbe — auf Navy also Off-White, nicht
 * die Akzentfarbe. Die Marke bleibt in der Arbeitsfläche ruhig
 * (Design-Briefing, „Marke ≠ Portal").
 */
export function Logo({ className }: { className?: string }) {
  return <span className={cn("ct-wordmark", className)}>FLC EVENTS</span>;
}
