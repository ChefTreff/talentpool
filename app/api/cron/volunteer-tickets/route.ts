import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { provisionVolunteerCoupons } from "@/lib/vivenu/volunteers";

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
 * Volunteer-Tickets (Welle 4 A6): je angenommenem Volunteer ein Coupon im
 * Undershop „Volunteers", danach die Erinnerung an die, die nach sieben Tagen
 * noch nicht eingelöst haben.
 *
 * `?profil=<id>` macht genau einen — für die Wiederholung nach einem Fehler.
 * Ohne `VIVENU_API_KEY` Trockenlauf; die Erinnerung läuft trotzdem, sie hängt
 * nicht an vivenu.
 */
export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const admin = createSupabaseAdminClient();
  const only = new URL(request.url).searchParams.get("profil")?.trim() || undefined;

  const { data: jobId, error: jobErr } = await admin.rpc("start_sync_job", {
    p_system: "vivenu",
    p_direction: "out",
    p_job_type: only ? "volunteer_coupon_single" : "volunteer_coupons",
    p_triggered_by: only ? "manual" : "cron",
  });
  if (jobErr) return NextResponse.json({ error: jobErr.message }, { status: 500 });
  const job = jobId as number;

  try {
    const summary = await provisionVolunteerCoupons(admin, job, only);
    const { data: reminded, error: remindErr } = await admin.rpc("remind_volunteer_tickets");
    if (remindErr) console.error("[cron/volunteer-tickets] Erinnerung:", remindErr.message);

    await admin.rpc("finish_sync_job", {
      p_id: job,
      p_status: summary.skipped ? "ok" : summary.errors > 0 ? "partial" : "ok",
      p_stats: { ...summary, runs: undefined, reminded: reminded ?? 0 },
      p_error: summary.skipped ?? null,
    });
    if (summary.skipped) console.warn("[cron/volunteer-tickets]", summary.skipped);
    return NextResponse.json({ ok: true, job, ...summary, reminded: reminded ?? 0 });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await admin.rpc("finish_sync_job", { p_id: job, p_status: "failed", p_stats: {}, p_error: message.slice(0, 500) });
    return NextResponse.json({ ok: false, job, error: message }, { status: 500 });
  }
}
