import { NextResponse } from "next/server";
import { requireAdminSection } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { istTrockenlauf } from "@/lib/products/dry-run";
import { syncSponsors } from "@/lib/event-app/sponsors";
import { deleteSponsors } from "@/lib/event-app/swapcard/adapter";
import { hasSwapcardKey } from "@/lib/event-app/swapcard/client";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Die Logo-Wand in Swapcard („Sponsoring & Werbung") aus dem Portal füllen.
 *
 * Body: `{ editionId?, dryRun? (Vorgabe true), entfernen?: string[] }`.
 *
 * Zwei Dinge in einer Route, weil sie zusammengehören: Der 27er-Event ist ein
 * Duplikat von 2026 und trägt dessen Wand noch — 54 Einträge ohne Namen. Wer
 * unsere anlegt, ohne die alten wegzunehmen, verdoppelt die Wand. Der
 * Trockenlauf zählt beides auf: was von uns käme und was dort schon steht.
 *
 * **`entfernen` löscht endgültig.** Swapcard kennt für Sponsoren keinen
 * Papierkorb. Die Route nimmt deshalb nur Kennungen, die sie selbst als fremden
 * Bestand gemeldet hat, verlangt `dryRun: false` und schreibt die vollständige
 * Liste ins Audit-Log. Ohne ausdrückliche Kennungen wird nichts entfernt.
 */
export async function POST(request: Request) {
  const ctx = await requireAdminSection("partner", "/admin/partner/integrationen");
  const supabase = await createSupabaseServerClient();
  const { data: team } = await supabase.rpc("is_partner_team");
  if (!team) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as {
    editionId?: string;
    dryRun?: boolean;
    entfernen?: unknown;
  };
  const dryRun = istTrockenlauf(body);
  const entfernen = Array.isArray(body.entfernen)
    ? body.entfernen.filter((i): i is string => typeof i === "string" && i.trim() !== "")
    : [];

  const admin = createSupabaseAdminClient();
  const { data: jobId } = await admin.rpc("start_sync_job", {
    p_system: "swapcard", p_direction: "out",
    p_job_type: dryRun ? "sponsors_preview" : "sponsors", p_triggered_by: "admin",
  });
  const job = (jobId as number | null) ?? null;

  try {
    const summary = await syncSponsors({
      admin, editionId: body.editionId ?? null, dryRun, hatSchluessel: hasSwapcardKey(),
    });

    // Aufräumen erst nach dem Lauf: die Liste `fremd` entsteht dort, und nur was
    // darin steht, darf überhaupt entfernt werden.
    let entfernt = 0;
    if (!dryRun && entfernen.length > 0 && summary.eventId) {
      const erlaubt = new Set(summary.fremd.map((f) => f.id));
      const ids = entfernen.filter((id) => erlaubt.has(id));
      if (ids.length > 0) {
        await deleteSponsors(summary.eventId, ids);
        entfernt = ids.length;
        await logAudit({
          action: "swapcard.sponsors_removed",
          objectType: "org_edition",
          objectId: summary.eventId,
          after: {
            count: ids.length,
            sponsors: summary.fremd.filter((f) => ids.includes(f.id)),
            by: ctx.user?.email ?? "admin",
          },
        });
      }
    }

    if (job) {
      await admin.rpc("finish_sync_job", {
        p_id: job,
        p_status: summary.errors > 0 ? "partial" : "ok",
        p_stats: { ...summary, runs: undefined, fremd: summary.fremd.length, entfernt },
        p_error: summary.skipped ?? null,
      });
    }
    return NextResponse.json({ ok: true, job, entfernt, ...summary });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (job) await admin.rpc("finish_sync_job", { p_id: job, p_status: "failed", p_stats: {}, p_error: message.slice(0, 500) });
    return NextResponse.json({ ok: false, job, error: message }, { status: 500 });
  }
}
