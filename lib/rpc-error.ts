import type { PostgrestError } from "@supabase/supabase-js";

/**
 * Fehler aus den RPCs in einen stabilen Schlüssel übersetzen.
 * Die UI schlägt ihn in `messages.rpc` im Dictionary nach — so steht kein
 * Datenbanktext in einer Oberfläche und nichts muss doppelt übersetzt werden.
 *
 * Codes laut `docs/datenmodell-v2.md`:
 *   42501 nicht erlaubt · 23P01 Überlappung auf der Bühne · 23514 Pflichtfeld/Regel
 *   23505 bereits vorhanden · P0001 fachliche Ablehnung (message = Schlüssel)
 *   P0002 nicht gefunden · 22023 ungültiges Argument · 28000 nicht angemeldet
 */
export type RpcFailure = {
  /** Schlüssel für `messages.rpc.<key>`; `unknown`, wenn nichts passt. */
  key: string;
  /** `detail` der Ausnahme — z. B. kollidierende Session-IDs bei `collision`. */
  detail?: string;
  /** Originaltext, nur für Logs und Diagnose. */
  raw: string;
};

/** Schlüssel, die P0001 über `message` transportiert (Datenmodell §Fehlercodes). */
const BUSINESS_KEYS = new Set([
  "confirmation_required",
  "deadline_passed",
  "not_eligible",
  "not_released",
  "ticket_required",
  "collision",
  "confirm_deadline_passed",
  "cannot_withdraw",
  "not_confirmable",
  "unpublish_first",
  "missing_required_answers",
  "already_applied",
  "session_not_open",
  "session_not_application",
  "session_not_registration",
  "slot_occupied",
  "session_not_found",
  "slot_not_found",
  "application_not_found",
  "registration_not_found",
  // Entscheidungen und Rollenverwaltung (Migration 0022)
  "not_decidable",
  "invalid_decision",
  "invalid_role",
  "last_admin",
  "person_not_found",
  "assignment_not_found",
]);

const BY_CODE: Record<string, string> = {
  "42501": "not_allowed",
  "23P01": "slot_overlap",
  "23514": "constraint_violated",
  "23505": "already_exists",
  P0002: "not_found",
  "22023": "invalid_argument",
  "28000": "not_authenticated",
};

export function toRpcFailure(error: PostgrestError | null | undefined): RpcFailure {
  if (!error) return { key: "unknown", raw: "" };

  const raw = error.message ?? "";
  const detail = error.details ?? undefined;

  // P0001 trägt den Schlüssel im Text; die RPCs melden ihn ohne Zusatz.
  const firstWord = raw.trim().split(/[\s:]/)[0];
  if (BUSINESS_KEYS.has(raw.trim())) return { key: raw.trim(), detail, raw };
  if (BUSINESS_KEYS.has(firstWord)) return { key: firstWord, detail, raw };

  const byCode = error.code ? BY_CODE[error.code] : undefined;
  if (byCode) return { key: byCode, detail, raw };

  return { key: "unknown", detail, raw };
}

/** Warnungen aus `move_slot` — keine Fehler, sondern Hinweise im Toast. */
export const MOVE_WARNINGS = [
  "before_open",
  "after_close",
  "off_grid_5min",
  "changeover_short",
  "speaker_conflict",
] as const;

export type MoveWarning = (typeof MOVE_WARNINGS)[number];

export function parseMoveResult(data: unknown): { warnings: MoveWarning[] } {
  const warnings =
    data && typeof data === "object" && Array.isArray((data as { warnings?: unknown }).warnings)
      ? ((data as { warnings: unknown[] }).warnings.filter(
          (w): w is MoveWarning => typeof w === "string" && (MOVE_WARNINGS as readonly string[]).includes(w),
        ) as MoveWarning[])
      : [];
  return { warnings };
}
