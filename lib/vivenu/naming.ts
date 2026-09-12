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

/**
 * Der Ticketshop des Verkäufers, z. B. `https://cheftreff-idbu.vivenushop.dev`.
 *
 * Die API kennt ihn nicht: weder das Event noch `/sellers/me` nennen die
 * Shop-Domain (im Sandbox-Lauf am 12.09. beides durchsucht). Sie steht nur im
 * Dashboard und wandert deshalb als `VIVENU_SHOP_BASE` in die Umgebung.
 * Fehlt sie, bleibt der Link leer statt falsch — eine erfundene Adresse in
 * einer Partner-Mail wäre schlimmer als gar keine.
 */
export function vivenuShopBase(): string | null {
  const raw = process.env.VIVENU_SHOP_BASE?.trim().replace(/\/+$/, "");
  if (!raw) return null;
  if (!/^https:\/\//.test(raw)) {
    console.warn(`[vivenu] VIVENU_SHOP_BASE ist "${raw}" — erwartet wird eine https-Adresse. Der Undershop-Link bleibt leer.`);
    return null;
  }
  return raw;
}

/**
 * Link auf den Undershop eines Partners.
 *
 * Form `<shop>/event/<eventId>/<underShopId>` — am 12.09. gegen die Sandbox
 * geprüft, alle vier Undershops antworten mit 200. Die frühere Vermutung
 * `/e/<eventId>/<id>` auf `vivenu.dev` war in beiden Teilen falsch: falscher
 * Host (der Shop läuft unter der Verkäufer-Domain) und falscher Pfad.
 * Undershops selbst führen kein `url`-Feld; die Abfrage darauf bleibt nur
 * stehen, falls vivenu eines nachreicht.
 */
export function undershopUrl(eventId: string, shop: UnderShopLike): string | null {
  const own = shop.shopUrl ?? shop.url;
  if (own) return own;
  const base = vivenuShopBase();
  if (!base || !shop._id) return null;
  return `${base}/event/${eventId}/${shop._id}`;
}
