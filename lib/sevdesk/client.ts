import "server-only";
import { SEVDESK_IDS } from "@/lib/sevdesk/mapping";

/**
 * SevDesk-API v1 mit `SEVDESK_API_TOKEN` (nur Vercel-Env). Kein SDK. Gleiche Haltung wie lib/expenses/integrations.ts:
 * ohne Token passiert nichts, Aufrufer entscheiden über Trockenlauf.
 */
const BASE = "https://my.sevdesk.de/api/v1";

export class SevdeskError extends Error {
  constructor(
    public readonly status: number,
    public readonly path: string,
    detail: string,
  ) {
    super(`SevDesk ${status} ${path}: ${detail}`);
  }
}

export function hasSevdeskToken(): boolean {
  return Boolean(process.env.SEVDESK_API_TOKEN?.trim());
}

/**
 * Ein Aufruf gegen die SevDesk-API.
 *
 * Exportiert, damit der Artikelstamm (`lib/sevdesk/parts.ts`) denselben Weg
 * nimmt — ein zweites `fetch` mit eigenem Token hätte irgendwann eine eigene
 * Fehlerbehandlung, und eine davon verschluckt den Statuscode.
 */
export async function sd<T>(path: string, init?: RequestInit): Promise<T> {
  const token = process.env.SEVDESK_API_TOKEN?.trim();
  if (!token) throw new Error("SEVDESK_API_TOKEN fehlt (docs/zugangs-liste.md)");
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { authorization: token, accept: "application/json", "content-type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 500);
    throw new SevdeskError(res.status, path.split("?")[0], detail);
  }
  // Eine leere Antwort (etwa nach einem `DELETE`) ist kein Fehler.
  const text = await res.text();
  return (text.trim() ? JSON.parse(text) : {}) as T;
}

type Objects<T> = { objects?: T };

/** Ansprechpartner (Pflichtfeld der Rechnung): `SEVDESK_CONTACT_PERSON_ID`, sonst der erste SevUser des Kontos. */
export async function getContactPersonId(): Promise<string> {
  const fromEnv = process.env.SEVDESK_CONTACT_PERSON_ID?.trim();
  if (fromEnv) return fromEnv;
  const res = await sd<Objects<{ id: string }[]>>("/SevUser");
  const id = res.objects?.[0]?.id;
  if (!id) throw new Error("SevDesk: kein SevUser gefunden");
  return String(id);
}

export async function getCountryId(code: string | null | undefined): Promise<number> {
  const cc = (code ?? "DE").trim().toUpperCase();
  if (cc === "" || cc === "DE" || cc === "DEUTSCHLAND" || cc === "GERMANY") return SEVDESK_IDS.countryGermany;
  try {
    const res = await sd<Objects<{ id: string; code?: string }[]>>(`/StaticCountry?code=${encodeURIComponent(cc)}`);
    const hit = res.objects?.find((c) => (c.code ?? "").toUpperCase() === cc) ?? res.objects?.[0];
    return hit ? Number(hit.id) : SEVDESK_IDS.countryGermany;
  } catch {
    return SEVDESK_IDS.countryGermany;
  }
}

export async function createContact(input: { name: string; vatNumber?: string | null; customerNumber?: string | null }): Promise<string> {
  const res = await sd<Objects<{ id: string }>>("/Contact", {
    method: "POST",
    body: JSON.stringify({
      name: input.name,
      category: { id: SEVDESK_IDS.contactCategoryCustomer, objectName: "Category" },
      ...(input.vatNumber ? { vatNumber: input.vatNumber } : {}),
      ...(input.customerNumber ? { customerNumber: input.customerNumber } : {}),
    }),
  });
  if (!res.objects?.id) throw new Error("SevDesk: Contact ohne id");
  return String(res.objects.id);
}

export async function addContactAddress(contactId: string, a: { street: string | null; zip: string | null; city: string | null; countryId: number }): Promise<void> {
  await sd("/ContactAddress", {
    method: "POST",
    body: JSON.stringify({
      contact: { id: contactId, objectName: "Contact" },
      street: a.street ?? "",
      zip: a.zip ?? "",
      city: a.city ?? "",
      country: { id: a.countryId, objectName: "StaticCountry" },
      category: { id: SEVDESK_IDS.addressCategoryInvoice, objectName: "Category" },
    }),
  });
}

