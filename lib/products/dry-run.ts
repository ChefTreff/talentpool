/**
 * Schreibt dieser Aufruf, oder liest er nur?
 *
 * Eigene Datei ohne `server-only` und ohne Client-Importe, damit `npm test` sie
 * prüfen kann (wie `lib/event-app/mapping.ts`). Die ganze Zusage „es wird nichts
 * ungefragt in ein Fremdsystem geschrieben" hängt an dieser einen Zeile:
 * **nur** ein ausdrückliches `dryRun: false` schreibt. Ein fehlendes Feld, ein
 * Tippfehler im Namen, `"false"` als Text, `null`, `0` — alles bleibt
 * Trockenlauf. (Konrad, 21.09.2026: vor jedem Anlegen wird gefragt.)
 */
export function istTrockenlauf(body: unknown): boolean {
  return (body as { dryRun?: unknown } | null)?.dryRun !== false;
}
