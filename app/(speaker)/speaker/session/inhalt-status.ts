import type { BadgeTone } from "@/components/ui/Badge";
import type { SessionSubmission } from "./types";

/**
 * Wo Titel und Beschreibung einer Session gerade stehen (SPK-050).
 *
 * Konrad am 24.09.: unter „Eingereicht" stand „Noch nichts eingereicht",
 * obwohl die Inhalte final im Programm standen — das Team hatte sie direkt
 * eingetragen. Die Seite zeigt deshalb nicht mehr zwei Spalten
 * („eingereicht" gegen „final"), sondern **eine** Übersicht dessen, was gilt,
 * mit einem Status in Konrads Worten: „Eingereicht" / „Veröffentlicht", bei
 * Änderungen „Änderung eingereicht" / „Änderung veröffentlicht".
 *
 * - `live` heisst: die Session ist veröffentlicht (`publish_status`).
 * - Eine Einreichung ist eine **Änderung**, wenn die Session schon
 *   veröffentlicht ist oder vor ihr schon eine Einreichung übernommen wurde
 *   (`is_change` aus `my_sessions`, Vorschlag v6_session_inhalt_status). Ohne
 *   den Schlüssel — vor dieser Migration — gilt nur die erste Hälfte, und eine
 *   übernommene Änderung heisst schlicht „Veröffentlicht". Das ist nicht falsch,
 *   nur weniger genau.
 */
export type InhaltsStatus =
  | "none"
  | "draft"
  | "submitted"
  | "approved"
  | "published"
  | "change_submitted"
  | "change_published"
  | "rejected";

export function inhaltsStatus(
  session: { publish_status: string | null; hatFinal: boolean },
  submission: Pick<SessionSubmission, "status" | "is_change"> | null,
): InhaltsStatus {
  const live = session.publish_status === "published";
  const aenderung = submission?.is_change === true;
  switch (submission?.status) {
    case "submitted":
      return live || aenderung ? "change_submitted" : "submitted";
    case "rejected":
      return "rejected";
    case "approved":
      if (live) return aenderung ? "change_published" : "published";
      return "approved";
  }
  // Keine Einreichung (oder nur eine ersetzte): was das Team eingetragen hat.
  if (live) return "published";
  return session.hatFinal ? "draft" : "none";
}

/** Farbe zum Status — der Text steht immer dabei (Design-Regel 4). */
export const INHALT_TONE: Record<InhaltsStatus, BadgeTone> = {
  none: "neutral",
  draft: "neutral",
  submitted: "accent",
  approved: "success",
  published: "success",
  change_submitted: "accent",
  change_published: "success",
  rejected: "error",
};
