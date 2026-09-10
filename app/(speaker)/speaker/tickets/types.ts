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
  companion: CompanionTicket | null;
  companion_history: CompanionHistoryEntry[];
};
