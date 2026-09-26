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
  /** Themen aus `session_topic` (LEAD-019). */
  tags?: string[];
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

/**
 * Eine Session einer Standbühne freigeben oder mit Grund zurückgeben
 * (LEAD-022, PART-050).
 *
 * `release_partner_session` gab es seit PART-050, aber keine Oberfläche rief
 * sie auf — Partner-Sessions blieben in `review` liegen. Die Funktion prüft
 * selbst, was für die Freigabe fehlt (`fields_required` mit den Feldern im
 * Detail), und verlangt beim Zurückgeben einen Grund.
 */
export async function releasePartnerSession(
  sessionId: string,
  approved: boolean,
  note: string | null,
): Promise<ActionResult> {
  const supabase = await client();
  const { error } = await supabase.rpc("release_partner_session", {
    p_session_id: sessionId,
    p_approved: approved,
    p_note: note,
  });
  if (error) return fail(error);
  revalidateBoard();
  revalidatePath("/admin/programm/freigabe");
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
  host_org_id: string | null;
  moderation_person_id: string | null;
  tags: string[] | null;
  speakers: SessionSpeaker[];
  /**
   * Der Name des **buchenden** Partners — Leads dürfen `organization` nicht
   * lesen. Die Moderation steht nicht hier, sondern als Speaker mit der Rolle
   * `moderator` in `speakers`.
   */
  refs: { partner: { id: string; name: string | null } | null };
  /**
   * LEAD-038: der Grund, mit dem die Programmleitung die Partner-Session
   * zurückgegeben hat (`partner_session_return`) — nur für die
   * Programmleitung; alle anderen bekommen `null`.
   */
  rueckgabe: { note: string; returned_at: string; returned_by_name: string | null } | null;
};

/** Details einer Session für den Editor. Lesen unter RLS, kein service_role. */
export async function loadSession(
  sessionId: string,
): Promise<SessionDetail | null> {
  const supabase = await client();
  const { data, error } = await supabase
    .from("session")
    .select(
      "id,title_de,title_en,description_de,description_en,format,language,access_mode,capacity,ticket_required,application_deadline,confirm_by_hours,publish_status,slot_id,host_org_id,moderation_person_id,tags",
    )
    .eq("id", sessionId)
    .maybeSingle();
  if (error || !data) return null;

  const [{ data: speakers }, { data: refs }, { data: rueckgaben }] = await Promise.all([
    supabase.rpc("session_speakers_public", { p_session_id: sessionId }),
    // Fehlt die Funktion noch (Migration nicht live) oder das Recht, bleiben
    // die Namen leer — der Drawer zeigt dann die Kennung nicht, sondern nichts.
    supabase.rpc("board_session_refs", { p_session_id: sessionId }),
    // LEAD-038: nur die Programmleitung; für alle anderen 42501 — dann eben keiner.
    supabase.rpc("board_session_return", { p_session_id: sessionId }),
  ]);
  const rueckgabe = Array.isArray(rueckgaben) && rueckgaben.length > 0 ? (rueckgaben[0] as SessionDetail["rueckgabe"]) : null;

  return {
    ...(data as Omit<SessionDetail, "speakers" | "refs" | "rueckgabe">),
    speakers: Array.isArray(speakers) ? (speakers as SessionSpeaker[]) : [],
    refs: (refs as SessionDetail["refs"] | null) ?? { partner: null },
    rueckgabe,
  };
}

/**
 * Speaker der Edition suchen — für Speaker und Moderation (LEAD-019/020).
 *
 * Über `board_search_people` statt `search_people`: die alte Suche verlangt
 * admin, ein Stage Lead bekam 42501. Die neue findet nur Personen mit
 * Speaker-Profil in der Edition und gibt keine Mailadresse heraus.
 */
export async function searchBoardPeople(
  eventId: string,
  query: string,
  /**
   * Für die Moderation (LEAD-042): dann kommen die Stage Leads der Edition
   * dazu — als Moderation wählbar, ohne Speaker-Profil und ohne Speaker-Hub.
   */
  opts?: { moderation?: boolean },
): Promise<{ id: string; name: string; hint: string | null; stageLead: boolean }[]> {
  const supabase = await client();
  const { data, error } = await supabase.rpc("board_search_people", {
    p_event_id: eventId,
    p_query: query,
    p_limit: 10,
    p_moderation: opts?.moderation ?? false,
  });
  if (error) {
    console.error("[programm] board_search_people:", error.message);
    return [];
  }
  return (
    (data ?? []) as { id: string; display_name: string | null; organization: string | null; is_stage_lead: boolean }[]
  ).map((p) => ({ id: p.id, name: p.display_name ?? "—", hint: p.organization, stageLead: p.is_stage_lead === true }));
}

/**
 * Den **buchenden** Partner setzen oder abnehmen (Korrektur zu #147).
 *
 * `partner_org_id` = hat gebucht, auch beim Talk auf unserer Bühne;
 * `host_org_id` = richtet aus und öffnet dem Partner die Bewerbersicht. Das
 * Partnerfeld im Board meint das Erste.
 */
export async function setSessionPartner(
  sessionId: string,
  orgId: string | null,
): Promise<ActionResult> {
  const supabase = await client();
  const { error } = await supabase.rpc("set_session_partner", {
    p_session_id: sessionId,
    p_org_id: orgId,
  });
  if (error) return fail(error);
  revalidateBoard();
  return { ok: true, data: undefined };
}

/** Partner der Edition suchen (LEAD-019, LEAD-010/ADM-025). */
export async function searchBoardPartners(
  eventId: string,
  query: string,
): Promise<{ id: string; name: string; hint: string | null }[]> {
  const supabase = await client();
  const { data, error } = await supabase.rpc("board_search_partners", {
    p_event_id: eventId,
    p_query: query,
    p_limit: 10,
  });
  if (error) {
    console.error("[programm] board_search_partners:", error.message);
    return [];
  }
  return ((data ?? []) as { id: string; name: string | null }[]).map((o) => ({
    id: o.id,
    name: o.name ?? "—",
    hint: null,
  }));
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
