import type { TicketAllocationRow } from "@/app/(partner)/partner/types";

/**
 * Die Codes, die ein Partner sieht (PART-111, Konrad 05.10.: „nur ein Code“).
 *
 * Seit PART-111 teilen sich alle Kontingente einer Rabattstufe einen Coupon: jede Zeile trägt denselben
 * Code. Gezeigt wird der Code **einmal**, mit den Kategorien, die er freischaltet; die Kontingente selbst
 * stehen darunter als Übersicht „eingelöst von Menge“. Kontingente mit eigenem Code — die 50-%-Stufe der
 * Initiativen, und für kurze Zeit der Altbestand aus der Zeit je Kategorie, bis der Lauf ihn
 * zusammengeführt hat — bekommen ihren eigenen Eintrag.
 *
 * Nur aktive Kontingente tragen einen Code: die RPC `my_ticket_allocations` hält ihn sonst zurück.
 */
export type TicketCode = { code: string; passTypes: string[] };

export function ticketCodes(allocations: Pick<TicketAllocationRow, "pass_type" | "status" | "coupon_code">[]): TicketCode[] {
  const codes: TicketCode[] = [];
  for (const a of allocations) {
    if (a.status !== "active" || !a.coupon_code) continue;
    const vorhanden = codes.find((c) => c.code === a.coupon_code);
    if (vorhanden) {
      if (!vorhanden.passTypes.includes(a.pass_type)) vorhanden.passTypes.push(a.pass_type);
    } else {
      codes.push({ code: a.coupon_code, passTypes: [a.pass_type] });
    }
  }
  return codes;
}

/** „Partner und Talent“ / „Partner, Talent und Startup“ — in der Sprache der Seite. */
export function aufzaehlung(namen: string[], locale: string): string {
  return new Intl.ListFormat(locale, { style: "long", type: "conjunction" }).format(namen);
}
