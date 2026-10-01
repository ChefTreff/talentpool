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
  } | null;
  submission: {
    url: string | null;
    repo_url: string | null;
    notes: string | null;
    submitted_at: string | null;
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
};
