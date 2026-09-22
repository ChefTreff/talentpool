"use client";

import { useTransition } from "react";
import { setLocale } from "@/lib/i18n/actions";
import { LOCALES, type Locale } from "@/lib/i18n/shared";
import { cn } from "@/components/ui/cn";

/**
 * DE/EN-Umschalter. Setzt Cookie und Profil-Präferenz und lädt die Server
 * Components neu — kein harter Reload, deshalb bleibt der Scroll erhalten.
 *
 * **Beide Sprachen stehen nebeneinander, die aktive ist markiert** (QS-024).
 * Vorher gab es zwei Mechaniken für dieselbe Sache, und beide verrieten den
 * Zustand nicht: hier zwei Knöpfe, die sich nur durch eine leicht hellere
 * Fläche unterschieden, und im Profilmenü eine Zeile „Sprache: EN" — die
 * zeigte die **andere** Sprache, sodass niemand wusste, ob EN gerade an ist
 * oder ob man damit dorthin wechselt.
 *
 * Die aktive Sprache trägt jetzt Fettung **und** Unterstreichung, nicht nur
 * eine Fläche: Zustand in Form und Farbe (Regel 4). Der senkrechte Strich
 * dazwischen macht aus zwei Knöpfen ein Paar — ohne ihn liest man sie als
 * zwei unabhängige Schalter.
 *
 * `tone` wählt den Grund: `navy` für Topbar und Login, `light` für das
 * Profilmenü auf weißem Grund.
 */
export function LocaleSwitcher({
  current,
  label,
  tone = "navy",
  className,
}: {
  current: Locale;
  /** Zugänglicher Name der Gruppe, z. B. „Sprache". */
  label: string;
  tone?: "navy" | "light";
  className?: string;
}) {
  const [pending, start] = useTransition();
  const aufNavy = tone === "navy";

  return (
    <div
      className={cn("flex items-center", className)}
      role="group"
      aria-label={label}
    >
      {LOCALES.map((l, i) => {
        const active = l === current;
        return (
          <span key={l} className="flex items-center">
            {i > 0 && (
              <span
                aria-hidden
                className={cn(
                  "px-0.5",
                  aufNavy ? "text-on-navy-muted" : "text-muted-soft",
                )}
              >
                |
              </span>
            )}
            <button
              type="button"
              lang={l}
              disabled={pending || active}
              aria-pressed={active}
              onClick={() => start(async () => void (await setLocale(l)))}
              className={cn(
                "rounded-ct-sm px-1.5 py-1 ct-label uppercase transition-colors",
                active && "font-extrabold underline underline-offset-4",
                aufNavy
                  ? active
                    ? "text-on-navy"
                    : "text-on-navy-muted hover:text-on-navy disabled:opacity-50"
                  : active
                    ? "text-accent-deep"
                    : "text-muted hover:text-ink disabled:opacity-50",
              )}
            >
              {l}
            </button>
          </span>
        );
      })}
    </div>
  );
}
