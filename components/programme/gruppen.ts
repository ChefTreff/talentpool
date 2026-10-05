import type { BoardDay, BoardSlot, BoardStage } from "./types";

/**
 * Die Tabelle des Programms gruppiert nach **Bühne und Tag** (ADM-069, Konrad 05.10.: „klarere Linien pro
 * Slot und direkt eine Gruppierung pro Bühne, sodass man jeweils pro Bühne pro Tag die Slots sieht“ — er
 * kopierte die Liste bisher erst nach Bühne, dann nach Tag in ein anderes Dokument).
 *
 * Reine Funktion, damit die Reihenfolge ein Test festhält: die Gruppen stehen in der Reihenfolge der Bühnen
 * (`sort_order`), innerhalb einer Bühne nach Tag; die Zeilen einer Gruppe behalten die Reihenfolge, in der
 * sie hereinkommen — die Sortierung der Spalten (Zeit, Titel, Format, Status) gilt also **innerhalb** der
 * Gruppen und wirft keine Zeile in eine andere.
 */
export type SlotGruppe = {
  /** `bühne|tag` — stabil als React-Schlüssel. */
  key: string;
  stageId: string;
  stageName: string;
  dayId: string;
  dayDate: string;
  /** Der Tag mit seinem Namen, wenn die Edition einen vergibt (`label_de`/`label_en`). */
  day: BoardDay | undefined;
  rows: BoardSlot[];
  /** Noch nicht fertig: offen, angefragt oder bestätigt ohne Titel (nicht: final, nicht: nicht genutzt). */
  offen: number;
  /** Früheste Startzeit und späteste Endzeit der Gruppe (ISO), für „10:00–16:30“. */
  von: string;
  bis: string;
};

/** Stände, in denen ein Slot noch Arbeit macht. */
export const NOCH_OFFEN: readonly string[] = ["open", "requested", "confirmed_title_open"];

export function gruppiereSlots(rows: readonly BoardSlot[], stages: readonly BoardStage[], days: readonly BoardDay[]): SlotGruppe[] {
  const buehneOrdnung = new Map(stages.map((s, i) => [s.id, [s.sort_order ?? i, i] as const]));
  const tage = new Map(days.map((d) => [d.id, d]));
  const gruppen = new Map<string, SlotGruppe>();

  for (const r of rows) {
    const key = `${r.stage_id}|${r.event_day_id}`;
    let g = gruppen.get(key);
    if (!g) {
      g = {
        key,
        stageId: r.stage_id,
        stageName: r.stage_name,
        dayId: r.event_day_id,
        dayDate: r.day_date,
        day: tage.get(r.event_day_id),
        rows: [],
        offen: 0,
        von: r.start_at,
        bis: r.end_at,
      };
      gruppen.set(key, g);
    }
    g.rows.push(r);
    if (NOCH_OFFEN.includes(r.slot_status)) g.offen += 1;
    if (r.start_at < g.von) g.von = r.start_at;
    if (r.end_at > g.bis) g.bis = r.end_at;
  }

  const rang = (stageId: string) => buehneOrdnung.get(stageId) ?? [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER];
  return [...gruppen.values()].sort((a, b) => {
    const [oa, ia] = rang(a.stageId);
    const [ob, ib] = rang(b.stageId);
    return oa - ob || ia - ib || a.stageName.localeCompare(b.stageName) || a.dayDate.localeCompare(b.dayDate);
  });
}
