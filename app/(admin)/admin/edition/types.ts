/** Antwort aus `programme_skeleton()` (Migration 0110). */
export type Geruest = {
  event: {
    id: string;
    name: string;
    slug: string | null;
    start_date: string | null;
    end_date: string | null;
    timezone: string | null;
    venue: string | null;
  } | null;
  days: GeruestTag[];
  stages: GeruestBuehne[];
  stage_days: GeruestBuehnenTag[];
  tracks: GeruestTrack[];
};

export type GeruestTag = {
  id: string;
  day_date: string;
  label_de: string | null;
  label_en: string | null;
  doors_open: string | null;
  programme_start: string | null;
  programme_end: string | null;
  sort_order: number;
  /** Hängt etwas daran? Entscheidet, ob gelöscht werden kann. */
  slots: number;
};

export type GeruestBuehne = {
  id: string;
  name: string;
  slug: string | null;
  type: string;
  /** Art der Bühne, abgeleitet aus Typ und Partner (ADM-085): main, branded, booth, masterclass, interview_table, side_event. */
  kind: string | null;
  /** Gültigkeitstage `JJJJ-MM-TT`; leer = alle Eventtage (ADM-085). */
  valid_days: string[];
  room: string | null;
  capacity: number | null;
  changeover_min: number;
  default_duration_min: number;
  partner_slot_quota: number | null;
  partner_org_id: string | null;
  partner_org_name: string | null;
  stage_lead_person_id: string | null;
  stage_lead_name: string | null;
  sort_order: number;
  active: boolean;
  slots: number;
};

export type GeruestBuehnenTag = {
  id: string;
  stage_id: string;
  event_day_id: string;
  open_from: string | null;
  open_to: string | null;
  slot_quota: number | null;
  notes: string | null;
};

export type GeruestTrack = {
  id: string;
  name_de: string;
  name_en: string | null;
  slug: string | null;
  sort_order: number;
  sessions: number;
};

/**
 * Die Typen des Vokabulars `stage_type`. Vorher standen hier nur vier; Interview Tables und Side-Event-Orte (beide live vorhanden)
 * ließen sich im Formular nicht darstellen — die Auswahl zeigte dann stillschweigend den ersten Eintrag (ADM-085: „das Formular
 * zeigt den Typ ausdrücklich“).
 */
export const BUEHNEN_ARTEN = ["main", "side", "partner_booth", "room", "interview_table", "side_event_venue"] as const;

/** Die Arten (`stage.kind`), wie sie die Datenbank ableitet — für die Beschriftung der Zeile. */
export const BUEHNEN_KINDS = ["main", "branded", "booth", "masterclass", "interview_table", "side_event"] as const;
