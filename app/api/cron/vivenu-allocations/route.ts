import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { provisionAllocations } from "@/lib/vivenu/allocations";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * Welle 3 A6: Ticket-Kontingente in vivenu anlegen (Undershop je Partner, Coupon je Pass-Typ). Läuft alle 30 Minuten (vercel.json) und holt alles,
 * was `ticket_allocations_pending()` liefert; `?allocation=<id>` verarbeitet genau ein Kontingent (Wiederholung nach einem Fehler). Nur mit `CRON_SECRET`,
 * service_role nach der Prüfung. Ohne `VIVENU_API_KEY` Trockenlauf.
 */
export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const admin = createSupabaseAdminClient();
  const only = new URL(request.url).searchParams.get("allocation")?.trim() || undefined;
  const { data: jobId, error: jobErr } = await admin.rpc("start_sync_job", {
    p_system: "vivenu", p_direction: "out", p_job_type: only ? "allocation_single" : "allocations", p_triggered_by: only ? "manual" : "cron",
  });
  if (jobErr) return NextResponse.json({ error: jobErr.message }, { status: 500 });
  const job = jobId as number;
  try {
    const summary = await provisionAllocations(admin, job, only);
    const status = summary.skipped ? "ok" : summary.errors > 0 ? "partial" : "ok";
    await admin.rpc("finish_sync_job", { p_id: job, p_status: status, p_stats: { ...summary, runs: undefined }, p_error: summary.skipped ?? null });
    if (summary.skipped) console.warn("[vivenu]", summary.skipped);
    return NextResponse.json({ ok: true, job, ...summary });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await admin.rpc("finish_sync_job", { p_id: job, p_status: "failed", p_stats: {}, p_error: message.slice(0, 500) });
    return NextResponse.json({ ok: false, job, error: message }, { status: 500 });
  }
}
