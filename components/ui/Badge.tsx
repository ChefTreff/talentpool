import type { ReactNode } from "react";
import { cn } from "./cn";

export type BadgeTone = "neutral" | "accent" | "success" | "warning" | "error";

/**
 * Status-Chip: Soft-Fläche + abgedunkelter Text + Wortlaut.
 * Zustand nie über Farbe allein — der Text trägt die Information (§5).
 */
const tones: Record<BadgeTone, string> = {
  neutral: "bg-surface-hover text-muted border-border",
  accent: "bg-accent-soft text-accent-deep border-accent-soft",
  success: "bg-success-soft text-success-ink border-success-soft",
  warning: "bg-warning-soft text-warning-ink border-warning-soft",
  error: "bg-error-soft text-error-ink border-error-soft",
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
        "inline-flex items-center gap-1 rounded-ct-sm border px-2 py-0.5 text-[13px] font-semibold leading-5",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
