import { formatMinutes, parseClock } from "@/lib/tz";
import { OHNE_ENDE, standFenster } from "@/components/partner/standbuehne";

/**
 * Öffnungszeiten je Bühne und Tag im Board (LEAD-033).
 *
 * Quelle ist `stage_day.open_from/open_to` — dieselben Werte, gegen die
 * `create_slot` und `move_slot` prüfen: für Stage Leads hart
 * (`outside_stage_day`, LEAD-016), für Partner auf ihrer Standbühne das
 * Zeitfenster, für das Programm-Team eine Warnung. Auf der Standbühne gilt
 * die Regel aus `standFenster()` (PART-090, 0195): je Grenze die Öffnungszeit,
 * sonst der Programmrahmen des Tages — dieselbe `coalesce`-Folge wie
 * `partner_booth_window`. Auf den übrigen Bühnen heißt eine fehlende Grenze
 * „keine Grenze“, wie in `create_slot`.
 *
 * Reine Funktionen ohne Server — `tests/board-oeffnung.test.ts` prüft sie.
 */

/** Zeile aus `stage_day` für den gezeigten Tag. */
export type BoardStageDay = {
  stage_id: string;
  open_from: string | null;
  open_to: string | null;
};

/** Öffnung in Minuten seit Mitternacht; eine fehlende Seite heißt „offen“. */
export type Oeffnung = { von: number | null; bis: number | null };

export function oeffnung(
  stage: { id: string; type: string | null },
  stageDays: readonly BoardStageDay[],
  day: { programme_start: string | null; programme_end: string | null } | null,
): Oeffnung | null {
  const zeile = stageDays.find((r) => r.stage_id === stage.id);
  let von: number | null;
  let bis: number | null;
  if (stage.type === "partner_booth") {
    const f = standFenster(
      zeile?.open_from ?? null,
      zeile?.open_to ?? null,
      day?.programme_start ?? null,
      day?.programme_end ?? null,
    );
    // 24:00 ist die Datenbank-Lesart von „kein Ende“ — dann nichts schraffieren.
    [von, bis] = [f.von, f.bis >= OHNE_ENDE ? null : f.bis];
  } else {
    [von, bis] = [parseClock(zeile?.open_from), parseClock(zeile?.open_to)];
  }
  return von === null && bis === null ? null : { von, bis };
}

/**
 * Die geschlossenen Bereiche einer Spalte im sichtbaren Fenster — davor und
 * danach. Das Fenster wächst um Slots außerhalb des Programms (`dayWindow`),
 * deshalb kann ein Bereich auch dort liegen, wo das Programm schon zu ist.
 */
export function geschlossen(
  o: Oeffnung | null,
  windowStart: number,
  windowEnd: number,
): { von: number; bis: number }[] {
  if (!o) return [];
  const bereiche: { von: number; bis: number }[] = [];
  if (o.von !== null && o.von > windowStart) {
    bereiche.push({ von: windowStart, bis: Math.min(o.von, windowEnd) });
  }
  if (o.bis !== null && o.bis < windowEnd) {
    bereiche.push({ von: Math.max(o.bis, windowStart), bis: windowEnd });
  }
  return bereiche.filter((b) => b.bis > b.von);
}

/** „13:00–20:30“, „ab 13:00“ oder „bis 19:00“ über die Vorlagen mit `{von}`/`{bis}`. */
export function oeffnungText(o: Oeffnung, t: { from: string; until: string }): string {
  if (o.von !== null && o.bis !== null) return `${formatMinutes(o.von)}–${formatMinutes(o.bis)}`;
  if (o.von !== null) return t.from.replace("{von}", formatMinutes(o.von));
  return t.until.replace("{bis}", formatMinutes(o.bis as number));
}
