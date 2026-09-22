import { NextResponse } from "next/server";
import { requireArea } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { istTrockenlauf } from "@/lib/products/dry-run";
import { syncSpeakers } from "@/lib/event-app/speakers";
import { hasSwapcardKey } from "@/lib/event-app/swapcard/client";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * EA2: bestätigte Speaker als Personen mit Speaker-Pass nach Swapcard.
 *
 * Body: `{ editionId?, dryRun? (Vorgabe true) }`. Gate `requireArea("admin")`
 * plus Rollenprüfung in der Datenbank; die Liste selbst prüft noch einmal.
 *
 * **Nur mit Einwilligung.** `event_app_speakers` liefert den Zustand je Person,
 * der Lauf schickt ausschliesslich `granted` — und meldet die Zurückgehaltenen
 * namentlich zurück, damit niemand unbemerkt fehlt.
 */
export async function POST(request: Request) {
  await requireArea("admin", "/admin/partner/integrationen");
  const supabase = await createSupabaseServerClient();
  const { data: team } = await supabase.rpc("is_partner_team");
  const { data: speakerTeam } = await supabase.rpc("is_speaker_team", { p_edition_id: null });
  if (!team && !speakerTeam) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as { editionId?: string; dryRun?: boolean };
  const dryRun = istTrockenlauf(body);

  const admin = createSupabaseAdminClient();
  const { data: jobId } = await admin.rpc("start_sync_job", {
    p_system: "swapcard", p_direction: "out",
    p_job_type: dryRun ? "speakers_preview" : "speakers", p_triggered_by: "admin",
  });
  const job = (jobId as number | null) ?? null;

  try {
    const summary = await syncSpeakers({
      admin, editionId: body.editionId ?? null, dryRun, hatSchluessel: hasSwapcardKey(),
    });
    if (job) {
      await admin.rpc("finish_sync_job", {
        p_id: job,
        p_status: summary.errors > 0 ? "partial" : "ok",
        // Namen bleiben aus dem Protokoll heraus: dort zählen die Zahlen, die
        // Namen stehen in der Antwort für den Menschen davor.
        p_stats: {
          ...summary, runs: undefined,
          zurueckgehalten: summary.zurueckgehalten.length,
          ohneFoto: summary.ohneFoto.length,
        },
        p_error: summary.skipped ?? null,
      });
    }
    return NextResponse.json({ ok: true, job, ...summary });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (job) await admin.rpc("finish_sync_job", { p_id: job, p_status: "failed", p_stats: {}, p_error: message.slice(0, 500) });
    return NextResponse.json({ ok: false, job, error: message }, { status: 500 });
  }
}
