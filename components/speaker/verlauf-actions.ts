"use server";

import { revalidatePath } from "next/cache";
import { requireAnyArea } from "@/lib/auth";
import { toRpcFailure } from "@/lib/rpc-error";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { VerlaufEintrag } from "@/lib/speaker/verlauf";

/**
 * Verlauf der Speaker-Pipeline (LEAD-039 Schnitt 2) — dieselben Wege für das
 * Fenster der Speaker-Leads und das Admin-Detail. Wer was darf, entscheiden die
 * RPCs (`can_manage_speaker`, Autor oder Team); hier wird nur verhindert, dass
 * jemand ohne einen der beiden Bereiche überhaupt ankommt.
 */
export type VerlaufResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; key: string; detail?: string };

function fail(error: unknown): { ok: false; key: string; detail?: string } {
  const f = toRpcFailure(error as never);
  if (f.key === "unknown" && f.raw) console.error("[speaker/verlauf] RPC:", f.raw);
  return { ok: false, key: f.key, detail: f.detail };
}

async function client() {
  await requireAnyArea(["admin", "speaker-leads"], "/speaker-leads");
  return createSupabaseServerClient();
}

/** Pipeline, Bestätigte, Admin-Liste und das Detail zeigen den neuen Stand. */
function refresh(profileId: string) {
  revalidatePath("/speaker-leads");
  revalidatePath("/speaker-leads/pipeline");
  revalidatePath("/speaker-leads/bestaetigt");
  revalidatePath("/admin/speaker");
  revalidatePath(`/admin/speaker/${profileId}`);
  revalidatePath("/admin/speaker/verlauf");
}

export async function ladeVerlauf(profileId: string): Promise<VerlaufResult<VerlaufEintrag[]>> {
  const supabase = await client();
  const { data, error } = await supabase.rpc("speaker_activities", { p_profile_id: profileId });
  if (error) return fail(error);
  return { ok: true, data: (data ?? []) as VerlaufEintrag[] };
}

export async function eintragen(
  profileId: string,
  input: { kind: string; body: string; occurredAt?: string | null; dueOn?: string | null; assigneeId?: string | null },
): Promise<VerlaufResult<{ id: string }>> {
  const supabase = await client();
  const { data, error } = await supabase.rpc("add_speaker_activity", {
    p_profile_id: profileId,
    p_data: {
      kind: input.kind,
      body: input.body,
      ...(input.occurredAt ? { occurred_at: input.occurredAt } : {}),
      ...(input.kind === "task" ? { due_on: input.dueOn ?? "", assignee_person_id: input.assigneeId ?? "" } : {}),
    },
  });
  if (error) return fail(error);
  refresh(profileId);
  return { ok: true, data: { id: data as string } };
}

export async function aendern(
  profileId: string,
  id: string,
  input: { body?: string; dueOn?: string; assigneeId?: string },
): Promise<VerlaufResult> {
  const supabase = await client();
  const { error } = await supabase.rpc("update_speaker_activity", {
    p_id: id,
    p_data: {
      ...(input.body !== undefined ? { body: input.body } : {}),
      ...(input.dueOn !== undefined ? { due_on: input.dueOn } : {}),
      ...(input.assigneeId !== undefined ? { assignee_person_id: input.assigneeId } : {}),
    },
  });
  if (error) return fail(error);
  refresh(profileId);
  return { ok: true, data: undefined };
}

export async function erledigen(profileId: string, id: string, done: boolean): Promise<VerlaufResult> {
  const supabase = await client();
  const { error } = await supabase.rpc("set_speaker_activity_done", { p_id: id, p_done: done });
  if (error) return fail(error);
  refresh(profileId);
  return { ok: true, data: undefined };
}

export async function loeschen(profileId: string, id: string): Promise<VerlaufResult> {
  const supabase = await client();
  const { error } = await supabase.rpc("delete_speaker_activity", { p_id: id });
  if (error) return fail(error);
  refresh(profileId);
  return { ok: true, data: undefined };
}
