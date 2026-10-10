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
/** Der Zustand eines Tickets aus dem Datenbankwert; alles Unbekannte zählt als offen. */
export const zustandVon = (s: string): Zustand => (s === "complete" ? "complete" : s === "partial" ? "partial" : "pending");
export function zaehleZustaende(zeilen: { personalization_status: string }[]): Record<Zustand, number> {
  const out: Record<Zustand, number> = { pending: 0, partial: 0, complete: 0 };
  for (const z of zeilen) out[zustandVon(z.personalization_status)] += 1;
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

/** Die Zustände aller Tickets der Bestellung nach Kennung — der Stand, den die Ansicht beim Laden kennt und beim Speichern nachführt. */
export function zustaendeVon(tickets: readonly { ticket_id: string; personalization_status: string }[]): Record<string, Zustand> {
  return Object.fromEntries(tickets.map((t) => [t.ticket_id, zustandVon(t.personalization_status)]));
}

/**
 * Welches Ticket kommt als Nächstes (TAL-020, B4)? Das erste **nach** `nach`, das noch nicht vollständig ist; ohne `nach` das erste der Bestellung. Es wird nicht
 * von vorn weitergesucht: wer ein Ticket überspringt, kommt nicht im Kreis zu ihm zurück. Gibt die Kennung oder `null` zurück.
 */
export function naechstesOffene(
  tickets: readonly { ticket_id: string }[],
  zustaende: Readonly<Record<string, Zustand>>,
  nach: string | null,
): string | null {
  const start = nach === null ? 0 : tickets.findIndex((t) => t.ticket_id === nach) + 1;
  return tickets.slice(start).find((t) => zustaende[t.ticket_id] !== "complete")?.ticket_id ?? null;
}

/** Die vier Angaben, die auf das Namensschild kommen. */
export type Felder = { first_name: string; last_name: string; company: string; job_position: string };
export const LEERE_FELDER: Felder = { first_name: "", last_name: "", company: "", job_position: "" };
const abbilden = (f: Felder, aendere: (feld: keyof Felder, wert: string) => string): Felder => ({
  first_name: aendere("first_name", f.first_name),
  last_name: aendere("last_name", f.last_name),
  company: aendere("company", f.company),
  job_position: aendere("job_position", f.job_position),
});

/**
 * Welches Ticket der Bestellung startet „für mich“ (TAL-020, B2)? **Höchstens eines** — das erste, zu dem noch nichts gespeichert ist —, und keines, wenn die
 * Person schon ein gespeichertes Ticket für sich hat. Vorher startete jedes mit dem Profil des Käufers: bei drei Tickets drei Mal „Speichern“ auf dieselbe Person.
 * „Gespeichert“ heißt: der Zustand ist nicht `pending`. `for_me` allein sagt nichts — der Ingest hängt ein neues Ticket schon an die Person, deren Adresse der
 * Käufer hat, ohne dass sie etwas eingetragen hätte. Gibt die Kennung des Tickets zurück oder `null`.
 */
export function startetFuerMich(tickets: readonly { ticket_id: string; personalization_status: string; for_me: boolean }[]): string | null {
  const gespeichert = (t: { personalization_status: string }) => zustandVon(t.personalization_status) !== "pending";
  if (tickets.some((t) => gespeichert(t) && t.for_me)) return null;
  return tickets.find((t) => !gespeichert(t))?.ticket_id ?? null;
}

/**
 * Was passiert mit den Feldern, wenn „für mich“ umgeschaltet wird (TAL-020, B2)? `eigene` sind die Angaben der Person selbst — das Profil, bei einem schon für sie
 * gespeicherten Ticket dessen Werte. **Feld für Feld:**
 * - **Auf „andere Person“:** ein Feld, das noch genau die eigene Angabe trägt, ist nur Vorbelegung und wird **geleert** (sonst bliebe der Name des Käufers samt
 *   Position stehen, und wer nur die E-Mail ergänzt, speichert ihn für jemand anderen). Was die Person selbst getippt hat, bleibt.
 * - **Zurück auf „für mich“:** leere Felder bekommen die eigene Angabe wieder, getippte bleiben.
 */
export function felderBeimUmschalten(aktuell: Felder, eigene: Felder, fuerMich: boolean): Felder {
  return abbilden(aktuell, (feld, wert) =>
    fuerMich ? (wert.trim() === "" ? eigene[feld] : wert) : wert.trim() === eigene[feld].trim() ? "" : wert,
  );
}

/** Fehlerschlüssel, zu denen die Seite einen eigenen, genaueren Text hat — er geht dem allgemeinen Wörterbuch (`rpc`) vor. */
const EIGENE_FEHLER = new Set(["name_required", "holder_email_required", "ticket_not_valid", "ticket_not_found", "person_has_ticket"]);

/**
 * Der Text zu einem Fehler der Aktion (TAL-020, B8): erst der genauere der Seite (`ticketBestaetigung`), dann das allgemeine Wörterbuch, dann „unbekannt“. Vorher
 * galt die umgekehrte Reihenfolge, und „Bitte Vor- und Nachname angeben.“ erschien nie, weil `rpc` denselben Schlüssel mit „Bitte einen Namen angeben.“ führt.
 */
export function fehlerText(key: string, seite: Record<string, string>, rpc: Record<string, string>): string {
  return (EIGENE_FEHLER.has(key) ? seite[key] : undefined) ?? rpc[key] ?? rpc.unknown ?? key;
}
