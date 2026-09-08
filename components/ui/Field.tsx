import type { ReactNode } from "react";
import { cn } from "./cn";

/**
 * Label über Feld (SB 14), Hilfetext darunter (muted 13), Fehler mit Text.
 * Pflicht mit „*" UND Hinweis im Label (Design-Briefing §5).
 */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  requiredLabel = "Pflichtfeld",
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  requiredLabel?: string;
  children: ReactNode;
  className?: string;
}) {
  const hintId = htmlFor && hint ? `${htmlFor}-hint` : undefined;
  const errorId = htmlFor && error ? `${htmlFor}-error` : undefined;
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <label htmlFor={htmlFor} className="ct-label text-ink">
        {label}
        {required && (
          <>
            <span aria-hidden className="ml-0.5 text-error-ink">
              *
            </span>
            <span className="ml-1 text-[12px] font-semibold text-muted">
              ({requiredLabel})
            </span>
          </>
        )}
      </label>
      {children}
      {hint && !error && (
        <p id={hintId} className="ct-help">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-[13px] leading-5 text-error-ink">
          {error}
        </p>
      )}
    </div>
  );
}
