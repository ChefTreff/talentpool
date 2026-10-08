/**
 * Reine Hilfen der Vorlagenseite (ADM-102): Typen aus `mail_templates_admin`, Platzhalter ziehen, Suche. Eigene Datei ohne
 * Client-Importe, damit `npm test` sie prüft.
 */

/** Eine Sprachfassung aus `mail_templates_admin`; `null`, wenn es sie noch nicht gibt. */
export type Sprachfassung = {
  subject: string;
  body_md: string;
  active: boolean;
  version: number;
  updated_at: string;
  updated_by_name: string | null;
} | null;

/** Eine Vorlage mit **beiden** Sprachfassungen (ADM-102 e). */
export type Vorlage = {
  key: string;
  category: string;
  name_de: string;
  name_en: string;
  /** Erlaubte Platzhalter ohne Klammern. */
  variables: string[];
  description: string | null;
  de: Sprachfassung;
  en: Sprachfassung;
  /** Mails, die gerade auf diese Vorlage warten (beide Sprachen). */
  queued: number;
  sent_30d: number;
  sort_order: number;
};

export type Sprache = "de" | "en";
export const SPRACHEN: readonly Sprache[] = ["de", "en"];

/** `{{name}}` aus einem Text ziehen — dieselbe Form, die `fillVars` ersetzt (klein geschrieben, ohne Doppelte). */
export function platzhalter(text: string): string[] {
  return [...new Set([...text.matchAll(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi)].map((m) => m[1].toLowerCase()))];
}

/** Platzhalter im Text, die die Vorlage nicht kennt — sie blieben beim Versand leer. */
export function unbekanntePlatzhalter(text: string, erlaubt: string[]): string[] {
  const ok = new Set(erlaubt.map((x) => x.toLowerCase()));
  return platzhalter(text).filter((p) => !ok.has(p));
}

/** Suche in Namen, Schlüssel und Texten beider Sprachen; jedes Wort muss vorkommen („durchsuchbar“, ADM-102 c). */
export function passt(v: Vorlage, suche: string): boolean {
  const q = suche.trim().toLowerCase();
  if (!q) return true;
  const heu = [v.name_de, v.name_en, v.key, v.de?.subject, v.de?.body_md, v.en?.subject, v.en?.body_md]
    .filter(Boolean).join("\n").toLowerCase();
  return q.split(/\s+/).every((w) => heu.includes(w));
}

/** Fügt `marke` in `text` anstelle der Auswahl `von`–`bis` ein; liefert den neuen Text und die Cursorposition dahinter. */
export function einsetzen(text: string, von: number, bis: number, marke: string): { text: string; cursor: number } {
  const a = Math.max(0, Math.min(von, text.length));
  const b = Math.max(a, Math.min(bis, text.length));
  return { text: text.slice(0, a) + marke + text.slice(b), cursor: a + marke.length };
}
