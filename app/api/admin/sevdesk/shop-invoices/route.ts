import { NextResponse } from "next/server";
import { requireArea } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createShopInvoiceDrafts } from "@/lib/sevdesk/shop-invoices";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Welle 3 A10: Rechnungsentwürfe in SevDesk aus abgeschlossenen Shop-Bestellungen — ausgelöst vom Partner-Team im Admin (B9) nach dem Summit.
 * Body: { editionId, dryRun?: boolean (Default true), orgId?: string }. Gate `requireArea("admin")` plus `is_partner_team()`; die Kandidaten- und
 * Referenz-RPCs laufen mit dem Session-Client, service_role nur für das Sync-Protokoll. Ohne `dryRun: false` wird nichts nach SevDesk geschrieben.
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
  if (!body.editionId) return NextResponse.json({ error: "editionId missing" }, { status: 400 });
  const dryRun = body.dryRun !== false;

  const { data: edition } = await supabase.from("event").select("id, slug, name, end_date").eq("id", body.editionId).eq("is_edition", true).maybeSingle();
  if (!edition) return NextResponse.json({ error: "edition not found" }, { status: 404 });

  const admin = createSupabaseAdminClient();
  const { data: jobId } = await admin.rpc("start_sync_job", {
    p_system: "sevdesk", p_direction: "out", p_job_type: dryRun ? "shop_invoices_preview" : "shop_invoices", p_triggered_by: "admin",
  });
  const job = (jobId as number | null) ?? null;
  try {
    const summary = await createShopInvoiceDrafts({
      supabase, admin, editionId: edition.id, editionLabel: (edition.slug ?? "").toUpperCase() || edition.name,
      deliveryDate: edition.end_date ?? new Date().toISOString().slice(0, 10), dryRun, orgId: body.orgId, jobId: job,
    });
    if (job) await admin.rpc("finish_sync_job", { p_id: job, p_status: summary.errors > 0 ? "partial" : "ok", p_stats: { ...summary, runs: undefined }, p_error: summary.skipped ?? null });
    return NextResponse.json({ ok: true, job, ...summary });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (job) await admin.rpc("finish_sync_job", { p_id: job, p_status: "failed", p_stats: {}, p_error: message.slice(0, 500) });
    return NextResponse.json({ ok: false, job, error: message }, { status: 500 });
  }
}
