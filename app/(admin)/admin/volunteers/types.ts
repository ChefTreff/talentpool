/** Zeilen der Volunteer-Team-RPCs (Kontrakt A1, Migrationen 0065–0069). */

export type VolunteerRow = {
  profile_id: string;
  person_id: string;
  display_name: string | null;
  email: string | null;
  status: "applied" | "accepted" | "declined" | "withdrawn";
  shirt_size: string | null;
  areas: string[] | null;
  day_prefs: string[] | null;
  availability: Record<string, unknown> | null;
  buddy_note: string | null;
  notes_internal: string | null;
  applied_at: string;
  decided_at: string | null;
  shifts_assigned: number;
  shifts_confirmed: number;
  birthdate: string | null;
};

export type ShiftPerson = {
  assignment_id: string;
  person_id: string;
  status: "assigned" | "confirmed" | "declined" | "no_show" | "waitlisted";
  name: string | null;
};

export type ShiftRow = {
  id: string;
  event_day_id: string | null;
  area: string;
  position: string;
  start_at: string;
  end_at: string;
  capacity: number;
  overbook: number;
  location: string | null;
  lead_person_id: string | null;
  lead_name: string | null;
  briefing_md: string | null;
  active: boolean;
  taken: number;
  waitlisted: number;
  people: ShiftPerson[];
};

export type VolunteerDay = {
  id: string;
  event_id: string;
  day_date: string;
  label_de: string | null;
  label_en: string | null;
  sort_order: number;
};

export const VOLUNTEER_STATUS = ["applied", "accepted", "declined", "withdrawn"] as const;

/** Freie Plätze einer Schicht — `capacity + overbook` minus Belegung (E9). */
export function freeSeats(shift: Pick<ShiftRow, "capacity" | "overbook" | "taken">): number {
  return shift.capacity + shift.overbook - shift.taken;
}

/**
 * Wer für eine Schicht in Frage kommt: angenommene Bewerbungen, die nicht
 * schon auf dieser Schicht stehen. Absagen bleiben draußen — wer abgesagt hat,
 * wird nicht aus Versehen wieder eingetragen.
 */
export function candidatesFor(
  shift: ShiftRow,
  volunteers: readonly VolunteerRow[],
): VolunteerRow[] {
  const taken = new Set(shift.people.map((p) => p.person_id));
  return volunteers.filter((v) => v.status === "accepted" && !taken.has(v.person_id));
}

/** Verteilung über die Bereiche, für die Kopfzeile des Schichtplans. */
export function shiftTotals(shifts: readonly ShiftRow[]): {
  shifts: number;
  seats: number;
  taken: number;
  waitlisted: number;
  open: number;
} {
  return shifts.reduce(
    (acc, s) => ({
      shifts: acc.shifts + 1,
      seats: acc.seats + s.capacity + s.overbook,
      taken: acc.taken + s.taken,
      waitlisted: acc.waitlisted + s.waitlisted,
      open: acc.open + Math.max(freeSeats(s), 0),
    }),
    { shifts: 0, seats: 0, taken: 0, waitlisted: 0, open: 0 },
  );
}
