import "server-only";
import { COMPANY_PROPERTIES, CONTACT_PROPERTIES, DEAL_PROPERTIES, LINE_ITEM_PROPERTIES } from "@/lib/hubspot/mapping";

/**
 * HubSpot-CRM-API mit dem Private-App-Token (`HUBSPOT_ACCESS_TOKEN`, nur Vercel-Env).
 * Kein SDK, damit die Abhängigkeitsliste kurz bleibt. Jede Funktion wirft `HubspotError`
 * mit Status und Pfad — die Aufrufer entscheiden, was daraus wird (Sync-Fehler, Retry).
 */
const BASE = "https://api.hubapi.com";

export class HubspotError extends Error {
  constructor(
    public readonly status: number,
    public readonly path: string,
    detail: string,
  ) {
    super(`HubSpot ${status} ${path}: ${detail}`);
  }
}

function token(): string {
  const t = process.env.HUBSPOT_ACCESS_TOKEN?.trim();
  if (!t) throw new Error("HUBSPOT_ACCESS_TOKEN fehlt (docs/zugangs-liste.md)");
  return t;
}

async function hs<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token()}`,
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 500);
    throw new HubspotError(res.status, path.split("?")[0], detail);
  }
  return (await res.json()) as T;
}

export type HsObject = {
  id: string;
  properties: Record<string, string | null>;
  associations?: Record<string, { results: { id: string; type: string }[] }>;
  propertiesWithHistory?: Record<string, { value: string; timestamp: string }[]>;
};

export async function getDeal(dealId: string): Promise<HsObject> {
  const q = new URLSearchParams({
    properties: DEAL_PROPERTIES.join(","),
    associations: "companies,contacts,line_items",
    propertiesWithHistory: "dealstage",
  });
  return hs<HsObject>(`/crm/v3/objects/deals/${encodeURIComponent(dealId)}?${q}`);
}

/** Zugeordnete IDs aus dem Deal — HubSpot schreibt Line-Items je nach Version als `line_items` oder `line items`. */
export function associatedIds(deal: HsObject, key: "companies" | "contacts" | "line_items"): string[] {
  const a = deal.associations ?? {};
  const bucket = key === "line_items" ? (a.line_items ?? a["line items"]) : a[key];
  return [...new Set((bucket?.results ?? []).map((r) => String(r.id)))];
}

export async function getCompany(companyId: string): Promise<HsObject | null> {
  try {
    const q = new URLSearchParams({ properties: COMPANY_PROPERTIES.join(",") });
    return await hs<HsObject>(`/crm/v3/objects/companies/${encodeURIComponent(companyId)}?${q}`);
  } catch (e) {
    if (e instanceof HubspotError && e.status === 404) return null;
    throw e;
  }
}

export async function batchRead(
  objectType: "contacts" | "line_items",
  ids: string[],
  properties: readonly string[],
): Promise<HsObject[]> {
  if (ids.length === 0) return [];
  const out: HsObject[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const body = { properties: [...properties], inputs: ids.slice(i, i + 100).map((id) => ({ id })) };
    const res = await hs<{ results: HsObject[] }>(`/crm/v3/objects/${objectType}/batch/read`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    out.push(...res.results);
  }
  return out;
}

export function getContacts(ids: string[]) {
  return batchRead("contacts", ids, CONTACT_PROPERTIES);
}

export function getLineItems(ids: string[]) {
  return batchRead("line_items", ids, LINE_ITEM_PROPERTIES);
}

/** Labels der Deal↔Kontakt-Zuordnung (v4), daraus entstehen die Kontaktrollen. */
export async function getContactLabels(dealId: string): Promise<Map<string, string[]>> {
  const res = await hs<{
    results: { toObjectId: number | string; associationTypes: { label: string | null; category: string }[] }[];
  }>(`/crm/v4/objects/deals/${encodeURIComponent(dealId)}/associations/contacts`);
  const map = new Map<string, string[]>();
  for (const r of res.results ?? []) {
    map.set(
      String(r.toObjectId),
      (r.associationTypes ?? []).map((t) => t.label ?? "").filter((l) => l !== ""),
    );
  }
  return map;
}

export async function getOwner(
  ownerId: string | null | undefined,
): Promise<{ email?: string | null; firstName?: string | null; lastName?: string | null } | null> {
  if (!ownerId) return null;
  try {
    return await hs(`/crm/v3/owners/${encodeURIComponent(ownerId)}`);
  } catch (e) {
    if (e instanceof HubspotError && e.status === 404) return null;
    throw e;
  }
}

export async function setDealStage(dealId: string, stageId: string): Promise<void> {
  await hs(`/crm/v3/objects/deals/${encodeURIComponent(dealId)}`, {
    method: "PATCH",
    body: JSON.stringify({ properties: { dealstage: stageId } }),
  });
}

/** Vorherige Phase aus der Eigenschafts-Historie (neueste zuerst) — dorthin setzt das Gate den Deal zurück. */
export function previousStage(deal: HsObject, current: string | null): string | null {
  const history = [...(deal.propertiesWithHistory?.dealstage ?? [])].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );
  const prev = history.find((h) => h.value && h.value !== current);
  return prev?.value ?? null;
}

/** Alle Deals einer Phase (Sweep), höchstens 1000. */
export async function searchDealsInStage(stageId: string): Promise<{ id: string; name: string | null }[]> {
  const out: { id: string; name: string | null }[] = [];
  let after: string | undefined;
  do {
    const res = await hs<{ results: HsObject[]; paging?: { next?: { after: string } } }>(
      "/crm/v3/objects/deals/search",
      {
        method: "POST",
        body: JSON.stringify({
          filterGroups: [{ filters: [{ propertyName: "dealstage", operator: "EQ", value: stageId }] }],
          properties: ["dealname"],
          limit: 100,
          ...(after ? { after } : {}),
        }),
      },
    );
    out.push(...res.results.map((r) => ({ id: String(r.id), name: r.properties.dealname ?? null })));
    after = res.paging?.next?.after;
  } while (after && out.length < 1000);
  return out;
}

let portalCache: string | null | undefined;
/** Portal-ID für Deal-Links (einmal je Prozess). */
export async function getPortalId(): Promise<string | null> {
  if (portalCache !== undefined) return portalCache;
  try {
    const res = await hs<{ portalId?: number | string }>("/account-info/v3/details");
    portalCache = res.portalId ? String(res.portalId) : null;
  } catch {
    portalCache = null;
  }
  return portalCache;
}
