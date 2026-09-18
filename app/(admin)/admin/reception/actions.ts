"use server";

import { revalidatePath } from "next/cache";
import { requireArea } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toRpcFailure } from "@/lib/rpc-error";
import type { ReceptionGuest } from "./types";

/**
 * Verwaltung der Speaker Reception (SPK-003).
 *
 * Wer das darf, entscheidet `is_speaker_team()` in den RPCs; hier steht nur
 * das Bereichsgate davor.
 */
const PATH = "/admin/reception";

export type ReceptionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; key: string; detail?: string };

function fail(error: unknown): { ok: false; key: string; detail?: string } {
  const f = toRpcFailure(error as never);
  if (f.key === "unknown" && f.raw) console.error("[admin/reception] RPC:", f.raw);
  return { ok: false, key: f.key, detail: f.detail };
}

async function client() {
  await requireArea("admin", PATH);
  return createSupabaseServerClient();
}

export async function saveReception(data: Record<string, unknown>): Promise<ReceptionResult> {
  const supabase = await client();
  const { error } = await supabase.rpc("upsert_reception", { p_data: data });
  if (error) return fail(error);
  revalidatePath(PATH);
  return { ok: true, data: undefined };
}

export async function removeReception(id: string): Promise<ReceptionResult> {
  const supabase = await client();
  const { error } = await supabase.rpc("delete_reception", { p_id: id });
  if (error) return fail(error);
  revalidatePath(PATH);
  return { ok: true, data: undefined };
}

/**
 * Die Gästeliste — bewusst **auf Abruf**, nicht mit der Seite.
 *
 * Namen und Hinweise sind Personendaten; sie sollen nicht in jedem Seitenaufruf
 * mitgeladen werden, nur weil jemand die Zahlen sehen will (Datenminimierung).
 */
export async function loadGuests(receptionId: string): Promise<ReceptionResult<ReceptionGuest[]>> {
  const supabase = await client();
  const { data, error } = await supabase.rpc("reception_guests", {
    p_reception_id: receptionId,
  });
  if (error) return fail(error);
  return { ok: true, data: (data ?? []) as ReceptionGuest[] };
}
