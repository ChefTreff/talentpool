"use server";

import { revalidatePath } from "next/cache";
import { requireAdminSection } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toRpcFailure } from "@/lib/rpc-error";
import { sammelErgebnis, type Entscheidung } from "@/lib/bewerbungen/liste";

/**
 * Bewerbungs-Queue. Alle drei Wege sind RPCs mit dem Session-Client:
 * `decide_application` prüft `can_decide_session()`, `release_decisions` und
 * `promote_waitlist` prüfen die Rolle selbst. `requireAdminSection("applications")` davor
 * hält Nicht-Team von der Route fern — die fachliche Prüfung bleibt in der DB.
 */
const PATH = "/admin/bewerbungen";

export type AdminResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; key: string; detail?: string };

function fail(error: unknown): { ok: false; key: string; detail?: string } {
  const f = toRpcFailure(error as never);
  if (f.key === "unknown" && f.raw) console.error("[bewerbungen] RPC:", f.raw);
  return { ok: false, key: f.key, detail: f.detail };
}

async function client(sessionId?: string) {
  await requireAdminSection("applications", sessionId ? `${PATH}/${sessionId}` : PATH);
  return createSupabaseServerClient();
}

function refresh(sessionId: string) {
  revalidatePath(PATH);
  revalidatePath(`${PATH}/${sessionId}`);
}

/** Eine Bewerbung entscheiden. `rank` ist optional und bleibt sonst, wie er war. */
export async function decideApplication(
  sessionId: string,
  applicationId: string,
  status: string,
  rank: number | null,
): Promise<AdminResult> {
  const supabase = await client(sessionId);
  const { error } = await supabase.rpc("decide_application", {
    p_application_id: applicationId,
    p_status: status,
    p_rank: rank,
  });
  if (error) return fail(error);
  refresh(sessionId);
  return { ok: true, data: undefined };
}

/**
 * Entscheidungen freigeben. Erst danach sehen Bewerber ihren Stand
 * (`my_applications()` maskiert bis dahin) und die Mails gehen raus.
 */
export async function releaseDecisions(
  sessionId: string,
  note?: string,
): Promise<AdminResult<{ accepted: number }>> {
  const supabase = await client(sessionId);
  const { data, error } = await supabase.rpc("release_decisions", {
    p_session_id: sessionId,
    p_note: note?.trim() ? note.trim() : null,
  });
  if (error) return fail(error);
  refresh(sessionId);
  return { ok: true, data: { accepted: typeof data === "number" ? data : 0 } };
}

/**
 * Mehrere Bewerbungen auf einmal entscheiden (ADM-003). `decide_applications`
 * ruft je Bewerbung `decide_application` auf — Rechte, Regeln und Audit wie
 * beim Einzelklick — und meldet je Kennung zurück; hier wird daraus „n
 * entschieden, so viele aus welchem Grund nicht“.
 */
export async function decideApplicationsBulk(
  applicationIds: string[],
  status: Entscheidung,
): Promise<AdminResult<{ ok: number; fehler: [string, number][] }>> {
  const supabase = await client();
  const { data, error } = await supabase.rpc("decide_applications", {
    p_application_ids: applicationIds,
    p_status: status,
  });
  if (error) return fail(error);
  revalidatePath(PATH, "layout");
  return { ok: true, data: sammelErgebnis((data ?? []) as { ok: boolean; error_key: string | null }[]) };
}

/** Von der Warteliste nachrücken lassen — nach Rang, dann nach Eingang. */
export async function promoteWaitlist(
  sessionId: string,
  count: number,
): Promise<AdminResult<{ promoted: number }>> {
  const supabase = await client(sessionId);
  const { data, error } = await supabase.rpc("promote_waitlist", {
    p_session_id: sessionId,
    p_count: count,
  });
  if (error) return fail(error);
  refresh(sessionId);
  return { ok: true, data: { promoted: typeof data === "number" ? data : 0 } };
}
