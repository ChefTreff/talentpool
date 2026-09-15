import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { OpenSlot, RegieCue, RegieStage } from "./types";

export type RegieDay = {
  id: string;
  day_date: string;
  label_de: string | null;
  label_en: string | null;
  event_id: string;
};

/**
 * Bühnen und Tage, an denen die anfragende Person Regie machen darf.
 *
 * Anders als `loadAxes()` in der Produktion fragt das hier **nicht** alle
 * Bühnen der Edition ab, sondern `my_regie_stages()` — die Auswahl im
 * Lead-Portal soll nicht anbieten, was beim Klick mit 42501 antwortet.
 */
export async function loadRegieAxes(): Promise<{ stages: RegieStage[]; days: RegieDay[] }> {
  const supabase = await createSupabaseServerClient();
  const { data: stageRows } = await supabase.rpc("my_regie_stages");
  const stages = (stageRows ?? []) as RegieStage[];
  if (stages.length === 0) return { stages, days: [] };

  const eventIds = [...new Set(stages.map((s) => s.event_id))];
  const { data: days } = await supabase
    .from("event_day")
    .select("id, day_date, label_de, label_en, event_id")
    .in("event_id", eventIds)
    .order("day_date");
  return { stages, days: (days ?? []) as RegieDay[] };
}

export async function loadRegieCues(
  stageId: string,
  dayId: string,
): Promise<{ cues: RegieCue[]; open: OpenSlot[] }> {
  const supabase = await createSupabaseServerClient();
  const [{ data: cues, error }, { data: open }] = await Promise.all([
    supabase.rpc("regie_view", { p_stage_id: stageId, p_event_day_id: dayId }),
    supabase.rpc("regie_open_slots", { p_stage_id: stageId, p_event_day_id: dayId }),
  ]);
  if (error) console.error("[regie] regie_view:", error.message);
  return { cues: (cues ?? []) as RegieCue[], open: (open ?? []) as OpenSlot[] };
}
