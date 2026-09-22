/**
 * Die drei Post-Vorlagen, in der Reihenfolge des Ablaufs: vorher, direkt
 * danach, im Rückblick.
 *
 * Sie standen bis zum 22.09. bei den Bildern und sind mit SPK-039 hierher
 * gezogen — Konrad: „Texte würde ich als zweiten Punkt auf die Seite von
 * ‚Deine Grafik' passen." Das stimmt: Grafik und Text gehören zu **einem**
 * Post, die Fotos sind das getrennte Ding.
 *
 * Der Wortlaut steht im Wörterbuch, nicht hier — Marketing pflegt ihn
 * (ADM-027), und dafür muss er ohne Codeänderung erreichbar sein.
 */
export const POST_VORLAGEN = ["announce", "live", "recap"] as const;
export type PostVorlage = (typeof POST_VORLAGEN)[number];

/** Eine Vorlage, fertig gefüllt und bereit zum Kopieren. */
export type GefuellterPost = {
  key: PostVorlage;
  label: string;
  hint: string;
  text: string;
};

/** Platzhalter füllen; unbekannte Namen fallen leer heraus. */
export function fuellen(vorlage: string, werte: Record<string, string>): string {
  return vorlage.replace(/\{(\w+)\}/g, (_, name: string) => werte[name] ?? "");
}
