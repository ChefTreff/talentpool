import type { ReactNode } from "react";
import { cn } from "./cn";

export type BadgeTone =
  | "neutral"
  | "accent"
  | "success"
  | "warning"
  | "error"
  | "highlight";

/**
 * Status-Chip: Soft-Fläche + abgedunkelter Text + Wortlaut.
 * Zustand nie über Farbe allein — der Text trägt die Information (§5).
 *
 * `highlight` ist der Sonderfall: Highlight-Pink mit Navy-Text (8,0:1), für
 * knappe Kontingente und Restplätze — „Noch 2 Plätze frei" (Konrad,
 * 17.09.2026, Vorbild Social-Post `319:692`). Er gilt **nur auf dunklem
 * Grund**: Hero-Band, Welcome, Login. Auf hellem Grund erreicht Pink 2,2:1
 * und ist dort verboten; dafür gibt es `warning`. Der Ton ist eine
 * Dringlichkeit, kein Status — er sagt „beeil dich", nicht „so steht es".
 */
const tones: Record<BadgeTone, string> = {
  neutral: "bg-surface-hover text-muted border-border",
  accent: "bg-accent-soft text-accent-deep border-accent-soft",
  success: "bg-success-soft text-success-ink border-success-soft",
  warning: "bg-warning-soft text-warning-ink border-warning-soft",
  error: "bg-error-soft text-error-ink border-error-soft",
  highlight: "bg-highlight text-navy border-highlight",
};

export function Badge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-ct-sm border px-2 py-0.5 ct-label ct-help leading-5",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
