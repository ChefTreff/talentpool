/**
 * Themen-Kategorien der Wiki-Artikel (PART-058, Vorschlag Design-Chat).
 *
 * Konrad (21./24.09.): „bessere Kategorisierung statt Phasen“. Die Phase
 * („vor dem Summit“, „Aufbau“ …) ist eine Eigenschaft des Artikels, kein Weg,
 * ihn zu finden; wer „Rückwand“ sucht, fragt nach einem Thema. Die Liste
 * gruppiert deshalb nach Aufgaben.
 *
 * **Das Thema steht am Artikel** (ADM-064, `kb_article.category`, Vokabular
 * `wiki_category`; im Editor wählbar). Dieser Code ist nur noch der Rückfall:
 * ein ausdrücklich gesetztes `category` gewinnt, sonst gilt die Zuordnung nach
 * Slug, sonst „Weitere Artikel“. Die Schlüssel und die Reihenfolge der Themen
 * stehen hier **und** im Vokabular — ein Test hält beide gleich
 * (`tests/wiki-thema-produktbezug.test.ts`).
 *
 * Die Reihenfolge der Slugs je Kategorie ist die Reihenfolge in der Liste:
 * von der Übersicht zum Detail, nicht alphabetisch.
 */

export const WIKI_KATEGORIEN = [
  "summit",
  "stand",
  "vorort",
  "programm",
  "sichtbarkeit",
  "speaking",
  "hackathon",
] as const;

export type WikiKategorieSchluessel = (typeof WIKI_KATEGORIEN)[number];
export type WikiKategorie = WikiKategorieSchluessel | "weitere";

export const SLUGS_JE_KATEGORIE: Record<WikiKategorieSchluessel, readonly string[]> = {
  // Ankommen und sich zurechtfinden.
  summit: [
    "ueber-cheftreff",
    "oeffnungszeiten-ablauf",
    "location-anfahrt",
    "hotel-unterkunft",
    "tickets-akkreditierung",
  ],
  // Alles bis der Stand steht.
  stand: [
    "hallenplan-standuebersicht",
    "eigenbau-stand-genehmigung",
    "messestand-rueckwand",
    "anlieferung-aufbau",
    "anlieferung-lkw",
    "messeshop",
  ],
  // Während des Summits.
  vorort: ["help-desk-kiosk", "stand-catering", "pfand"],
  // Formate, in denen Partner auftreten.
  programm: ["company-tours", "masterclasses", "sponsored-talk"],
  // Gesehen und gefunden werden.
  sichtbarkeit: ["media-kit", "event-app", "recruiting-best-practices"],
  // Für Speaker: vom Briefing zur Folie.
  speaking: ["speaker-briefing", "talk-guidelines", "praesentationen", "faq-speaking"],
  hackathon: ["ai-hackathon-wiki", "hackathon-ablauf-teilnehmende"],
};

const KATEGORIE_NACH_SLUG: Map<string, WikiKategorieSchluessel> = new Map(
  WIKI_KATEGORIEN.flatMap((k) => SLUGS_JE_KATEGORIE[k].map((s) => [s, k] as const)),
);

function istSchluessel(wert: string | null | undefined): wert is WikiKategorieSchluessel {
  return !!wert && (WIKI_KATEGORIEN as readonly string[]).includes(wert);
}

/** Die Kategorie eines Artikels: ausdrücklich gesetzt, sonst nach Slug, sonst „weitere“. */
export function wikiKategorie(artikel: { slug: string; category?: string | null }): WikiKategorie {
  if (istSchluessel(artikel.category)) return artikel.category;
  return KATEGORIE_NACH_SLUG.get(artikel.slug) ?? "weitere";
}

/** Schlüssel der Beschriftung je Thema im Wörterbuch (`wiki.kat…`) — Portal und Admin zeigen dieselben Namen. */
export const THEMA_TEXT: Record<WikiKategorie, string> = {
  summit: "katSummit",
  stand: "katStand",
  vorort: "katVorort",
  programm: "katProgramm",
  sichtbarkeit: "katSichtbarkeit",
  speaking: "katSpeaking",
  hackathon: "katHackathon",
  weitere: "katWeitere",
};

export type KategorieGruppe<T> = { kategorie: WikiKategorie; artikel: T[] };

/**
 * Gruppiert die Artikel nach Kategorie. Reihenfolge der Gruppen wie in
 * `WIKI_KATEGORIEN`, „weitere“ zuletzt; leere Gruppen fehlen. Innerhalb einer
 * Gruppe gilt die Reihenfolge von `SLUGS_JE_KATEGORIE`, nicht eingeordnete
 * Artikel folgen alphabetisch nach Titel.
 */
export function gruppiereNachKategorie<T extends { slug: string; title: string; category?: string | null }>(
  artikel: readonly T[],
  sprache = "de",
): KategorieGruppe<T>[] {
  const je = new Map<WikiKategorie, T[]>();
  for (const a of artikel) {
    const k = wikiKategorie(a);
    je.set(k, [...(je.get(k) ?? []), a]);
  }
  const rang = (a: T): number => {
    const k = wikiKategorie(a);
    if (k === "weitere") return Number.MAX_SAFE_INTEGER;
    const i = SLUGS_JE_KATEGORIE[k].indexOf(a.slug);
    return i === -1 ? Number.MAX_SAFE_INTEGER - 1 : i;
  };
  const reihenfolge: WikiKategorie[] = [...WIKI_KATEGORIEN, "weitere"];
  return reihenfolge
    .filter((k) => (je.get(k)?.length ?? 0) > 0)
    .map((k) => ({
      kategorie: k,
      artikel: [...(je.get(k) ?? [])].sort(
        (a, b) => rang(a) - rang(b) || a.title.localeCompare(b.title, sprache),
      ),
    }));
}
