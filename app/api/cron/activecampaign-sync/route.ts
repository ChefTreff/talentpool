import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { acClient, acListId, acWriteEnabled, hasAcKey } from "@/lib/activecampaign/client";
import { syncActiveCampaign } from "@/lib/activecampaign/sync";

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
 * Abgleich Portal ⇄ ActiveCampaign (TAL-009, K-43): Themen als Tags, Abmeldungen zurück als
 * Widerruf der Newsletter-Einwilligung. Protokoll in `integration.sync_job` (system
 * `activecampaign`). Ohne Schlüssel und Adresse passiert nichts („Verbindung fehlt“). Mit
 * Schlüssel, aber ohne `ACTIVECAMPAIGN_WRITE_ENABLED=true`, zählt der Lauf nur, was er täte: er
 * liest aus unserer Datenbank und ruft ActiveCampaign **nicht** auf — nichts wird geschrieben,
 * nichts gelöscht. Erst Konrads Freigabe schaltet das Schreiben frei.
 */
export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!hasAcKey()) return NextResponse.json({ ok: true, dryRun: true, skipped: "Verbindung fehlt (ACTIVECAMPAIGN_API_KEY/_URL)" });

  const admin = createSupabaseAdminClient();
  if (!acWriteEnabled()) {
    const [out, gone] = await Promise.all([
      admin.rpc("ac_sync_outbound", { p_limit: 200 }),
      admin.rpc("ac_sync_withdrawn", { p_limit: 200 }),
    ]);
    if (out.error || gone.error) return NextResponse.json({ ok: false, dryRun: true, error: "database" }, { status: 502 });
    const withdrawn = (gone.data ?? []) as { action: string }[];
    return NextResponse.json({
      ok: true,
      dryRun: true,
      stats: {
        wouldPush: (out.data ?? []).length,
        wouldUntagOrUnsubscribe: withdrawn.filter((w) => w.action !== "delete").length,
        wouldDelete: withdrawn.filter((w) => w.action === "delete").length,
      },
    });
  }

  const { data: jobId } = await admin.rpc("start_sync_job", {
    p_system: "activecampaign",
    p_direction: "out",
    p_job_type: "activecampaign.contacts",
    p_triggered_by: "cron",
  });
  const job = (jobId as number | null) ?? null;
  try {
    const stats = await syncActiveCampaign({
      ac: acClient(),
      rpc: async (fn, args) => {
        const { data, error } = await admin.rpc(fn, args);
        return { data, error: error ? { message: error.message } : null };
      },
      listId: acListId(),
    });
    if (job !== null) {
      await admin.rpc("finish_sync_job", { p_id: job, p_status: stats.errors > 0 ? "partial" : "ok", p_stats: stats, p_error: null });
    }
    return NextResponse.json({ ok: true, stats });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (job !== null) {
      await admin.rpc("finish_sync_job", { p_id: job, p_status: "failed", p_stats: {}, p_error: message.slice(0, 500) });
    }
    return NextResponse.json({ ok: false, error: message.slice(0, 200) }, { status: 502 });
  }
}
