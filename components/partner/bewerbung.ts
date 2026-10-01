import type { BadgeTone } from "@/components/ui/Badge";

/**
 * Reine Teile der Bewerbungsanzeige (ADM-003) — ohne React, damit die Tests sie
 * laden. Genutzt von `ApplicantList` (Partner-Portal), `BewerbungDetails` und
 * der Bewerbungsliste im Admin.
 */

/** Farbe des Status-Badges — der Wortlaut kommt aus dem Vokabular `application_status`. */
export const BEWERBUNG_STATUS_TON: Record<string, BadgeTone> = {
  applied: "neutral",
  shortlisted: "accent",
  accepted: "success",
  promoted: "success",
  confirmed: "success",
  attended: "success",
  waitlisted: "warning",
  declined: "error",
  expired: "neutral",
  no_show: "error",
  withdrawn: "neutral",
};

/** Profilfelder in fester Reihenfolge — was leer ist, fällt weg. */
export const BEWERBUNG_PROFILFELDER = [
  "occupation_status",
  "career_level",
  "employer_name",
  "university",
  "study_field",
  "city",
] as const;

/** Was die Details einer Bewerbung brauchen — Partner- und Admin-Zeilen liefern es gleich. */
export type BewerbungFuerDetails = {
  display_name: string | null;
  consent_share: boolean;
  answers: Record<string, unknown> | null;
  profile: Record<string, unknown> | null;
};

/**
 * Verdeckt ist eine Bewerbung nur, wenn ihre Daten **fehlen**: Partner bekommen
 * ohne Einwilligung weder Name noch Antworten, das Team bekommt sie trotzdem
 * (`is_application_team`). Am Datenstand zu entscheiden statt am Häkchen hält
 * beide Sichten richtig, ohne dass die Anzeige wissen muss, wer schaut.
 */
export function istVerdeckt(a: Pick<BewerbungFuerDetails, "display_name" | "consent_share">): boolean {
  return !a.consent_share && a.display_name == null;
}
