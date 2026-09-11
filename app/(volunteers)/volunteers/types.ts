/** Zeilen und Formen der Volunteer-RPCs (Kontrakt A1). */

export type VolunteerStatus = "applied" | "accepted" | "declined" | "withdrawn";

/** Rückgabe von `my_volunteer_profile()` — `null`, solange keine Bewerbung vorliegt. */
export type VolunteerProfile = {
  id: string;
  edition_id: string;
  status: VolunteerStatus;
  shirt_size: string | null;
  areas: string[];
  day_prefs: string[];
  availability: Record<string, unknown> | null;
  buddy_person_id: string | null;
  buddy_note: string | null;
  applied_at: string;
  decided_at: string | null;
  decision_note: string | null;
  shifts: number;
};

/** Zeile aus `my_shifts()`. */
export type MyShift = {
  assignment_id: string;
  shift_id: string;
  status: "assigned" | "confirmed" | "waitlisted" | "no_show";
  area: string;
  position: string;
  start_at: string;
  end_at: string;
  location: string | null;
  briefing_md: string | null;
  lead_name: string | null;
  confirmed_at: string | null;
  day_label_de: string | null;
  day_label_en: string | null;
};

export type EventDay = {
  id: string;
  day_date: string;
  label_de: string | null;
  label_en: string | null;
};

/** Was der Wizard sammelt und `apply_volunteer` erwartet. */
export type ApplyDraft = {
  birthdate: string;
  shirt_size: string;
  areas: string[];
  day_prefs: string[];
  availability: string;
  buddy_note: string;
  consents: { terms: boolean; privacy: boolean; photo_video: boolean };
};

/**
 * Wer angenommen ist, sieht die Schichten. Vorher gibt es nichts zu zeigen —
 * die Zuteilung macht das Team (Antwort 26), nicht die Person selbst.
 */
export function canSeeShifts(profile: VolunteerProfile | null): boolean {
  return profile?.status === "accepted";
}
