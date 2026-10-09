import type { SperrHinweis } from "@/lib/speaker/shuttle-sperre";

/**
 * Der Hinweis auf einer gesperrten Shuttle-Seite (LEAD-065, K-64): wann die Sperre begann, wer jetzt zuständig ist und wie man ihn erreicht.
 * Dieselbe Karte im Speaker-Portal (`/speaker/travel`) und im Lead-Portal (`/speaker-leads/shuttle`) — die Texte liefert
 * `sperrHinweis()`, der Kontakt kommt aus der Datenbank.
 */
export function SperreHinweis({ hinweis }: { hinweis: SperrHinweis }) {
  return (
    <div role="status" className="rounded-ct-md border border-accent-soft bg-accent-soft p-3 ct-small text-accent-deep">
      <p>{hinweis.lead}</p>
      <p className="ct-label mt-1">{hinweis.kontakt}</p>
      {hinweis.zeilen.length > 0 && <p className="mt-1 tabular-nums">{hinweis.zeilen.join(" · ")}</p>}
    </div>
  );
}
