/**
 * Reine Helfer der Ticket-Bestätigung (TAL-019): ohne `server-only` und ohne Klassen, damit sie im Node-Test laufen.
 * Der Server-Teil (Transaktion laden, Rückschreiben) steht in `lib/vivenu/transaktion.ts`.
 */

/** vivenu-Kennungen sind Mongo-Ids; erlaubt ist, was in eine URL passt, ohne etwas zu bedeuten. */
export function gueltigeTransaktion(roh: unknown): string | null {
  if (typeof roh !== "string") return null;
  const t = roh.trim();
  return /^[A-Za-z0-9_-]{8,64}$/.test(t) ? t : null;
}

export function normAdresse(x: unknown): string | null {
  if (typeof x !== "string") return null;
  const t = x.trim().toLowerCase();
  return t.includes("@") ? t : null;
}

type Obj = Record<string, unknown>;
const istObj = (x: unknown): x is Obj => typeof x === "object" && x !== null && !Array.isArray(x);

/** Käufer-Adresse einer vivenu-Transaktion — die Felder heißen je nach Version unterschiedlich, deshalb tolerant. */
export function kaeuferAdresse(tx: unknown): string | null {
  if (!istObj(tx)) return null;
  const kandidaten = [tx.email, tx.customerEmail, istObj(tx.customer) ? tx.customer.email : null, istObj(tx.buyer) ? tx.buyer.email : null];
  for (const k of kandidaten) {
    const a = normAdresse(k);
    if (a) return a;
  }
  return null;
}

/** Gehört die Transaktion der angemeldeten Adresse? Ohne Käufer-Adresse: nein. */
export function gleicheAdresse(kaeufer: string | null, anmeldung: string | null | undefined): boolean {
  const a = normAdresse(kaeufer);
  const b = normAdresse(anmeldung);
  return a !== null && b !== null && a === b;
}

/**
 * Ein Ticket aus der Transaktion so ergänzen, wie `ingest_vivenu_ticket` es braucht: Event, Käufer-Adresse und Transaktions-Id
 * stehen am Ticket nicht immer selbst.
 */
export function ticketAusTransaktion(ticket: Obj, tx: unknown, transaktion: string): Obj {
  const t = istObj(tx) ? tx : {};
  return {
    ...ticket,
    eventId: ticket.eventId ?? t.eventId,
    email: ticket.email ?? kaeuferAdresse(tx) ?? undefined,
    transactionId: ticket.transactionId ?? transaktion,
  };
}

/** Eine Taktung je Transaktion und Minute: gleiche Kennung ⇒ `record_webhook_event` meldet `duplicate`. */
export function ladeSchluessel(transaktion: string, jetztMs: number): string {
  return `${transaktion}:${Math.floor(jetztMs / 60_000)}`;
}

export type DataField = { _id?: string; slug?: string; name?: string; type?: string };
/** Die Slugs der Extrafelder für Firma und Position (K-93, Antwort 2: Konrad legt sie je Tickettyp so an). */
export const BADGE_SLUGS = { company: "company", position: "position" } as const;

export type Badge = { first_name: string; last_name: string; company: string; job_position: string };

/**
 * Der Rumpf für `POST /tickets/personalize/{id}/{secret}`: Vorname und Nachname am Ticket, Firma und Position nur als
 * Extrafelder — und nur, wenn das Event dafür ein Feld mit diesem Slug kennt (`data fields by reference`). Ein Slug, den
 * vivenu nicht kennt, würde abgewiesen; `fehlend` sagt, was nur im Portal bleibt.
 */
export function personalisierungsRumpf(badge: Badge, felder: DataField[]): {
  body: { firstname: string; lastname: string; extraFields: Record<string, string> };
  fehlend: string[];
} {
  const slugs = new Set(felder.map((f) => f.slug).filter((s): s is string => typeof s === "string"));
  const extra: Record<string, string> = {};
  const fehlend: string[] = [];
  const setze = (slug: string, wert: string) => {
    if (!wert.trim()) return;
    if (slugs.has(slug)) extra[slug] = wert.trim();
    else fehlend.push(slug);
  };
  setze(BADGE_SLUGS.company, badge.company);
  setze(BADGE_SLUGS.position, badge.job_position);
  return { body: { firstname: badge.first_name.trim(), lastname: badge.last_name.trim(), extraFields: extra }, fehlend };
}

/** Der Schalter fürs Rückschreiben: nur das Wort `true` schaltet ein (Standard aus, wie bei Luma und ActiveCampaign). */
export function rueckschreibenAn(wert: string | undefined): boolean {
  return wert?.trim().toLowerCase() === "true";
}

/** Das Secret darf in keiner Fehlermeldung stehen (der Pfad der vivenu-API enthält es). */
export function ohneSecret(text: string, secret: string | null | undefined): string {
  return secret ? text.split(secret).join("***").split(encodeURIComponent(secret)).join("***") : text;
}

export type Zustand = "pending" | "partial" | "complete";
export function zaehleZustaende(zeilen: { personalization_status: string }[]): Record<Zustand, number> {
  const out: Record<Zustand, number> = { pending: 0, partial: 0, complete: 0 };
  for (const z of zeilen) {
    if (z.personalization_status === "complete") out.complete += 1;
    else if (z.personalization_status === "partial") out.partial += 1;
    else out.pending += 1;
  }
  return out;
}

/** Namen der gekauften Add-ons (nur Anzeige); vivenu liefert je Eintrag meist `name`. */
export function addonNamen(addons: unknown): string[] {
  if (!Array.isArray(addons)) return [];
  const out: string[] = [];
  for (const a of addons) {
    const n = istObj(a) ? (typeof a.name === "string" ? a.name : typeof a.label === "string" ? a.label : null) : typeof a === "string" ? a : null;
    if (n?.trim()) out.push(n.trim());
  }
  return out;
}

/** Eingaben des Formulars prüfen — dieselben Regeln wie `personalize_ticket`, damit die Meldung vor dem Aufruf kommt. */
export function pruefeEingabe(e: { fuerMich: boolean; first_name: string; last_name: string; holder_email: string }): string | null {
  if (!e.first_name.trim() || !e.last_name.trim()) return "name_required";
  if (!e.fuerMich && !normAdresse(e.holder_email)) return "holder_email_required";
  return null;
}
