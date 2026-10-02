"use server";

import { requireArea } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toRpcFailure } from "@/lib/rpc-error";

export type FeedbackEingabe = {
  format: string;
  kind?: string;
  ratings?: Record<string, number>;
  return_intent?: string;
  main_reason?: string;
  memorable?: string;
  body?: string;
};

/**
 * Feedback senden (TAL-011). Ob anonym, entscheidet die Person; anonym heißt
 * wirklich anonym — die Datenbank speichert dann weder Person noch Uhrzeit
 * und schreibt kein Audit (`submit_feedback`).
 */
export async function sendFeedback(input: FeedbackEingabe, anonym: boolean): Promise<{ ok: true } | { ok: false; key: string }> {
  await requireArea("talent", "/feedback");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("submit_feedback", { p_data: input, p_anonymous: anonym });
  if (error) return { ok: false, key: toRpcFailure(error).key };
  return { ok: true };
}
