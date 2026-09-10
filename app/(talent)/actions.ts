"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toRpcFailure } from "@/lib/rpc-error";

/**
 * Teilnahme-Aktionen eines Talents. Alles über die RPCs des Backends, mit dem
 * Session-Client — sie prüfen Frist, Eignung, Ticketpflicht und Kollisionen
 * selbst und melden fachliche Ablehnungen als P0001 mit Schlüssel.
 *
 * Beide Seiten zeigen dieselben Daten: `/programm` die Sessions mit dem
 * eigenen Stand, `/meine` die eigene Teilnahme. Deshalb liegen die Aktionen
 * hier gemeinsam und erneuern beide Seiten.
 */
const PATHS = ["/programm", "/meine"] as const;

function revalidate() {
  for (const path of PATHS) revalidatePath(path);
}

export type TalentResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; key: string; detail?: string };

function fail(error: unknown): { ok: false; key: string; detail?: string } {
  const f = toRpcFailure(error as never);
  if (f.key === "unknown" && f.raw) console.error("[teilnahme] RPC:", f.raw);
  return { ok: false, key: f.key, detail: f.detail };
}

/** Bewerbung. `answers` ist auf `question_id` geschlüsselt (siehe apply_to_session). */
export async function applyToSession(
  sessionId: string,
  answers: Record<string, string>,
  consentShare: boolean,
): Promise<TalentResult<{ applicationId: string }>> {
  await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("apply_to_session", {
    p_session_id: sessionId,
    p_answers: answers,
    p_consent_share: consentShare,
  });
  if (error) return fail(error);
  revalidate();
  return { ok: true, data: { applicationId: data as string } };
}

/** Anmeldung. Liefert `confirmed` oder `waitlisted` zurück. */
export async function registerForSession(
  sessionId: string,
): Promise<TalentResult<{ status: string }>> {
  await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("register_for_session", {
    p_session_id: sessionId,
  });
  if (error) return fail(error);
  revalidate();
  return { ok: true, data: { status: (data as string) ?? "confirmed" } };
}

export async function cancelRegistration(sessionId: string): Promise<TalentResult> {
  await requireUser();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("cancel_registration", {
    p_session_id: sessionId,
  });
  if (error) return fail(error);
  revalidate();
  return { ok: true, data: undefined };
}

export async function withdrawApplication(
  applicationId: string,
): Promise<TalentResult> {
  await requireUser();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("withdraw_application", {
    p_application_id: applicationId,
  });
  if (error) return fail(error);
  revalidate();
  return { ok: true, data: undefined };
}

/**
 * Zusage bestätigen. Kollidiert die Session mit einer schon bestätigten,
 * meldet das Backend `collision` mit den IDs im Detail — die Oberfläche fragt
 * dann nach und ruft erneut mit `replaceConflicting`.
 */
export async function confirmApplication(
  applicationId: string,
  replaceConflicting = false,
): Promise<TalentResult<{ replaced: string[] }>> {
  await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("confirm_application", {
    p_application_id: applicationId,
    p_replace_conflicting: replaceConflicting,
  });
  if (error) return fail(error);
  revalidate();
  const replaced =
    data && typeof data === "object" && Array.isArray((data as { replaced?: unknown }).replaced)
      ? ((data as { replaced: string[] }).replaced)
      : [];
  return { ok: true, data: { replaced } };
}
