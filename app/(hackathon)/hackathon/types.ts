/** Formen der Hackathon-RPCs (Migration 0085). Der Bereich ist englisch. */

export type HackMember = { person_id: string; name: string | null; is_captain: boolean };

export type HackCriterion = { key: string; label: string; weight: number };

export type MyHack = {
  edition_id: string | null;
  application: {
    id: string;
    status: "applied" | "accepted" | "declined" | "withdrawn";
    skills: string[];
    motivation: string | null;
    team_pref: string | null;
    applied_at: string;
    github_url?: string | null;
    website_url?: string | null;
    behance_url?: string | null;
    /** Gewünschte Tracks (vocab hack_track, HACK-010). */
    track_prefs?: string[];
    /** „Ich suche ein Team“ (HACK-016). */
    seeking_team?: boolean;
  } | null;
  team: {
    id: string;
    name: string;
    status: string;
    join_code: string;
    discord_url: string | null;
    members: HackMember[];
  } | null;
  challenge: {
    id: string;
    title: string;
    description: string | null;
    prizes: string | null;
    resources: string | null;
    criteria: HackCriterion[];
    track?: string | null;
    /** Abgabefrist der Challenge (HACK-011). */
    submission_deadline?: string | null;
  } | null;
  submission: {
    url: string | null;
    repo_url: string | null;
    notes: string | null;
    submitted_at: string | null;
    /** Nach der Frist eingereicht (HACK-011). */
    late?: boolean;
  } | null;
};

export type HackChallenge = {
  id: string;
  title: string;
  description: string | null;
  prizes: string | null;
  resources: string | null;
  /** Eine Zeile je Person, aus dem Formularfeld `mentor_names` der Partner-Pflicht. */
  mentors: string[] | null;
  criteria: HackCriterion[];
  org_name: string | null;
  teams: number;
  /** vocab hack_track (HACK-008); ältere Challenges können ohne sein. */
  track: string | null;
  /** Auswertungsart (HACK-009): Jury (Pitch) oder Metrik (Leaderboard). */
  judging_mode: "jury" | "metric";
  metric_label: string | null;
  metric_higher_better: boolean;
  /** Abgabefrist (HACK-011). */
  submission_deadline?: string | null;
};

/** Eine Zeile aus `hack_leaderboard` (HACK-009). Rang nur bei bestätigten Werten. */
export type LeaderboardRow = {
  rank: number | null;
  team_id: string;
  team_name: string;
  value: number;
  confirmed: boolean;
  is_mine: boolean;
};

/** Eingereichtes, noch nicht freigegebenes Challenge-Formular (`hack_open_challenges`). */
export type HackOpenChallenge = {
  deliverable_id: string;
  org_name: string;
  title: string | null;
  /** Track aus der Formularantwort, falls erkennbar. */
  track: string | null;
};

export type HackTeamRow = {
  team_id: string;
  team_name: string;
  status: string;
  members: number;
  captain: string | null;
  challenge_id: string | null;
  challenge_title: string | null;
  submitted_at: string | null;
  scores: number;
  avg_total: number | null;
  late?: boolean;
};

export type JudgingRow = {
  team_id: string;
  team_name: string;
  challenge_title: string | null;
  criteria: HackCriterion[];
  submission_url: string | null;
  repo_url: string | null;
  notes: string | null;
  submitted_at: string | null;
  my_criteria: Record<string, number> | null;
  my_total: number | null;
  my_note: string | null;
  judging_mode: "jury" | "metric";
  metric_label: string | null;
  metric_value: number | null;
  metric_confirmed: boolean;
  late?: boolean;
};

/** Teamsuche (HACK-016) — Formen der Leserollen. Nie Kontaktdaten. */
export type OffenesTeam = {
  team_id: string;
  team_name: string;
  challenge_title: string | null;
  track: string | null;
  members: number;
  free_slots: number;
  looking_skills: string[];
  looking_note: string | null;
  /** Offene Anfrage zwischen mir und dem Team (`to_team`/`to_person`) oder null. */
  my_request: "to_team" | "to_person" | null;
};

export type SuchendePerson = {
  person_id: string;
  first_name: string | null;
  study_field: string | null;
  skills: string[];
  track_prefs: string[];
  invited: boolean;
};

export type Beitrittsanfrage = {
  request_id: string;
  direction: "to_team" | "to_person";
  status: "pending" | "accepted" | "declined" | "withdrawn";
  team_id: string;
  team_name: string;
  person_first_name: string | null;
  message: string | null;
  created_at: string;
  mine_to_answer: boolean;
};

/** Rückgabe von `hack_event_info()` (HACK-020): Eckdaten, Ansprechperson, Zähler. */
export type HackEventInfo = {
  start_date: string | null;
  end_date: string | null;
  start_time: string | null;
  end_time: string | null;
  starts_at: string | null;
  ends_at: string | null;
  timezone: string;
  venue: string | null;
  location: string | null;
  note: string | null;
  contact: { name: string; role: string | null; email: string; phone: string; photo_path: string | null } | null;
  /** Beide `null`, solange weniger als 20 Bewerbungen angenommen sind (K-59). */
  accepted: number | null;
  teams: number | null;
} | null;
