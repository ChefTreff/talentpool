/**
 * Die zentrale Freigabe-Übersicht (ADM-072, Paulina 05.10.: „alles Freigabepflichtige
 * an einem Ort“). Fünf Arten, jede mit einem Zähler; wer eine Art nicht entscheiden
 * darf, bekommt sie gar nicht erst gezählt oder gezeigt.
 *
 * Reine Funktionen, damit die Auswahl der Art in `tests/adm-072-freigaben.test.ts`
 * steht und nicht an der Seite hängt.
 */
export const FREIGABE_ARTEN = ["inhalte", "slots", "reisekosten", "hotel", "shuttle"] as const;
export type FreigabeArt = (typeof FREIGABE_ARTEN)[number];

/** Zähler je Art — **nur** Arten, die die Person entscheiden darf, haben einen Eintrag. */
export type FreigabeZaehler = Partial<Record<FreigabeArt, number>>;

export function istFreigabeArt(wert: string | undefined): wert is FreigabeArt {
  return (FREIGABE_ARTEN as readonly string[]).includes(wert ?? "");
}

/**
 * Welche Art die Seite zeigt: die gewählte, wenn die Person sie entscheiden darf;
 * sonst die erste mit offenen Einträgen; sonst die erste erlaubte. `null`, wenn
 * die Person gar keine Art entscheiden darf.
 */
export function waehleArt(param: string | undefined, zaehler: FreigabeZaehler): FreigabeArt | null {
  const erlaubt = FREIGABE_ARTEN.filter((a) => zaehler[a] !== undefined);
  if (erlaubt.length === 0) return null;
  if (istFreigabeArt(param) && zaehler[param] !== undefined) return param;
  return erlaubt.find((a) => (zaehler[a] ?? 0) > 0) ?? erlaubt[0];
}

/** Summe aller offenen Einträge über alle erlaubten Arten. */
export function summeOffen(zaehler: FreigabeZaehler): number {
  return FREIGABE_ARTEN.reduce((n, a) => n + (zaehler[a] ?? 0), 0);
}
