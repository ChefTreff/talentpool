import "server-only";
import { vv, VivenuError } from "@/lib/vivenu/client";

/**
 * Freitickets bei vivenu anlegen — Speaker-Pass und Begleitticket (SPK-068).
 *
 * **Der Endpunkt heisst `POST /api/tickets/free`, nicht `POST /api/tickets`.**
 * Die Antwort von vivenu vom 11.09.2026 nannte ihn „tickets#create-free-tickets";
 * in der OpenAPI-Beschreibung der Sandbox (gelesen am 25.09.2026) trägt
 * `/api/tickets` nur ein `GET`. Das Schema `CreateFreeTicketValidationSchema`
 * kennt zwei Varianten: eine mit `customerId` für bestehende Kundinnen und eine
 * mit `prename`, `lastname` und `email` für neue — wir nehmen die zweite, weil
 * der Name auf dem Ticket stehen soll.
 *
 * **`sendMail: false`**: die Ticket-Mail verschickt das Portal später selbst
 * (`ticket_final`, docs/mail-plan.md). Ohne das Feld schickt vivenu sie sofort.
 *
 * **`batchId` trägt unsere Ticket-Kennung.** Das ist der einzige frei belegbare
 * Rückverweis, den der Endpunkt anbietet — `meta` und `extraFields` gibt es hier
 * nicht. Daran erkennen wir ein bereits angelegtes Ticket wieder (`GET
 * /api/tickets?batch=…`), und daran erkennt der Webhook-Ingest unsere Zeile,
 * bevor die vivenu-Kennung bei uns steht.
 */
export type FreeTicketWunsch = {
  /** Unsere Ticket-Kennung — wird zu `batchId`. */
  ticketId: string;
  vivenuEventId: string;
  vivenuTicketTypeId: string;
  firstName: string;
  lastName: string;
  email: string;
  company?: string | null;
};

/** Was vivenu je Ticket zurückgibt (Auszug aus `TicketResource`). */
export type VivenuFreeTicket = {
  _id?: string;
  barcode?: string;
  secret?: string;
  transactionId?: string;
  batch?: string;
  ticketTypeId?: string;
  status?: string;
  [k: string]: unknown;
};

/** Ein bereits angelegtes Freiticket zu unserer Kennung — oder `null`. */
export async function findFreeTicketByBatch(ticketId: string): Promise<VivenuFreeTicket | null> {
  const antwort = await vv<{ docs?: VivenuFreeTicket[]; rows?: VivenuFreeTicket[] }>(
    `/tickets?batch=${encodeURIComponent(ticketId)}&top=2`,
  );
  // vivenu nennt die Liste je nach Endpunkt `docs` oder `rows`; beides lesen,
  // statt sich auf eines festzulegen und bei der nächsten Änderung leer
  // auszugehen.
  const liste = antwort.docs ?? antwort.rows ?? [];
  return liste[0] ?? null;
}

/**
 * Freiticket anlegen. **Idempotent**: existiert zu unserer Kennung schon eines,
 * wird es zurückgegeben statt ein zweites anzulegen.
 *
 * Der Abbruch zwischen vivenu-Anlage und unserem Schreiben ist der Fall, für den
 * das gebaut ist — ein zweiter Klick darf keine zweite Karte erzeugen.
 */
export async function createFreeTicket(
  wunsch: FreeTicketWunsch,
): Promise<{ ticket: VivenuFreeTicket; bereitsVorhanden: boolean }> {
  const vorhanden = await findFreeTicketByBatch(wunsch.ticketId);
  if (vorhanden?._id) return { ticket: vorhanden, bereitsVorhanden: true };

  const body = {
    eventId: wunsch.vivenuEventId,
    items: [{ type: "ticket", amount: 1, ticketTypeId: wunsch.vivenuTicketTypeId }],
    prename: wunsch.firstName,
    lastname: wunsch.lastName,
    email: wunsch.email,
    ...(wunsch.company ? { company: wunsch.company } : {}),
    sendMail: false,
    batchId: wunsch.ticketId,
    // Der Speaker soll seine Angaben im Portal ergänzen, nicht bei vivenu.
    requiresPersonalization: false,
    addToCustomers: true,
  };

  const antwort = await vv<VivenuFreeTicket[] | VivenuFreeTicket>("/tickets/free", {
    method: "POST",
    body: JSON.stringify(body),
  });
  const ticket = Array.isArray(antwort) ? antwort[0] : antwort;
  if (!ticket?._id) {
    throw new VivenuError(201, "/tickets/free", "Antwort ohne Ticket-Kennung");
  }
  return { ticket, bereitsVorhanden: false };
}

/**
 * Ein Ticket ueber seine vivenu-Kennung lesen (`GET /tickets/{id}`).
 *
 * Der Weg fuer ein Ticket, das **nicht** ueber unseren `batchId` entstanden ist
 * — im vivenu-Dashboard ausgestellt und per Webhook bei uns gelandet. Fuer das
 * findet `findFreeTicketByBatch` nichts; ein Anlegen legte ein **zweites**
 * Ticket bei vivenu an. Deshalb liest die Action solche Tickets nur.
 */
export async function ladeTicket(vivenuTicketId: string): Promise<VivenuFreeTicket | null> {
  try {
    const ticket = await vv<VivenuFreeTicket>(`/tickets/${encodeURIComponent(vivenuTicketId)}`);
    return ticket?._id ? ticket : null;
  } catch (fehler) {
    if (fehler instanceof VivenuError && fehler.status === 404) return null;
    throw fehler;
  }
}

/**
 * Das Secret nachladen, falls die Anlage-Antwort keines mitgibt.
 *
 * vivenu (11.09.2026): Ticket-Secrets aus `GET /api/transactions/{id}/tickets`
 * dürfen serverseitig gespeichert werden. Ohne Secret bleibt der Wallet-Knopf
 * im Speaker-Portal ohne Ziel.
 */
export async function ticketSecretNachladen(
  transactionId: string,
  vivenuTicketId: string,
): Promise<string | null> {
  const antwort = await vv<{ docs?: VivenuFreeTicket[] } | VivenuFreeTicket[]>(
    `/transactions/${encodeURIComponent(transactionId)}/tickets`,
  );
  const liste = Array.isArray(antwort) ? antwort : (antwort.docs ?? []);
  const treffer = liste.find((t) => t._id === vivenuTicketId) ?? liste[0];
  const secret = treffer?.secret;
  return typeof secret === "string" && secret.trim() !== "" ? secret.trim() : null;
}
