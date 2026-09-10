/**
 * Nicht-Funktions-Exporte des Wizards. Eine `"use server"`-Datei darf nur
 * async Funktionen exportieren — Konstanten und Typen gehören deshalb hierher.
 */

/** Fassung der Texte, auf die sich eine Einwilligung bezieht. */
export const CONSENT_VERSION = "2026-09";

export type WizardStep = "basics" | "work" | "interests" | "consent";

export type WizardData = {
  first_name: string;
  last_name: string;
  preferred_language: string;
  city: string;
  country: string;
  occupation_status: string;
  career_level: string;
  employer_name: string;
  study_field: string;
  university: string;
  interests: string[];
  interests_founder: string[];
  consents: Record<string, boolean>;
};

export type StepResult =
  | { ok: true }
  | { ok: false; message: "not_signed_in" | "no_person" | "save_failed"; detail?: string };
