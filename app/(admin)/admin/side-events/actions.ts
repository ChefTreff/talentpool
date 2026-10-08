"use server";

import { revalidatePath } from "next/cache";
import { requireAdminSection } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toRpcFailure } from "@/lib/rpc-error";
import type { InviteResult, InviteStatus, SideEventInvite } from "./types";

/**
 * Verwaltung der Side Events (ADM-077, SPK-091).
 *
 * Wer das darf, entscheidet `is_speaker_team()` in den RPCs; hier steht nur das Abschnitts-Gate davor. Namen und Hinweise der Eingeladenen
 * kommen **auf Abruf** (`loadInvites`), nicht mit der Seite — Datenminimierung.
 */
const PATH = "/admin/side-events";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUS: readonly string[] = ["invited", "yes", "no"];

export type SideEventResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; key: string; detail?: string };

function fail(error: unknown): { ok: false; key: string; detail?: string } {
  const f = toRpcFailure(error as never);
  if (f.key === "unknown" && f.raw) console.error("[admin/side-events] RPC:", f.raw);
  return { ok: false, key: f.key, detail: f.detail };
}

async function client() {
  await requireAdminSection("sideEvents", PATH);
  return createSupabaseServerClient();
}

export async function saveSideEvent(data: Record<string, unknown>): Promise<SideEventResult> {
  const supabase = await client();
  const { error } = await supabase.rpc("upsert_side_event", { p_data: data });
  if (error) return fail(error);
  revalidatePath(PATH);
  return { ok: true, data: undefined };
}

export async function removeSideEvent(id: string): Promise<SideEventResult> {
  const supabase = await client();
  if (!UUID.test(id)) return { ok: false, key: "not_found" };
  const { error } = await supabase.rpc("delete_side_event", { p_id: id });
  if (error) return fail(error);
  revalidatePath(PATH);
  return { ok: true, data: undefined };
}

/** Die Einladungen eines Events mit Namen — nur für das Event, dessen Fenster gerade aufgeht. */
export async function loadInvites(eventId: string): Promise<SideEventResult<SideEventInvite[]>> {
  const supabase = await client();
  if (!UUID.test(eventId)) return { ok: false, key: "not_found" };
  const { data, error } = await supabase.rpc("side_events_admin", { p_side_event_id: eventId });
  if (error) return fail(error);
  const zeile = ((data ?? []) as { id: string; invites: SideEventInvite[] | null }[]).find((r) => r.id === eventId);
  return { ok: true, data: zeile?.invites ?? [] };
}

/**
 * Einladen — oder mit `resend` die Mail noch einmal schicken (neuer Link; der alte gilt dann nicht mehr). Die Funktion prüft, wer
 * eingeladen werden darf (bestätigt, kein Gast, nicht gelöscht), und meldet zurück, wen sie übersprungen hat und für wen keine Mail
 * möglich war.
 */
export async function inviteSpeakers(eventId: string, profileIds: string[], resend: boolean): Promise<SideEventResult<InviteResult>> {
  const supabase = await client();
  if (!UUID.test(eventId) || profileIds.length === 0 || profileIds.length > 200 || !profileIds.every((p) => UUID.test(p))) {
    return { ok: false, key: "invalid_side_event" };
  }
  const { data, error } = await supabase.rpc("invite_to_side_event", {
    p_side_event_id: eventId,
    p_profile_ids: profileIds,
    p_resend: resend,
  });
  if (error) return fail(error);
  revalidatePath(PATH);
  return { ok: true, data: data as InviteResult };
}

/** Den Stand von Hand setzen — zum Beispiel, wenn jemand mündlich zu- oder abgesagt hat. */
export async function setInviteStatus(
  eventId: string,
  profileId: string,
  status: InviteStatus,
  guests: number,
  note: string,
): Promise<SideEventResult> {
  const supabase = await client();
  if (!UUID.test(eventId) || !UUID.test(profileId) || !STATUS.includes(status) || !Number.isInteger(guests) || guests < 0 || guests > 3) {
    return { ok: false, key: "invalid_side_event" };
  }
  const { error } = await supabase.rpc("set_side_event_status", {
    p_side_event_id: eventId,
    p_profile_id: profileId,
    p_status: status,
    p_guests: status === "yes" ? guests : 0,
    // Immer der Text aus dem Fenster: leer löscht den Hinweis (`null` ließe ihn stehen).
    p_note: note.trim(),
  });
  if (error) return fail(error);
  revalidatePath(PATH);
  return { ok: true, data: undefined };
}
