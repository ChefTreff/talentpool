"use server";

import { revalidatePath } from "next/cache";
import { requireArea } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { consentRowsToWrite, type ConsentState } from "@/lib/consent";
import { toRpcFailure } from "@/lib/rpc-error";

/**
 * Speaker-Portal. Alles über die RPCs aus Migration 0025 mit dem
 * Session-Client: sie kennen die Feld-Whitelist und die Grenzen der Assistenz.
 * `requireArea("speaker")` davor hält Fremde von der Route fern.
 */
const PATH = "/speaker";

export type SpeakerResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; key: string; detail?: string };

function fail(error: unknown): { ok: false; key: string; detail?: string } {
  const f = toRpcFailure(error as never);
  if (f.key === "unknown" && f.raw) console.error("[speaker] RPC:", f.raw);
  return { ok: false, key: f.key, detail: f.detail };
}

async function client() {
  await requireArea("speaker", PATH);
  return createSupabaseServerClient();
}

function refresh() {
  revalidatePath(PATH);
  revalidatePath(`${PATH}/profil`);
}

/**
 * Profil speichern. Was hier ankommt, ist nicht automatisch erlaubt — die RPC
 * übernimmt nur ihre Whitelist und ignoriert den Rest. Deshalb steht hier
 * keine zweite Prüfung, die auseinanderlaufen könnte.
 */
export async function saveSpeakerProfile(
  data: Record<string, unknown>,
): Promise<SpeakerResult> {
  const supabase = await client();
  const { error } = await supabase.rpc("update_my_speaker_profile", { p_data: data });
  if (error) return fail(error);
  refresh();
  return { ok: true, data: undefined };
}

/**
 * Einwilligungen. Nicht über die Profil-RPC, sondern direkt in
 * `consent_record` — und immer für die eigene Person (Policy `cr_self_ins`).
 *
 * Deshalb muss die Assistenz hier abprallen: Ihr Aufruf würde nicht scheitern,
 * sondern eine Einwilligung **auf ihren eigenen Namen** anlegen — die Zustimmung
 * stünde bei der falschen Person. Das Formular zeigt den Block nur lesend; der
 * Riegel gehört trotzdem hierher, denn eine Server-Action ist eine Route.
 */
export async function saveSpeakerConsents(
  consents: Record<string, boolean>,
): Promise<SpeakerResult> {
  const supabase = await client();
  const { data: profile, error: profileError } = await supabase.rpc("my_speaker_profile");
  if (profileError) return fail(profileError);
  if ((profile as { is_assistant?: boolean } | null)?.is_assistant) {
    return { ok: false, key: "not_allowed" };
  }

  const { data: pid } = await supabase.rpc("current_person_id");
  if (!pid) return { ok: false, key: "not_authenticated" };

  const { data: current, error: readError } = await supabase
    .from("consent_current")
    .select("consent_type, granted, version");
  if (readError) return fail(readError);

  const rows = consentRowsToWrite(
    (current ?? []) as ConsentState[],
    consents,
    pid as string,
  );
  if (rows.length > 0) {
    const { error } = await supabase.from("consent_record").insert(rows);
    if (error) return fail(error);
  }
  refresh();
  return { ok: true, data: undefined };
}

export async function inviteAssistant(
  profileId: string,
  email: string,
  firstName: string,
  lastName: string,
): Promise<SpeakerResult> {
  const supabase = await client();
  const { error } = await supabase.rpc("invite_assistant", {
    p_profile_id: profileId,
    p_email: email,
    p_first_name: firstName || null,
    p_last_name: lastName || null,
  });
  if (error) return fail(error);
  refresh();
  return { ok: true, data: undefined };
}

export async function removeAssistant(profileId: string): Promise<SpeakerResult> {
  const supabase = await client();
  const { error } = await supabase.rpc("remove_assistant", { p_profile_id: profileId });
  if (error) return fail(error);
  refresh();
  return { ok: true, data: undefined };
}
