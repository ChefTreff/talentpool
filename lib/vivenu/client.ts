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
 * Die Verknüpfung läuft über **`baseTicket`** — die Id des Tickettyps am
 * Event. `_id` ist die eigene Id *dieser Zeile*, die vivenu beim Anlegen
 * vergibt; sie ist nie die Id eines Tickettyps.
 *
 * Das war am 12.09. zweimal falsch: erst mit `ticketTypeId` (vivenu wirft das
 * Feld weg), dann mit `_id` — da nimmt vivenu die Id an, aber sie zeigt auf
 * nichts, und der Shop verkauft nichts. Erst als Konrad einen Tickettyp
 * anlegte und vivenu ihn von selbst in jeden Undershop schrieb, war das
 * richtige Feld zu sehen; `/api/openapi.json` bestätigt es:
 * `_id`, `baseTicket`, `name`, `price`, `amount`, `active` sind Pflicht,
 * `_id` vergibt der Server.
 */
export type UnderShopTicket = {
  _id?: string;
  baseTicket: string;
  name?: string;
  price?: number;
  amount?: number;
  active?: boolean;
  [k: string]: unknown;
};
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
export type VivenuTicketType = { _id: string; name?: string; price?: number; amount?: number; active?: boolean; [k: string]: unknown };
export type VivenuEvent = { _id: string; name?: string; slug?: string; tickets?: VivenuTicketType[]; underShops?: UnderShop[]; [k: string]: unknown };
export type VivenuCoupon = { _id: string; code?: string; [k: string]: unknown };

export function getEvent(eventId: string): Promise<VivenuEvent> {
  return vv<VivenuEvent>(`/events/${encodeURIComponent(eventId)}`);
}

/** Read-Modify-Write des kompletten `underShops`-Arrays — nur diese Route schreibt es, je Event nacheinander. */
export function putUnderShops(eventId: string, underShops: UnderShop[]): Promise<VivenuEvent> {
  return vv<VivenuEvent>(`/events/${encodeURIComponent(eventId)}`, { method: "PUT", body: JSON.stringify({ underShops }) });
}

/**
 * Coupon-Felder nach `CouponCreateResource` aus `/api/openapi.json` (Sandbox-Lauf 12.09.).
 *
 * Drei Fallen, die die Vorlage aus der Doku nicht zeigte:
 * - Der Rabatt ist **flach** (`discountType` + `discountValue`), kein
 *   verschachteltes `discount`-Objekt. `var` ist der prozentuale Typ, also
 *   100 % = `{ discountType: "var", discountValue: 100 }`.
 * - `allowAllEvents` und `allowAllTickets` stehen per Vorgabe auf `true`.
 *   Wer nur `allowedEvents`/`allowedTickets` setzt, bekommt trotzdem einen
 *   Coupon, der auf **allen** Events des Verkäuferkontos 100 % gibt. Beide
 *   Schalter müssen ausdrücklich auf `false`.
 * - `maxUsage` ist per Vorgabe **1**; eine Nutzung ist eine abgeschlossene
 *   Transaktion. Ein Partner, der seine Plätze in zwei Käufen abruft, stünde
 *   sonst nach dem ersten vor einem toten Code. `maxTickets` begrenzt die
 *   Stückzahl, `maxUsage` die Zahl der Käufe.
 *
 * `unlocks` braucht zusätzlich `target: "underShop"`.
 */
export type CouponInput = {
  name: string;
  code?: string;
  couponType?: "coupon";
  discountType?: "fix" | "var" | "fixPerItem" | "waiveFees";
  discountValue?: number;
  maxUsage?: number;
  maxTickets?: number;
  singleUsage?: boolean;
  allowAllEvents?: boolean;
  allowedEvents?: string[];
  allowAllTickets?: boolean;
  allowedTickets?: string[];
  unlocks?: { target: "underShop"; eventId: string; underShopId: string }[];
  active?: boolean;
  note?: string;
};

export function createCoupon(input: CouponInput): Promise<VivenuCoupon> {
  // Singular: `/coupons` gibt 404. Im Sandbox-Lauf am 12.09. über
  // `/openapi.json` bestätigt — die API kennt `/api/coupon`.
  return vv<VivenuCoupon>("/coupon", { method: "POST", body: JSON.stringify(input) });
}

export function updateCoupon(couponId: string, patch: Partial<CouponInput>): Promise<VivenuCoupon> {
  // Ändern ist laut Schema PUT, nicht POST.
  return vv<VivenuCoupon>(`/coupon/${encodeURIComponent(couponId)}`, { method: "PUT", body: JSON.stringify(patch) });
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
    // `event` (Liste von Event-Ids), nicht `eventId`: vivenu weist alles
    // Unbekannte mit 400 ab, statt es zu ignorieren. Der Zeitfilter heisst
    // `updatedAt[$gt]`; `modifiedSince` gibt es nicht. Beides am 12.09. gegen
    // `/api/openapi.json` geprüft, nachdem der Sweep mit 400 stehenblieb.
    const query = new URLSearchParams({
      event: eventId,
      top: String(Math.min(page, limit - skip)),
      skip: String(skip),
    });
    if (options.since) query.set("updatedAt[$gt]", options.since);
    const res = await vv<{ docs?: VivenuTicketRow[]; rows?: VivenuTicketRow[] }>(`/tickets?${query}`);
    const batch = res.docs ?? res.rows ?? [];
    out.push(...batch);
    if (batch.length < page) break;
  }
  return out;
}

/** Das, was der Ingest von einem Ticket braucht — der Rest wird durchgereicht. */
export type VivenuTicketRow = { _id?: string; eventId?: string; [k: string]: unknown };
