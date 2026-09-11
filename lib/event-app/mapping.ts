import type { ExhibitorRow, ExhibitorUpsert, RemoteExhibitor } from "@/lib/event-app/types";

/** Reine Abbildung Portal → Aussteller (ohne server-only, damit `npm test` sie prüfen kann). */

const MAX_DESCRIPTION = 2000;

export function exhibitorDescription(row: Pick<ExhibitorRow, "description_de" | "description_en">, locale: "de" | "en" = "de"): string | undefined {
  const candidates = locale === "en" ? [row.description_en, row.description_de] : [row.description_de, row.description_en];
  const text = candidates.find((t) => t && t.trim() !== "")?.trim();
  if (!text) return undefined;
  return text.length > MAX_DESCRIPTION ? `${text.slice(0, MAX_DESCRIPTION - 1)}…` : text;
}

export function normalizeWebsite(url: string | null | undefined): string | undefined {
  const t = url?.trim();
  if (!t) return undefined;
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}

/** Logo-Typ in der App = Sponsoring-Level (Arbeitsauftrag A12); ohne Level die Partnerkategorie. */
export function exhibitorType(row: Pick<ExhibitorRow, "sponsoring_level" | "partner_category">): string | undefined {
  return row.sponsoring_level?.trim() || row.partner_category?.trim() || undefined;
}

export function toExhibitorUpsert(row: ExhibitorRow, opts: { locale?: "de" | "en"; logoUrl?: string | null } = {}): ExhibitorUpsert {
  const item: ExhibitorUpsert = { clientId: row.org_id, name: row.name.trim() };
  const description = exhibitorDescription(row, opts.locale ?? "de");
  if (description) item.description = description;
  const website = normalizeWebsite(row.website);
  if (website) item.websiteUrl = website;
  if (opts.logoUrl) item.logoUrl = opts.logoUrl;
  const type = exhibitorType(row);
  if (type) item.type = type;
  const booth = row.booth_number?.trim();
  if (booth) item.booth = booth;
  return item;
}

/** Bestehenden Aussteller finden: erst `clientId` (unsere Org-ID), dann gespeicherte App-ID, zuletzt der Name. */
export function matchRemote(remotes: RemoteExhibitor[], row: Pick<ExhibitorRow, "org_id" | "name" | "swapcard_exhibitor_id">): RemoteExhibitor | undefined {
  const byClient = remotes.find((r) => (r.clientIds ?? []).includes(row.org_id));
  if (byClient) return byClient;
  if (row.swapcard_exhibitor_id) {
    const byId = remotes.find((r) => r.id === row.swapcard_exhibitor_id);
    if (byId) return byId;
  }
  const wanted = row.name.trim().toLowerCase();
  return remotes.find((r) => r.name.trim().toLowerCase() === wanted);
}

/** Muss der Aussteller in der App geschrieben werden? Logo zählt nur, wenn wir eines liefern. */
export function exhibitorChanged(remote: RemoteExhibitor, wanted: ExhibitorUpsert): boolean {
  const same = (a: string | null | undefined, b: string | undefined) => (a ?? "").trim() === (b ?? "").trim();
  if (!same(remote.name, wanted.name)) return true;
  if (!same(remote.description, wanted.description)) return true;
  if (!same(remote.websiteUrl, wanted.websiteUrl)) return true;
  if (remote.type !== undefined && !same(remote.type, wanted.type)) return true;
  if (wanted.logoUrl !== undefined && !same(remote.logoUrl, wanted.logoUrl)) return true;
  return false;
}

export function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
