/**
 * Suche und Filter der Vokabularliste (ADM-101). Reine Hilfen ohne React, damit `npm test` sie prüft.
 */
export type Begriff = {
  vocabulary: string;
  key: string;
  label_de: string;
  label_en: string;
};

/**
 * Passt der Begriff zur Suche? Jedes Wort muss in Schlüssel, deutscher oder englischer Beschriftung **oder im Namen des
 * Vokabulars** vorkommen (Groß-/Kleinschreibung egal): wer „status“ tippt, findet auch alle Begriffe eines Vokabulars, das so
 * heißt.
 */
export function passtBegriff(b: Begriff, suche: string): boolean {
  const worte = suche.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (worte.length === 0) return true;
  const heu = `${b.vocabulary}\n${b.key}\n${b.label_de}\n${b.label_en}`.toLowerCase();
  return worte.every((w) => heu.includes(w));
}

/** Gruppiert nach Vokabular (alphabetisch) und wendet Vokabular-Filter und Suche an; leere Gruppen fallen weg. */
export function gruppiereBegriffe<T extends Begriff>(begriffe: T[], filter: { vokabular: string; q: string }): { namen: string[]; gruppen: Record<string, T[]>; treffer: number } {
  const gruppen: Record<string, T[]> = {};
  let treffer = 0;
  for (const b of begriffe) {
    if (filter.vokabular && b.vocabulary !== filter.vokabular) continue;
    if (!passtBegriff(b, filter.q)) continue;
    (gruppen[b.vocabulary] ??= []).push(b);
    treffer += 1;
  }
  return { namen: Object.keys(gruppen).sort(), gruppen, treffer };
}
