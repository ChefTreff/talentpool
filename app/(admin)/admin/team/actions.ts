"use server";

import { revalidatePath } from "next/cache";
import { requireAdminSection } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toRpcFailure } from "@/lib/rpc-error";

/**
 * Team-Verwaltung. Vergeben und Entziehen laufen über dieselben RPCs wie
 * `/admin/rollen` (Migration 0022) — diese Seite ist ein zweiter Blick auf
 * dieselben Daten, kein zweiter Weg in die Tabelle. Beide prüfen
 * `has_role('admin')` und schreiben ins Audit-Log.
 */
const PATH = "/admin/team";

export type TeamResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; key: string; detail?: string };

function fail(error: unknown): { ok: false; key: string; detail?: string } {
  const f = toRpcFailure(error as never);
  if (f.key === "unknown" && f.raw) console.error("[admin/team] RPC:", f.raw);
  return { ok: false, key: f.key, detail: f.detail };
}

async function client() {
  await requireAdminSection("team", PATH);
  return createSupabaseServerClient();
}

function refresh() {
  revalidatePath(PATH);
  revalidatePath("/admin/rollen");
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
    console.error("[admin/team] search_people:", error.message);
    return [];
  }
  return (data ?? []) as FoundPerson[];
}

/**
 * Eine Teamrolle vergeben.
 *
 * `editionId` setzt den Scope auf die Edition. Welche Rollen sinnvoll auf eine
 * Edition begrenzt werden, entscheidet die Oberfläche — die Rolle `admin` ist
 * ausdrücklich global: ein Admin, der nur für eine Edition gilt, wäre im
 * nächsten Jahr lautlos keiner mehr.
 */
export async function grantTeamRole(
  personId: string,
  role: string,
  editionId?: string | null,
): Promise<TeamResult> {
  const supabase = await client();
  const scoped = role !== "admin" && Boolean(editionId);
  const { error } = await supabase.rpc("assign_role", {
    p_person_id: personId,
    p_role: role,
    p_scope_type: scoped ? "edition" : "global",
    p_scope_id: null,
    p_edition_id: scoped ? editionId : null,
    p_portal: null,
    p_valid_from: null,
    p_valid_to: null,
    p_note: "Team (Admin)",
  });
  if (error) return fail(error);
  refresh();
  return { ok: true, data: undefined };
}

/**
 * Eine Rolle entziehen. Setzt ein Ablaufdatum, die Historie bleibt.
 *
 * Den letzten globalen Admin schützt die Datenbank selbst (P0001 `last_admin`);
 * die Oberfläche warnt vorher, damit niemand erst in den Fehler läuft.
 */
export async function revokeTeamRole(assignmentId: string): Promise<TeamResult> {
  const supabase = await client();
  const { error } = await supabase.rpc("revoke_role", {
    p_assignment_id: assignmentId,
    p_note: null,
  });
  if (error) return fail(error);
  refresh();
  return { ok: true, data: undefined };
}
