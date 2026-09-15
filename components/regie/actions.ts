"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toRpcFailure } from "@/lib/rpc-error";

/**
 * Regie schreiben — aus der Produktion **und** aus dem Lead-Portal.
 *
 * Das Gate ist bewusst nur `requireUser`: **wer an welcher Bühne arbeiten
 * darf, entscheidet `can_edit_regie` in der Datenbank** (Migration 0101) —
 * Produktion überall, Speaker-Lead an seiner Bühne. Ein Bereichs-Gate hier
 * wäre eine zweite Regel neben der ersten und würde entweder das Lead-Portal
 * aussperren oder die Prüfung verdoppeln.
 */
export type RegieResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; key: string; detail?: string };

function fail(error: unknown): { ok: false; key: string; detail?: string } {
  const f = toRpcFailure(error as never);
  if (f.key === "unknown" && f.raw) console.error("[regie] RPC:", f.raw);
  return { ok: false, key: f.key, detail: f.detail };
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

/** Beide Ansichten neu laden — sie zeigen dieselben Zeilen. */
function refresh() {
  revalidatePath("/produktion");
  revalidatePath("/speaker-leads/regie");
}

export async function saveCue(input: CueInput): Promise<RegieResult<{ id: string }>> {
  await requireUser("/produktion");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("upsert_regie_cue", { p_data: input });
  if (error) return fail(error);
  refresh();
  return { ok: true, data: { id: data as string } };
}

export async function deleteCue(id: string): Promise<RegieResult> {
  await requireUser("/produktion");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("delete_regie_cue", { p_id: id });
  if (error) return fail(error);
  refresh();
  return { ok: true, data: undefined };
}
