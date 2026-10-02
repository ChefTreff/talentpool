/**
 * Regeln des Schichtmodells (VOL-002, K-44): Blöcke von 4–6 Stunden, Warnung ab 8 Stunden und bei
 * zwei Schichten am selben Tag ohne Pause. Nur Hinweise — nichts davon sperrt eine Zuteilung.
 */

/** Fassung der Sicherheitsunterweisung; steigt sie, muss neu bestätigt werden können. */
export const SAFETY_VERSION = "2027-1";

export const BLOCK_MIN_HOURS = 4;
export const BLOCK_MAX_HOURS = 6;
export const WARN_FROM_HOURS = 8;
export const MIN_BREAK_MINUTES = 60;
export const MAX_WISHES = 5;

type Span = { start_at: string; end_at: string };

export function shiftHours(s: Span): number {
  return (new Date(s.end_at).getTime() - new Date(s.start_at).getTime()) / 3_600_000;
}

/** `long` ab 8 h (Warnung), `short` unter 4 h und `block` im Regelbereich bis 6 h; dazwischen `ok`. */
export function lengthKind(hours: number): "short" | "block" | "ok" | "long" {
  if (hours >= WARN_FROM_HOURS) return "long";
  if (hours > BLOCK_MAX_HOURS) return "ok";
  if (hours >= BLOCK_MIN_HOURS) return "block";
  return "short";
}

/**
 * Zwei Schichten einer Person, die sich berühren oder weniger als eine Stunde Pause lassen
 * (Überschneidungen weist die Datenbank ab). Gibt die Paare als Ids zurück.
 */
export function breakConflicts<T extends Span & { id: string }>(
  shifts: readonly T[],
): [string, string][] {
  const sorted = [...shifts].sort((a, b) => a.start_at.localeCompare(b.start_at));
  const out: [string, string][] = [];
  for (let i = 1; i < sorted.length; i++) {
    const gap = (new Date(sorted[i].start_at).getTime() - new Date(sorted[i - 1].end_at).getTime()) / 60_000;
    if (gap < MIN_BREAK_MINUTES) out.push([sorted[i - 1].id, sorted[i].id]);
  }
  return out;
}

/** Je Person die Schichten-Ids, bei denen eine Pause fehlt — für den Hinweis im Plan. */
export function shortBreakShiftIds(
  shifts: readonly (Span & { id: string; people: { person_id: string; status: string }[] })[],
): Map<string, Set<string>> {
  const byPerson = new Map<string, (Span & { id: string })[]>();
  for (const s of shifts) {
    for (const p of s.people) {
      if (p.status !== "assigned" && p.status !== "confirmed") continue;
      byPerson.set(p.person_id, [...(byPerson.get(p.person_id) ?? []), s]);
    }
  }
  const out = new Map<string, Set<string>>();
  for (const [person, list] of byPerson) {
    for (const [a, b] of breakConflicts(list)) {
      out.set(a, new Set([...(out.get(a) ?? []), person]));
      out.set(b, new Set([...(out.get(b) ?? []), person]));
    }
  }
  return out;
}

/** `HH:MM` aus einem Postgres-`time` ("09:00:00"). */
export function hhmm(time: string): string {
  return time.slice(0, 5);
}

/** Dauer einer Vorlage in Stunden; Ende <= Beginn heißt Folgetag. */
export function templateHours(start: string, end: string): number {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let mins = eh * 60 + em - (sh * 60 + sm);
  if (mins <= 0) mins += 24 * 60;
  return mins / 60;
}
