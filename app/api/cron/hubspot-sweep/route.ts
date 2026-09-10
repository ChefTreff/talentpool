import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { searchDealsInStage, HubspotError } from "@/lib/hubspot/client";
import { ingestDeal } from "@/lib/hubspot/ingest";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
/** Deals je Lauf — mehr holt die nächste Nacht; hält den Lauf unter der Funktionslaufzeit. */
const MAX_PER_RUN = 25;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * Nächtlicher Abgleich (Vercel Cron, vercel.json): alle Deals in der Phase „Onboarding
 * Automation“ jeder Edition gegen `partner_deal` — was der Webhook verpasst hat, wird nachgeholt.
 * Mit `?deal=<id>` verarbeitet die Route genau einen Deal (erster Test, Wiederholung nach einem
 * Gate-Fehler); dabei wird die Phase nicht zurückgesetzt, weil der Deal dann meist schon dort steht,
 * wo das Sales-Team ihn haben will. Nur mit `CRON_SECRET`, service_role nach der Prüfung.
 */
export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const admin = createSupabaseAdminClient();
  const single = new URL(request.url).searchParams.get("deal")?.trim();

  const { data: jobId, error: jobErr } = await admin.rpc("start_sync_job", {
    p_system: "hubspot",
    p_direction: "in",
    p_job_type: single ? "deal_single" : "deal_sweep",
    p_triggered_by: single ? "manual" : "cron",
  });
  if (jobErr) return NextResponse.json({ error: jobErr.message }, { status: 500 });
  const job = jobId as number;

  const stats = { editions: 0, deals: 0, checked: 0, ingested: 0, already: 0, gate_failed: 0, errors: 0 };
  const runs: { dealId: string; outcome: string; detail?: string }[] = [];

  async function runDeal(dealId: string, resetStage: boolean) {
    try {
      const run = await ingestDeal(admin, dealId, { jobId: job, resetStage });
      stats[run.outcome] += 1;
      runs.push({
        dealId,
        outcome: run.outcome,
        detail: run.result.ok ? undefined : run.result.errors.join(", "),
      });
    } catch (e) {
      stats.errors += 1;
      const message = e instanceof Error ? e.message : String(e);
      runs.push({ dealId, outcome: "error", detail: message.slice(0, 300) });
      await admin.rpc("record_sync_error", {
        p_job_id: job,
        p_object_type: "hubspot_deal",
        p_object_id: dealId,
        p_message: message.slice(0, 500),
        p_payload: e instanceof HubspotError ? { status: e.status, path: e.path } : null,
      });
    }
  }

  try {
    if (single) {
      stats.deals = 1;
      stats.checked = 1;
      await runDeal(single, false);
    } else {
      const { data: editions } = await admin.rpc("hubspot_editions");
      for (const ed of (editions ?? []) as { edition_id: string; slug: string; stage_id: string }[]) {
        stats.editions += 1;
        const deals = await searchDealsInStage(ed.stage_id);
        stats.deals += deals.length;
        const ids = deals.map((d) => d.id);
        const { data: done } = await admin.rpc("hubspot_deals_ingested", { p_deal_ids: ids });
        const doneSet = new Set((done ?? []) as string[]);
        for (const id of ids.filter((x) => !doneSet.has(x))) {
          if (stats.checked >= MAX_PER_RUN) break;
          stats.checked += 1;
          await runDeal(id, true);
        }
      }
    }
    const status = stats.errors > 0 ? "partial" : "ok";
    await admin.rpc("finish_sync_job", { p_id: job, p_status: status, p_stats: stats, p_error: null });
    return NextResponse.json({ ok: true, job, stats, runs });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await admin.rpc("finish_sync_job", { p_id: job, p_status: "failed", p_stats: stats, p_error: message.slice(0, 500) });
    return NextResponse.json({ ok: false, job, stats, runs, error: message }, { status: 500 });
  }
}
