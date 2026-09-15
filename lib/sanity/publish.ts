import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExhibitorRow } from "@/lib/event-app/types";
import { ensurePublicLogo, publicLogoUrl, PRIVATE_BUCKET } from "@/lib/event-app/logos";
import { hasSanityConfig, sanityMutate, sanityUploadImage } from "@/lib/sanity/client";
import { partnerLogoChanged, partnerLogoDocId, partnerLogoDocument, partnerLogoRefMeta, type PartnerLogoRefMeta } from "@/lib/sanity/mapping";
import { svgTransparency } from "@/lib/sanity/svg";

export type PublishRun = { org: string; outcome: string; detail?: string; transparent?: boolean; raster?: boolean };

export type PublishSummary = {
  dryRun: boolean;
  rows: number;
  withLogo: number;
  create: number;
  update: number;
  unchanged: number;
  /** Logos, deren SVG eine Hintergrundfläche hat — werden mit `logoTransparent: false` geschrieben, die Website lässt sie aus. */
  opaque: number;
  validated: number;
  published: number;
  errors: number;
  skipped?: string;
  runs: PublishRun[];
};

const SYSTEM = "sanity";
const OBJECT_TYPE = "partner_logo";

/**
 * Freigegebene Partner-Logos als Sanity-Dokumente `portalPartnerLogo` (A11, Kontrakt v2). Quelle ist `event_app_exhibitors()` (nur Zeilen mit
 * freigegebener SVG-Fassung); ob schon veröffentlicht, sagt `external_ref` (system sanity, object_type partner_logo, object_id = org_edition) mit der
 * Fassung im `meta`. Die SVG-Datei wird in beiden Läufen gelesen, weil `logoTransparent` ihren Inhalt braucht. `dryRun` (Standard) lässt Sanity die
 * Dokumente mit `dryRun=true` prüfen und schreibt nichts; der Echtlauf lädt die SVG-Datei als Asset hoch, schreibt das Dokument per createOrReplace
 * (feste ID je Org — genau ein Dokument, „genau ein Upsert je Freigabe“) und merkt sich die Fassung.
 */
export async function publishPartnerLogos(opts: {
  admin: SupabaseClient;
  editionId?: string | null;
  dryRun: boolean;
  jobId: number | null;
  orgId?: string | null;
}): Promise<PublishSummary> {
  const { admin, dryRun, jobId } = opts;
  const summary: PublishSummary = {
    dryRun, rows: 0, withLogo: 0, create: 0, update: 0, unchanged: 0, opaque: 0, validated: 0, published: 0, errors: 0, runs: [],
  };

  const { data, error } = await admin.rpc("event_app_exhibitors", { p_edition_id: opts.editionId ?? null });
  if (error) throw new Error(`event_app_exhibitors: ${error.message}`);
  let rows = (data ?? []) as ExhibitorRow[];
  if (opts.orgId) rows = rows.filter((r) => r.org_id === opts.orgId);
  summary.rows = rows.length;
  rows = rows.filter((r) => r.logo_svg_path);
  summary.withLogo = rows.length;
  if (rows.length === 0) return summary;
  if (!hasSanityConfig()) return { ...summary, skipped: "SANITY_PROJECT_ID/SANITY_API_TOKEN fehlen – nichts veröffentlicht" };

  const { data: refRows, error: refErr } = await admin.rpc("list_external_refs", { p_system: SYSTEM, p_object_type: OBJECT_TYPE });
  if (refErr) throw new Error(`list_external_refs: ${refErr.message}`);
  const refs = new Map<string, { external_id: string; meta: PartnerLogoRefMeta }>();
  for (const r of (refRows ?? []) as { object_id: string; external_id: string; meta: PartnerLogoRefMeta }[]) refs.set(r.object_id, r);

  const fail = async (row: ExhibitorRow, e: unknown) => {
    const message = e instanceof Error ? e.message : String(e);
    summary.errors += 1;
    summary.runs.push({ org: row.name, outcome: "error", detail: message.slice(0, 300) });
    if (dryRun) return;
    await admin.rpc("record_sync_error", {
      p_job_id: jobId,
      p_object_type: "org_edition",
      p_object_id: row.org_edition_id,
      p_message: message.slice(0, 500),
      p_payload: { org_id: row.org_id, edition: row.edition_slug, system: SYSTEM },
    });
  };

  for (const row of rows) {
    const ref = refs.get(row.org_edition_id);
    if (!partnerLogoChanged(ref?.meta, row)) {
      summary.unchanged += 1;
      summary.runs.push({ org: row.name, outcome: "unchanged", detail: ref?.external_id });
      continue;
    }
    const kind = ref ? "update" : "create";
    summary[kind] += 1;

    // SVG lesen — auch im Trockenlauf: die Transparenzprüfung braucht den Inhalt, und ein Logo, das sich nicht laden lässt, ist ein Befund.
    let svg: Blob;
    try {
      const { data: blob, error: dl } = await admin.storage.from(PRIVATE_BUCKET).download(row.logo_svg_path!);
      if (dl || !blob) throw new Error(`SVG laden: ${dl?.message ?? "leer"}`);
      svg = blob;
    } catch (e) {
      await fail(row, e);
      continue;
    }
    const check = svgTransparency(await svg.text());
    if (!check.transparent) summary.opaque += 1;
    const note = check.transparent ? "" : ` · logoTransparent=false (${check.reason})`;

    if (dryRun) {
      const doc = partnerLogoDocument(row, { pngUrl: publicLogoUrl(admin, row), transparent: check.transparent });
      if (!doc) continue;
      try {
        await sanityMutate([{ createOrReplace: doc }], { dryRun: true });
        summary.validated += 1;
        summary.runs.push({ org: row.name, outcome: `would_${kind}`, detail: `${doc._id}${note}`, transparent: check.transparent, raster: check.raster });
      } catch (e) {
        summary.errors += 1;
        summary.runs.push({ org: row.name, outcome: "invalid", detail: (e instanceof Error ? e.message : String(e)).slice(0, 300) });
      }
      continue;
    }

    try {
      const asset = await sanityUploadImage(svg, `${row.edition_slug}-${row.org_id}.svg`, "image/svg+xml");
      let pngUrl: string | null = null;
      try {
        pngUrl = await ensurePublicLogo(admin, row);
      } catch (e) {
        summary.runs.push({ org: row.name, outcome: "png_skipped", detail: (e instanceof Error ? e.message : String(e)).slice(0, 200) });
      }
      const doc = partnerLogoDocument(row, { svgAssetId: asset._id, pngUrl, transparent: check.transparent });
      if (!doc) continue;
      await sanityMutate([{ createOrReplace: doc }], { dryRun: false });
      const { error: refSet } = await admin.rpc("set_external_ref", {
        p_system: SYSTEM,
        p_object_type: OBJECT_TYPE,
        p_object_id: row.org_edition_id,
        p_external_id: partnerLogoDocId(row.org_id),
        p_meta: partnerLogoRefMeta(row, asset._id, check.transparent),
      });
      if (refSet) throw new Error(`set_external_ref: ${refSet.message}`);
      summary.published += 1;
      summary.runs.push({ org: row.name, outcome: kind, detail: `${doc._id}${note}`, transparent: check.transparent, raster: check.raster });
    } catch (e) {
      await fail(row, e);
    }
  }
  return summary;
}
