/**
 * Wartezeiten für Wiederholungen gegen die vivenu-API.
 *
 * Eigene Datei ohne `server-only` und ohne Klassen: `lib/vivenu/client.ts`
 * nutzt Parameter-Eigenschaften, die der Test-Runner von Node nicht lesen
 * kann — die Regel soll aber im Test stehen.
 */

/** Ab wann wiederholt wird. 4xx ausser 429 erledigt sich nicht von selbst. */
export const RETRY_ON = new Set([429, 502, 503, 504]);
export const MAX_ATTEMPTS = 4;
const BASE_DELAY_MS = 500;
const MAX_DELAY_MS = 30_000;

/**
 * Wartezeit vor dem nächsten Versuch: `retry-after` schlägt die eigene
 * Rechnung, sonst verdoppelt sich der Abstand. vivenu nennt 1.000 Requests je
 * Stunde als Anhaltspunkt und empfiehlt einen Retry (Antwort 11.09.).
 */
export function retryDelayMs(attempt: number, retryAfter: string | null): number {
  const header = Number(retryAfter);
  if (Number.isFinite(header) && header > 0) return Math.min(header * 1000, MAX_DELAY_MS);
  return Math.min(BASE_DELAY_MS * 2 ** attempt, MAX_DELAY_MS);
}
