"use server";

import { revalidatePath } from "next/cache";
import { requireAnyArea } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toRpcFailure } from "@/lib/rpc-error";

/**
 * Schreibwege des Hackathons. Sitzungs-Client: wer in welchem Team ist und wer
 * bewerten darf, entscheidet die Datenbank.
 */
export type ActionResult<T = void> = { ok: true; data: T } | { ok: false; key: string; detail?: string };

function fail(error: unknown): { ok: false; key: string; detail?: string } {
  const f = toRpcFailure(error as never);
  if (f.key === "unknown" && f.raw) console.error("[hackathon] RPC:", f.raw);
  return { ok: false, key: f.key, detail: f.detail };
}

const PATHS = ["/hackathon", "/hackathon/judging", "/hackathon/teams"] as const;
function revalidateAll() {
  for (const p of PATHS) revalidatePath(p);
}

async function client() {
  await requireAnyArea(["hackathon", "admin"], PATHS[0]);
  return createSupabaseServerClient();
}

export async function applyHackathon(input: {
  skills: string[];
  motivation?: string;
  teamPref?: string;
}): Promise<ActionResult> {
  const supabase = await client();
  const { error } = await supabase.rpc("apply_hackathon", {
    p_data: { skills: input.skills, motivation: input.motivation ?? null, team_pref: input.teamPref ?? null },
  });
  if (error) return fail(error);
  revalidateAll();
  return { ok: true, data: undefined };
}

export async function createTeam(name: string): Promise<ActionResult> {
  const supabase = await client();
  const { error } = await supabase.rpc("create_hack_team", { p_name: name });
  if (error) return fail(error);
  revalidateAll();
  return { ok: true, data: undefined };
}

export async function joinTeam(code: string): Promise<ActionResult> {
  const supabase = await client();
  const { error } = await supabase.rpc("join_hack_team", { p_code: code });
  if (error) return fail(error);
  revalidateAll();
  return { ok: true, data: undefined };
}

export async function leaveTeam(): Promise<ActionResult> {
  const supabase = await client();
  const { error } = await supabase.rpc("leave_hack_team");
  if (error) return fail(error);
  revalidateAll();
  return { ok: true, data: undefined };
}

export async function submitProject(input: {
  url?: string;
  repoUrl?: string;
  notes?: string;
}): Promise<ActionResult> {
  const supabase = await client();
  const { error } = await supabase.rpc("submit_hack", {
    p_data: { url: input.url ?? null, repo_url: input.repoUrl ?? null, notes: input.notes ?? null },
  });
  if (error) return fail(error);
  revalidateAll();
  return { ok: true, data: undefined };
}

export async function saveScore(input: {
  teamId: string;
  criteria: Record<string, number>;
  note?: string;
}): Promise<ActionResult<{ total: number | null }>> {
  const supabase = await client();
  const { data, error } = await supabase.rpc("set_hack_score", {
    p_team_id: input.teamId,
    p_criteria: input.criteria,
    p_note: input.note ?? null,
  });
  if (error) return fail(error);
  revalidateAll();
  return { ok: true, data: { total: (data as number) ?? null } };
}

export async function assignChallenges(): Promise<ActionResult<{ teams: number }>> {
  const supabase = await client();
  const { data, error } = await supabase.rpc("assign_challenges");
  if (error) return fail(error);
  revalidateAll();
  return { ok: true, data: { teams: (data as number) ?? 0 } };
}

export async function publishChallenge(deliverableId: string): Promise<ActionResult> {
  const supabase = await client();
  const { error } = await supabase.rpc("publish_hack_challenge", { p_deliverable_id: deliverableId });
  if (error) return fail(error);
  revalidateAll();
  return { ok: true, data: undefined };
}
