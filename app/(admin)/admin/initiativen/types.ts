/** Zeile aus `initiatives_admin()` (Migration 0116). */
export type Initiative = {
  org_edition_id: string;
  org_id: string;
  org_name: string;
  slug: string | null;
  website: string | null;
  description_de: string | null;
  pipeline_stage: string | null;
  source: string;
  onboarding_status: string;
  lead_contact_id: string | null;
  produkte: number;
  pflichten_offen: number;
  kontingente: number;
  updated_at: string;
};

/** Die Stufen in der Reihenfolge des Funnels, nicht alphabetisch. */
export const STAGES = [
  "outreach",
  "gespraech",
  "agreement",
  "onboarding",
  "aktiv",
  "abgelehnt",
] as const;

/** Was eine Initiative bekommen kann — Preis 0, aus einer Vereinbarung. */
export type IniProdukt = { sku: string; name: string };
