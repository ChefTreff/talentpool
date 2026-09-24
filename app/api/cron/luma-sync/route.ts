import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { hasLumaKey, lumaClient } from "@/lib/luma/client";
import { lumaWriteEnabled } from "@/lib/luma/events";
import { syncLuma } from "@/lib/luma/sync";

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
 * Abgleich Luma → Profil (TAL-007/008 Stufe 3): Events der letzten 60 Tage und
 * alle kommenden, je Event die Gäste. Idempotent; Protokoll in
 * `integration.sync_job` (system `luma`). Liest nur aus Luma — geschrieben
 * wird allein in unsere Datenbank, und das erst mit `LUMA_WRITE_ENABLED=true`
 * (K-30b). Vorher läuft der Abgleich als Trockenlauf: er liest Events und
 * Gäste und zählt, was er schreiben würde, ruft aber keine Sync-Funktion auf.
 * Ohne `LUMA_API_KEY` nichts.
 */
export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!hasLumaKey()) return NextResponse.json({ ok: true, dryRun: true, skipped: "LUMA_API_KEY fehlt" });

  const luma = lumaClient();
  const calendarId = process.env.LUMA_CALENDAR_ID?.trim() || null;
  if (!lumaWriteEnabled()) {
    try {
      const stats = await syncLuma({
        listEvents: (after) => luma.listEvents(after),
        listGuests: (id) => luma.listGuests(id),
        // Trockenlauf: nichts schreiben, jeden Gast als „nicht zugeordnet" zählen.
        rpc: async () => ({ data: { matched: false }, error: null }),
        calendarId,
      });
      return NextResponse.json({ ok: true, dryRun: true, stats });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ ok: false, dryRun: true, error: message.slice(0, 200) }, { status: 502 });
    }
  }

  const admin = createSupabaseAdminClient();
  const { data: jobId } = await admin.rpc("start_sync_job", {
    p_system: "luma",
    p_direction: "in",
    p_job_type: "luma.guests",
    p_triggered_by: "cron",
  });
  const job = (jobId as number | null) ?? null;
  try {
    const stats = await syncLuma({
      listEvents: (after) => luma.listEvents(after),
      listGuests: (id) => luma.listGuests(id),
      rpc: async (fn, args) => {
        const { data, error } = await admin.rpc(fn, args);
        return { data, error: error ? { message: error.message } : null };
      },
      calendarId,
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
