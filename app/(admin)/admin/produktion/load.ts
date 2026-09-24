import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { BoothItem, OpenSlot, RegieCue, SupplierRow } from "./types";

/**
 * Bühnen und Tage der laufenden Edition — die beiden Achsen der Regie.
 *
 * Gelesen mit dem Sitzungs-Client; die RPCs dahinter prüfen `is_production_team()`
 * selbst. Fehlt die Migration 0082 noch, kommt ein Fehler zurück statt eines
 * Absturzes: die Seite zeigt dann den Leerzustand.
 */
export type ProductionAxes = {
  editionId: string | null;
  stages: { id: string; name: string; event_id: string }[];
  days: { id: string; day_date: string; label_de: string | null; label_en: string | null; event_id: string }[];
};

export async function loadAxes(): Promise<ProductionAxes> {
  const supabase = await createSupabaseServerClient();
  const { data: editions } = await supabase
    .from("event")
    .select("id")
    .eq("is_edition", true)
    .order("start_date", { ascending: false })
    .limit(1);
  const editionId = editions?.[0]?.id ?? null;
  if (!editionId) return { editionId: null, stages: [], days: [] };

  const { data: events } = await supabase
    .from("event")
    .select("id")
    .or(`id.eq.${editionId},edition_id.eq.${editionId}`);
  const eventIds = (events ?? []).map((e) => e.id as string);

  const [{ data: stages }, { data: days }] = await Promise.all([
    supabase.from("stage").select("id, name, event_id").in("event_id", eventIds).eq("active", true).order("sort_order"),
    supabase.from("event_day").select("id, day_date, label_de, label_en, event_id").in("event_id", eventIds).order("day_date"),
  ]);

  return {
    editionId,
    stages: (stages ?? []) as ProductionAxes["stages"],
    days: (days ?? []) as ProductionAxes["days"],
  };
}

export async function loadRegie(stageId: string, dayId: string): Promise<{ cues: RegieCue[]; open: OpenSlot[] }> {
  const supabase = await createSupabaseServerClient();
  const [{ data: cues, error: cueErr }, { data: open }] = await Promise.all([
    supabase.rpc("regie_view", { p_stage_id: stageId, p_event_day_id: dayId }),
    supabase.rpc("regie_open_slots", { p_stage_id: stageId, p_event_day_id: dayId }),
  ]);
  if (cueErr) console.error("[produktion] regie_view:", cueErr.message);
  return { cues: (cues ?? []) as RegieCue[], open: (open ?? []) as OpenSlot[] };
}

export async function loadBooths(editionId: string): Promise<BoothItem[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("booth_checklist", { p_edition_id: editionId, p_org_id: null });
  if (error) console.error("[produktion] booth_checklist:", error.message);
  return (data ?? []) as BoothItem[];
}

export async function loadSuppliers(editionId: string, supplier?: string): Promise<SupplierRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("supplier_order_list", {
    p_edition_id: editionId,
    p_supplier: supplier ?? null,
  });
  if (error) console.error("[produktion] supplier_order_list:", error.message);
  return (data ?? []) as SupplierRow[];
}
