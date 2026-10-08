import { dayInZone, minutesOfDay } from "@/lib/tz";

/**
 * Bühnenwahl, Gültigkeitstage und Sperrzeiten im Programm-Board (ADM-085, LEAD-061, LEAD-062).
 *
 * Alles hier sind **reine Funktionen** ohne Server und Datenbank — `tests/adm-085-buehnen-stammdaten.test.ts` führt sie aus. Die
 * Regeln selbst (wer wo einen Slot setzen darf, wann eine Sperrzeit greift) hält die Datenbank (`stage_slot_check` in create_slot,
 * move_slot, partner_create_session); das Board zeigt sie nur, damit niemand erst zieht und dann abgewiesen wird.
 */

/**
 * Die Arten, die als **Hauptbühnen** gelten und im Stage-Lead-Board stehen (LEAD-061, Plan 08.10.): die ChefTreff-Bühnen
 * (`main`) und die von Partnern gebrandeten (`branded` — eine unserer Bühnen mit Partnerlogo). Standbühnen, Räume der Masterclasses,
 * Interview Tables und Side-Event-Orte gehören nicht dazu. `stage.kind` ist eine generierte Spalte aus `type` und `partner_org_id`.
 */
export const HAUPT_ARTEN: readonly string[] = ["main", "branded"];

export function istHauptbuehne(kind: string | null | undefined): boolean {
  return kind !== null && kind !== undefined && HAUPT_ARTEN.includes(kind);
}

/** Der Wert von `?buehnen=` unter `/admin/programm`: `haupt` oder alles (Standard). */
export type BuehnenWahl = "alle" | "haupt";

export function leseBuehnenWahl(param: string | undefined): BuehnenWahl {
  return param === "haupt" ? "haupt" : "alle";
}

type BuehneFuerWahl = { id: string; kind?: string | null; valid_days?: readonly string[] | null };

/**
 * Welche Bühnen am gezeigten Tag eine Spalte bekommen.
 *
 * - **Bühnenwahl:** nur die Hauptbühnen — außer den Bühnen, die die Sicht ohnehin bearbeitet (`immer`): ein Stage Lead soll seine eigene
 *   Spalte nie verlieren, auch wenn sie keine Hauptbühne ist.
 * - **Gültigkeitstage:** eine Bühne, die an diesem Tag nicht gilt, bekommt keine Spalte. Hängt an dem Tag aber schon ein Slot an ihr (ein
 *   Altbestand), **bleibt sie stehen** — nichts verschwindet still aus dem Board.
 */
export function sichtbareBuehnen<T extends BuehneFuerWahl>(
  buehnen: readonly T[],
  opts: {
    /** Der gezeigte Tag als `JJJJ-MM-TT`; `null` ohne Tag. */
    tag: string | null;
    /** Bühnen, an denen an diesem Tag schon ein Slot hängt. */
    mitSlots?: ReadonlySet<string>;
    wahl: BuehnenWahl;
    immer?: ReadonlySet<string>;
  },
): T[] {
  const { tag, mitSlots, wahl, immer } = opts;
  return buehnen.filter((b) => {
    const gesichert = immer?.has(b.id) ?? false;
    if (wahl === "haupt" && !istHauptbuehne(b.kind) && !gesichert) return false;
    const tage = b.valid_days ?? [];
    if (tag !== null && tage.length > 0 && !tage.includes(tag) && !(mitSlots?.has(b.id) ?? false) && !gesichert) return false;
    return true;
  });
}

/** Eine Zeile aus `stage_blocked_times()`. */
export type Sperrzeit = {
  id: string;
  event_id: string;
  stage_id: string | null;
  stage_name: string | null;
  starts_at: string;
  ends_at: string;
  reason: string;
  slots_affected: number;
};

/** Die Sperrzeit am gezeigten Tag, in Minuten seit Mitternacht (Ereigniszeit). */
export type BoardSperrzeit = {
  id: string;
  stage_id: string | null;
  von: number;
  bis: number;
  grund: string;
};

/**
 * Die Sperrzeiten, die den Tag `tag` berühren — auf Minuten dieses Tages zugeschnitten. Eine Sperrzeit über mehrere Tage (oder über
 * Mitternacht) zählt an jedem Tag nur mit ihrem Anteil; eine, die genau um 00:00 endet, berührt den neuen Tag nicht (halboffen, wie die
 * Datenbank).
 */
export function sperrzeitenAmTag(zeilen: readonly Sperrzeit[], tag: string, zone: string): BoardSperrzeit[] {
  const treffer: BoardSperrzeit[] = [];
  for (const z of zeilen) {
    const ersterTag = dayInZone(z.starts_at, zone);
    const letzterTag = dayInZone(z.ends_at, zone);
    if (tag < ersterTag || tag > letzterTag) continue;
    const endeMin = minutesOfDay(z.ends_at, zone);
    const von = tag === ersterTag ? minutesOfDay(z.starts_at, zone) : 0;
    const bis = tag === letzterTag ? endeMin : 24 * 60;
    // Endet die Sperrzeit genau um 00:00 eines späteren Tages, ist `bis` dort 0 — gleich `von`: dieser Tag liegt nicht mehr darin.
    if (bis <= von) continue;
    treffer.push({ id: z.id, stage_id: z.stage_id, von, bis, grund: z.reason });
  }
  return treffer.sort((a, b) => a.von - b.von || a.bis - b.bis);
}

/** Was in der Spalte einer Bühne gesperrt ist: Sperrzeiten dieser Bühne und die für alle Bühnen. */
export function sperrenDerBuehne(sperren: readonly BoardSperrzeit[], stageId: string): BoardSperrzeit[] {
  return sperren.filter((s) => s.stage_id === null || s.stage_id === stageId);
}

/** Auf das sichtbare Zeitfenster zuschneiden; was ganz außerhalb liegt, entfällt. */
export function imFenster(
  sperren: readonly BoardSperrzeit[],
  windowStart: number,
  windowEnd: number,
): BoardSperrzeit[] {
  return sperren
    .map((s) => ({ ...s, von: Math.max(s.von, windowStart), bis: Math.min(s.bis, windowEnd) }))
    .filter((s) => s.bis > s.von);
}
