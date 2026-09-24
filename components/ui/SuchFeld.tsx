import type { ComponentProps } from "react";
import { cn } from "./cn";
import { Input } from "./Input";

/**
 * Ein Suchfeld, das man als Suchfeld erkennt (QS-038).
 *
 * Bis zum 24.09. gab es im Portal neun Suchen, und jede war ein gewöhnliches
 * Eingabefeld — gleich aussehend wie „Firmierung" oder „Telefon". Was es zum
 * Suchfeld macht, fehlte: die Lupe vorn und der Typ `search`, der dem Browser
 * sagt, was hier passiert (Tastatur mit „Suchen"-Taste auf dem Telefon, ein
 * Löschen-Zeichen in Chrome und Safari, Vorlesesoftware kündigt es als Suche
 * an). In den Komponenten-Sammlungen, die Konrad genannt hat (21st.dev,
 * „Search Bars"), ist es der häufigste Baustein jenseits der Grundformen.
 *
 * Nur die Hülle: Wert, Filterlogik und Beschriftung bleiben bei der Seite —
 * manche filtern beim Tippen, andere beim Verlassen des Felds. Die
 * Beschriftung steht wie bei jedem Feld über ihm (`Field` oder `<label>`);
 * der Platzhalter nennt, **wonach** gesucht wird (Team-Portal-Muster:
 * „Suchen — Name, Benutzername, Notiz").
 */
export function SuchFeld({ className, ...rest }: Omit<ComponentProps<typeof Input>, "type">) {
  return (
    <div className="relative">
      <svg
        viewBox="0 0 16 16"
        aria-hidden
        focusable="false"
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      >
        <circle cx="7" cy="7" r="4.5" />
        <path d="m10.5 10.5 3 3" />
      </svg>
      <Input type="search" {...rest} className={cn("pl-9", className)} />
    </div>
  );
}
