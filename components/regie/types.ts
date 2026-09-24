/** Zeilen der Regie-RPCs (Migration 0082, Rechte seit 0101 über `can_edit_regie`). */

export type RegieCue = {
  cue_id: string;
  cue_start: string;
  cue_end: string;
  sort_order: number;
  action: string;
  umbau_min: number | null;
  moderation: string | null;
  regie: string | null;
  backstage: string | null;
  mobiliar: string | null;
  /** Wer auf der Bühne steht — Angabe der Stage Leads (SPK-029). */
  people_on_stage: string | null;
  notes: string | null;
  mic_assignments: Record<string, unknown>;
  media: Record<string, unknown>;
  slot_id: string | null;
  slot_status: string | null;
  session_id: string | null;
  title: string | null;
  format: string | null;
  speakers: { person_id: string; first_name: string | null; last_name: string | null }[] | null;
  /**
   * Die Technik-Ansage des Speakers zu dieser Session (0121, aus `session.tech`).
   *
   * **Nur Anzeige.** Die Disposition der Regie steht in `mic_assignments` und
   * `media` und wird davon nicht berührt — sonst gäbe es zwei Felder für
   * dieselbe Aussage und keines wäre die Wahrheit. Cues ohne Session (Doors
   * open, Puffer) tragen ein leeres Objekt.
   */
  tech: Record<string, string | boolean> | null;
};

export type OpenSlot = {
  slot_id: string;
  start_at: string;
  end_at: string;
  title: string | null;
  format: string | null;
};

/** Bühne, an der diese Person Regie machen darf (`my_regie_stages`). */
export type RegieStage = {
  stage_id: string;
  stage_name: string;
  event_id: string;
  edition_id: string;
};
