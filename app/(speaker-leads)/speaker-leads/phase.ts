import { PIPELINE_BESTAETIGT, PIPELINE_ORDER, type ManagedSpeaker } from "@/app/(speaker-leads)/speaker-leads/types";

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

// === LEAD-055: das Personen-Fenster — Rangfolge im Kopf, Marken der Blöcke ====================================================
//
// Alles, was das Fenster über „was als Nächstes“ sagt, liest aus `naechstePflichten()` und `kannZusageMelden()`:
// die Hauptaktion, die Marken der Blöcke und die Zeile „Als Nächstes“. Eine zweite Tabelle von Stand zu Knopf wäre die
// zweite Quelle, die beim nächsten Stand auseinanderläuft (Design, 05.10.).

/** Die Stufen der Stufenleiste: Lead bis Teilgenommen. „Abgesagt“ ist ein Ergebnis und kein Schritt. */
export const STUFEN: string[] = PIPELINE_ORDER.filter((s) => s !== "declined");

/**
 * Wie `istNachZusage`, aber auch nach einer **Absage nach der Zusage**: die Zeit `confirmed_at` bleibt stehen (der Trigger
 * setzt sie nur, nie zurück), und dann ist noch aufzuräumen — Session freigeben, Hotel stornieren (Design-Frage c, 05.10.).
 * Vor der Zusage Abgesagte (nie bestätigt) bleiben bei den Ständen davor.
 */
export function warNachZusage(s: Pick<ManagedSpeaker, "pipeline_status" | "confirmed_at">): boolean {
  return istNachZusage(s.pipeline_status) || (s.pipeline_status === "declined" && s.confirmed_at !== null);
}

/** Die eine Hauptaktion des Kopfes — das Verb des nächsten Schritts, nie der Name eines Stands. */
export type Hauptaktion = "contact" | "confirm" | "invite" | "hospitality" | "travel" | "session";

/**
 * Die Hauptaktion **dieser Rolle**: die erste Aktion, die sie erledigen kann; gibt es keine, steht keine da (die Leiste
 * und die Marken zeigen, wer dran ist). Die Einladung darf jede Betreuung, Hospitality, Reisekosten und die Zuordnung im
 * Programm nur das Speaker-Team. Gäste von Partnern, Abgesagte und alle, die nichts mehr offen haben, bekommen keine.
 */
export function hauptaktion(
  s: Parameters<typeof naechstePflichten>[0],
  team: boolean,
): Hauptaktion | null {
  if (s.pipeline_status === "lead") return "contact";
  if (s.pipeline_status === "contacted") return "confirm";
  for (const p of naechstePflichten(s)) {
    if (p === "invite") return "invite";
    if (team) return p;
  }
  return null;
}

/** Die drei Blöcke nach der Zusage, in der festen Reihenfolge des Fensters. */
export type PflichtBlock = "onboarding" | "hospitality" | "programm";
export const PFLICHT_BLOECKE: PflichtBlock[] = ["onboarding", "hospitality", "programm"];

const BLOCK_DER_PFLICHT: Record<Pflicht, PflichtBlock> = {
  invite: "onboarding",
  hospitality: "hospitality",
  travel: "hospitality",
  session: "programm",
};

/** Der Zustand eines Blocks: Wort **und** Ton in der Oberfläche; `n` zählt die offenen Pflichten im Block. */
export type BlockMarke = { zustand: "erledigt" | "naechste" | "offen"; n: number };

/**
 * Marken der drei Blöcke aus den offenen Pflichten: ohne offene Pflicht **Erledigt**; der **erste** Block mit offener
 * Pflicht (Onboarding → Hospitality → Programm) ist die **Nächste Pflicht** und steht offen, die Hauptaktion zeigt auf
 * ihn; jeder weitere ist **Offen** (mit Zahl, wenn es mehrere sind) und zu.
 */
export function blockMarken(pflichten: Pflicht[]): Record<PflichtBlock, BlockMarke> {
  const offen = (b: PflichtBlock) => pflichten.filter((p) => BLOCK_DER_PFLICHT[p] === b).length;
  const erste = PFLICHT_BLOECKE.find((b) => offen(b) > 0);
  const marke = (b: PflichtBlock): BlockMarke =>
    offen(b) === 0 ? { zustand: "erledigt", n: 0 } : { zustand: b === erste ? "naechste" : "offen", n: offen(b) };
  return { onboarding: marke("onboarding"), hospitality: marke("hospitality"), programm: marke("programm") };
}

/**
 * Nach einer Absage nach der Zusage: wo noch etwas hängt, was das Fenster belegen kann — eine Session im Programm, eine
 * Hotel- oder Reisekostenzusage. Ticket und Fahrt kennt `manager_speakers` nicht; der Block „Onboarding“ trägt deshalb nie
 * eine Marke. Wer hier `true` bekommt, sieht „Aufräumen“.
 */
export function aufraeumen(
  s: Pick<ManagedSpeaker, "hospitality_status" | "travel_costs_approved" | "sessions">,
): Record<PflichtBlock, boolean> {
  return {
    onboarding: false,
    hospitality: s.hospitality_status !== "none" || s.travel_costs_approved,
    programm: (s.sessions ?? []).length > 0,
  };
}

/** Was die Zeile „Als Nächstes“ im Kopf sagt. */
export type AlsNaechstes =
  | { art: "abgesagt" }
  | { art: "pflicht"; pflicht: Pflicht }
  | { art: "aufgabe" }
  | { art: "nichts" };

/**
 * Vor der Zusage die früheste offene Aufgabe des Verlaufs (`next_task`), nach der Zusage die erste offene Pflicht
 * (ohne erfundene Frist) — erst wenn keine Pflicht mehr offen ist, wieder die Aufgabe. Nach einer Absage steht die Absage
 * da, nicht „Als Nächstes“.
 */
export function alsNaechstes(
  s: Parameters<typeof naechstePflichten>[0] & Pick<ManagedSpeaker, "next_task">,
): AlsNaechstes {
  if (s.pipeline_status === "declined") return { art: "abgesagt" };
  const pflichten = naechstePflichten(s);
  if (pflichten.length > 0) return { art: "pflicht", pflicht: pflichten[0] };
  return s.next_task ? { art: "aufgabe" } : { art: "nichts" };
}
