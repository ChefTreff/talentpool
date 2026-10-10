/**
 * Die Liste „nicht personalisiert“ (TAL-019 Teil 2): Tickets, deren Badge-Angaben noch fehlen, damit das Team nachfassen
 * kann. Reine Funktionen — Spalten und Zählung ohne Datenbank und ohne Route prüfbar (`tests/ticket-personalisierung-admin.test.ts`).
 *
 * Die Quelle ist `tickets_unpersonalized` (Gate: Abschnitt `applications`). **Kein Barcode, kein Secret** — die
 * Funktion liefert sie nicht; die Käufer-Adresse steht drin, weil das Team darüber nachfasst.
 */
export type NichtPersonalisiert = {
  ticket_id: string;
  event_name: string;
  pass_type: string | null;
  personalization_status: string;
  buyer_email: string | null;
  holder_first_name: string | null;
  holder_last_name: string | null;
  holder_company: string | null;
  purchased_at: string | null;
  writeback_open: boolean;
};

export type UebersichtZeile = {
  event_id: string;
  event_name: string;
  pending: number;
  partial: number;
  complete: number;
  writeback_open: number;
};

const STAND: Record<string, string> = { pending: "offen", partial: "teilweise" };

/** `pass` übersetzt den Schlüssel des Tickettyps in seine Bezeichnung (Vokabular `ticket_type`); ohne sie steht der Schlüssel da. */
export type PassLabel = (schluessel: string | null) => string;

export const NICHT_PERSONALISIERT_SPALTEN: { label: string; wert: (z: NichtPersonalisiert, pass?: PassLabel) => string }[] = [
  { label: "Veranstaltung", wert: (z) => z.event_name },
  { label: "Pass", wert: (z, pass) => (pass ? pass(z.pass_type) : (z.pass_type ?? "")) },
  { label: "Stand", wert: (z) => STAND[z.personalization_status] ?? z.personalization_status },
  { label: "Käufer-E-Mail", wert: (z) => z.buyer_email ?? "" },
  { label: "Vorname", wert: (z) => z.holder_first_name ?? "" },
  { label: "Nachname", wert: (z) => z.holder_last_name ?? "" },
  { label: "Firma", wert: (z) => z.holder_company ?? "" },
  { label: "Gekauft", wert: (z) => (z.purchased_at ? z.purchased_at.slice(0, 10) : "") },
  { label: "Rückschreiben offen", wert: (z) => (z.writeback_open ? "ja" : "") },
];

/**
 * Die `mailto:`-Adresse zum Nachfassen (TAL-020, B12): ein Klick auf die Käufer-Adresse öffnet das Mailprogramm. **Nur für eine einfache Adresse** — kein Leerraum,
 * keine zweite Adresse (`,` oder `;`), keine Abfrage (`?cc=…`, `&`) und keine Sonderzeichen, die ein `mailto:` umdeuten: die Adresse kommt von vivenu, und was
 * dort als Käufer-Adresse steht, würde sonst Felder im Mailprogramm der Person vorbelegen, die die Liste öffnet. Sonst `null` — dann bleibt es Text.
 */
export function mailtoLink(adresse: string | null | undefined): string | null {
  const a = (adresse ?? "").trim();
  return /^[^\s@,;?&#<>"'%:/\\]+@[^\s@,;?&#<>"'%:/\\]+\.[^\s@,;?&#<>"'%:/\\]+$/.test(a) ? `mailto:${a}` : null;
}

/** Gesamtzahl über alle Editionen; „offen“ heißt hier: es fehlen noch Angaben (pending + partial). */
export function summiere(zeilen: UebersichtZeile[]) {
  return zeilen.reduce(
    (s, z) => ({
      pending: s.pending + z.pending,
      partial: s.partial + z.partial,
      complete: s.complete + z.complete,
      writebackOpen: s.writebackOpen + z.writeback_open,
    }),
    { pending: 0, partial: 0, complete: 0, writebackOpen: 0 },
  );
}
