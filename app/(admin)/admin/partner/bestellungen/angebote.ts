import type { AdminQuote } from "../types";

/** Ein Angebot der Übersicht samt dem, was nur die Uhr weiß: ist es schon verfallen? */
export type AdminQuoteRow = AdminQuote & { expired: boolean };

/**
 * Markiert die Angebote, deren Frist vorbei ist (PART-116). Ein verfallenes Angebot hält Positionen und Bestand, bis die Bereinigung
 * (`shop_quotes_housekeeping`) den Warenkorb freigibt — das Team soll es sehen und gleich zurückziehen können. Ohne Frist (die Erstellung läuft noch)
 * ist nichts verfallen. Als Funktion mit übergebener Uhrzeit, damit die Seite keine Uhr im Render lesen muss und der Test eine feste Zeit setzen kann.
 */
export function mitAblauf(quotes: readonly AdminQuote[], jetzt: number = Date.now()): AdminQuoteRow[] {
  return quotes.map((q) => ({ ...q, expired: q.valid_until != null && new Date(q.valid_until).getTime() < jetzt }));
}
