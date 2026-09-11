"use server";

import { revalidatePath } from "next/cache";
import { requireAnyArea } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseMoveResult, toRpcFailure, type MoveWarning } from "@/lib/rpc-error";
import type { SessionSpeaker } from "./types";

/**
 * Alle Board-Schreibwege laufen über die RPCs des Programm-Backends
 * (Migration `v2_programme_editor`) — mit dem **Session-Client**, nicht
 * service_role: `can_edit_slot()`/`can_edit_session()` prüfen gegen
 * `current_person_id()`, und genau diese Prüfung wollen wir hier.
 *
 * Das Board steht in drei Bereichen: `/admin/programm` für das Team,
 * `/speaker-leads/board` für die Leads, `/partner/buehne` für die Partner mit
 * eigener Bühne. Das Gate davor lässt alle drei herein; wer welchen Slot
 * ändern darf, bleibt Sache der Datenbank. Alle Pfade werden neu geladen,
 * sonst zeigt ein anderer Bereich einen alten Stand.
 */
const BOARD_PATHS = ["/admin/programm", "/speaker-leads/board", "/partner/buehne"] as const;

function revalidateBoard() {
  for (const path of BOARD_PATHS) revalidatePath(path);
}

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; key: string; detail?: string };

function fail(error: unknown): { ok: false; key: string; detail?: string } {
  const f = toRpcFailure(error as never);
  if (f.key === "unknown" && f.raw) console.error("[programm] RPC:", f.raw);
  return { ok: false, key: f.key, detail: f.detail };
}

async function client() {
  await requireAnyArea(["admin", "speaker-leads", "partner"], BOARD_PATHS[0]);
  return createSupabaseServerClient();
}

/** Slot verschieben oder in der Länge ändern. Warnungen sind kein Fehler. */
export async function moveSlot(input: {
  slotId: string;
  stageId: string;
  startAt: string;
  endAt: string;
  confirm?: boolean;
}): Promise<ActionResult<{ warnings: MoveWarning[] }>> {
  const supabase = await client();
  const { data, error } = await supabase.rpc("move_slot", {
    p_slot_id: input.slotId,
    p_stage_id: input.stageId,
    p_start: input.startAt,
    p_end: input.endAt,
    p_confirm: input.confirm ?? false,
  });
  if (error) return fail(error);
  revalidateBoard();
  return { ok: true, data: parseMoveResult(data) };
}

/** Neuen Slot anlegen; optional gleich eine Backlog-Session daran hängen. */
export async function createSlot(input: {
  stageId: string;
  startAt: string;
  endAt: string;
  slotType?: string;
  sessionId?: string | null;
}): Promise<ActionResult<{ slotId: string }>> {
  const supabase = await client();
  const { data, error } = await supabase.rpc("create_slot", {
    p_stage_id: input.stageId,
    p_start: input.startAt,
    p_end: input.endAt,
    p_slot_type: input.slotType ?? "content",
    p_session_id: input.sessionId ?? null,
  });
  if (error) return fail(error);
  revalidateBoard();
  return { ok: true, data: { slotId: data as string } };
}

export async function setSlotStatus(
  slotId: string,
  status: string,
): Promise<ActionResult> {
  const supabase = await client();
  const { error } = await supabase.rpc("set_slot_status", {
    p_slot_id: slotId,
    p_status: status,
  });
  if (error) return fail(error);
  revalidateBoard();
  return { ok: true, data: undefined };
}

export type SessionInput = {
  id?: string;
  event_id?: string;
  title_de?: string;
  title_en?: string;
  description_de?: string;
  description_en?: string;
  format?: string;
  language?: string;
  access_mode?: string;
  capacity?: string;
  ticket_required?: boolean;
  application_deadline?: string;
  confirm_by_hours?: string;
  track_id?: string;
  /**
   * Gastgebende Organisation. Ein Bühnen-Editor legt Sessions für die eigene
   * Org an — `upsert_session` setzt das nicht von selbst, es muss mit.
   */
  host_org_id?: string;
};

/** Anlegen oder ändern. `upsert_session` macht ein Teilupdate über die Schlüssel. */
export async function upsertSession(
  input: SessionInput,
): Promise<ActionResult<{ sessionId: string }>> {
  const supabase = await client();
  const { data, error } = await supabase.rpc("upsert_session", { p_data: input });
  if (error) return fail(error);
  revalidateBoard();
  return { ok: true, data: { sessionId: data as string } };
}

export async function attachSession(
  sessionId: string,
  slotId: string,
): Promise<ActionResult> {
  const supabase = await client();
  const { error } = await supabase.rpc("attach_session_to_slot", {
    p_session_id: sessionId,
    p_slot_id: slotId,
  });
  if (error) return fail(error);
  revalidateBoard();
  return { ok: true, data: undefined };
}

export async function detachSession(sessionId: string): Promise<ActionResult> {
  const supabase = await client();
  const { error } = await supabase.rpc("detach_session", { p_session_id: sessionId });
  if (error) return fail(error);
  revalidateBoard();
  return { ok: true, data: undefined };
}

export async function publishSession(sessionId: string): Promise<ActionResult> {
  const supabase = await client();
  const { error } = await supabase.rpc("publish_session", { p_session_id: sessionId });
  if (error) return fail(error);
  revalidateBoard();
  return { ok: true, data: undefined };
}

