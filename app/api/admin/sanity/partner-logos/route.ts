import { NextResponse } from "next/server";
import { requireArea } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { publishPartnerLogos } from "@/lib/sanity/publish";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Welle 3 A11: freigegebene Partner-Logos als `portalPartnerLogo` nach Sanity — ausgelöst vom Partner-Team im Admin (B9).
 * Body: { editionId?: string, dryRun?: boolean (Default true), orgId?: string }. Gate `requireArea("admin")` plus `is_partner_team()`;
 * Daten mit service_role nach der Prüfung. Ohne `dryRun: false` wird nichts nach Sanity geschrieben (die API prüft mit dryRun=true).
 */
export async function POST(request: Request) {
  await requireArea("admin", "/admin/partner");
  const supabase = await createSupabaseServerClient();
  const { data: team } = await supabase.rpc("is_partner_team");
  if (!team) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  let body: { editionId?: string; dryRun?: boolean; orgId?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const dryRun = body.dryRun !== false;

  const admin = createSupabaseAdminClient();
  const { data: jobId } = await admin.rpc("start_sync_job", {
    p_system: "sanity", p_direction: "out", p_job_type: dryRun ? "partner_logos_preview" : "partner_logos", p_triggered_by: "admin",
  });
  const job = (jobId as number | null) ?? null;
  try {
    const summary = await publishPartnerLogos({ admin, editionId: body.editionId ?? null, dryRun, jobId: job, orgId: body.orgId ?? null });
    if (job) {
      await admin.rpc("finish_sync_job", {
        p_id: job, p_status: summary.errors > 0 ? "partial" : "ok", p_stats: { ...summary, runs: undefined }, p_error: summary.skipped ?? null,
      });
    }
    return NextResponse.json({ ok: true, job, ...summary });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (job) await admin.rpc("finish_sync_job", { p_id: job, p_status: "failed", p_stats: {}, p_error: message.slice(0, 500) });
    return NextResponse.json({ ok: false, job, error: message }, { status: 500 });
  }
}
