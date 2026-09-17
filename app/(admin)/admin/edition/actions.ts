"use server";

import { revalidatePath } from "next/cache";
import { requireArea } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toRpcFailure } from "@/lib/rpc-error";

/**
 * Das Grundgerüst einer Edition: Tage, Bühnen, Bühne × Tag, Tracks.
 *
 * Alle Wege über die RPCs aus 0110 — `is_programme_editor()` prüft dort, und
 * jede Änderung landet im Audit-Log. Die Seite selbst entscheidet nichts.
 */
const PATH = "/admin/edition";

export type EditionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; key: string; detail?: string };

function fail(error: unknown): { ok: false; key: string; detail?: string } {
  const f = toRpcFailure(error as never);
  if (f.key === "unknown" && f.raw) console.error("[admin/edition] RPC:", f.raw);
  return { ok: false, key: f.key, detail: f.detail };
}

async function client() {
  await requireArea("admin", PATH);
  return createSupabaseServerClient();
}

function refresh() {
  revalidatePath(PATH);
  // Das Board liest dieselben Tage und Bühnen.
  revalidatePath("/admin/programm");
  revalidatePath("/speaker-leads/board");
}

async function rpc(name: string, args: Record<string, unknown>): Promise<EditionResult<string>> {
  const supabase = await client();
  const { data, error } = await supabase.rpc(name, args);
  if (error) return fail(error);
  refresh();
  return { ok: true, data: (data ?? "") as string };
}

export async function saveDay(data: Record<string, unknown>) {
  return rpc("upsert_event_day", { p_data: data });
}

export async function removeDay(id: string) {
  return rpc("delete_event_day", { p_id: id });
}

export async function saveStage(data: Record<string, unknown>) {
  return rpc("upsert_stage", { p_data: data });
}

export async function removeStage(id: string) {
  return rpc("delete_stage", { p_id: id });
}

/** Öffnungszeiten und Kontingent je Bühne und Tag — legt die Zeile bei Bedarf an. */
export async function saveStageDay(data: Record<string, unknown>) {
  return rpc("upsert_stage_day", { p_data: data });
}

export async function saveTrack(data: Record<string, unknown>) {
  return rpc("upsert_track", { p_data: data });
}

export async function removeTrack(id: string) {
  return rpc("delete_track", { p_id: id });
}
