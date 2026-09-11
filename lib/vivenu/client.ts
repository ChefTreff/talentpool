import "server-only";
import { vivenuBase } from "@/lib/vivenu/naming";

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

async function vv<T>(path: string, init?: RequestInit): Promise<T> {
  const key = process.env.VIVENU_API_KEY?.trim();
  if (!key) throw new Error("VIVENU_API_KEY fehlt (docs/zugangs-liste.md)");
  const res = await fetch(`${vivenuBase().api}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 500);
    throw new VivenuError(res.status, path.split("?")[0], detail);
  }
  return (await res.json()) as T;
}

export type UnderShopTicket = { ticketTypeId: string; price?: number; active?: boolean; [k: string]: unknown };
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
