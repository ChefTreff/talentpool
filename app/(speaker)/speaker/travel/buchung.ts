/**
 * Die Buchungen auf `/speaker/travel` (SPK-086) — reine Regeln, ohne Netz und ohne React, damit `npm test` sie ausführt.
 *
 * Konrad am 05.10. beim Durchgang durch das Speaker-Portal: die Reihenfolge „Hotel und Übernachtung“ und „Deine Buchung“ ergebe „so wenig Sinn“ — „würde
 * wahrscheinlich eine Auswahl machen: Shuttlebuchung, Hotelbuchung und dann jeweils darunter alle Buchungen zusammengefasst von Shuttle und Hotel“. Seitdem
 * steht oben die **Auswahl** (zwei Reiter), darunter das **Angebot** der gewählten Art (Fahrt anfordern bzw. Zimmer buchen) und ganz unten **Deine Buchungen**:
 * Fahrten und Hotel in einer Liste, jede mit ihrem Stand.
 */

export const BUCHUNG_ARTEN = ["shuttle", "hotel"] as const;
export type BuchungArt = (typeof BUCHUNG_ARTEN)[number];

/**
 * Was eine der beiden Ansichten zeichnet: das **Angebot** (Formular bzw. Zimmerliste samt Hinweisen und Einwilligung) oder die **Buchungen** (die Karten der
 * eigenen Fahrten bzw. Zimmer samt Stornieren). Die Seite setzt beides zusammen — das Angebot der gewählten Art oben, die Buchungen beider Arten unten.
 */
export type BuchungsTeil = "angebot" | "buchungen";

/**
 * Welche Art die Seite zeigt: `?buchung=hotel` oder `?buchung=shuttle`. Ohne Angabe, bei einem unbekannten Wert und bei einer doppelten Angabe gilt das Shuttle
 * (das haben **alle** Speaker, auch die ohne Zimmer); das Hotel nur, wenn es für diese Person angeboten wird — sonst führte ein alter Link auf eine Ansicht, die es
 * nicht gibt.
 */
export function waehleBuchung(param: string | string[] | undefined, hotelAngeboten: boolean): BuchungArt {
  return typeof param === "string" && param === "hotel" && hotelAngeboten ? "hotel" : "shuttle";
}

/**
 * Wie viele Buchungen gelten: alles außer „storniert“. Daran hängt, ob „Deine Buchungen“ Karten oder den Satz „Noch keine Buchungen“ zeigt — beide Listen
 * zählen, sonst stünde der Satz über einem Hotel, das schon gebucht ist.
 */
export function aktiveBuchungen(
  fahrten: readonly { status: string }[],
  hotel: readonly { status: string }[],
): { fahrten: number; hotel: number; gesamt: number } {
  const zaehle = (liste: readonly { status: string }[]) => liste.filter((b) => b.status !== "cancelled").length;
  const f = zaehle(fahrten);
  const h = zaehle(hotel);
  return { fahrten: f, hotel: h, gesamt: f + h };
}
