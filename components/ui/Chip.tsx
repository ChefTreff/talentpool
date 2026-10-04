import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "./cn";

/**
 * Auswahlknopf mit Zustand: ein Filter, eine Tag- oder Bereichswahl innerhalb einer Seite
 * (QS-064, Speaker-Chat 02.10.). Der Baustein stand als Klassenfolge in sieben Dateien — Programmansicht
 * und Fotos im Talent-Portal, Fotos im Admin, Messeshop, Hackathon-Challenges, Stage-Lead-Pipeline —
 * und überall bei 32 px, auch am Handy. Jetzt eine Stelle: 32 px am Desktop, **44 am Handy**
 * (`pointer-coarse:min-h-11`, Skill-Regel 7, wie `Button` und `Input` seit QS-057).
 *
 * **Zustand in Form und Farbe** (Regel 4): der gewählte Chip trägt die Akzent-Soft-Fläche und den dunklen
 * Akzentton, die übrigen nur Grau und beim Darüberfahren die Hover-Fläche; für Vorlesegeräte
 * `aria-pressed` am Knopf, `aria-current="page"` am Link. Der Text ist die Information, nicht die Farbe.
 *
 * - `Chip` ist ein `<button>` — der Zustand liegt im Client (`useState`), ein Klick setzt ihn.
 * - `ChipLink` ist ein Link — der Zustand liegt in der Adresse (`?event=…`, `?track=…`), die Seite
 *   rendert auf dem Server. Wie bei `Button` und `ButtonLink`.
 *
 * Eine **Statusanzeige** ist kein Chip, sondern ein `Badge` (nicht klickbar). Die **Reiter** innerhalb eines
 * Admin-Bereichs (`SectionTabs`) bauen auf `ChipLink` auf. Gruppen von Chips stehen in einem
 * `<div role="group" aria-label>` bzw. einem `<nav aria-label>` mit `flex flex-wrap gap-1`.
 */
const grundform = "inline-flex items-center rounded-ct-sm px-2.5 py-1.5 ct-label transition-colors pointer-coarse:min-h-11";
const zustand = (aktiv: boolean) =>
  aktiv ? "bg-accent-soft text-accent-deep" : "text-muted hover:bg-surface-hover hover:text-ink";

type Eigen = {
  /** Ist dieser Chip gerade gewählt? */
  aktiv: boolean;
  className?: string;
  children: ReactNode;
};

export function Chip({
  aktiv,
  className,
  children,
  ...rest
}: Eigen & Omit<ComponentProps<"button">, keyof Eigen>) {
  return (
    <button type="button" {...rest} aria-pressed={aktiv} className={cn(grundform, zustand(aktiv), className)}>
      {children}
    </button>
  );
}

export function ChipLink({
  aktiv,
  className,
  children,
  ...rest
}: Eigen & Omit<ComponentProps<typeof Link>, keyof Eigen>) {
  return (
    <Link {...rest} aria-current={aktiv ? "page" : undefined} className={cn(grundform, zustand(aktiv), className)}>
      {children}
    </Link>
  );
}
