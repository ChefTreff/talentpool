import { buehnenGeaendert, einordnungAenderungen, type EinordnungEntwurf } from "@/lib/speaker/einordnung";
import type { ManagedSpeaker } from "@/app/(speaker-leads)/speaker-leads/types";

/**
 * Der Entwurf des Personen-Fensters (LEAD-055): die Felder, die „Änderungen speichern“ schreibt — ohne Einordnung und
 * Bühnen, die ihren eigenen Entwurf haben (`lib/speaker/einordnung`). Zeichenketten statt `null`, damit ein Feld im
 * Formular nie `undefined` wird.
 */
export type FensterEntwurf = {
  speaker_type: string;
  job_title: string;
  organization_name: string;
  internal_notes: string;
  travel_costs_covered: boolean;
  pass_type: string;
  lounge_access: boolean;
  hotel_tier: string;
  hospitality_status: string;
};

/** Der gespeicherte Stand, aus dem das Fenster seinen Entwurf beginnt — und mit dem es ihn vergleicht. */
export function fensterEntwurf(s: ManagedSpeaker): FensterEntwurf {
  return {
    speaker_type: s.speaker_type,
    job_title: s.job_title ?? "",
    organization_name: s.organization_name ?? "",
    internal_notes: s.internal_notes ?? "",
    travel_costs_covered: s.travel_costs_covered,
    pass_type: s.pass_type,
    lounge_access: s.lounge_access,
    hotel_tier: s.hotel_tier,
    hospitality_status: s.hospitality_status,
  };
}

const FELDER: (keyof FensterEntwurf)[] = [
  "speaker_type",
  "job_title",
  "organization_name",
  "internal_notes",
  "travel_costs_covered",
];

/** Nur das Team schreibt diese Felder (`update_speaker` antwortet sonst mit `team_only_fields`). */
const TEAM_FELDER: (keyof FensterEntwurf)[] = ["pass_type", "lounge_access", "hotel_tier", "hospitality_status"];

/**
 * Geht beim Schließen etwas verloren? Das Fenster fragt dann zurück („Änderungen verwerfen?“) — in zugeklappten Blöcken
 * können Änderungen unsichtbar sein (Design, 05.10.). Team-Felder zählen nur für das Team: ein Stage Lead sieht und speichert
 * sie nie, ihr Unterschied wäre ein Alarm ohne Anlass.
 */
export function entwurfGeaendert(
  gespeichert: FensterEntwurf,
  entwurf: FensterEntwurf,
  team: boolean,
  einordnungVorher: EinordnungEntwurf,
  einordnung: EinordnungEntwurf,
): boolean {
  const felder = team ? [...FELDER, ...TEAM_FELDER] : FELDER;
  if (felder.some((k) => entwurf[k] !== gespeichert[k])) return true;
  return (
    Object.keys(einordnungAenderungen(einordnungVorher, einordnung)).length > 0 ||
    buehnenGeaendert(einordnungVorher, einordnung)
  );
}
