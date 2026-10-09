/**
 * Knöpfe in Mail-Vorlagen prüfen (ADM-102 f, Muster Design-Chat): ein Knopf ist ein gewöhnlicher Link mit dem Titel „knopf“,
 * `[Beschriftung](https://… "knopf")`. Ein Knopf ohne brauchbare Adresse — die Werkzeugleiste setzt zunächst nur `https://` —
 * wäre in der Mail ein toter Klick; der Editor sagt es, bevor gespeichert wird. Brauchbar ist eine Adresse, die mit `https://`
 * (und etwas dahinter), mit `/` oder mit einem Platzhalter (`{{portal_url}}/login`) beginnt.
 */
export type KnopfProblem = { beschriftung: string; adresse: string };

const KNOPF = /\[([^\]]*)\]\(([^)\s]*)\s+"knopf"\)/gi;

export function knopfProbleme(text: string): KnopfProblem[] {
  const probleme: KnopfProblem[] = [];
  for (const m of text.matchAll(KNOPF)) {
    const adresse = m[2].trim();
    const ok = /^https:\/\/[^\s/]/i.test(adresse) || adresse.startsWith("/") || adresse.startsWith("{{");
    if (!ok) probleme.push({ beschriftung: m[1], adresse });
  }
  return probleme;
}
