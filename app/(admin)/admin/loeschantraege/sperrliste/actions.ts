"use server";

import { revalidatePath } from "next/cache";
import { requireAdminSection } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toRpcFailure } from "@/lib/rpc-error";

const PFAD = "/admin/loeschantraege";

export type Pruefung =
  | { ok: true; gesperrt: boolean; grund: string | null; seit: string | null }
  | { ok: false; key: string; detail?: string };
export type Eintrag = { ok: true; neu: boolean } | { ok: false; key: string; detail?: string };

/**
 * Ist diese Adresse gesperrt (ADM-035)? Die Adresse geht nur zum Vergleich an
 * die Datenbank — dort wird sie gehasht, nicht gespeichert, nicht protokolliert.
 */
export async function pruefeAdresse(email: string): Promise<Pruefung> {
  await requireAdminSection("suppression", PFAD);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("suppression_check", { p_email: email });
  if (error) {
    const f = toRpcFailure(error);
    return { ok: false, key: f.key, detail: f.detail };
  }
  const z = ((data ?? []) as { suppressed: boolean; reason: string | null; created_at: string | null }[])[0];
  return { ok: true, gesperrt: Boolean(z?.suppressed), grund: z?.reason ?? null, seit: z?.created_at ?? null };
}

/** Adresse von Hand sperren. Über die Sitzung, damit das Protokoll die handelnde Person trägt. */
export async function sperreAdresse(email: string, grund: string): Promise<Eintrag> {
  await requireAdminSection("suppression", PFAD);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("add_suppression", { p_email: email, p_reason: grund });
  if (error) {
    const f = toRpcFailure(error);
    if (f.key === "unknown") console.error("[sperrliste] add_suppression:", f.raw);
    return { ok: false, key: f.key, detail: f.detail };
  }
  revalidatePath(PFAD);
  return { ok: true, neu: Boolean(data) };
}
