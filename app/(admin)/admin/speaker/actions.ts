"use server";

import { revalidatePath } from "next/cache";
import { requireAdminSection } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toRpcFailure } from "@/lib/rpc-error";

/**
 * Admin-Sektion Speaker. Jede Änderung geht über dieselben RPCs wie im
 * Lead-Portal — der Unterschied liegt in der Rolle des Aufrufers, nicht in
 * einem zweiten Weg in die Tabelle.
 */
const PATH = "/admin/speaker";

export type AdminResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; key: string; detail?: string };

function fail(error: unknown): { ok: false; key: string; detail?: string } {
  const f = toRpcFailure(error as never);
  if (f.key === "unknown" && f.raw) console.error("[admin/speaker] RPC:", f.raw);
  return { ok: false, key: f.key, detail: f.detail };
}

async function client() {
  await requireAdminSection("speakers", PATH);
  return createSupabaseServerClient();
}

function refresh(profileId?: string) {
  revalidatePath(PATH);
  if (profileId) revalidatePath(`${PATH}/${profileId}`);
}

/** Alle Felder aus der Whitelist von `update_speaker`. */
export async function saveSpeaker(
  profileId: string,
  data: Record<string, unknown>,
): Promise<AdminResult> {
  const supabase = await client();
  const { error } = await supabase.rpc("update_speaker", {
    p_profile_id: profileId,
    p_data: data,
  });
  if (error) return fail(error);
  refresh(profileId);
  return { ok: true, data: undefined };
}

/**
 * Bühnen in Frage (LEAD-039) — ersetzt die ganze Menge, wie im Fenster der
 * Speaker-Leads. Rechte und Edition prüft `set_speaker_stage_candidates`.
 */
export async function setStageCandidates(profileId: string, stageIds: string[]): Promise<AdminResult> {
  const supabase = await client();
  const { error } = await supabase.rpc("set_speaker_stage_candidates", {
    p_profile_id: profileId,
    p_stage_ids: stageIds,
  });
  if (error) return fail(error);
  refresh(profileId);
  return { ok: true, data: undefined };
}

export async function setPipeline(
  profileId: string,
  status: string,
  reason?: string | null,
): Promise<AdminResult> {
  const supabase = await client();
  const { error } = await supabase.rpc("set_speaker_pipeline", {
    p_profile_id: profileId,
    p_status: status,
    p_reason: reason ?? null,
  });
  if (error) return fail(error);
  refresh(profileId);
  return { ok: true, data: undefined };
}

/**
 * Betreuung setzen oder abgeben.
 *
 * Im Admin-Bereich ist jede Zuordnung erlaubt; die RPC prüft trotzdem, dass
 * der Empfänger überhaupt Speaker-Lead ist (`invalid_owner`). Eine Betreuung,
 * die das Lead-Portal nicht öffnen kann, wäre nur auf dem Papier eine.
 */
export async function handoverSpeaker(
  profileId: string,
  toPersonId: string | null,
): Promise<AdminResult> {
  const supabase = await client();
  const { error } = await supabase.rpc("handover_speaker", {
    p_profile_id: profileId,
    p_to_person_id: toPersonId,
  });
  if (error) return fail(error);
  refresh(profileId);
  return { ok: true, data: undefined };
}

/** Finale Reisekosten-Freigabe. */
export async function approveTravelCosts(
  profileId: string,
  approved: boolean,
): Promise<AdminResult> {
  const supabase = await client();
  const { error } = await supabase.rpc("approve_travel_costs", {
    p_profile_id: profileId,
    p_approved: approved,
  });
  if (error) return fail(error);
  refresh(profileId);
  return { ok: true, data: undefined };
}

/**
 * Pauschale oder Übernahme per Beleg (SPK-042).
 *
 * Der Betrag kommt **in Cent** herein; das Umrechnen aus dem Eurofeld passiert
 * einmal in der Oberfläche, nicht hier und nicht in der Datenbank.
 */
export async function setExpenseMode(
  profileId: string,
  mode: string,
  amountCents: number | null,
): Promise<AdminResult> {
  const supabase = await client();
  const { error } = await supabase.rpc("set_expense_mode", {
    p_profile_id: profileId,
    p_mode: mode,
    p_amount_cents: amountCents,
  });
  if (error) return fail(error);
  refresh(profileId);
  return { ok: true, data: undefined };
}

