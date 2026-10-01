import { ausAdresse, neueSuche } from "@/components/ui/url-filter";

/**
 * Die Bewerbungsliste im Admin (ADM-003) — Filter, Blättern und das Ergebnis
 * einer Sammelentscheidung, rein und ohne React, damit es sich prüfen lässt.
 *
 * Gefiltert wird **in der Datenbank** (`applications_admin_list`): bei bis zu
 * 50 Masterclasses mit je 500 Bewerbungen liegt die Liste nie ganz im Browser.
 * Deshalb kein `useUrlFilter` (schreibt die Adresse ohne Server-Rundlauf),
 * sondern dieselben reinen Funktionen dahinter: `ausAdresse` liest, `neueSuche`
 * baut Filter- und Seitenlinks — die Adresse enthält nur, was von der Vorgabe
 * abweicht, und fremde Parameter bleiben stehen.
 */

/** Zeilen je Seite. Die Datenbank liefert höchstens 200; 50 hält die Seite ruhig. */
export const SEITE_GROESSE = 50;

/** Höchstens so viele Bewerbungen je Sammelentscheidung — dieselbe Zahl wie in `decide_applications`. */
export const SAMMEL_MAX = 200;

/** Die vier Entscheidungen, die `decide_application(s)` annimmt. */
export const ENTSCHEIDUNGEN = ["shortlisted", "accepted", "waitlisted", "declined"] as const;
export type Entscheidung = (typeof ENTSCHEIDUNGEN)[number];

/**
 * Stände, in denen `decide_application` noch entscheidet. Bestätigte,
 * erschienene, nicht erschienene und zurückgezogene Bewerbungen weist die
 * Datenbank ab (`not_decidable`) — in der Liste bekommen sie kein Häkchen und
 * keine Entscheidungsknöpfe.
 */
export const ENTSCHEIDBAR: ReadonlySet<string> = new Set(["applied", "shortlisted", "accepted", "waitlisted", "declined", "promoted", "expired"]);

/** Felder in der Adresse; leer heisst „alle“ bzw. Seite 1. */
export const LISTE_VORGABEN = { q: "", format: "", session: "", status: "", einwilligung: "", seite: "" };
export type ListeWerte = typeof LISTE_VORGABEN;

/** Was an `applications_admin_list` geht. */
export type ListeFilter = {
  q: string | null;
  format: string | null;
  session: string | null;
  status: string | null;
  consent: boolean | null;
  seite: number;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Filter aus der Adresse, geprüft. Was nicht passt (unbekanntes Format, keine
 * Kennung, Seite „-3“), fällt auf „alle“ bzw. Seite 1 zurück — eine verbogene
 * Adresse soll eine Liste zeigen, keinen Fehler. `werte` ist der bereinigte
 * Stand fürs Formular.
 */
export function listeFilter(
  params: { get(name: string): string | null },
  erlaubt: { formate: readonly string[]; status: readonly string[] },
): { werte: ListeWerte; filter: ListeFilter } {
  const roh = ausAdresse(params, LISTE_VORGABEN);
  const q = roh.q.trim().slice(0, 100);
  const format = erlaubt.formate.includes(roh.format) ? roh.format : null;
  const session = UUID.test(roh.session) ? roh.session.toLowerCase() : null;
  const status = erlaubt.status.includes(roh.status) ? roh.status : null;
  const consent = roh.einwilligung === "mit" ? true : roh.einwilligung === "ohne" ? false : null;
  const n = Number.parseInt(roh.seite, 10);
  const seite = Number.isFinite(n) && n >= 1 ? Math.min(n, 10_000) : 1;
  return {
    werte: {
      q,
      format: format ?? "",
      session: session ?? "",
      status: status ?? "",
      einwilligung: consent === null ? "" : consent ? "mit" : "ohne",
      seite: seite > 1 ? String(seite) : "",
    },
    filter: { q: q || null, format, session, status, consent, seite },
  };
}

/** Steht irgendein Filter (ausser der Seite)? Dann gibt es „Filter zurücksetzen“. */
export function filterAktiv(werte: ListeWerte): boolean {
  return Boolean(werte.q || werte.format || werte.session || werte.status || werte.einwilligung);
}

/** Adresse einer Seite: alle Filter bleiben, nur `seite` ändert sich (Seite 1 steht nicht in der Adresse). */
export function seitenAdresse(pfad: string, suche: string, seite: number): string {
  const neu = neueSuche(suche, { seite: seite > 1 ? String(seite) : "" }, LISTE_VORGABEN);
  return neu ? `${pfad}?${neu}` : pfad;
}

/** Adresse nach dem Filtern: die neuen Werte, zurück auf Seite 1. */
export function filterAdresse(pfad: string, suche: string, werte: Partial<ListeWerte>): string {
  const neu = neueSuche(suche, { ...werte, seite: "" }, LISTE_VORGABEN);
  return neu ? `${pfad}?${neu}` : pfad;
}

/** Seiten insgesamt — mindestens eine, auch ohne Treffer. */
export function seitenZahl(total: number, groesse = SEITE_GROESSE): number {
  return Math.max(1, Math.ceil(Math.max(0, total) / groesse));
}

/**
 * Ergebnis einer Sammelentscheidung: wie viele geklappt haben und welche
 * Gründe wie oft dagegen standen — häufigster zuerst.
 */
export function sammelErgebnis(zeilen: { ok: boolean; error_key: string | null }[]): {
  ok: number;
  fehler: [string, number][];
} {
  const gruende = new Map<string, number>();
  let ok = 0;
  for (const z of zeilen) {
    if (z.ok) ok += 1;
    else gruende.set(z.error_key ?? "unknown", (gruende.get(z.error_key ?? "unknown") ?? 0) + 1);
  }
  return { ok, fehler: [...gruende.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])) };
}
