"use server";

import { revalidatePath } from "next/cache";
import { requireAdminSection } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toRpcFailure } from "@/lib/rpc-error";

/**
 * Speaker-Leads verwalten. Rolle vergeben und entziehen läuft über dieselben
 * RPCs wie die allgemeine Rollenverwaltung (Migration 0022) — diese Seite ist
 * ein zweiter Zugang zu denselben Daten, kein zweiter Weg in die Tabelle.
 */
const PATH = "/admin/speaker-leads";

export type LeadsResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; key: string; detail?: string };

function fail(error: unknown): { ok: false; key: string; detail?: string } {
  const f = toRpcFailure(error as never);
  if (f.key === "unknown" && f.raw) console.error("[admin/speaker-leads] RPC:", f.raw);
  return { ok: false, key: f.key, detail: f.detail };
}

async function client() {
  await requireAdminSection("speakerLeads", PATH);
  return createSupabaseServerClient();
}

function refresh() {
  revalidatePath(PATH);
  revalidatePath("/admin/speaker");
}

export type FoundPerson = {
  id: string;
  display_name: string | null;
  email: string | null;
  city: string | null;
};

export async function findPeople(query: string): Promise<FoundPerson[]> {
  const supabase = await client();
  const { data, error } = await supabase.rpc("search_people", { p_query: query, p_limit: 10 });
  if (error) {
    console.error("[admin/speaker-leads] search_people:", error.message);
    return [];
  }
  return (data ?? []) as FoundPerson[];
}

/**
 * Jemanden zum Stage Lead einer Bühne machen (PORT3).
 *
 * `speaker_manager` sind die externen Stage Leads: die Rolle gilt nur für eine
 * Bühne (oder einen Tag, einen Slot) — nie für die Edition oder global, sonst
 * sähe die Person alle Speaker. `assign_role` weist das ab (22023
 * `stage_scope_required`) und setzt die Edition aus der Bühne. Mehrere Bühnen
 * heißen mehrere Zuweisungen.
 */
export async function makeLead(personId: string, stageId: string): Promise<LeadsResult> {
  const supabase = await client();
  const { error } = await supabase.rpc("assign_role", {
    p_person_id: personId,
    p_role: "speaker_manager",
    p_scope_type: "stage",
    p_scope_id: stageId,
    p_edition_id: null,
    p_portal: null,
    p_valid_from: null,
    p_valid_to: null,
    p_note: "Speaker-Leads (Admin)",
  });
  if (error) return fail(error);
  refresh();
  return { ok: true, data: undefined };
}

/** Entziehen setzt ein Ablaufdatum; die Historie bleibt stehen. */
export async function revokeLead(assignmentId: string): Promise<LeadsResult> {
  const supabase = await client();
  const { error } = await supabase.rpc("revoke_role", {
    p_assignment_id: assignmentId,
    p_note: null,
  });
  if (error) return fail(error);
  refresh();
  return { ok: true, data: undefined };
}

/** Zuordnen und Umhängen gehen denselben Weg wie im Detailblatt. */
export async function assignSpeaker(
  profileId: string,
  toPersonId: string | null,
): Promise<LeadsResult> {
  const supabase = await client();
  const { error } = await supabase.rpc("handover_speaker", {
    p_profile_id: profileId,
    p_to_person_id: toPersonId,
  });
  if (error) return fail(error);
  refresh();
  return { ok: true, data: undefined };
}