/** Ansprechpartner je Speaker; `null` fällt auf den Standard der Edition zurück. */
export async function setContacts(
  profileId: string,
  lead: string | null,
  buddy: string | null,
): Promise<AdminResult> {
  const supabase = await client();
  const { error } = await supabase.rpc("set_speaker_contacts", {
    p_profile_id: profileId,
    p_lead: lead,
    p_buddy: buddy,
  });
  if (error) return fail(error);
  refresh(profileId);
  return { ok: true, data: undefined };
}

/**
 * Über wen die Speaker-Mails gehen (SPK-072, PART-091): ein Kontakt des
 * Profils mit Zugang, oder `null` für die Speakerin selbst. Recht, Prüfung des
 * Kontakts und Audit-Eintrag liegen in `set_speaker_mail_via`.
 */
export async function setMailVia(profileId: string, contactId: string | null): Promise<AdminResult> {
  const supabase = await client();
  const { error } = await supabase.rpc("set_speaker_mail_via", {
    p_profile_id: profileId,
    p_contact_id: contactId,
  });
  if (error) return fail(error);
  refresh(profileId);
  return { ok: true, data: undefined };
}

/** Einladung ins Portal. Geht erst ab „bestätigt" (P0001 `not_confirmed`). */
export async function inviteSpeaker(profileId: string): Promise<AdminResult> {
  const supabase = await client();
  const { error } = await supabase.rpc("invite_speaker", { p_profile_id: profileId });
  if (error) return fail(error);
  refresh(profileId);
  return { ok: true, data: undefined };
}

export async function inviteAssistant(
  profileId: string,
  email: string,
  firstName: string,
  lastName: string,
): Promise<AdminResult> {
  const supabase = await client();
  const { error } = await supabase.rpc("invite_assistant", {
    p_profile_id: profileId,
    p_email: email,
    p_first_name: firstName || null,
    p_last_name: lastName || null,
  });
  if (error) return fail(error);
  refresh(profileId);
  return { ok: true, data: undefined };
}

export async function removeAssistant(profileId: string): Promise<AdminResult> {
  const supabase = await client();
  const { error } = await supabase.rpc("remove_assistant", { p_profile_id: profileId });
  if (error) return fail(error);
  refresh(profileId);
  return { ok: true, data: undefined };
}

// === Aufgaben zum Selbst-Abhaken (SPK-024, 0149) ============================

/** Aufgabe anlegen oder ändern; schlüsselt auf Edition + `key`. */
export async function saveSpeakerTask(data: Record<string, unknown>): Promise<AdminResult> {
  const supabase = await client();
  const { error } = await supabase.rpc("upsert_speaker_task", { p_data: data });
  if (error) return fail(error);
  revalidatePath(`${PATH}/aufgaben`);
  return { ok: true, data: undefined };
}

/**
 * Aufgabe löschen. Die RPC weist das ab, sobald jemand sie abgehakt hat
 * (`task_has_ticks`) — dann bleibt nur das Stilllegen, und die Haken bleiben
 * nachlesbar.
 */
export async function deleteSpeakerTask(taskId: string): Promise<AdminResult> {
  const supabase = await client();
  const { error } = await supabase.rpc("delete_speaker_task", { p_task_id: taskId });
  if (error) return fail(error);
  revalidatePath(`${PATH}/aufgaben`);
  return { ok: true, data: undefined };
}

// === Kontakte: Assistenz, Agentur, Office in einer Liste (SPK-040, 0148) ====

/** Kontakt anlegen oder ändern — dieselbe RPC wie im Speaker-Portal. */
export async function saveSpeakerContact(
  data: Record<string, unknown>,
): Promise<AdminResult<string>> {
  const supabase = await client();
  const { data: id, error } = await supabase.rpc("upsert_speaker_contact", { p_data: data });
  if (error) return fail(error);
  refresh(String(data.profile_id ?? ""));
  return { ok: true, data: id as string };
}

/** Kontakt entfernen; ein Zugang geht damit auch. */
export async function removeSpeakerContact(contactId: string): Promise<AdminResult> {
  const supabase = await client();
  const { error } = await supabase.rpc("remove_speaker_contact", { p_contact_id: contactId });
  if (error) return fail(error);
  revalidatePath(PATH, "layout");
  return { ok: true, data: undefined };
}
