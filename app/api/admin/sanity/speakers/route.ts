import { NextResponse } from "next/server";
import { requireAdminSection } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { istTrockenlauf } from "@/lib/products/dry-run";
import { speakerLauf, speakerSchreibenErlaubt } from "@/lib/sanity/speakers";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * SPK-046: Speaker für die Website als `portalSpeaker` nach Sanity (Kontrakt `docs/sanity-speaker-kontrakt.md`).
 *
 * Body: `{ dryRun? }` — **nur ein ausdrückliches `dryRun: false` schreibt** (`istTrockenlauf`). Gate
 * `requireAdminSection("speakers")` plus Speaker-Team in der Datenbank; Daten mit service_role erst danach.
 * Der Echtlauf braucht zusätzlich `SANITY_SPEAKERS_WRITE_ENABLED=true` (Konrad nach Freigabe durch das
 * Website-Team); ohne ihn entfernt er nur Dokumente, deren Tor zu ist (Weg hinaus), und schreibt nichts Neues.
 */
export async function POST(request: Request) {
  const ctx = await requireAdminSection("speakers", "/admin/speaker/website");
  const supabase = await createSupabaseServerClient();
  const { data: speakerTeam } = await supabase.rpc("is_speaker_team", { p_edition_id: null });
  if (!speakerTeam) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as { dryRun?: boolean };
  const dryRun = istTrockenlauf(body);
  if (!dryRun && !speakerSchreibenErlaubt()) {
    // Kein stiller Teil-Lauf: wer „Übertragen“ drückt, solange der Schalter fehlt, bekommt das gesagt.
    return NextResponse.json({ ok: false, error: "write_disabled" }, { status: 409 });
  }

  const admin = createSupabaseAdminClient();
  const { data: jobId } = await admin.rpc("start_sync_job", {
    p_system: "sanity",
    p_direction: "out",
    p_job_type: dryRun ? "speakers_preview" : "speakers",
    p_triggered_by: `manual:${ctx.personId ?? "?"}`,
  });
  const job = (jobId as number | null) ?? null;
  try {
    const lauf = await speakerLauf({ admin, dryRun });
    if (job) {
      await admin.rpc("finish_sync_job", {
        p_id: job,
        p_status: lauf.fehler.length > 0 ? "partial" : "ok",
        // Nur Zahlen ins Protokoll; die Namen stehen in der Antwort für den Menschen davor.
        p_stats: {
          personen: lauf.personen,
          anlegen: lauf.anlegen.length,
          aendern: lauf.aendern.length,
          unveraendert: lauf.unveraendert,
          entfernen: lauf.entfernen.length,
          zurueckgehalten: lauf.zurueckgehalten.length,
          geprueft: lauf.geprueft,
          geschrieben: lauf.geschrieben,
          entfernt: lauf.entfernt,
          fehler: lauf.fehler.length,
        },
        p_error: lauf.skipped ?? null,
      });
    }
    return NextResponse.json({ ok: true, job, ...lauf });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (job) await admin.rpc("finish_sync_job", { p_id: job, p_status: "failed", p_stats: {}, p_error: message.slice(0, 500) });
    return NextResponse.json({ ok: false, job, error: "run_failed" }, { status: 500 });
  }
}
