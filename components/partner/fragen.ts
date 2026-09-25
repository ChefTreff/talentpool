/**
 * Bewerbungsfragen einer Session aus Sicht des Partners (PART-045): Katalog-
 * fragen und eigene, beantragte Fragen. Reine Typen und Hilfen ohne Server und
 * ohne JSX, damit sie Seiten, Formulare und Tests gleichermassen nutzen.
 */

/** Eine Frage der Session mit Text (Katalog oder eigene). */
export type SessionFrage = {
  /** Antwortschlüssel: `question_id` bei Katalogfragen, sonst die eigene Id (wie `apply_to_session`). */
  key: string;
  id: string;
  question_id: string | null;
  label_de: string;
  label_en: string;
  type: string | null;
  required: boolean;
  sort_order: number;
  approved_at: string | null;
  purpose: string | null;
  /** Katalogschlüssel (etwa `motivation`) — ältere Antworten tragen ihn statt der Id. */
  catalog_key: string | null;
};

/** Höchstens zwei eigene Fragen je Session (Antwort C, `partner_request_question`). */
export const MAX_EIGENE_FRAGEN = 2;

/**
 * Typen, die ein Partner für eine eigene Frage beantragen kann — die Liste von
 * `partner_request_question` ohne `multiselect`: das Bewerbungsformular zeigt
 * davon heute nur Auswahl, Ja/Nein, kurzen und langen Text.
 */
export const EIGENE_FRAGE_TYPEN = ["text", "textarea", "select", "boolean", "url", "number"] as const;
export type EigeneFrageTyp = (typeof EIGENE_FRAGE_TYPEN)[number];

/**
 * Optionen einer Auswahlfrage aus „eine Option pro Zeile“. Gespeichert wird wie
 * im Katalog (`[{key,label_de,label_en}]`); der Schlüssel ist der Text selbst,
 * damit die Antwort in der Bewerberliste lesbar bleibt. Doppelte und leere
 * Zeilen fallen weg.
 */
export function optionenAusText(text: string): { key: string; label_de: string; label_en: string }[] {
  const gesehen = new Set<string>();
  return text
    .split("\n")
    .map((z) => z.trim())
    .filter((z) => z !== "" && !gesehen.has(z) && gesehen.add(z))
    .map((z) => ({ key: z, label_de: z, label_en: z }));
}

/**
 * Antworten unter ihrem Fragetext statt unter dem Schlüssel, in der
 * Reihenfolge der Fragen; unbekannte Schlüssel bleiben hinten stehen.
 */
export function antwortenMitText(
  answers: Record<string, unknown> | null,
  fragen: SessionFrage[],
  locale: string,
): Record<string, unknown> | null {
  if (!answers) return null;
  const text = new Map<string, string>();
  for (const f of fragen) {
    const label = locale === "en" ? f.label_en : f.label_de;
    text.set(f.key, label);
    if (f.catalog_key) text.set(f.catalog_key, label);
  }
  const geordnet: [string, unknown][] = [];
  const genommen = new Set<string>();
  for (const f of fragen) {
    for (const k of [f.key, f.catalog_key]) {
      if (k && k in answers && !genommen.has(k)) {
        geordnet.push([text.get(k)!, answers[k]]);
        genommen.add(k);
      }
    }
  }
  for (const [k, v] of Object.entries(answers)) {
    if (!genommen.has(k)) geordnet.push([text.get(k) ?? k, v]);
  }
  return Object.fromEntries(geordnet);
}
