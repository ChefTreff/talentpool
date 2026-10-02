/** Wunschprofil je Challenge (HACK-015) — Form der Leserolle und die Passung zur Bewerbung. */
export type Wunschprofil = {
  challenge_id: string;
  title: string;
  org_name: string | null;
  study_fields: string[];
  skills: string[];
  profile: string | null;
  can_edit: boolean;
};

/** Hat die Challenge überhaupt ein Wunschprofil? */
export function hatWunschprofil(w: Wunschprofil): boolean {
  return w.study_fields.length > 0 || w.skills.length > 0 || Boolean(w.profile?.trim());
}

/**
 * Challenges, zu denen eine Bewerbung passt: gleiches Studienfeld oder
 * mindestens ein gemeinsamer Skill. Eine Hilfe für die Auswahl, keine Regel —
 * Challenges ohne Wunschprofil zählen nicht.
 */
export function passendeChallenges(
  profile: Wunschprofil[],
  person: { study_field: string | null; profile_skills: string[] | null },
): Wunschprofil[] {
  const skills = new Set(person.profile_skills ?? []);
  return profile.filter(
    (w) =>
      (person.study_field != null && w.study_fields.includes(person.study_field)) ||
      w.skills.some((s) => skills.has(s)),
  );
}
