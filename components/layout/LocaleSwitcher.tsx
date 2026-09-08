"use client";

import { useTransition } from "react";
import { setLocale } from "@/lib/i18n/actions";
import { LOCALES, type Locale } from "@/lib/i18n/shared";
import { cn } from "@/components/ui/cn";

/**
 * DE/EN-Umschalter im Header. Setzt Cookie + Profil-Präferenz und lädt die
 * Server Components neu — kein harter Reload, deshalb bleibt der Scroll erhalten.
 */
export function LocaleSwitcher({
  current,
  label,
}: {
  current: Locale;
  label: string;
}) {
  const [pending, start] = useTransition();

  return (
    <div className="flex items-center gap-1" role="group" aria-label={label}>
      {LOCALES.map((l) => {
        const active = l === current;
        return (
          <button
            key={l}
            type="button"
            lang={l}
            disabled={pending || active}
            aria-pressed={active}
            onClick={() => start(async () => void (await setLocale(l)))}
            className={cn(
              "rounded-ct-sm px-2 py-1 text-[13px] font-semibold uppercase transition-colors",
              active
                ? "bg-on-navy/15 text-on-navy"
                : "text-on-navy-muted hover:text-on-navy disabled:opacity-50",
            )}
          >
            {l}
          </button>
        );
      })}
    </div>
  );
}
