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

/**
 * Sponsoring-Level und Ausstellerkategorien, wie sie aus den gebuchten Produkten kommen (0135) — für Anzeige und Protokoll.
 * **Nicht** an Swapcard gesendet: `Exhibitor.type` ist dort die *Branche* („Tech, Data & IT"), nicht das Level (Probe 21.09.2026);
 * eine Branche kennt das Portal bisher nicht. Siehe docs/runbooks/swapcard-aussteller.md, Abschnitt „Offen".
 */
export function exhibitorTier(row: Pick<ExhibitorRow, "level_key" | "level_source" | "categories">): {
  level: string | null;
  source: "product" | "hubspot" | null;
  categories: string[];
} {
  return { level: row.level_key ?? null, source: row.level_source ?? null, categories: row.categories ?? [] };
}

export function toExhibitorUpsert(row: ExhibitorRow, opts: { logoUrl?: string | null } = {}): ExhibitorUpsert {
  const item: ExhibitorUpsert = { clientId: row.org_id, name: row.name.trim() };
  const description = exhibitorDescription(row, "de");
  if (description) item.description = description;
  const descriptionEn = row.description_en?.trim() ? exhibitorDescription(row, "en") : undefined;
  if (descriptionEn && descriptionEn !== description) item.descriptionEn = descriptionEn;
  const website = normalizeWebsite(row.website);
  if (website) item.websiteUrl = website;
  if (opts.logoUrl) item.logoUrl = opts.logoUrl;
  // Branche (0138). Ohne Angabe geht das Feld **nicht** mit: Swapcard behält
  // dann, was dort steht, statt es auf leer zu setzen.
  const industry = row.industry?.trim();
  if (industry) item.industry = industry;
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

/**
 * Beschreibungen ohne jeden Leerraum vergleichen. Swapcard speichert den Text als HTML und gibt ihn beim Lesen **ohne Tags und ohne
 * Trennzeichen** zurück: aus „Absatz A\n\nAbsatz B" wird „Absatz AAbsatz B" (Probe 21.09.2026 an den 191 Ausstellern der Community).
 * Ein Vergleich auf Gleichheit hielte jeden mehrzeiligen Text für geändert und schriebe ihn bei **jedem** Lauf neu.
 */
function sameText(a: string | null | undefined, b: string | undefined): boolean {
  const plain = (t: string | null | undefined) => (t ?? "").replace(/<[^>]*>/g, "").replace(/\s+/g, "");
  return plain(a) === plain(b);
}

/**
 * Muss der Aussteller in der App geschrieben werden? Logo, Standnummer und Branche zählen nur, wenn wir sie liefern.
 *
 * Die Branche steht drüben zweimal: `type` gibt beim Lesen die **Beschriftung** zurück („Tech, Data & IT"), `typeLabel.value`
 * den Optionswert (`tech-and-it`) — den wir schicken. Verglichen wird deshalb gegen `typeValue`, nicht gegen `type`.
 */
export function exhibitorChanged(remote: RemoteExhibitor, wanted: ExhibitorUpsert): boolean {
  const same = (a: string | null | undefined, b: string | undefined) => (a ?? "").trim() === (b ?? "").trim();
  if (!same(remote.name, wanted.name)) return true;
  if (!sameText(remote.description, wanted.description)) return true;
  if (!same(remote.websiteUrl, wanted.websiteUrl)) return true;
  if (wanted.logoUrl !== undefined && !same(remote.logoUrl, wanted.logoUrl)) return true;
  // Die Standnummer hängt am Event, nicht am Aussteller: sie kommt nur mit, wenn wir den Aussteller **im Event** gelesen haben.
  // Ohne diesen Vergleich erreichte eine Standänderung Swapcard nach dem ersten Schreiben nie wieder.
  if (wanted.booth !== undefined && remote.booths !== undefined && !remote.booths.some((b) => same(b, wanted.booth))) return true;
  if (wanted.industry !== undefined && !same(remote.typeValue, wanted.industry)) return true;
  return false;
}

export function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Öffentliche Kopie des freigegebenen PNG: eine Datei je Fassung (Asset-ID), damit eine neue Freigabe eine neue URL bekommt. */
export function publicLogoPath(row: Pick<ExhibitorRow, "edition_slug" | "org_id" | "logo_png_asset_id">): string | null {
  return row.logo_png_asset_id ? `${row.edition_slug}/${row.org_id}/${row.logo_png_asset_id}.png` : null;
}
