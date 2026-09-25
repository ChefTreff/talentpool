import type { Einordnung } from "@/lib/speaker/einordnung";
import type { SpeakerContact } from "@/app/(speaker)/speaker/types";

import type { ManagedSpeaker } from "@/app/(speaker-leads)/speaker-leads/types";

/** Die Liste ist dieselbe wie im Lead-Portal — nur sieht das Team hier alle. */
export type AdminSpeakerRow = ManagedSpeaker;

/** Ein Slot oder eine Session, an der der Speaker hängt. */
export type DetailSession = {
  session_id: string;
  title_de: string | null;
  title_en: string | null;
  publish_status: string | null;
  start_at: string | null;
  stage_name: string | null;
};

/** Antwort aus `speaker_detail()` (Migration 0103). */
/**
 * Antwort aus `speaker_detail()`. Die Einordnung (LEAD-039) kommt über
 * `Einordnung` dazu — dieselben Schlüssel wie in `manager_speakers`.
 */
export type SpeakerDetail = Einordnung & {
  id: string;
  edition_id: string;
  person: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    title: string | null;
    email: string | null;
    preferred_language: string | null;
    salutation_de: string | null;
    salutation_en: string | null;
    has_account: boolean;
  };
  speaker_type: string;
  pipeline_status: string;
  confirmed_at: string | null;
  declined_at: string | null;
  decline_reason: string | null;
  invited_at: string | null;
  owner_person_id: string | null;
  owner_name: string | null;
  assistant_person_id: string | null;
  assistant_name: string | null;
  job_title: string | null;
  organization_name: string | null;
  org_id: string | null;
  org_name: string | null;
  bio_short_de: string | null;
  bio_short_en: string | null;
  bio_long_de: string | null;
  bio_long_en: string | null;
  socials: Record<string, string> | null;
  tech_rider: Record<string, unknown> | null;
  photo_asset_id: string | null;
  reception_eligible: boolean;
  lounge_access: boolean;
  pass_type: string;
  hotel_tier: string;
  hospitality_status: string;
  /** Kontakte aus `speaker_contact` (0148) — Assistenz, Agentur, Office. */
  speaker_contacts: SpeakerContact[];
  travel_costs_covered: boolean;
  /** Wie abgerechnet wird: per Beleg oder als Pauschale (SPK-042). */
  expense_mode: "receipts" | "lump_sum";
  /** Der Pauschalbetrag in Cent — nur bei `lump_sum` gesetzt. */
  expense_lump_sum_cents: number | null;
  travel_costs_approved_at: string | null;
  travel_costs_approved_by: string | null;
  lead_contact_id: string | null;
  buddy_contact_id: string | null;
  contacts: { id: string; type: string; display_name: string }[];
  travel: {
    arrival_date: string | null;
    arrival_time: string | null;
    arrival_mode: string | null;
    arrival_ref: string | null;
    departure_date: string | null;
    departure_time: string | null;
    departure_mode: string | null;
    departure_ref: string | null;
    needs_pickup: boolean;
    note: string | null;
  } | null;
  sessions: DetailSession[];
  /**
   * `false` heisst: es gibt vielleicht eine Notiz, du siehst sie nur nicht.
   * Ohne diese Unterscheidung wäre ein leeres Feld zweideutig — und wer
   * hineinschriebe, überschriebe fremden Text ungesehen.
   */
  internal_notes_visible: boolean;
  internal_notes?: string | null;
  created_at: string;
  updated_at: string;
};

/** Eine Lead-Person aus `speaker_managers()`. */
export type SpeakerManager = {
  person_id: string;
  display_name: string | null;
  email: string | null;
};

/** Ein Ansprechpartner aus `edition_contacts_admin()`. */
export type ContactOption = {
  id: string;
  edition_id: string;
  type: string;
  display_name: string;
};

/**
 * Dieselben Felder, die der Speaker in seinem Portal ausfüllt — nicht mehr und
 * nicht weniger. Böte der Admin-Bereich ein freies Schlüssel-Wert-Paar an,
 * stünden am Ende Werte in der Spalte, die keine Ansicht mehr ausliest.
 */
export const SOCIAL_KEYS = ["website", "x", "instagram"] as const;

/** Tech-Rider wie im Speaker-Portal: Mikrofon als Text, zwei Haken, Notiz. */
export const RIDER_FLAGS = ["own_laptop", "video"] as const;