export async function addContactEmail(contactId: string, email: string): Promise<void> {
  await sd("/CommunicationWay", {
    method: "POST",
    body: JSON.stringify({
      contact: { id: contactId, objectName: "Contact" },
      type: "EMAIL",
      value: email,
      key: { id: SEVDESK_IDS.communicationKeyInvoice, objectName: "CommunicationWayKey" },
      main: 1,
    }),
  });
}

export async function saveInvoiceDraft(payload: unknown): Promise<{ id: string; invoiceNumber: string | null }> {
  const res = await sd<Objects<{ invoice?: { id?: string; invoiceNumber?: string | null } }>>("/Invoice/Factory/saveInvoice", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  const id = res.objects?.invoice?.id;
  if (!id) throw new Error("SevDesk: saveInvoice ohne invoice.id");
  return { id: String(id), invoiceNumber: res.objects?.invoice?.invoiceNumber ?? null };
}

// ---- Angebote (PART-116) ------------------------------------------------------------------------------------------------------------------

/**
 * Die Kontakte zu einer Kundennummer — **nur lesend**, höchstens zwei Treffer: mehr braucht es nicht, um „mehrdeutig“ zu erkennen. Der Aufrufer entscheidet,
 * was null, eins und zwei Treffer bedeuten (`lib/sevdesk/angebot.ts`); `findContactByCustomerNumber` in `documents.ts` gibt bei Mehrdeutigkeit nichts zurück,
 * das genügt dort, wo nur gelesen wird, aber nicht hier, wo ein dritter Kontakt entstehen könnte.
 */
export async function findContactIdsByCustomerNumber(nummer: string): Promise<string[]> {
  const wert = nummer.trim();
  if (!wert) return [];
  const res = await sd<Objects<{ id: string }[]>>(`/Contact?customerNumber=${encodeURIComponent(wert)}&limit=2`);
  return (res.objects ?? []).map((c) => String(c.id));
}

/**
 * Die nächste freie Angebotsnummer (`AN-####`). Ohne `useNextNumber` verbraucht der Aufruf keine Nummer (Befund 08.10.2026,
 * `docs/befund-part116-sevdesk-angebot-2026-10-08.md`); die Nummer gehört erst dem Angebot, das mit ihr gespeichert wird.
 */
export async function getNextQuoteNumber(): Promise<string> {
  const res = await sd<{ objects?: string | { orderNumber?: string } }>("/Order/Factory/getNextOrderNumber?orderType=AN");
  const roh = res.objects;
  const nummer = (typeof roh === "string" ? roh : roh?.orderNumber ?? "").trim();
  if (!nummer) throw new Error("SevDesk: keine Angebotsnummer");
  return nummer;
}

/**
 * Ein Angebot als Entwurf (Status 100) anlegen — `POST /Order/Factory/saveOrder`. Festgeschrieben wird es erst mit dem ersten `getPdf` (`documents.ts`);
 * bis dahin lässt es sich mit `deleteOrderDraft` wieder entfernen.
 */
export async function saveOrderDraft(payload: unknown): Promise<{ id: string; orderNumber: string | null }> {
  const res = await sd<Objects<{ order?: { id?: string; orderNumber?: string | null } }>>("/Order/Factory/saveOrder", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  const id = res.objects?.order?.id;
  if (!id) throw new Error("SevDesk: saveOrder ohne order.id");
  return { id: String(id), orderNumber: res.objects?.order?.orderNumber ?? null };
}

/**
 * Einen Entwurf löschen — **nur** für den Probebetrieb und zum Aufräumen eines Entwurfs, der nicht festgeschrieben wurde. Ein festgeschriebener Beleg lässt
 * sich so nicht löschen (SevDesk lehnt es ab), und das ist gewollt.
 */
export async function deleteOrderDraft(id: string): Promise<void> {
  await sd(`/Order/${encodeURIComponent(id)}`, { method: "DELETE" });
}
