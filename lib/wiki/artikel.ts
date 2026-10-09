import type { KbAdminArticle } from "@/components/wiki/types";
import { wikiKategorie } from "@/lib/wiki/kategorien";

/**
 * Ein Wiki-Artikel im Admin (ADM-103): das Paar (slug, edition_id) mit **einer Zeile je Sprache** in `kb_article`.
 * Reine Hilfen ohne Server- und Client-Importe, damit `npm test` sie prüft.
 */
export type WikiArtikel = {
  /** `slug|edition_id` — stabil, solange der Artikel besteht; steht nie in der Übersicht. */
  schluessel: string;
  slug: string;
  edition_id: string | null;
  edition_slug: string | null;
  de: KbAdminArticle | null;
  en: KbAdminArticle | null;
  /** Titel der deutschen Fassung, sonst der englischen. */
  titel: string;
  /** Thema wie im Portal (gesetztes `category`, sonst abgeleitet, sonst „weitere“). */
  thema: string;
  audience: string[];
  product_formats: string[];
  roles: string[];
  phase: string;
  valid_until: string | null;
  /** Jüngste Änderung beider Fassungen. */
  geaendert: string;
  /** Gemeinsame Felder weichen zwischen den Sprachen ab — passiert bei Bestand, den die Paarfunktion beim nächsten Speichern angleicht. */
  abweichend: boolean;
};

const gleich = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join("|") === [...b].sort().join("|");

/** Gruppiert die Zeilen von `kb_articles_admin` zu Artikeln; Reihenfolge: nach Titel. */
export function gruppiere(zeilen: KbAdminArticle[]): WikiArtikel[] {
  const je = new Map<string, WikiArtikel>();
  for (const z of zeilen) {
    const schluessel = `${z.slug}|${z.edition_id ?? ""}`;
    const alt = je.get(schluessel);
    const sprache = z.language === "en" ? "en" : "de";
    if (!alt) {
      je.set(schluessel, {
        schluessel, slug: z.slug, edition_id: z.edition_id, edition_slug: z.edition_slug,
        de: null, en: null, titel: z.title, thema: wikiKategorie(z), audience: z.audience,
        product_formats: z.product_formats, roles: z.roles, phase: z.phase, valid_until: z.valid_until,
        geaendert: z.updated_at, abweichend: false,
      });
    }
    const a = je.get(schluessel)!;
    a[sprache] = z;
    if (new Date(z.updated_at) > new Date(a.geaendert)) a.geaendert = z.updated_at;
  }
  for (const a of je.values()) {
    // Die deutsche Fassung gibt die gemeinsamen Felder vor, die englische nur, wenn es keine deutsche gibt.
    const fuehrend = a.de ?? a.en!;
    a.titel = fuehrend.title;
    a.thema = wikiKategorie(fuehrend);
    a.audience = fuehrend.audience;
    a.product_formats = fuehrend.product_formats;
    a.roles = fuehrend.roles;
    a.phase = fuehrend.phase;
    a.valid_until = fuehrend.valid_until;
    if (a.de && a.en) {
      a.abweichend =
        !gleich(a.de.audience, a.en.audience) || !gleich(a.de.roles, a.en.roles) || !gleich(a.de.product_formats, a.en.product_formats) ||
        a.de.phase !== a.en.phase || (a.de.category ?? "") !== (a.en.category ?? "");
    }
  }
  return [...je.values()].sort((x, y) => x.titel.localeCompare(y.titel, "de"));
}

export type Filter = { q: string; thema: string; zielgruppe: string; status: string };

/** Suche in Titel, Slug und Text beider Sprachen (jedes Wort muss vorkommen); Filter nach Thema, Zielgruppe und Status (einer Fassung). */
export function passtArtikel(a: WikiArtikel, f: Filter): boolean {
  if (f.thema && a.thema !== f.thema) return false;
  if (f.zielgruppe && !a.audience.includes(f.zielgruppe)) return false;
  if (f.status && !(a.de?.status === f.status || a.en?.status === f.status) && !(f.status === "missing" && !a.en)) return false;
  const q = f.q.trim().toLowerCase();
  if (!q) return true;
  const heu = [a.slug, a.de?.title, a.de?.body_md, a.en?.title, a.en?.body_md].filter(Boolean).join("\n").toLowerCase();
  return q.split(/\s+/).every((w) => heu.includes(w));
}
