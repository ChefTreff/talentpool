"use server";

import { revalidatePath } from "next/cache";
import { requireArea } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toRpcFailure } from "@/lib/rpc-error";

/**
 * Schreibwege der Produktion. Mit dem **Sitzungs-Client**, nicht service_role:
 * `is_production_team()` prüft in der Datenbank, und genau diese Prüfung wollen
 * wir hier — das Gate davor sortiert nur vor.
 */
export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; key: string; detail?: string };

function fail(error: unknown): { ok: false; key: string; detail?: string } {
  const f = toRpcFailure(error as never);
  if (f.key === "unknown" && f.raw) console.error("[produktion] RPC:", f.raw);
  return { ok: false, key: f.key, detail: f.detail };
}

const PATHS = ["/produktion", "/produktion/staende", "/produktion/bestellungen"] as const;
function revalidateAll() {
  for (const p of PATHS) revalidatePath(p);
}

async function client() {
  await requireArea("produktion", PATHS[0]);
  return createSupabaseServerClient();
}

export type CueInput = {
  id?: string;
  stage_id?: string;
  event_day_id?: string;
  slot_id?: string | null;
  cue_start?: string;
  cue_end?: string;
  sort_order?: number;
  action?: string;
  umbau_min?: string;
  moderation?: string;
  regie?: string;
  backstage?: string;
  mobiliar?: string;
  notes?: string;
};

export async function saveCue(input: CueInput): Promise<ActionResult<{ id: string }>> {
  const supabase = await client();
  const { data, error } = await supabase.rpc("upsert_regie_cue", { p_data: input });
  if (error) return fail(error);
  revalidateAll();
  return { ok: true, data: { id: data as string } };
}

export async function deleteCue(id: string): Promise<ActionResult> {
  const supabase = await client();
  const { error } = await supabase.rpc("delete_regie_cue", { p_id: id });
  if (error) return fail(error);
  revalidateAll();
  return { ok: true, data: undefined };
}

export async function setBoothCheck(input: {
  orgEditionId: string;
  sku: string;
  checked: boolean;
  note?: string | null;
}): Promise<ActionResult> {
  const supabase = await client();
  const { error } = await supabase.rpc("set_booth_service_check", {
    p_org_edition_id: input.orgEditionId,
    p_product_sku: input.sku,
    p_checked: input.checked,
    p_note: input.note ?? null,
  });
  if (error) return fail(error);
  revalidateAll();
  return { ok: true, data: undefined };
}
