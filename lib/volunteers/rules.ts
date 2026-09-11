/**
 * Regeln des Volunteer-Bereichs, die Client und Test teilen.
 *
 * Dieselbe Rechnung läuft zweimal: hier im Browser, damit niemand das
 * Formular umsonst ausfüllt, und noch einmal in `apply_volunteer`
 * (P0001 `too_young`). Verlassen kann man sich nur auf die RPC.
 */

/**
 * Mindestalter 18 **am ersten Eventtag** (Entscheidung E1) — nicht heute.
 * Wer heute 17 ist und im März 18 wird, darf sich bewerben; wer am Summit
 * noch 17 ist, nicht.
 *
 * Ohne bekanntes Datum der Edition zählt der heutige Tag: dann ist die
 * Prüfung strenger als die Datenbank, nie lockerer.
 */
export function isTooYoung(birthdate: string, firstDay: string | null): boolean {
  if (!birthdate) return false;
  const born = new Date(birthdate);
  if (Number.isNaN(born.getTime())) return false;
  const reference = firstDay ? new Date(firstDay) : new Date();
  if (Number.isNaN(reference.getTime())) return false;
  const limit = new Date(reference);
  limit.setFullYear(limit.getFullYear() - 18);
  return born > limit;
}
