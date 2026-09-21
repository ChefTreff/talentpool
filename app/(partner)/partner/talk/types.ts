/** Was `partner_format_sessions` und `partner_speakers` liefern (0133, 0139). */

export type PartnerFormatSession = {
  id: string;
  format: string;
  title_de: string | null;
  title_en: string | null;
  description_de: string | null;
  description_en: string | null;
  language: string | null;
  access_mode: string | null;
  capacity: number | null;
  publish_status: string;
  format_details: Record<string, unknown>;
  starts_at: string | null;
  ends_at: string | null;
  stage_name: string | null;
  day_label_de: string | null;
  applications_total: number;
  applications_accepted: number;
  is_host: boolean;
  /** Seit 0140. Die Zuordnung laeuft ueber die Kennung, nicht ueber den Namen. */
  stage_id: string | null;
  event_day_id: string | null;
};

/**
 * Ein Speaker, den dieser Partner eingetragen hat.
 *
 * Alle Felder ab `title` sind **null, solange `can_edit` falsch ist** — bei
 * einer nur zugeordneten Person und nach ihrem ersten Login. Das ist keine
 * Lücke in den Daten, sondern die Regel: ab da gehören die Angaben ihr.
 */
export type PartnerSpeaker = {
  profile_id: string;
  person_id: string;
  session_id: string | null;
  session_title: string | null;
  display_name: string | null;
  can_edit: boolean;
  confirmed: boolean;
  pipeline_status: string | null;
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  job_title: string | null;
  organization_name: string | null;
  bio_short_de: string | null;
  bio_short_en: string | null;
  bio_long_de: string | null;
  bio_long_en: string | null;
  linkedin_url: string | null;
  socials: Record<string, unknown> | null;
  photo_asset_id: string | null;
};
