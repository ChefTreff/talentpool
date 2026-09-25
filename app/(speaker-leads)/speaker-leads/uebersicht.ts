import { fristStand } from "@/lib/speaker/verlauf";
import { PIPELINE_BESTAETIGT, type ManagedSpeaker, type ManagerScope } from "@/app/(speaker-leads)/speaker-leads/types";

/**
 * Die Übersicht des Stage-Lead-Portals (LEAD-024): was auf den eigenen Bühnen
 * steht und was als Nächstes zu tun ist — aus denselben Daten wie Pipeline
 * und Bestätigte Speaker (`manager_speakers`, `my_manager_scope`), ohne eigene
 * Abfrage. Reine Funktion, damit die Zahlen in `tests/leads-uebersicht.test.ts`
 * stehen und nie von der Pipeline abweichen.
 *
 * Gäste von Partnern (SPK-070) zählen nicht mit: sie haben kein Onboarding und
 * stehen auch in der Pipeline nur auf Wunsch.
 */

export type Aufgabe = {
  speaker: ManagedSpeaker;
  stand: "ueberfaellig" | "heute" | "spaeter";
};

export type Uebersicht = {
  /** Lead und kontaktiert — die Ansprache vor der Zusage. */
  ansprache: number;
  /** Bestätigt im Sinne von `speaker_is_confirmed()` (QS-049). */
  bestaetigt: number;
  /** Offene Aufgaben aller Speaker im Scope, wer immer sie trägt. */
  offeneAufgaben: number;
  /** Die früheste offene Aufgabe je Speaker, die **mir** zugewiesen ist — nach Frist. */
  meineAufgaben: Aufgabe[];
  /** Davon heute fällig oder überfällig — dieselbe Regel wie „Fällig“ in der Pipeline (LEAD-027). */
  faellig: number;
  /** Bestätigte Speaker mit offenen Schritten („Fehlt noch“). */
  fehltNoch: ManagedSpeaker[];
  /** Slots der eigenen Bühnen: alle und die mit Session. */
  slots: { gesamt: number; belegt: number };
};

export function uebersicht(
  speakers: readonly ManagedSpeaker[],
  scope: Pick<ManagerScope, "person_id" | "slots">,
  heuteIso: string,
): Uebersicht {
  const ohneGaeste = speakers.filter((s) => !s.stage_guest);
  const bestaetigte = ohneGaeste.filter((s) => PIPELINE_BESTAETIGT.includes(s.pipeline_status));

  const meineAufgaben = ohneGaeste
    .filter((s) => s.next_task && s.next_task.assignee_person_id === scope.person_id)
    .map((s) => ({ speaker: s, stand: fristStand(s.next_task!.due_on, heuteIso) }))
    .sort((a, b) => (a.speaker.next_task!.due_on < b.speaker.next_task!.due_on ? -1 : 1));

  return {
    ansprache: ohneGaeste.filter((s) => s.pipeline_status === "lead" || s.pipeline_status === "contacted").length,
    bestaetigt: bestaetigte.length,
    offeneAufgaben: ohneGaeste.reduce((summe, s) => summe + (s.open_tasks ?? 0), 0),
    meineAufgaben,
    faellig: meineAufgaben.filter((a) => a.stand !== "spaeter").length,
    fehltNoch: bestaetigte.filter((s) => (s.next_open ?? []).length > 0),
    slots: {
      gesamt: scope.slots.length,
      belegt: scope.slots.filter((sl) => sl.session_id !== null).length,
    },
  };
}
