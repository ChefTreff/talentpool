/**
 * vivenu-Ticket-Nutzlasten lesen.
 *
 * Die Felder stammen aus der Doku und den Antworten vom 11.09.
 * (`docs/vivenu-support-anfrage.md`). Tolerant lesen, nicht raten: was fehlt,
 * bleibt leer und die Datenbank behält ihren alten Wert (`coalesce` in
 * `ingest_vivenu_ticket`). So macht ein Webhook mit Teilangaben nichts kaputt.
 */

export type VivenuTicket = {
  _id?: string;
  eventId?: string;
  ticketTypeId?: string;
  transactionId?: string;
  customerId?: string;
  barcode?: string;
  secret?: string;
  status?: string;
  personalizationStatus?: string;
  email?: string;
  firstname?: string;
  lastname?: string;
  company?: string;
  realPrice?: number;
  currency?: string;
  createdAt?: string;
  addOns?: unknown;
  meta?: Record<string, unknown>;
  extraFields?: Record<string, unknown>;
  appliedDiscountInfo?: { discountId?: string }[];
  [k: string]: unknown;
};

export type VivenuWebhook = {
  /** Eindeutige Ereignis-Id für die Idempotenz (vivenu-Antwort 11.09.). */
  id?: string;
  _id?: string;
  type?: string;
  event?: string;
  data?: unknown;
  [k: string]: unknown;
};

/** Die Ereignisarten, auf die der Ingest reagiert. Alles andere wird nur protokolliert. */
export const TICKET_EVENTS = ["ticket.created", "ticket.updated", "ticket.deleted"] as const;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Ereignis-Id — vivenu nennt sie `id`, ältere Beispiele `_id`. */
export function webhookId(hook: VivenuWebhook): string | null {
  const raw = hook.id ?? hook._id;
  return typeof raw === "string" && raw.trim() !== "" ? raw.trim() : null;
}

export function webhookType(hook: VivenuWebhook): string {
  const raw = hook.type ?? hook.event;
  return typeof raw === "string" && raw.trim() !== "" ? raw.trim() : "unknown";
}

/**
 * Die Tickets aus einer Webhook-Nutzlast. vivenu schickt je nach Ereignis ein
 * Ticket-Objekt, eine Liste oder eine Transaktion mit `tickets[]`.
 */
export function ticketsOf(payload: unknown): VivenuTicket[] {
  if (Array.isArray(payload)) return payload.filter(isRecord) as VivenuTicket[];
  if (!isRecord(payload)) return [];
  if (Array.isArray(payload.tickets)) return payload.tickets.filter(isRecord) as VivenuTicket[];
  if (isRecord(payload.ticket)) return [payload.ticket as VivenuTicket];
  if (isRecord(payload.data)) return ticketsOf(payload.data);
  // Ein nacktes Ticket erkennt man an der eigenen Id plus Event.
  if (typeof payload._id === "string" && typeof payload.eventId === "string") {
    return [payload as VivenuTicket];
  }
  return [];
}

/**
 * Ein Ticket so formen, wie `ingest_vivenu_ticket` es erwartet: die
 * Transaktions-Id wird mitgegeben, weil sie beim Ticket selbst fehlen kann.
 */
export function toIngestPayload(
  ticket: VivenuTicket,
  context: { transactionId?: string | null } = {},
): Record<string, unknown> {
  const holder =
    typeof ticket.extraFields?.email === "string" ? ticket.extraFields.email : undefined;
  return {
    ...ticket,
    transactionId: ticket.transactionId ?? context.transactionId ?? null,
    holderEmail: holder ?? null,
  };
}

/** Ist das ein Ticket, mit dem der Ingest etwas anfangen kann? */
export function isIngestable(ticket: VivenuTicket): boolean {
  return typeof ticket._id === "string" && ticket._id.trim() !== "" &&
    typeof ticket.eventId === "string" && ticket.eventId.trim() !== "";
}
