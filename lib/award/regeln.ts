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

/** Stati, in denen die Bewerbung auf der öffentlichen Seite /award steht (siehe `award_public_entries`). */
export const OEFFENTLICH = ["accepted", "finalist", "winner"] as const;

/**
 * Braucht ein Statuswechsel eine Rückfrage? (QS-065 Punkt 1)
 *
 * „Angenommen" macht die Bewerbung öffentlich und abstimmbar; ein Fehlgriff am
 * Handy wirkt sofort. Gefragt wird deshalb bei jedem Wechsel, den die Öffentlichkeit
 * sieht: hinein (`publish`), heraus (`unpublish`) oder zwischen den öffentlichen
 * Stufen (`change`). Zwischen „Neu" und „Abgelehnt" bleibt es bei einem Klick.
 */
export function statusFrage(alt: string, neu: string): "publish" | "unpublish" | "change" | null {
  if (alt === neu) return null;
  const war = (OEFFENTLICH as readonly string[]).includes(alt);
  const wird = (OEFFENTLICH as readonly string[]).includes(neu);
  if (!war && wird) return "publish";
  if (war && !wird) return "unpublish";
  return war && wird ? "change" : null;
}
