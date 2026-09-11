import { randomBytes } from "node:crypto";

/** Reine Helfer ohne `server-only`, damit sie im Node-Test laufen. */
export function vivenuBase(): { api: string; shop: string } {
  const prod = process.env.VIVENU_SANDBOX?.trim().toLowerCase() === "false";
  return prod
    ? { api: "https://vivenu.com/api", shop: "https://vivenu.com" }
    : { api: "https://vivenu.dev/api", shop: "https://vivenu.dev" };
}

export function undershopName(editionSlug: string, orgName: string): string {
  return `${editionSlug.toUpperCase()} · ${orgName}`.slice(0, 80);
}

export function couponCode(editionSlug: string, orgSlug: string | null, orgName: string, passType: string): string {
  const org = (orgSlug ?? orgName).toUpperCase().replace(/[^A-Z0-9]+/g, "").slice(0, 10) || "PARTNER";
  const rnd = randomBytes(3).toString("hex").toUpperCase();
  return `${editionSlug.toUpperCase()}-${org}-${passType.toUpperCase().slice(0, 4)}-${rnd}`;
}

export type UnderShopLike = { _id?: string; name?: string; url?: string; shopUrl?: string };

/** Undershop-Link, wenn vivenu ihn nicht selbst liefert. Bis zum Sandbox-Lauf ein Kandidat — das Team kann ihn über set_ticket_allocation überschreiben. */
export function undershopUrl(eventId: string, shop: UnderShopLike): string | null {
  const own = shop.shopUrl ?? shop.url;
  if (own) return own;
  if (!shop._id) return null;
  return `${vivenuBase().shop}/e/${eventId}/${shop._id}`;
}