export async function unpublishSession(
  sessionId: string,
  reason?: string,
): Promise<ActionResult> {
  const supabase = await client();
  const { error } = await supabase.rpc("unpublish_session", {
    p_session_id: sessionId,
    p_reason: reason ?? null,
  });
  if (error) return fail(error);
  revalidateBoard();
  return { ok: true, data: undefined };
}

/**
 * Speaker einer Session komplett ersetzen.
 *
 * `confirmed` gehört mit in die Liste: die RPC behält den bisherigen Wert zwar,
 * wenn der Schlüssel fehlt, aber dann kennt nur die Datenbank die Wahrheit. Die
 * Oberfläche schickt, was sie anzeigt.
 */
export async function setSessionSpeakers(
  sessionId: string,
  speakers: {
    person_id: string;
    role?: string;
    sort_order?: number;
    confirmed?: boolean;
  }[],
): Promise<ActionResult> {
  const supabase = await client();
  const { error } = await supabase.rpc("set_session_speakers", {
    p_session_id: sessionId,
    p_speakers: speakers,
  });
  if (error) return fail(error);
  revalidateBoard();
  return { ok: true, data: undefined };
}

/**
 * Personensuche für die Speaker-Zuordnung — über die RPC `search_people`
 * (Migration 0022). Sie prüft `is_staff()` selbst, maskiert die E-Mail für
 * Nicht-Admins und escaped die Eingabe; damit braucht das Board keinen
 * service_role-Client mehr.
 */
export async function searchPeople(
  query: string,
): Promise<{ id: string; name: string }[]> {
  const supabase = await client();
  const { data, error } = await supabase.rpc("search_people", {
    p_query: query,
    p_limit: 10,
  });
  if (error) {
    console.error("[programm] search_people:", error.message);
    return [];
  }
  return ((data ?? []) as { id: string; display_name: string | null }[]).map((p) => ({
    id: p.id,
    name: p.display_name ?? "—",
  }));
}

export type SessionDetail = {
  id: string;
  title_de: string | null;
  title_en: string | null;
  description_de: string | null;
  description_en: string | null;
  format: string | null;
  language: string | null;
  access_mode: string | null;
  capacity: number | null;
  ticket_required: boolean;
  application_deadline: string | null;
  confirm_by_hours: number | null;
  publish_status: string | null;
  slot_id: string | null;
  speakers: SessionSpeaker[];
};

/** Details einer Session für den Editor. Lesen unter RLS, kein service_role. */
export async function loadSession(
  sessionId: string,
): Promise<SessionDetail | null> {
  const supabase = await client();
  const { data, error } = await supabase
    .from("session")
    .select(
      "id,title_de,title_en,description_de,description_en,format,language,access_mode,capacity,ticket_required,application_deadline,confirm_by_hours,publish_status,slot_id",
    )
    .eq("id", sessionId)
    .maybeSingle();
  if (error || !data) return null;

  const { data: speakers } = await supabase.rpc("session_speakers_public", {
    p_session_id: sessionId,
  });

  return {
    ...(data as Omit<SessionDetail, "speakers">),
    speakers: Array.isArray(speakers) ? (speakers as SessionSpeaker[]) : [],
  };
}

export type CatalogQuestion = {
  id: string;
  key: string;
  label: string;
  help: string | null;
  type: string;
};

/** Fragenkatalog für die Session-Fragen (Vokabular-gepflegt, nicht frei getippt). */
export async function loadQuestionCatalog(
  locale: "de" | "en",
): Promise<CatalogQuestion[]> {
  const supabase = await client();
  const { data } = await supabase
    .from("question_catalog")
    .select("id,key,label_de,label_en,help_de,help_en,type")
    .eq("active", true)
    // `file` (cv_upload) bräuchte einen Upload; bis der existiert (B4) würde die
    // Frage im Bewerbungsformular als Textfeld landen. Lieber gar nicht anbieten.
    .neq("type", "file")
    .order("sort_order");

  return ((data ?? []) as Record<string, string | null>[]).map((q) => ({
    id: q.id as string,
    key: q.key as string,
    label: (locale === "en" ? q.label_en : q.label_de) || (q.label_de as string),
    help: (locale === "en" ? q.help_en : q.help_de) ?? null,
    type: (q.type as string) ?? "text",
  }));
}

export async function loadSessionQuestions(
  sessionId: string,
): Promise<{ question_id: string; required: boolean; sort_order: number }[]> {
  const supabase = await client();
  const { data } = await supabase
    .from("session_question")
    .select("question_id, required, sort_order")
    .eq("session_id", sessionId)
    .not("question_id", "is", null)
    .order("sort_order");
  return ((data ?? []) as { question_id: string; required: boolean; sort_order: number | null }[])
    .map((q, i) => ({ ...q, sort_order: q.sort_order ?? i }));
}

/**
 * Fragen einer Session setzen. Über die RPC `set_session_questions` — die prüft
 * `can_edit_session()` selbst, schreibt ins Audit-Log und lässt eigene
 * Partner-Fragen (ohne `question_id`) stehen, solange `p_replace_custom` false
 * bleibt. Kein service_role nötig, damit die Scope-Regel des Backends gilt.
 */
export async function setSessionQuestions(
  sessionId: string,
  questions: { question_id: string; required: boolean; sort_order: number }[],
): Promise<ActionResult> {
  const supabase = await client();
  const { error } = await supabase.rpc("set_session_questions", {
    p_session_id: sessionId,
    p_questions: questions,
    p_replace_custom: false,
  });
  if (error) return fail(error);

  revalidateBoard();
  return { ok: true, data: undefined };
}
