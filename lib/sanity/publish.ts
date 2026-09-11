import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExhibitorRow } from "@/lib/event-app/types";
import { ensurePublicLogo, publicLogoUrl, PRIVATE_BUCKET } from "@/lib/event-app/logos";
import { hasSanityConfig, sanityMutate, sanityUploadImage } from "@/lib/sanity/client";
import { partnerLogoChanged, partnerLogoDocId, partnerLogoDocument, partnerLogoRefMeta, type PartnerLogoRefMeta } from "@/lib/sanity/mapping";

export type PublishSummary = {
  dryRun: boolean;
  rows: number;
  withLogo: number;
  create: number;
  update: number;
  unchanged: number;
  validated: number;
  published: number;
  errors: number;
  skipped?: string;
  runs: { org: string; outcome: string; detail?: string }[];
};

const SYSTEM = "sanity";
const OBJECT_TYPE = "partner_logo";

/**
 * Freigegebene Partner-Logos als Sanity-Dokumente `portalPartnerLogo` (A11). Quelle ist `event_app_exhibitors()` (nur Zeilen mit freigegebener
 * SVG-Fassung); ob schon veröffentlicht, sagt `external_ref` (system sanity, object_type partner_logo, object_id = org_edition) mit der Fassung im
 * `meta`. `dryRun` (Standard) lässt Sanity die Dokumente mit `dryRun=true` prüfen und schreibt nichts; der Echtlauf lädt die SVG-Datei als Asset hoch,
 * schreibt das Dokument per createOrReplace (feste ID je Org — genau ein Dokument, „genau ein Upsert je Freigabe“) und merkt sich die Fassung.
 */
export async function publishPartnerLogos(opts: {
  admin: SupabaseClient;
  editionId?: string | null;
  dryRun: boolean;
  jobId: number | null;
  orgId?: string | null;
}): Promise<PublishSummary> {
  const { admin, dryRun, jobId } = opts;
  const summary: PublishSummary = { dryRun, rows: 0, withLogo: 0, create: 0, update: 0, unchanged: 0, validated: 0, published: 0, errors: 0, runs: [] };

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

  for (const row of rows) {
    const ref = refs.get(row.org_edition_id);
    const changed = partnerLogoChanged(ref?.meta, row);
    if (!changed) {
      summary.unchanged += 1;
      summary.runs.push({ org: row.name, outcome: "unchanged", detail: ref?.external_id });
      continue;
    }
    const kind = ref ? "update" : "create";
    summary[kind] += 1;

    if (dryRun) {
      const doc = partnerLogoDocument(row, { pngUrl: publicLogoUrl(admin, row) });
      if (!doc) continue;
      try {
        await sanityMutate([{ createOrReplace: doc }], { dryRun: true });
        summary.validated += 1;
        summary.runs.push({ org: row.name, outcome: `would_${kind}`, detail: doc._id });
      } catch (e) {
        summary.errors += 1;
        summary.runs.push({ org: row.name, outcome: "invalid", detail: (e instanceof Error ? e.message : String(e)).slice(0, 300) });
      }
      continue;
    }

    try {
      const { data: blob, error: dl } = await admin.storage.from(PRIVATE_BUCKET).download(row.logo_svg_path!);
      if (dl || !blob) throw new Error(`SVG laden: ${dl?.message ?? "leer"}`);
      const asset = await sanityUploadImage(blob, `${row.edition_slug}-${row.org_id}.svg`, "image/svg+xml");
      let pngUrl: string | null = null;
      try {
        pngUrl = await ensurePublicLogo(admin, row);
      } catch (e) {
        summary.runs.push({ org: row.name, outcome: "png_skipped", detail: (e instanceof Error ? e.message : String(e)).slice(0, 200) });
      }
      const doc = partnerLogoDocument(row, { svgAssetId: asset._id, pngUrl });
      if (!doc) continue;
      await sanityMutate([{ createOrReplace: doc }], { dryRun: false });
      const { error: refSet } = await admin.rpc("set_external_ref", {
        p_system: SYSTEM,
        p_object_type: OBJECT_TYPE,
        p_object_id: row.org_edition_id,
        p_external_id: partnerLogoDocId(row.org_id),
        p_meta: partnerLogoRefMeta(row, asset._id),
      });
      if (refSet) throw new Error(`set_external_ref: ${refSet.message}`);
      summary.published += 1;
      summary.runs.push({ org: row.name, outcome: kind, detail: doc._id });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      summary.errors += 1;
      summary.runs.push({ org: row.name, outcome: "error", detail: message.slice(0, 300) });
      await admin.rpc("record_sync_error", {
        p_job_id: jobId,
        p_object_type: "org_edition",
        p_object_id: row.org_edition_id,
        p_message: message.slice(0, 500),
        p_payload: { org_id: row.org_id, edition: row.edition_slug, system: SYSTEM },
      });
    }
  }
  return summary;
}
