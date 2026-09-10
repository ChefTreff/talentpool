"use server";

import { revalidatePath } from "next/cache";
import { requireArea } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toRpcFailure } from "@/lib/rpc-error";

/**
 * Lead-Portal. Alle Wege über die RPCs aus A1/A2 mit dem Session-Client:
 * `can_manage_speaker()` prüft den Scope, `is_speaker_team()` die Team-Felder.
 * `requireArea("speaker-leads")` hält Fremde von der Route fern.
 */
const PATH = "/speaker-leads";

export type LeadResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; key: string; detail?: string };

function fail(error: unknown): { ok: false; key: string; detail?: string } {
  const f = toRpcFailure(error as never);
  if (f.key === "unknown" && f.raw) console.error("[speaker-leads] RPC:", f.raw);
  return { ok: false, key: f.key, detail: f.detail };
}

async function client() {
  await requireArea("speaker-leads", PATH);
  return createSupabaseServerClient();
}

function refresh() {
  revalidatePath(PATH);
}

export type NewSpeaker = {
  editionId: string;
  email: string;
  firstName: string;
  lastName: string;
  speakerType: string;
  jobTitle: string;
  organizationName: string;
  /** Bestehende Person verknüpfen statt neu anlegen. */
  personId?: string | null;
};

/** Anlegen oder verknüpfen. Die RPC erkennt eine bestehende Person an der Mail. */
export async function createSpeaker(input: NewSpeaker): Promise<LeadResult<{ id: string }>> {
  const supabase = await client();
  const { data, error } = await supabase.rpc("upsert_speaker", {
    p_data: {
      edition_id: input.editionId,
      ...(input.personId ? { person_id: input.personId } : {}),
      email: input.email,
      first_name: input.firstName,
      last_name: input.lastName,
      speaker_type: input.speakerType,
      job_title: input.jobTitle,
      organization_name: input.organizationName,
    },
  });
  if (error) return fail(error);
  refresh();
  return { ok: true, data: { id: data as string } };
}

/**
 * Felder ändern. Was hier ankommt, ist nicht automatisch erlaubt — die RPC
 * lehnt Team-Felder für Manager mit `team_only_fields` ab. Die Oberfläche
 * zeigt sie ihnen deshalb gar nicht erst.
 */
export async function updateSpeaker(
  profileId: string,
  data: Record<string, unknown>,
): Promise<LeadResult> {
  const supabase = await client();
  const { error } = await supabase.rpc("update_speaker", {
    p_profile_id: profileId,
    p_data: data,
  });
  if (error) return fail(error);
  refresh();
  return { ok: true, data: undefined };
}

export async function setPipeline(
  profileId: string,
  status: string,
): Promise<LeadResult> {
  const supabase = await client();
  const { error } = await supabase.rpc("set_speaker_pipeline", {
    p_profile_id: profileId,
    p_status: status,
  });
  if (error) return fail(error);
  refresh();
  return { ok: true, data: undefined };
}

/** Einladung verschicken. Geht erst ab `confirmed` (P0001 `not_confirmed`). */
export async function inviteSpeaker(profileId: string): Promise<LeadResult> {
  const supabase = await client();
  const { error } = await supabase.rpc("invite_speaker", { p_profile_id: profileId });
  if (error) return fail(error);
  refresh();
  return { ok: true, data: undefined };
}

/** Finale Reisekosten-Freigabe — nur Program Lead oder Admin. */
export async function approveTravelCosts(
  profileId: string,
  approved: boolean,
): Promise<LeadResult> {
  const supabase = await client();
  const { error } = await supabase.rpc("approve_travel_costs", {
    p_profile_id: profileId,
    p_approved: approved,
  });
  if (error) return fail(error);
  refresh();
  return { ok: true, data: undefined };
}

export type FoundPerson = {
  id: string;
  display_name: string | null;
  email: string | null;
  city: string | null;
};

/** Personensuche für „bestehende Person verknüpfen". */
export async function findPeople(query: string): Promise<FoundPerson[]> {
  const supabase = await client();
  const { data, error } = await supabase.rpc("search_people", {
    p_query: query,
    p_limit: 10,
  });
  if (error) {
    console.error("[speaker-leads] search_people:", error.message);
    return [];
  }
  return (data ?? []) as FoundPerson[];
}
