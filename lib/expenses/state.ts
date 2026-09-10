/**
 * Wann ein Antrag eine Rechnung haben darf.
 *
 * Die Freigabe geht ihr voraus, `paid` steht dahinter und darf die Ablage
 * wiederholen. Ein eingereichter oder zurückgewiesener Antrag bekommt keine —
 * sonst entstünde ein Beleg über eine Entscheidung, die niemand getroffen hat.
 *
 * Eigene Datei, weil `"use server"`-Module nur asynchrone Funktionen
 * exportieren dürfen; so lässt sich die Regel prüfen.
 */
const INVOICE_STATES = new Set(["approved", "paid"]);

export function canHaveInvoice(status: string | null | undefined): boolean {
  return typeof status === "string" && INVOICE_STATES.has(status);
}
