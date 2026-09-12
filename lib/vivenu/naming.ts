import { randomBytes } from "node:crypto";

/** Reine Helfer ohne `server-only`, damit sie im Node-Test laufen. */

const SANDBOX = { api: "https://vivenu.dev/api", shop: "https://vivenu.dev" } as const;
const PRODUCTION = { api: "https://vivenu.com/api", shop: "https://vivenu.com" } as const;

/**
 * Sandbox oder Produktion.
 *
 * Nur `true` und `false` zählen. Alles andere ist ein Tippfehler und wird
 * laut gemeldet, statt still zu wirken — im September stand in der Umgebung
 * `VIVENU_SANDBOX=turtrue`, was mit dem alten Vergleich („ist es `false`?")
 * zufällig Sandbox ergab. Zufällig richtig ist nicht richtig: derselbe
 * Tippfehler bei `false` hätte gegen die Produktion gezeigt.
 *
 * Im Zweifel Sandbox — die Richtung, in der nichts Echtes passiert.
 */
export function vivenuBase(): { api: string; shop: string } {
  const raw = process.env.VIVENU_SANDBOX?.trim().toLowerCase();
  if (raw === "false") return PRODUCTION;
  if (raw === "true" || raw === undefined || raw === "") return SANDBOX;
  console.warn(
    `[vivenu] VIVENU_SANDBOX ist "${raw}" — erwartet wird "true" oder "false". Es gilt die Sandbox.`,
  );
  return SANDBOX;
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
