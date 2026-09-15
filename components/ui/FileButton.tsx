"use client";

import { useId, type ReactNode } from "react";
import { cn } from "./cn";

/**
 * Datei wählen — als Knopf, nicht als nacktes `<input type="file">`.
 *
 * Das rohe Feld sieht in jedem Browser anders aus, heisst mal „Datei
 * auswählen", mal „Durchsuchen", und man erkennt nicht, dass dort etwas
 * hochgeladen wird (Konrads Befund, F12.4). Hier ist es ein `<label>`, das
 * wie ein Knopf aussieht, mit dem echten Feld unsichtbar darin: Klick,
 * Tastatur und Vorlesesoftware verhalten sich weiter wie beim Original —
 * nur die Optik ist unsere.
 *
 * Kein `display:none` für das Feld, sondern `sr-only`: ausgeblendete
 * Formularfelder sind für manche Hilfsmittel nicht mehr erreichbar.
 */
export function FileButton({
  label,
  accept,
  disabled,
  onFile,
  hint,
  icon,
  className,
}: {
  label: string;
  accept?: string;
  disabled?: boolean;
  onFile: (file: File) => void;
  hint?: string;
  icon?: ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <label
        htmlFor={id}
        className={cn(
          "inline-flex min-h-11 w-fit cursor-pointer items-center gap-2 rounded-ct-md border border-border-strong bg-surface px-4 py-2 ct-label text-ink transition-colors",
          "hover:bg-surface-hover focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent",
          disabled && "pointer-events-none opacity-50",
        )}
      >
        {icon ?? (
          <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M8 11V3m0 0L5 6m3-3 3 3M2.5 11v2a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-2" />
          </svg>
        )}
        {label}
        <input
          id={id}
          type="file"
          accept={accept}
          disabled={disabled}
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) onFile(file);
          }}
        />
      </label>
      {hint && <p className="ct-help">{hint}</p>}
    </div>
  );
}
