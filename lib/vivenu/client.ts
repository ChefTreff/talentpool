import "server-only";
import { vivenuBase } from "@/lib/vivenu/naming";
import { MAX_ATTEMPTS, retryDelayMs, RETRY_ON } from "@/lib/vivenu/backoff";

/**
 * vivenu-API (Doku docs.vivenu.dev). Sandbox `vivenu.dev`, Produktion `vivenu.com`; `VIVENU_SANDBOX=false` schaltet um.
 * Kein SDK. Antworten werden tolerant gelesen — die Felder der Undershops und Coupons stammen aus der Doku und dem Dev-Dashboard
 * (docs/vivenu-support-anfrage.md, Nachtrag 10.09.) und sind bis zum ersten Sandbox-Lauf mit Dev-Event nicht gegen echte Antworten geprüft.
 */
export class VivenuError extends Error {
  constructor(
    public readonly status: number,
    public readonly path: string,
    detail: string,
  ) {
    super(`vivenu ${status} ${path}: ${detail}`);
  }
}

export { vivenuBase } from "@/lib/vivenu/naming";

export function hasVivenuKey(): boolean {
  return Boolean(process.env.VIVENU_API_KEY?.trim());
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function vv<T>(path: string, init?: RequestInit): Promise<T> {
  const key = process.env.VIVENU_API_KEY?.trim();
  if (!key) throw new Error("VIVENU_API_KEY fehlt (docs/zugangs-liste.md)");
  let last: VivenuError | null = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const res = await fetch(`${vivenuBase().api}${path}`, {
      ...init,
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json", ...(init?.headers ?? {}) },
      cache: "no-store",
    });
    if (res.ok) return (await res.json()) as T;
    const detail = (await res.text().catch(() => "")).slice(0, 500);
    last = new VivenuError(res.status, path.split("?")[0], detail);
    // Nur wiederholen, was sich von selbst erledigen kann — 4xx sonst nicht.
    if (!RETRY_ON.has(res.status) || attempt === MAX_ATTEMPTS - 1) throw last;
    await sleep(retryDelayMs(attempt, res.headers.get("retry-after")));
  }
  throw last ?? new Error("vivenu: unerreichbar");
}

/**
 * Ein Tickettyp im Undershop.
 *
 * Die Verknüpfung läuft über **`_id`** — das ist die Id des Tickettyps am
 * Event, nicht eine eigene. Im Sandbox-Lauf am 12.09. nachgemessen: mit
 * `ticketTypeId`, `ticketId`, `baseTicketId` oder `refId` wirft vivenu die
 * Angabe weg und vergibt eine neue Id, der Shop verkauft dann nichts.
 */
export type UnderShopTicket = { _id: string; price?: number; active?: boolean; amount?: number; [k: string]: unknown };
export type UnderShop = {
  _id?: string;
  name: string;
  active?: boolean;
  unlockMode?: "none" | "couponCode" | string;
  tickets?: UnderShopTicket[];
  url?: string;
  shopUrl?: string;
  [k: string]: unknown;
};
export type VivenuEvent = { _id: string; name?: string; slug?: string; underShops?: UnderShop[]; [k: string]: unknown };
export type VivenuCoupon = { _id: string; code?: string; [k: string]: unknown };

export function getEvent(eventId: string): Promise<VivenuEvent> {
  return vv<VivenuEvent>(`/events/${encodeURIComponent(eventId)}`);
}

/** Read-Modify-Write des kompletten `underShops`-Arrays — nur diese Route schreibt es, je Event nacheinander. */
export function putUnderShops(eventId: string, underShops: UnderShop[]): Promise<VivenuEvent> {
  return vv<VivenuEvent>(`/events/${encodeURIComponent(eventId)}`, { method: "PUT", body: JSON.stringify({ underShops }) });
}

export type CouponInput = {
  name: string;
  code: string;
  discount: { type: "percentage" | "fixed"; value: number };
  maxTickets?: number;
  allowedTickets?: string[];
  unlocks?: { eventId: string; underShopId: string }[];
  active?: boolean;
  sellerId?: string;
};

export function createCoupon(input: CouponInput): Promise<VivenuCoupon> {
  return vv<VivenuCoupon>("/coupons", { method: "POST", body: JSON.stringify(input) });
}

export function updateCoupon(couponId: string, patch: Partial<CouponInput>): Promise<VivenuCoupon> {
  return vv<VivenuCoupon>(`/coupons/${encodeURIComponent(couponId)}`, { method: "POST", body: JSON.stringify(patch) });
}

/**
 * Tickets eines Events. vivenu paginiert über `skip`/`top`; wir holen in
 * Seiten von 100, bis `limit` erreicht ist oder nichts mehr kommt.
 */
export async function listTickets(
  eventId: string,
  options: { since?: string | null; limit?: number } = {},
): Promise<VivenuTicketRow[]> {
  const limit = options.limit ?? 500;
  const out: VivenuTicketRow[] = [];
  const page = 100;
  for (let skip = 0; skip < limit; skip += page) {
    const query = new URLSearchParams({
      eventId,
      top: String(Math.min(page, limit - skip)),
      skip: String(skip),
    });
    if (options.since) query.set("modifiedSince", options.since);
    const res = await vv<{ docs?: VivenuTicketRow[]; rows?: VivenuTicketRow[] }>(`/tickets?${query}`);
    const batch = res.docs ?? res.rows ?? [];
    out.push(...batch);
    if (batch.length < page) break;
  }
  return out;
}

/** Das, was der Ingest von einem Ticket braucht — der Rest wird durchgereicht. */
export type VivenuTicketRow = { _id?: string; eventId?: string; [k: string]: unknown };
