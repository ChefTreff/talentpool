"use client";

import { useId, useState, type ReactNode } from "react";
import { Button } from "./Button";
import { cn } from "./cn";

/**
 * Datei wählen und hochladen — in **zwei** Schritten.
 *
 * Vorher war es ein `<label>`, das wie ein Umriss-Knopf aussah, mit dem
 * echten Feld unsichtbar darin; die Auswahl startete den Upload sofort.
 * Konrad im Speaker-Durchgang (QS-025): „sieht nicht klickbar aus, der
 * Upload wirkt versteckt". Beides stimmt, und es hängt zusammen — wenn
 * Auswählen und Hochladen dieselbe Geste sind, muss der Knopf beides
 * versprechen und kann keines davon deutlich sagen.
 *
 * Jetzt: erst ein echter `<Button>` zum Auswählen, dann der Dateiname mit
 * einer eigenen Aktion „Upload" daneben. Wer die falsche Datei erwischt hat,
 * sieht es **vor** dem Hochladen und kann wechseln, statt eine falsche
 * Fassung einzureichen und sie ersetzen zu lassen.
 *
 * Die Aufrufer ändern sich dadurch nicht: `onFile` wird weiterhin mit der
 * Datei gerufen, nur eben erst beim Klick auf „Upload“. Die Komponente hält
 * die Auswahl so lange selbst.
 *
 * Kein `display:none` für das Feld, sondern `sr-only` — ausgeblendete
 * Formularfelder sind für manche Hilfsmittel nicht mehr erreichbar.
 *
 * `variant="secondary"` für Listen mit einem Knopf je Zeile (Partnergrafiken,
 * PART-041): sonst stünden zehn Primärknöpfe untereinander, und die eine
 * Hauptaktion der Seite ginge darin unter.
 */
export function FileButton({
  label,
  uploadLabel = "Upload",
  changeLabel,
  accept,
  disabled,
  onFile,
  hint,
  icon,
  className,
  variant = "primary",
}: {
  /** Beschriftung des Auswahl-Knopfes, z. B. „Datei auswählen". */
  label: string;
  /** Beschriftung der Upload-Aktion. */
  uploadLabel?: string;
  /** „Andere Datei" — ohne Angabe wird `label` wiederverwendet. */
  changeLabel?: string;
  accept?: string;
  disabled?: boolean;
  onFile: (file: File) => void;
  hint?: string;
  icon?: ReactNode;
  className?: string;
  /** Primär (Standard) oder als Umriss-Knopf wie `<Button variant="secondary">`. */
  variant?: "primary" | "secondary";
}) {
  const id = useId();
  const [gewaehlt, setGewaehlt] = useState<File | null>(null);

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {gewaehlt ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="ct-small min-w-0 break-all text-ink">{gewaehlt.name}</span>
          <Button
            size="sm"
            disabled={disabled}
            onClick={() => {
              onFile(gewaehlt);
              // Die Auswahl ist verbraucht: der Aufrufer meldet Erfolg oder
              // Fehler selbst, und eine stehengebliebene Datei liesse offen,
              // ob sie schon oben ist.
              setGewaehlt(null);
            }}
          >
            {uploadLabel}
          </Button>
          <label htmlFor={id} className="ct-link ct-small cursor-pointer">
            {changeLabel ?? label}
          </label>
        </div>
      ) : (
        <label htmlFor={id} className="w-fit">
          {/* Der sichtbare Knopf ist ein `<span>` im Button-Gewand: ein echtes
              `<button>` im `<label>` fängt den Klick ab, statt ihn an das Feld
              weiterzureichen. Tastatur und Vorlesesoftware bedienen weiter das
              Feld selbst, das direkt darunter liegt. */}
          <span
            className={cn(
              "inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-ct-md px-5 ct-label transition-colors",
              variant === "secondary"
                ? "border-2 border-accent bg-transparent text-accent-strong hover:bg-accent/10"
                : "bg-accent-strong text-on-navy hover:bg-accent-deep",
              "focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent",
              disabled && "pointer-events-none opacity-40",
            )}
          >
            {icon ?? (
              <svg
                viewBox="0 0 16 16"
                className="h-4 w-4 shrink-0"
                aria-hidden
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path d="M8 11V3m0 0L5 6m3-3 3 3M2.5 11v2a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-2" />
              </svg>
            )}
            {label}
          </span>
        </label>
      )}

      <input
        id={id}
        type="file"
        accept={accept}
        disabled={disabled}
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) setGewaehlt(file);
        }}
      />

      {hint && <p className="ct-help">{hint}</p>}
    </div>
  );
}
