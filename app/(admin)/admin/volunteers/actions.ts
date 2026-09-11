"use server";

import { revalidatePath } from "next/cache";
import { requireArea } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toRpcFailure } from "@/lib/rpc-error";

/**
 * Volunteer-Admin. Alles über die Team-RPCs aus A1 mit dem Session-Client;
 * sie prüfen `is_volunteer_team()` selbst (Admin, `area_lead_volunteers`,
 * `volunteer_lead`). `requireArea("admin")` davor hält Fremde von der Route
 * fern, mehr nicht — wer nicht zum Volunteer-Team gehört, bekommt 42501 und
 * die Seite sagt, woran es liegt.
 */
const PATH = "/admin/volunteers";

export type AdminResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; key: string; detail?: string };

function fail(error: unknown): { ok: false; key: string; detail?: string } {
  const f = toRpcFailure(error as never);
  if (f.key === "unknown" && f.raw) console.error("[admin/volunteers] RPC:", f.raw);
  return { ok: false, key: f.key, detail: f.detail };
}

async function client() {
  await requireArea("admin", PATH);
  return createSupabaseServerClient();
}

function refresh() {
  revalidatePath(PATH);
  revalidatePath(`${PATH}/schichten`);
}

export async function setVolunteerStatus(
  profileId: string,
  status: string,
  note: string,
): Promise<AdminResult> {
  const supabase = await client();
  const { error } = await supabase.rpc("set_volunteer_status", {
    p_profile_id: profileId,
    p_status: status,
    p_note: note.trim() ? note.trim() : null,
  });
  if (error) return fail(error);
  refresh();
  return { ok: true, data: undefined };
}

export async function saveShift(data: Record<string, unknown>): Promise<AdminResult<{ id: string }>> {
  const supabase = await client();
  const { data: id, error } = await supabase.rpc("upsert_shift", { p_data: data });
  if (error) return fail(error);
  refresh();
  return { ok: true, data: { id: id as string } };
}

/**
 * Zuteilen. Ohne `status` entscheidet der Platz: ist die Schicht voll, landet
 * die Person auf der Warteliste — das ist keine Fehlbedienung, sondern der
 * gewollte Weg (E9).
 */
export async function assignShift(
  shiftId: string,
  personId: string,
  status?: "assigned" | "waitlisted",
): Promise<AdminResult<{ id: string }>> {
  const supabase = await client();
  const { data, error } = await supabase.rpc("assign_shift", {
    p_shift_id: shiftId,
    p_person_id: personId,
    p_status: status ?? null,
  });
  if (error) return fail(error);
  refresh();
  return { ok: true, data: { id: data as string } };
}

export async function unassignShift(assignmentId: string): Promise<AdminResult> {
  const supabase = await client();
  const { error } = await supabase.rpc("unassign_shift", { p_assignment_id: assignmentId });
  if (error) return fail(error);
  refresh();
  return { ok: true, data: undefined };
}
