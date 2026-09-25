import type { ComponentProps } from "react";
import { cn, feldBreite } from "./cn";

const control =
  "rounded-ct-md border border-border-strong bg-surface px-3 leading-6 text-ink " +
  "placeholder:text-muted focus:border-accent disabled:bg-surface-hover disabled:text-muted";

/**
 * E-Mail-Felder ohne Rechtschreibprüfung und ohne Grossschreibung am Anfang
 * (QS-014, Web Interface Guidelines „Forms“): eine rot unterstrichene Adresse
 * sieht falsch aus, obwohl sie stimmt, und „Anna@…“ tippt das Handy von
 * selbst. `autoComplete` steht auf „off“, weil fast jedes E-Mail-Feld im
 * Portal die Adresse **einer anderen Person** erfragt (Kontakt, Speaker,
 * Begleitung) — der Browser böte sonst die eigene an. Wo es die eigene ist
 * (Anmeldung), setzt die Seite `autoComplete="email"` selbst; was übergeben
 * wird, gewinnt.
 */
const EMAIL_VORGABE = { spellCheck: false, autoCapitalize: "none", autoComplete: "off" } as const;

export function Input({
  className,
  invalid,
  ...rest
}: ComponentProps<"input"> & { invalid?: boolean }) {
  return (
    <input
      {...(rest.type === "email" ? EMAIL_VORGABE : {})}
      {...rest}
      aria-invalid={invalid || undefined}
      className={cn(control, feldBreite(className), "h-10", invalid && "border-error", className)}
    />
  );
}

export function Textarea({
  className,
  invalid,
  ...rest
}: ComponentProps<"textarea"> & { invalid?: boolean }) {
  return (
    <textarea
      {...rest}
      aria-invalid={invalid || undefined}
      className={cn(control, feldBreite(className), "min-h-24 py-2", invalid && "border-error", className)}
    />
  );
}
