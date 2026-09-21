"use server";

import { revalidatePath } from "next/cache";
import { requireArea } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toRpcFailure } from "@/lib/rpc-error";

/**
 * Hotel und Shuttle. Status und Consent prüft `book_hospitality` selbst und
 * meldet `not_eligible` mit dem Grund im Detail — die Oberfläche zeigt vorher
 * schon, woran es liegt, entscheidet aber nichts.
 */
const PATH = "/speaker/travel";

export type TravelResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; key: string; detail?: string };

function fail(error: unknown): { ok: false; key: string; detail?: string } {
  const f = toRpcFailure(error as never);
  if (f.key === "unknown" && f.raw) console.error("[speaker/travel] RPC:", f.raw);
  return { ok: false, key: f.key, detail: f.detail };
}

async function client() {
  await requireArea("speaker", PATH);
  return createSupabaseServerClient();
}

function refresh() {
  revalidatePath(PATH);
  revalidatePath("/speaker");
}

/** Liefert `requested` oder `waitlisted` — beides ist ein Erfolg. */
export async function bookHospitality(
  quotaId: string,
  details: Record<string, string>,
  guests: number,
): Promise<TravelResult<{ id: string; status: string }>> {
  const supabase = await client();
  const { data, error } = await supabase.rpc("book_hospitality", {
    p_quota_id: quotaId,
    p_details: details,
    p_guests: guests,
  });
  if (error) return fail(error);
  refresh();
  const result = (data ?? {}) as { id?: string; status?: string };
  return { ok: true, data: { id: result.id ?? "", status: result.status ?? "requested" } };
}

export async function cancelHospitality(bookingId: string): Promise<TravelResult> {
  const supabase = await client();
  const { error } = await supabase.rpc("cancel_hospitality", { p_booking_id: bookingId });
  if (error) return fail(error);
  refresh();
  return { ok: true, data: undefined };
}

/**
 * An- und Abreise. Speaker und Assistenz dürfen beide — dieselbe Grenze wie
 * bei Hotel und Shuttle; `set_my_speaker_travel` prüft es noch einmal und
 * schreibt ins Protokoll, wenn die Assistenz gespeichert hat.
 */
export async function saveTravel(data: Record<string, unknown>): Promise<TravelResult> {
  const supabase = await client();
  const { error } = await supabase.rpc("set_my_speaker_travel", { p_data: data });
  if (error) return fail(error);
  refresh();
  return { ok: true, data: undefined };
}

/**
 * Eine Shuttle-Fahrt anfordern (SPK-016).
 *
 * Status ist immer `requested`; freigegeben wird im Speaker-Admin. Die
 * Obergrenze von fünf Fahrten prüft `request_shuttle` selbst und antwortet mit
 * P0001 `shuttle_limit` — die Oberfläche blendet das Begründungsfeld nur
 * rechtzeitig ein, sie entscheidet nicht.
 */
export async function requestShuttle(
  profileId: string,
  data: Record<string, unknown>,
): Promise<TravelResult<{ id: string }>> {
  const supabase = await client();
  const { data: res, error } = await supabase.rpc("request_shuttle", {
    p_profile_id: profileId,
    p_data: data,
  });
  if (error) return fail(error);
  refresh();
  return { ok: true, data: { id: (res as { id?: string } | null)?.id ?? "" } };
}

export async function cancelShuttle(bookingId: string): Promise<TravelResult> {
  const supabase = await client();
  const { error } = await supabase.rpc("cancel_shuttle", { p_booking_id: bookingId });
  if (error) return fail(error);
  refresh();
  return { ok: true, data: undefined };
}
