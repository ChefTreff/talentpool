"use server";

import { revalidatePath } from "next/cache";
import { requireAnyArea } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toRpcFailure } from "@/lib/rpc-error";

export type Ergebnis = { ok: true } | { ok: false; key: string; detail?: string };

/**
 * Wunschprofil einer Challenge speichern (HACK-015) — aus dem Partner-Portal
 * und dem Admin. Wer was darf, prüft `set_hack_challenge_profile`: Hack-Team
 * oder wer die Organisation der Challenge bearbeiten darf.
 */
export async function saveWunschprofil(input: {
  challengeId: string;
  studyFields: string[];
  skills: string[];
  text: string;
}): Promise<Ergebnis> {
  await requireAnyArea(["partner", "admin", "hackathon"]);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_hack_challenge_profile", {
    p_challenge_id: input.challengeId,
    p_study_fields: input.studyFields,
    p_skills: input.skills,
    p_text: input.text,
  });
  if (error) {
    const f = toRpcFailure(error);
    return { ok: false, key: f.key, detail: f.detail };
  }
  revalidatePath("/partner/hackathon");
  revalidatePath("/admin/hackathon");
  revalidatePath("/hackathon/challenges");
  return { ok: true };
}
