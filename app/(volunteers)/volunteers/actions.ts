"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toRpcFailure } from "@/lib/rpc-error";
import { consentRowsToWrite, type ConsentState } from "@/lib/consent";

/**
 * Volunteer-Bereich. Alles über die RPCs aus A1 mit dem Session-Client.
 *
 * Das Gate ist hier bewusst nur „angemeldet": bewerben darf sich jede Person
 * mit Login, die Rolle `volunteer` entsteht erst mit der Zusage. Was jemand
 * sehen und ändern darf, entscheidet die Datenbank — `my_*` kennt nur die
 * eigene Person, die Team-RPCs verlangen `is_volunteer_team()`.
 */
const PATH = "/volunteers";

export type VolunteerResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; key: string; detail?: string };

function fail(error: unknown): { ok: false; key: string; detail?: string } {
  const f = toRpcFailure(error as never);
  if (f.key === "unknown" && f.raw) console.error("[volunteers] RPC:", f.raw);
  return { ok: false, key: f.key, detail: f.detail };
}

async function client() {
  await requireUser(PATH);
  return createSupabaseServerClient();
}

function refresh() {
  revalidatePath(PATH);
  revalidatePath(`${PATH}/schichten`);
}

/**
 * Einwilligungen schreiben — versioniert, und nur was sich geändert hat
 * (`lib/consent.ts`). `apply_volunteer` prüft anschließend selbst, ob
 * Bedingungen und Datenschutz zugestimmt vorliegen.
 */
async function saveConsents(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  consents: Record<string, boolean>,
): Promise<{ ok: true } | { ok: false; key: string }> {
  const { data: personId } = await supabase.rpc("current_person_id");
  if (!personId) return { ok: false, key: "not_authenticated" };
  const { data: current } = await supabase
    .from("consent_current")
    .select("consent_type, granted, version");
  const rows = consentRowsToWrite(
    (current ?? []) as ConsentState[],
    consents,
    personId as string,
    "volunteers",
  );
  if (rows.length === 0) return { ok: true };
  const { error } = await supabase.from("consent_record").insert(rows);
  if (error) return { ok: false, key: toRpcFailure(error).key };
  return { ok: true };
}

export async function applyVolunteer(input: {
  birthdate: string;
  shirtSize: string | null;
  areas: string[];
  dayPrefs: string[];
  availability: string;
  buddyNote: string;
  consents: Record<string, boolean>;
}): Promise<VolunteerResult<{ id: string }>> {
  const supabase = await client();
  const consent = await saveConsents(supabase, input.consents);
  if (!consent.ok) return { ok: false, key: consent.key };

  const { data, error } = await supabase.rpc("apply_volunteer", {
    p_data: {
      birthdate: input.birthdate,
      shirt_size: input.shirtSize,
      areas: input.areas,
      day_prefs: input.dayPrefs,
      // Freitext statt Raster: was jemand kann, steht in einem Satz besser
      // als in zehn Haken (Datenminimierung, Arbeitsauftrag C).
      availability: input.availability.trim() ? { note: input.availability.trim() } : null,
      buddy_note: input.buddyNote,
    },
  });
  if (error) return fail(error);
  refresh();
  return { ok: true, data: { id: data as string } };
}

export async function updateMyVolunteerProfile(input: {
  shirtSize?: string | null;
  areas?: string[];
  dayPrefs?: string[];
  availability?: string;
  buddyNote?: string;
  withdraw?: boolean;
}): Promise<VolunteerResult> {
  const supabase = await client();
  const data: Record<string, unknown> = {};
  if (input.shirtSize !== undefined) data.shirt_size = input.shirtSize;
  if (input.areas !== undefined) data.areas = input.areas;
  if (input.dayPrefs !== undefined) data.day_prefs = input.dayPrefs;
  if (input.availability !== undefined) {
    data.availability = input.availability.trim() ? { note: input.availability.trim() } : null;
  }
  if (input.buddyNote !== undefined) data.buddy_note = input.buddyNote;
  if (input.withdraw) data.status = "withdrawn";

  const { error } = await supabase.rpc("update_my_volunteer_profile", { p_data: data });
  if (error) return fail(error);
  refresh();
  return { ok: true, data: undefined };
}

export async function confirmShift(assignmentId: string): Promise<VolunteerResult> {
  const supabase = await client();
  const { error } = await supabase.rpc("confirm_shift", { p_assignment_id: assignmentId });
  if (error) return fail(error);
  refresh();
  return { ok: true, data: undefined };
}

export async function declineShift(
  assignmentId: string,
  reason: string,
): Promise<VolunteerResult> {
  const supabase = await client();
  const { error } = await supabase.rpc("decline_shift", {
    p_assignment_id: assignmentId,
    p_reason: reason.trim() ? reason.trim() : null,
  });
  if (error) return fail(error);
  refresh();
  return { ok: true, data: undefined };
}
