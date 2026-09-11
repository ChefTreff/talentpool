import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { hasVivenuKey, listTickets } from "@/lib/vivenu/client";
import { isIngestable, toIngestPayload } from "@/lib/vivenu/tickets";

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
 * Sweep über die Tickets einer Edition — der verlässliche Weg neben dem
 * Webhook.
 *
 * vivenu gibt nach sieben vergeblichen Versuchen auf; was dabei verloren geht,
 * holt dieser Lauf. Er ist idempotent: `ingest_vivenu_ticket` schreibt je
 * vivenu-Ticket-Id und zählt Coupon-Einlösungen neu.
 *
 * `?edition=<slug|uuid>` grenzt ein, `?since=<ISO>` holt nur Geändertes,
 * `?limit=` begrenzt den Lauf. Ohne `VIVENU_API_KEY` Trockenlauf.
 */
export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const params = new URL(request.url).searchParams;
  const only = params.get("edition")?.trim() || null;
  const since = params.get("since")?.trim() || null;
  const limit = Math.min(Number(params.get("limit") ?? 500) || 500, 2000);

  const admin = createSupabaseAdminClient();
  const { data: editions, error } = await admin.rpc("vivenu_editions");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const targets = ((editions ?? []) as { edition_id: string; slug: string; vivenu_event_id: string }[])
    .filter((e) => !only || e.slug === only || e.edition_id === only);

  if (!hasVivenuKey()) {
    return NextResponse.json({
      ok: true,
      dryRun: true,
      skipped: "VIVENU_API_KEY fehlt",
      editions: targets.map((e) => e.slug),
    });
  }

  const { data: jobId } = await admin.rpc("start_sync_job", {
    p_system: "vivenu",
    p_direction: "in",
    p_job_type: "ticket_sweep",
    p_triggered_by: only ? "manual" : "cron",
  });
  const job = (jobId as number | null) ?? null;

  const stats = { editions: 0, tickets: 0, created: 0, updated: 0, unknown_event: 0, errors: 0 };
  try {
    for (const edition of targets) {
      stats.editions += 1;
      const tickets = await listTickets(edition.vivenu_event_id, { since, limit });
      for (const ticket of tickets.filter(isIngestable)) {
        stats.tickets += 1;
        const { data, error: rpcError } = await admin.rpc("ingest_vivenu_ticket", {
          p_data: toIngestPayload(ticket),
        });
        if (rpcError) {
          stats.errors += 1;
          await admin.rpc("record_sync_error", {
            p_job_id: job,
            p_object_type: "vivenu_ticket",
            p_object_id: String(ticket._id ?? ""),
            p_message: rpcError.message.slice(0, 500),
            p_payload: ticket as unknown as Record<string, unknown>,
          });
          continue;
        }
        const outcome = String((data as { outcome?: string } | null)?.outcome ?? "");
        if (outcome === "created") stats.created += 1;
        else if (outcome === "updated") stats.updated += 1;
        else if (outcome === "unknown_event") stats.unknown_event += 1;
      }
    }
    if (job) {
      await admin.rpc("finish_sync_job", {
        p_id: job,
        p_status: stats.errors > 0 ? "partial" : "ok",
        p_stats: stats,
        p_error: null,
      });
    }
    return NextResponse.json({ ok: true, job, ...stats });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (job) {
      await admin.rpc("finish_sync_job", { p_id: job, p_status: "failed", p_stats: stats, p_error: message.slice(0, 500) });
    }
    return NextResponse.json({ ok: false, job, error: message, ...stats }, { status: 500 });
  }
}
