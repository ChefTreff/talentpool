/**
 * Felder des Teilnehmer-Profils, die mit TAL-013 dazukamen (Feldvorschlag
 * `docs/talent-felder-vorschlag.md`, Konrads Antworten §5). Nicht-Funktions-
 * Exporte gehören nicht in die `"use server"`-Datei — deshalb hier.
 */

/** Mehrfachauswahl-Listen, die das Profil in `person_interest` pflegt. */
export const PROFILE_MULTI_VOCABS = [
  "interests",
  "interests_founder",
  "career_opportunities",
  "summit_goal",
  "skill",
  "work_mode",
] as const;
export type ProfileMultiVocab = (typeof PROFILE_MULTI_VOCABS)[number];

export type LanguageEntry = { language: string; level: string };

/**
 * Die neuen Einzelfelder. Kommen nur mit, wenn die Seite sie lesen konnte
 * (Migration `v6_profilfelder` live) — sonst bleibt `extended` leer und das
 * Profil speichert wie bisher.
 */
export type ExtendedProfile = {
  job_title: string;
  study_program_label: string;
  job_openness: string;
  function_area: string;
  graduation_year: string; // "" | "2027"
  availability: string;
  mobility: string;
  languages: LanguageEntry[];
};

/** Abschlussjahr: leer oder vierstellig im Rahmen des CHECK (1950–2100). */
export function parseGraduationYear(value: string): number | null | "invalid" {
  const v = value.trim();
  if (v === "") return null;
  if (!/^\d{4}$/.test(v)) return "invalid";
  const n = Number(v);
  return n >= 1950 && n <= 2100 ? n : "invalid";
}

/** Eine Sprache höchstens einmal; unvollständige Zeilen fallen weg. */
export function cleanLanguages(list: LanguageEntry[]): LanguageEntry[] {
  const seen = new Set<string>();
  return list.filter((l) => {
    if (!l.language || !l.level || seen.has(l.language)) return false;
    seen.add(l.language);
    return true;
  });
}

/** Einwilligungen, die die Person im Profil selbst ändert (A9, B2). */
export const EDITABLE_CONSENTS = ["newsletter", "photo_video", "share_with_partner"] as const;
/** Pflicht-Einwilligungen: im Profil nur sichtbar, Widerruf heißt Profil löschen. */
export const REQUIRED_CONSENTS = ["terms", "privacy"] as const;

/** Lebenslauf (B3): PDF bis 10 MB, wie der Bucket `person-cv`. */
export const CV_BUCKET = "person-cv";
export const CV_MIME = ["application/pdf"];
export const MAX_CV_BYTES = 10 * 1024 * 1024;
