/**
 * Regeln des Award-Formulars, die Browser und Server teilen (ADM-024).
 * Ohne `server-only`: das Formular verkleinert damit vor dem Senden.
 */

/** Der Browser verkleinert vor dem Senden (Vercel nimmt je Anfrage etwa 4,5 MB); was größer ankommt, weist der Server ab. */
export const MAX_BILD_BYTES = 1_500_000;
export const MAX_BILDER = 3;
/** Lange Kante, auf die der Browser verkleinert; der Server rechnet danach mit `verkleinere()` neu. */
export const BROWSER_KANTE = 1600;
/** Verstecktes Feld: Menschen sehen es nicht, Formular-Roboter füllen es aus. */
export const HONIGTOPF = "homepage_url";
/** Wortgrenzen aus dem Airtable-Formular. */
export const MAX_WOERTER = { description: 250, mission: 400, project: 400 } as const;

export function woerter(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}
