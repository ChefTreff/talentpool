import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { standFenster, type StandFenster } from "@/components/partner/standbuehne";

/** Zeile aus `my_partner_stages()`. */
export type PartnerStage = {
  stage_id: string;
  stage_name: string | null;
  stage_slug: string | null;
  event_id: string;
  event_slug: string | null;
  event_name: string | null;
  edition_id: string;
  org_id: string | null;
  org_name: string | null;
};

/** Die Bühnen, die diese Person als Partner bearbeitet (Rolle `standbuehne_editor`). */
export async function ladeEigeneBuehnen(): Promise<PartnerStage[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("my_partner_stages");
  return (data ?? []) as PartnerStage[];
}

/**
 * Zeitfenster je Bühne und Tag (PART-079), Schlüssel `stageId|dayId`.
 * `stage_day` ist für Angemeldete lesbar; ohne Zeile an einem Tag gilt nur das
 * Ende 19:00 — genau wie in `partner_booth_window`.
 */
export async function ladeFenster(stageIds: string[], dayIds: string[]): Promise<Record<string, StandFenster>> {
  if (stageIds.length === 0 || dayIds.length === 0) return {};
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("stage_day")
    .select("stage_id, event_day_id, open_from, open_to")
    .in("stage_id", stageIds)
    .in("event_day_id", dayIds);
  const rahmen = new Map(
    ((data ?? []) as { stage_id: string; event_day_id: string; open_from: string | null; open_to: string | null }[]).map(
      (r) => [`${r.stage_id}|${r.event_day_id}`, r],
    ),
  );
  const fenster: Record<string, StandFenster> = {};
  for (const stageId of stageIds) {
    for (const dayId of dayIds) {
      const r = rahmen.get(`${stageId}|${dayId}`);
      fenster[`${stageId}|${dayId}`] = standFenster(r?.open_from ?? null, r?.open_to ?? null);
    }
  }
  return fenster;
}
