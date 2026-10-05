/** Das eigene Speaker-Ticket. `barcode` bleibt NULL bis zur Ausstellung. */
export type OwnTicket = {
  id: string;
  status: string;
  pass_type: string | null;
  lounge_access: boolean;
  /**
   * Die Eintrittsberechtigung. Gehört in den QR-Code und sonst nirgendwohin —
   * der Assistenz gibt die RPC sie gar nicht erst (Migration 0036), deshalb
   * hier NULL auch dann, wenn das Ticket längst ausgestellt ist.
   */
  barcode: string | null;
  /** Ausgestellt? Sagt auch der Assistenz, woran sie ist. */
  issued: boolean;
  holder_first_name: string | null;
  holder_last_name: string | null;
  holder_company: string | null;
  holder_position: string | null;
  personalization_status: string | null;
  checked_in_at: string | null;
  created_at: string;
  issued_at: string | null;
};

export type CompanionTicket = {
  id: string;
  status: string;
  pass_type: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  team_note: string | null;
  created_at: string;
  approved_at: string | null;
  issued_at: string | null;
  /** Ausgestellt — der Barcode geht direkt an die Begleitung, nicht hierher. */
  issued: boolean;
  /** Lounge-Zugang der Begleitung (ADM-076) — das Team setzt ihn je Ticket. Fehlt, solange die Migration nicht lebt. */
  lounge_access?: boolean;
};

export type CompanionHistoryEntry = {
  id: string;
  status: string;
  first_name: string | null;
  last_name: string | null;
  team_note: string | null;
  created_at: string;
};

/** Antwort aus `my_speaker_tickets()`. */
export type SpeakerTickets = {
  /** Ab `confirmed` in der Pipeline steht das Ticket zu. */
  eligible: boolean;
  pipeline_status: string;
  pass_type: string | null;
  lounge_access: boolean;
  /** Sieht gerade die Assistenz zu? Dann fehlt der Barcode absichtlich. */
  is_assistant: boolean;
  own: OwnTicket | null;
  /** Das jüngste aktive Begleitticket — so lasen es die Stände vor ADM-076; die Ansicht liest `companions`. */
  companion: CompanionTicket | null;
  /**
   * ADM-076: **alle** aktiven Begleitungen, die älteste zuerst, dazu das Kontingent. Fehlt, solange die Migration
   * `v6_speaker_tickets_final` nicht angewendet ist — dann gilt wie bisher genau eine Begleitung (`companion`).
   */
  companions?: CompanionTicket[];
  companion_quota?: number;
  companion_used?: number;
  companion_history: CompanionHistoryEntry[];
};

/**
 * Was die Ansicht aus der Antwort liest — mit dem alten Stand als Rückfall: ohne die neuen Felder eine Begleitung und
 * Kontingent 1, so wie es bis ADM-076 galt. Eine Funktion statt Ausdrücke in der Ansicht, damit der Rückfall getestet ist.
 */
export function begleitungen(t: Pick<SpeakerTickets, "companion" | "companions" | "companion_quota" | "companion_used">): {
  liste: CompanionTicket[];
  kontingent: number;
  vergeben: number;
  kannAnfragen: boolean;
} {
  const liste = t.companions ?? (t.companion ? [t.companion] : []);
  const kontingent = t.companion_quota ?? 1;
  const vergeben = t.companion_used ?? liste.length;
  return { liste, kontingent, vergeben, kannAnfragen: vergeben < kontingent };
}
