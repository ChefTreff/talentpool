import { snapTo5 } from "@/lib/tz";

/** Pixel je Minute im Raster. 60 Minuten = 96 px. */
export const PX_PER_MIN = 1.6;
/** Feinheit des Rasters in Minuten (Arbeitsauftrag B5). */
export const GRID_MIN = 5;

const FALLBACK_START = 8 * 60;
const FALLBACK_END = 20 * 60;

/**
 * Sichtbares Zeitfenster eines Tages, in Minuten seit Mitternacht.
 *
 * Erste Wahl sind die Programmzeiten des Tages. Liegt ein Slot davor oder
 * danach, wächst das Fenster bis zur vollen Stunde um ihn herum: vorher stand
 * er ausserhalb des Rasters und war schlicht nicht zu sehen (25.09.: drei
 * Slots um 10 Uhr bei Programmbeginn 13 Uhr). Fehlen die Programmzeiten,
 * spannt das Fenster die Slots mit einer Stunde Luft ein — sonst klebt der
 * erste Slot am oberen Rand. Ohne beides: 08–20 Uhr.
 */
export function dayWindow(
  slotRanges: { startMin: number; endMin: number }[],
  programmeStart: number | null,
  programmeEnd: number | null,
): { start: number; end: number } {
  if (
    programmeStart !== null &&
    programmeEnd !== null &&
    programmeEnd > programmeStart
  ) {
    if (slotRanges.length === 0) return { start: programmeStart, end: programmeEnd };
    const frueh = Math.min(...slotRanges.map((s) => s.startMin));
    const spaet = Math.max(...slotRanges.map((s) => s.endMin));
    return {
      start: frueh < programmeStart ? Math.max(0, Math.floor(frueh / 60) * 60) : programmeStart,
      end: spaet > programmeEnd ? Math.min(1440, Math.ceil(spaet / 60) * 60) : programmeEnd,
    };
  }
  if (slotRanges.length > 0) {
    const lo = Math.max(
      0,
      Math.floor((Math.min(...slotRanges.map((s) => s.startMin)) - 60) / 60) * 60,
    );
    const hi = Math.min(
      1440,
      Math.ceil((Math.max(...slotRanges.map((s) => s.endMin)) + 60) / 60) * 60,
    );
    return { start: lo, end: Math.max(hi, lo + 120) };
  }
  return { start: FALLBACK_START, end: FALLBACK_END };
}

/** Position und Höhe einer Slot-Karte in der Spalte. */
export function slotBox(
  startMin: number,
  endMin: number,
  windowStart: number,
): { top: number; height: number } {
  return {
    top: (startMin - windowStart) * PX_PER_MIN,
    // Mindesthöhe, damit auch ein 5-Minuten-Slot anklickbar bleibt.
    height: Math.max(22, (endMin - startMin) * PX_PER_MIN - 2),
  };
}

/**
 * Wie viele Textzeilen à 20 px ganz in eine Slot-Karte passen (2 px
 * Innenabstand oben und unten). Die Karte zeigt nur, was ganz hineinpasst
 * (LEAD-017): 20 Minuten → 1 (Beginn und Titel in einer Zeile), 30 → 2,
 * 45 → 3, 60 → 4.
 */
export function zeilenInKarte(startMin: number, endMin: number): number {
  return Math.floor((slotBox(startMin, endMin, 0).height - 4) / 20);
}

/**
 * Y-Abstand zum oberen Rand der Spalte → Startminute, auf 5 Minuten gerastert
 * und in das sichtbare Fenster geklemmt.
 */
export function minutesFromOffset(
  offsetPx: number,
  windowStart: number,
  windowEnd: number,
): number {
  const raw = windowStart + offsetPx / PX_PER_MIN;
  return Math.min(windowEnd - GRID_MIN, Math.max(windowStart, snapTo5(raw)));
}

/** Neues Ende beim Ziehen am unteren Rand — nie kürzer als ein Rasterschritt. */
export function resizedEnd(
  startMin: number,
  endMin: number,
  deltaPx: number,
): number {
  return Math.max(startMin + GRID_MIN, snapTo5(endMin + deltaPx / PX_PER_MIN));
}

/** Volle Stunden im Fenster — die Linien und Beschriftungen des Rasters. */
export function hourMarks(windowStart: number, windowEnd: number): number[] {
  const marks: number[] = [];
  for (let m = Math.ceil(windowStart / 60) * 60; m <= windowEnd; m += 60) {
    marks.push(m);
  }
  return marks;
}
