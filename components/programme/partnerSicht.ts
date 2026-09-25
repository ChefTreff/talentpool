import type { GastWahl } from "@/components/partner/gaeste";
import { PARTNER_STATUS, partnerStatus, type PartnerStatus } from "@/components/partner/standbuehne";

/**
 * Die Partner-Sicht im Board (LEAD-035/036/037): wer im Partner-Portal auf
 * seine Standbühne schaut, sieht den **Partner-Status** statt des internen
 * Slot-Status, fragt „Veröffentlichen“ an statt freizugeben und ordnet seine
 * **Gäste** zu statt Personen zu suchen (`board_search_people` ist Partnern
 * verschlossen, `can_search_board`).
 *
 * Regel und Wortlaut stehen in `components/partner/standbuehne.ts` und gelten
 * genauso in der Tabelle `/partner/buehne/tabelle` — das Board übernimmt sie,
 * statt sie neu zu schreiben. Die Schreibwege sind die Server-Aktionen des
 * Partner-Portals; die Seite reicht sie herein, das Board kennt kein Gate.
 */

/** Antwort der Server-Aktionen des Partner-Portals (`PartnerResult`, `GastErgebnis`). */
export type PartnerErgebnis<T = void> = { ok: true; data: T } | { ok: false; key: string; detail?: string };

export type PartnerSicht = {
  /** Rückmeldungen der Programmleitung je Session (PART-083) — sie machen den Stand „Zurückgegeben“. */
  rueckgaben: Record<string, string>;
  /** Gäste der Organisation (PART-081) zur Zuordnung im Schubfach. */
  gaeste: GastWahl[];
  /** `requestStagePublish` — die Anfrage an die Programmleitung, keine Freigabe. */
  anfragen: (sessionId: string) => Promise<PartnerErgebnis<{ status: string }>>;
  /** `withdrawStagePublish`, solange nicht freigegeben ist. */
  zuruecknehmen: (sessionId: string) => Promise<PartnerErgebnis<{ status: string }>>;
  /** `assignStageGuest` (`partner_assign_stage_guest`). */
  gastZuordnen: (sessionId: string, profileId: string, zuordnen: boolean) => Promise<PartnerErgebnis>;
  /** Texte aus `partnerStage` — dieselben wie in der Tabelle. */
  t: Record<string, string>;
};

/** Der Partner-Status eines Slots oder einer Session im Board. */
export function boardPartnerStatus(
  x: { session_id: string | null; publish_status: string | null },
  rueckgaben: Record<string, string>,
): PartnerStatus {
  return partnerStatus({
    sessionId: x.session_id,
    publishStatus: x.publish_status,
    returnNote: x.session_id ? rueckgaben[x.session_id] ?? null : null,
  });
}

/**
 * Karte im Board je Partner-Status — dieselbe Farbsprache wie
 * `PARTNER_STATUS_TON`: Gelb heißt „ihr seid dran“, Akzent „die
 * Programmleitung ist dran“. Der Wortlaut steht zusätzlich in der Karte.
 */
export const PARTNER_KARTE: Record<PartnerStatus, string> = {
  offen: "border-border bg-surface",
  in_bearbeitung: "border-border-strong bg-surface",
  zurueckgegeben: "border-warning-soft bg-warning-soft",
  zur_freigabe: "border-accent-soft bg-accent-soft",
  veroeffentlicht: "border-success-soft bg-success-soft",
  abgesagt: "border-dashed border-error-soft bg-error-soft",
};

/** Die Texte der Stände aus `partnerStage`. */
export function partnerStatusTexte(t: Record<string, string>): Record<PartnerStatus, string> {
  const texte: Record<PartnerStatus, string> = {
    offen: t.statusOpen,
    in_bearbeitung: t.statusDraft,
    zurueckgegeben: t.statusReturned,
    zur_freigabe: t.statusReview,
    veroeffentlicht: t.statusPublished,
    abgesagt: t.statusCancelled,
  };
  return texte;
}

/** Reihenfolge der Legende — die des Lebenswegs einer Session. */
export const PARTNER_LEGENDE = PARTNER_STATUS;
