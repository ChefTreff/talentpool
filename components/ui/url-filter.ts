/**
 * Filter einer Liste ↔ Adresszeile (QS-050) — die reinen Funktionen hinter
 * `useUrlFilter`, ohne React, damit `tests/url-filter.test.ts` sie prüft.
 *
 * Regeln:
 * - Ein Feld steht nur in der Adresse, wenn es von seiner Vorgabe abweicht —
 *   die ungefilterte Liste hat eine saubere Adresse.
 * - Fremde Parameter bleiben stehen (`event`, `tag` im Board, Rücksprünge).
 * - Werte sind Text; Schalter schreiben „1“ (an) oder fehlen (aus).
 */

export type FilterWerte = Record<string, string>;

/** Schlüssel in der Adresszeile je Feld, wo er kürzer sein soll (`query` → `q`). */
export type FilterNamen<T extends FilterWerte> = Partial<Record<keyof T, string>>;

const name = <T extends FilterWerte>(k: keyof T, namen: FilterNamen<T>) => namen[k] ?? String(k);

/** Die Werte aus der Adresse, sonst die Vorgaben. */
export function ausAdresse<T extends FilterWerte>(
  params: { get(name: string): string | null },
  vorgaben: T,
  namen: FilterNamen<T> = {},
): T {
  const werte = { ...vorgaben };
  for (const k of Object.keys(vorgaben) as (keyof T)[]) {
    const v = params.get(name(k, namen));
    if (v !== null) werte[k] = v as T[keyof T];
  }
  return werte;
}

/**
 * Der neue Suchteil der Adresse (ohne „?“) nach einer Änderung: geänderte
 * Felder gesetzt oder — bei Vorgabe oder leer — entfernt, alles andere wie vorher.
 */
export function neueSuche<T extends FilterWerte>(
  suche: string,
  aenderung: Partial<T>,
  vorgaben: T,
  namen: FilterNamen<T> = {},
): string {
  const q = new URLSearchParams(suche);
  for (const k of Object.keys(aenderung) as (keyof T)[]) {
    const v = aenderung[k];
    if (v === undefined) continue;
    if (v === "" || v === vorgaben[k]) q.delete(name(k, namen));
    else q.set(name(k, namen), v);
  }
  return q.toString();
}
