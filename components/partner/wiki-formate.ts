/**
 * Formate der gebuchten Produkte einer Organisation — Grundlage des Wiki-Filters im Partner-Portal (PART-103, Konrad & Leopold 05.10.:
 * „Artikel zu Masterclasses nur für Partner mit Masterclass“). Ein Format ist der `format_key` des Produkts (Vokabular `partner_format`,
 * dasselbe wie `kb_article.product_formats`); gezählt wird, was **gebucht** ist: eine stornierte Leistung öffnet keine Artikel mehr, ein
 * Produkt ohne Format (Mobiliar, Technik) keinen. Reihenfolge fest, jedes Format einmal.
 *
 * Das Ergebnis geht als `formats` an `loadArticles` / `kb_articles(p_formats)`: Artikel ohne Produktbezug sieht jeder, Artikel mit
 * Produktbezug nur, wer ein passendes Format gebucht hat; eine leere Liste heißt „nur die allgemeinen“. Ein Relevanzfilter, kein
 * Zugriffsschutz — die Zielgruppenprüfung bleibt die Datenbank.
 */
export function gebuchteFormate(
  products: ReadonlyArray<{ format_key: string | null; status: string }> | null | undefined,
): string[] {
  const formate = new Set<string>();
  for (const p of products ?? []) {
    if (p.status === "booked" && p.format_key) formate.add(p.format_key);
  }
  return [...formate].sort();
}
