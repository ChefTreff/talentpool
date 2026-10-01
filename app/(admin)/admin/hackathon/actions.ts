"use server";

import { revalidatePath } from "next/cache";
import { requireAdminSection } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toRpcFailure } from "@/lib/rpc-error";

export type Ergebnis = { ok: true } | { ok: false; key: string; detail?: string };

/**
 * Bewerbung entscheiden (ADM-055). Gate hier und in der RPC
 * (`set_hack_application_status` → `is_hack_team()` → Abschnitt `hackathon`).
 */
export async function decideApplication(id: string, status: "applied" | "accepted" | "declined"): Promise<Ergebnis> {
  await requireAdminSection("hackathon");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_hack_application_status", { p_id: id, p_status: status });
  if (error) {
    const f = toRpcFailure(error);
    return { ok: false, key: f.key, detail: f.detail };
  }
  revalidatePath("/admin/hackathon");
  return { ok: true };
}

/** Track einer freigegebenen Challenge ändern (HACK-008). Gate hier und in der RPC. */
export async function setChallengeTrack(challengeId: string, track: string): Promise<Ergebnis> {
  await requireAdminSection("hackathon");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_hack_challenge_track", { p_challenge_id: challengeId, p_track: track });
  if (error) {
    const f = toRpcFailure(error);
    return { ok: false, key: f.key, detail: f.detail };
  }
  revalidatePath("/admin/hackathon");
  revalidatePath("/hackathon/challenges");
  return { ok: true };
}
