"use server";

import { revalidatePath } from "next/cache";
import { requireArea } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toRpcFailure } from "@/lib/rpc-error";

/**
 * Shuttle-Fahrten aus dem Lead-Portal (LEAD-011).
 *
 * Konrad am 17.09.: „Hier muss es ausnahmsweise auch einen Bereich im
 * Speaker-Leads Portal geben. Shuttle-Fahrten sollen sie auch anfordern
 * können." Wer für wen anfordern darf, entscheidet `can_request_shuttle` über
 * `can_manage_speaker` — hier steht keine zweite Regel daneben.
 *
 * **Freigeben kann das Lead-Portal nicht.** `confirm_shuttle` verlangt das
 * Speaker-Team; jede Fahrt von hier geht als Anfrage in den Admin.
 */
const PATH = "/speaker-leads/shuttle";

export type LeadShuttleResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; key: string; detail?: string };

function fail(error: unknown): { ok: false; key: string; detail?: string } {
  const f = toRpcFailure(error as never);
  if (f.key === "unknown" && f.raw) console.error("[leads/shuttle] RPC:", f.raw);
  return { ok: false, key: f.key, detail: f.detail };
}

async function client() {
  await requireArea("speaker-leads", PATH);
  return createSupabaseServerClient();
}

export async function requestShuttleForSpeaker(
  profileId: string,
  data: Record<string, unknown>,
): Promise<LeadShuttleResult> {
  const supabase = await client();
  const { error } = await supabase.rpc("request_shuttle", {
    p_profile_id: profileId,
    p_data: data,
  });
  if (error) return fail(error);
  revalidatePath(PATH);
  return { ok: true, data: undefined };
}

export async function cancelShuttleAsLead(bookingId: string): Promise<LeadShuttleResult> {
  const supabase = await client();
  const { error } = await supabase.rpc("cancel_shuttle", { p_booking_id: bookingId });
  if (error) return fail(error);
  revalidatePath(PATH);
  return { ok: true, data: undefined };
}
