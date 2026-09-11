import type { ExhibitorRow } from "@/lib/event-app/types";

/**
 * Sanity-Dokument je Partner (Welle 3 A11): nur freigegebene Logos, nur unser eigener Dokumenttyp, nie fremde Dokumente
 * (Entscheidungslog 11.09., Schutz der Website-Baustelle). Rein, ohne Netz — testbar.
 */
export const PARTNER_LOGO_TYPE = "portalPartnerLogo";

/** Feste Dokument-ID je Organisation — eine erneute Freigabe ersetzt das Dokument statt ein zweites anzulegen. */
export function partnerLogoDocId(orgId: string): string {
  return `${PARTNER_LOGO_TYPE}.${orgId}`;
}

export type PartnerLogoRow = Pick<
  ExhibitorRow,
  "org_id" | "org_edition_id" | "edition_slug" | "name" | "website" | "sponsoring_level" | "partner_category" | "logo_svg_path" | "logo_png_path" | "logo_png_asset_id"
>;

export type PartnerLogoDocument = {
  _id: string;
  _type: typeof PARTNER_LOGO_TYPE;
  orgId: string;
  editionSlug: string;
  name: string;
  website?: string;
  sponsoringLevel?: string;
  partnerCategory?: string;
  logoSvg?: { _type: "image"; asset: { _type: "reference"; _ref: string } };
  /** Pfad der freigegebenen SVG-Fassung im Portal — Kennung der Fassung, auch ohne hochgeladenes Asset (Trockenlauf). */
  logoSvgPath: string;
  logoPngUrl?: string;
  publishedAt: string;
};

/** Was im `external_ref.meta` steht, um „schon veröffentlicht?“ ohne Sanity-Abfrage zu beantworten. */
export type PartnerLogoRefMeta = {
  svg_path?: string;
  png_asset_id?: string | null;
  name?: string;
  sponsoring_level?: string | null;
  sanity_asset_id?: string;
  published_at?: string;
};

export function partnerLogoDocument(
  row: PartnerLogoRow,
  opts: { svgAssetId?: string | null; pngUrl?: string | null; now?: Date } = {},
): PartnerLogoDocument | null {
  if (!row.logo_svg_path) return null;
  const doc: PartnerLogoDocument = {
    _id: partnerLogoDocId(row.org_id),
    _type: PARTNER_LOGO_TYPE,
    orgId: row.org_id,
    editionSlug: row.edition_slug,
    name: row.name.trim(),
    logoSvgPath: row.logo_svg_path,
    publishedAt: (opts.now ?? new Date()).toISOString(),
  };
  const website = row.website?.trim();
  if (website) doc.website = /^https?:\/\//i.test(website) ? website : `https://${website}`;
  const level = row.sponsoring_level?.trim();
  if (level) doc.sponsoringLevel = level;
  const category = row.partner_category?.trim();
  if (category) doc.partnerCategory = category;
  if (opts.svgAssetId) doc.logoSvg = { _type: "image", asset: { _type: "reference", _ref: opts.svgAssetId } };
  if (opts.pngUrl) doc.logoPngUrl = opts.pngUrl;
  return doc;
}

/** Muss neu veröffentlicht werden? Nur wenn Logo-Fassung, Name oder Level von der letzten Veröffentlichung abweichen. */
export function partnerLogoChanged(meta: PartnerLogoRefMeta | null | undefined, row: PartnerLogoRow): boolean {
  if (!meta) return true;
  return (
    meta.svg_path !== row.logo_svg_path ||
    (meta.png_asset_id ?? null) !== (row.logo_png_asset_id ?? null) ||
    (meta.name ?? "") !== row.name.trim() ||
    (meta.sponsoring_level ?? null) !== (row.sponsoring_level?.trim() || null)
  );
}

export function partnerLogoRefMeta(row: PartnerLogoRow, sanityAssetId: string | null, now: Date = new Date()): PartnerLogoRefMeta {
  return {
    svg_path: row.logo_svg_path ?? undefined,
    png_asset_id: row.logo_png_asset_id ?? null,
    name: row.name.trim(),
    sponsoring_level: row.sponsoring_level?.trim() || null,
    sanity_asset_id: sanityAssetId ?? undefined,
    published_at: now.toISOString(),
  };
}
