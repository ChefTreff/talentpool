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
  /** `{ text }` — was die Regie am Mikrofon tatsächlich stellt (LEAD-012, LEAD-031). */
  mic_assignments?: Record<string, unknown>;
  /** `{ text }` — Präsentation und Medien. */
  media?: Record<string, unknown>;
};

/** Beide Ansichten neu laden — sie zeigen dieselben Zeilen. */
function refresh() {
  revalidatePath("/admin/produktion");
  revalidatePath("/admin/regie");
  revalidatePath("/speaker-leads/regie");
}

export async function saveCue(input: CueInput): Promise<RegieResult<{ id: string }>> {
  await requireUser("/admin/produktion");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("upsert_regie_cue", { p_data: input });
  if (error) return fail(error);
  refresh();
  return { ok: true, data: { id: data as string } };
}

export async function deleteCue(id: string): Promise<RegieResult> {
  await requireUser("/admin/produktion");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("delete_regie_cue", { p_id: id });
  if (error) return fail(error);
  refresh();
  return { ok: true, data: undefined };
}

/**
 * Die Anweisungen eines Slots — aus der Liste der Stage Leads (LEAD-031).
 *
 * Nur die fünf Felder; Zeiten und Ablauf lehnt `set_regie_anweisungen` mit
 * `not_editable` ab. Gibt es zum Slot noch keinen Cue, legt die Funktion einen
 * mit den Zeiten des Slots an.
 */
export async function saveAnweisungen(
  slotId: string,
  data: Partial<Record<"people_on_stage" | "mic" | "media" | "mobiliar" | "notes", string>>,
): Promise<RegieResult<{ id: string }>> {
  await requireUser("/speaker-leads/regie");
  const supabase = await createSupabaseServerClient();
  const { data: id, error } = await supabase.rpc("set_regie_anweisungen", { p_slot_id: slotId, p_data: data });
  if (error) return fail(error);
  refresh();
  return { ok: true, data: { id: id as string } };
}
