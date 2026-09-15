import type { ExhibitorRow } from "@/lib/event-app/types";

/**
 * Sanity-Dokument je Partner (Welle 3 A11; Kontrakt v2 nach der Antwort des Website-Teams vom 15.09.2026): nur freigegebene Logos,
 * nur unser eigener Dokumenttyp, nie fremde Dokumente (Entscheidungslog 11.09., Schutz der Website-Baustelle). Rein, ohne Netz — testbar.
 */
export const PARTNER_LOGO_TYPE = "portalPartnerLogo";

/** Rang für Level, die das Vokabular `sponsoring_level` nicht kennt — die Website sortiert aufsteigend, Unbekanntes kommt zuletzt. */
export const UNRANKED = 999;

/**
 * Feste Dokument-ID je Organisation — eine erneute Freigabe ersetzt das Dokument statt ein zweites anzulegen.
 * Bindestrich statt Punkt: in Sanity gilt eine ID mit Punkt als Pfad (wie `drafts.`), und Dokumente in Pfaden sind nur mit Token
 * lesbar — die statisch gebaute Website liest ohne Token. Veröffentlicht wird direkt, nie unter `drafts.`.
 */
export function partnerLogoDocId(orgId: string): string {
  return `${PARTNER_LOGO_TYPE}-${orgId}`;
}

/** Schlüssel eines Sponsoring-Levels wie `sponsoring_level_key()` in der Datenbank (0097): klein, Nicht-Alphanumerisches zu `_`. */
export function sponsoringLevelKey(level: string | null | undefined): string | null {
  const key = (level ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return key || null;
}

export type PartnerLogoRow = Pick<
  ExhibitorRow,
  | "org_id"
  | "org_edition_id"
  | "edition_slug"
  | "name"
  | "website"
  | "sponsoring_level"
  | "sponsoring_key"
  | "sponsoring_rank"
  | "partner_category"
  | "logo_svg_path"
  | "logo_png_path"
  | "logo_png_asset_id"
>;

export type PartnerLogoDocument = {
  _id: string;
  _type: typeof PARTNER_LOGO_TYPE;
  orgId: string;
  editionSlug: string;
  name: string;
  website?: string;
  /** Schlüssel aus dem Vokabular `sponsoring_level` (z. B. `premium`); ein unbekanntes Level kommt normalisiert mit. */
  sponsoringLevel?: string;
  /** Sortierung der Logo-Wand: Rang aus dem Vokabular (`sort_order`), `UNRANKED` ohne Zuordnung. */
  sponsoringRank: number;
  partnerCategory?: string;
  logoSvg?: { _type: "image"; asset: { _type: "reference"; _ref: string } };
  /** Pfad der freigegebenen SVG-Fassung im Portal — Kennung der Fassung, auch ohne hochgeladenes Asset (Trockenlauf). */
  logoSvgPath: string;
  /** false = deckende Hintergrundfläche erkannt (`lib/sanity/svg.ts`); die Website lässt das Logo dann aus (Maske auf Navy). */
  logoTransparent: boolean;
  logoPngUrl?: string;
  publishedAt: string;
};

/** Was im `external_ref.meta` steht, um „schon veröffentlicht?“ ohne Sanity-Abfrage zu beantworten. */
export type PartnerLogoRefMeta = {
  svg_path?: string;
  png_asset_id?: string | null;
  name?: string;
  sponsoring_key?: string | null;
  sponsoring_rank?: number;
  logo_transparent?: boolean;
  sanity_asset_id?: string;
  published_at?: string;
};

export type PartnerLogoOptions = {
  /** Ergebnis der SVG-Prüfung — Pflicht, damit kein Dokument ohne bewusste Aussage entsteht. */
  transparent: boolean;
  svgAssetId?: string | null;
  pngUrl?: string | null;
  now?: Date;
};

function levelKey(row: PartnerLogoRow): string | null {
  return row.sponsoring_key ?? sponsoringLevelKey(row.sponsoring_level);
}

export function partnerLogoDocument(row: PartnerLogoRow, opts: PartnerLogoOptions): PartnerLogoDocument | null {
  if (!row.logo_svg_path) return null;
  const doc: PartnerLogoDocument = {
    _id: partnerLogoDocId(row.org_id),
    _type: PARTNER_LOGO_TYPE,
    orgId: row.org_id,
    editionSlug: row.edition_slug,
    name: row.name.trim(),
    sponsoringRank: row.sponsoring_rank ?? UNRANKED,
    logoSvgPath: row.logo_svg_path,
    logoTransparent: opts.transparent,
    publishedAt: (opts.now ?? new Date()).toISOString(),
  };
  const website = row.website?.trim();
  if (website) doc.website = /^https?:\/\//i.test(website) ? website : `https://${website}`;
  const key = levelKey(row);
  if (key) doc.sponsoringLevel = key;
  const category = row.partner_category?.trim();
  if (category) doc.partnerCategory = category;
  if (opts.svgAssetId) doc.logoSvg = { _type: "image", asset: { _type: "reference", _ref: opts.svgAssetId } };
  if (opts.pngUrl) doc.logoPngUrl = opts.pngUrl;
  return doc;
}

/** Muss neu veröffentlicht werden? Nur wenn Logo-Fassung, Name, Level oder Rang von der letzten Veröffentlichung abweichen. */
export function partnerLogoChanged(meta: PartnerLogoRefMeta | null | undefined, row: PartnerLogoRow): boolean {
  if (!meta) return true;
  return (
    meta.svg_path !== row.logo_svg_path ||
    (meta.png_asset_id ?? null) !== (row.logo_png_asset_id ?? null) ||
    (meta.name ?? "") !== row.name.trim() ||
    (meta.sponsoring_key ?? null) !== levelKey(row) ||
    (meta.sponsoring_rank ?? UNRANKED) !== (row.sponsoring_rank ?? UNRANKED)
  );
}

export function partnerLogoRefMeta(row: PartnerLogoRow, sanityAssetId: string | null, transparent: boolean, now: Date = new Date()): PartnerLogoRefMeta {
  return {
    svg_path: row.logo_svg_path ?? undefined,
    png_asset_id: row.logo_png_asset_id ?? null,
    name: row.name.trim(),
    sponsoring_key: levelKey(row),
    sponsoring_rank: row.sponsoring_rank ?? UNRANKED,
    logo_transparent: transparent,
    sanity_asset_id: sanityAssetId ?? undefined,
    published_at: now.toISOString(),
  };
}
