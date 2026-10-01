"use client";

import { useCallback, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { ausAdresse, neueSuche, type FilterNamen, type FilterWerte } from "@/components/ui/url-filter";

/**
 * Filter, Suche und Sortierung einer Liste in der Adresszeile (QS-050, Web
 * Interface Guidelines „URL reflects state“; Team-Portal-Muster „Filter im
 * URL-Zustand“). Nach dem Neuladen, über ein Lesezeichen oder einen geteilten
 * Link steht die Liste wieder so da — „Speaker mit Prio A“ ist ein Link.
 *
 *   const [f, setF] = useUrlFilter({ status: "", query: "" }, { query: "q" });
 *   <SuchFeld value={f.query} onChange={(e) => setF({ query: e.target.value })} />
 *
 * Geschrieben wird mit `window.history.replaceState`: Next.js hält
 * `useSearchParams` damit im Gleichklang, **ohne** Server-Rundlauf (Doku
 * „Linking and Navigating → Native History API“) — ein `router.replace` je
 * Tastendruck würde die Seite jedes Mal neu rendern. `replace` statt `push`:
 * der Zurück-Knopf führt zur vorigen Seite, nicht durch jede Filterstufe.
 *
 * Der Zustand liegt zusätzlich lokal, damit das Suchfeld beim Tippen sofort
 * folgt. Die Seiten sind dynamisch gerendert; `useSearchParams` braucht
 * deshalb keine eigene Suspense-Grenze (statische Seiten schlagen im Build fehl).
 */
export function useUrlFilter<T extends FilterWerte>(
  vorgaben: T,
  namen: FilterNamen<T> = {},
): [T, (aenderung: Partial<T>) => void] {
  const params = useSearchParams();
  const pfad = usePathname();
  // Vorgaben und Namen sind Konstanten der Seite — der erste Stand gilt.
  const fest = useRef({ vorgaben, namen });
  const [werte, setWerte] = useState<T>(() => ausAdresse(params, vorgaben, namen));

  const setze = useCallback(
    (aenderung: Partial<T>) => {
      setWerte((alt) => ({ ...alt, ...aenderung }));
      const { vorgaben: v, namen: n } = fest.current;
      const suche = neueSuche(window.location.search, aenderung, v, n);
      window.history.replaceState(null, "", `${pfad}${suche ? `?${suche}` : ""}${window.location.hash}`);
    },
    [pfad],
  );

  return [werte, setze];
}
