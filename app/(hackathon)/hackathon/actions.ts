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
  /** Portfolio-Links (HACK-007) — nur hier, nicht im allgemeinen Profil. */
  githubUrl?: string;
  websiteUrl?: string;
  behanceUrl?: string;
  /** Gewünschte Tracks (HACK-010), Schlüssel aus vocab hack_track. */
  trackPrefs?: string[];
  /** Wunsch-Challenges in Reihenfolge (HACK-017), höchstens drei. */
  challengePrefs?: string[];
}): Promise<ActionResult> {
  const supabase = await client();
  const { error } = await supabase.rpc("apply_hackathon", {
    p_data: {
      skills: input.skills,
      motivation: input.motivation ?? null,
      team_pref: input.teamPref ?? null,
      github_url: input.githubUrl ?? null,
      website_url: input.websiteUrl ?? null,
      behance_url: input.behanceUrl ?? null,
      track_prefs: input.trackPrefs ?? [],
      challenge_prefs: (input.challengePrefs ?? []).filter(Boolean),
    },
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

/**
 * Challenge freigeben (HACK-008: mit Track). Ohne Angabe nimmt die Datenbank
 * den Track aus dem Formular; fehlt er dort, kommt `track_missing`.
 */
export async function publishChallenge(deliverableId: string, track?: string): Promise<ActionResult> {
  const supabase = await client();
  const { error } = await supabase.rpc("publish_hack_challenge", {
    p_deliverable_id: deliverableId,
    p_track: track || null,
  });
  if (error) return fail(error);
  revalidateAll();
  return { ok: true, data: undefined };
}

/**
 * Metrik-Wert eines Teams eintragen (HACK-009). Dürfen Mitglieder des Teams und
 * die Jury der Challenge — das prüft `set_hack_metric`; ein neuer Wert muss vom
 * Hack-Team neu bestätigt werden.
 */
export async function saveMetric(input: { teamId: string; value: number; note?: string }): Promise<ActionResult> {
  const supabase = await client();
  const { error } = await supabase.rpc("set_hack_metric", {
    p_team_id: input.teamId,
    p_value: input.value,
    p_note: input.note ?? null,
  });
  if (error) return fail(error);
  revalidateAll();
  return { ok: true, data: undefined };
}

// ---------------------------------------------------------------- Teamsuche (HACK-016)
// Rechte und Regeln prüfen die Definer-Funktionen; hier nur Weitergabe.

async function teamsuche(rpc: string, args: Record<string, unknown>): Promise<ActionResult> {
  const supabase = await client();
  const { error } = await supabase.rpc(rpc, args);
  if (error) return fail(error);
  revalidateAll();
  return { ok: true, data: undefined };
}

/** „Ich suche ein Team“ an der eigenen Bewerbung. */
export async function setSeeking(seeking: boolean): Promise<ActionResult> {
  return teamsuche("set_hack_seeking", { p_seeking: seeking });
}

/** „Wir suchen noch“ am eigenen Team (nur Kapitän). */
export async function setTeamLooking(input: { looking: boolean; skills: string[]; note: string }): Promise<ActionResult> {
  return teamsuche("set_hack_team_looking", { p_looking: input.looking, p_skills: input.skills, p_note: input.note });
}

export async function requestJoin(teamId: string, message: string): Promise<ActionResult> {
  return teamsuche("request_hack_join", { p_team_id: teamId, p_message: message });
}

export async function invitePerson(personId: string, message: string): Promise<ActionResult> {
  return teamsuche("invite_hack_person", { p_person_id: personId, p_message: message });
}

export async function answerRequest(requestId: string, accept: boolean): Promise<ActionResult> {
  return teamsuche("answer_hack_request", { p_request_id: requestId, p_accept: accept });
}

export async function withdrawRequest(requestId: string): Promise<ActionResult> {
  return teamsuche("withdraw_hack_request", { p_request_id: requestId });
}
