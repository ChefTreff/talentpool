import { PIPELINE_BESTAETIGT, type ManagedSpeaker } from "@/app/(speaker-leads)/speaker-leads/types";

/**
 * Vor und nach der Zusage (LEAD-054, Paulina 05.10.: „der Schritt ‚hat
 * bestätigt‘ fehlt“). Bis zur Zusage stehen im Fenster nur die Grunddaten, die
 * Ansprache und die Einordnung; mit der Zusage öffnen sich Onboarding,
 * Hospitality und Programm — und das Fenster sagt, was als Nächstes zu tun ist.
 *
 * Die Liste der Stände nach der Zusage ist **dieselbe** wie in
 * `speaker_is_confirmed()` (Datenbank) und in `PIPELINE_BESTAETIGT`; ein Test
 * hält die drei zusammen.
 */
export function istNachZusage(status: string): boolean {
  return PIPELINE_BESTAETIGT.includes(status);
}

/**
 * Welche Stände vor der Zusage zur Wahl stehen. Die Onboarding-Stände
 * (`onboarded`, `ready`, `published`, `attended`) gibt es erst danach — wer
 * noch nicht zugesagt hat, kann nicht „bereit“ sein.
 */
export const STAENDE_VOR_ZUSAGE = ["lead", "contacted", "confirmed", "declined"];

/** Der Stand, aus dem eine Zusage gemeldet wird. */
export function kannZusageMelden(status: string): boolean {
  return status === "lead" || status === "contacted";
}

/** Eine offene Pflicht nach der Zusage — der Schlüssel wählt Text und Aktion. */
export type Pflicht = "invite" | "hospitality" | "travel" | "session";

/**
 * Was nach der Zusage als Nächstes ansteht, in der Reihenfolge, in der man es
 * tut. Nur, was das Fenster auch belegen kann: die Einladung (`invited_at`),
 * die Hospitality-Freischaltung (`hospitality_status`, setzt das Team), die
 * Reisekosten-Freigabe (vorgesehen, aber nicht freigegeben) und die Session im
 * Programm. Die Schritte, die der Speaker selbst erledigt (Profil, Foto,
 * Einwilligungen, Präsentation …), stehen weiter unter „Offene Schritte“.
 *
 * Gäste von Partnern (SPK-070) haben kein Onboarding — für sie gibt es keine
 * Pflichten. Vor der Zusage ebenso nicht.
 */
export function naechstePflichten(
  s: Pick<
    ManagedSpeaker,
    | "pipeline_status"
    | "stage_guest"
    | "invited_at"
    | "hospitality_status"
    | "travel_costs_covered"
    | "travel_costs_approved"
    | "sessions"
  >,
): Pflicht[] {
  if (!istNachZusage(s.pipeline_status) || s.stage_guest) return [];
  const offen: Pflicht[] = [];
  if (!s.invited_at) offen.push("invite");
  if (s.hospitality_status === "none") offen.push("hospitality");
  if (s.travel_costs_covered && !s.travel_costs_approved) offen.push("travel");
  if ((s.sessions ?? []).length === 0) offen.push("session");
  return offen;
}
