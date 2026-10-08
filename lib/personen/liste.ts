import type { BadgeTone } from "@/components/ui/Badge";

/**
 * Filter und Anzeige der Personenliste (ADM-091). Die Werte stehen in der
 * Adresszeile; was die Datenbank nicht kennt, wird hier **vor** dem Aufruf
 * verworfen — `persons_admin_list` wirft bei einem unbekannten Konto-Status
 * oder einer unbekannten Sortierung 22023, und ein Tippfehler im Link soll
 * eine Liste zeigen, keine Fehlerseite.
 */
export const KONTO_FILTER = ["alle", "login", "ohne_login", "gesperrt", "antrag", "geloescht"] as const;
export type KontoFilter = (typeof KONTO_FILTER)[number];

export const SORTIERUNG = ["neu", "name"] as const;
export type Sortierung = (typeof SORTIERUNG)[number];

export function leseKonto(roh: string | undefined): KontoFilter | "" {
  return (KONTO_FILTER as readonly string[]).includes(roh ?? "") ? (roh as KontoFilter) : "";
}

export function leseSortierung(roh: string | undefined): Sortierung {
  return (SORTIERUNG as readonly string[]).includes(roh ?? "") ? (roh as Sortierung) : "neu";
}

/** Eine Zeile aus `persons_admin_list`, so wie PostgREST sie liefert. */
export type PersonZeile = {
  person_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  occupation_status: string | null;
  employer_name: string | null;
  tier: string;
  has_login: boolean;
  blocked_at: string | null;
  deleted_at: string | null;
  deletion_pending: boolean;
  roles: string[];
  editions: string[];
  created_at: string;
  total: number;
};

export type Konto = "geloescht" | "gesperrt" | "antrag" | "login" | "ohne_login";

/**
 * Das eine Kennzeichen je Zeile. Reihenfolge nach Gewicht: gelöscht vor
 * gesperrt vor „Löschantrag offen“ vor dem gewöhnlichen Stand — wer hier etwas
 * Besonderes sucht, soll es nicht unter „mit Login“ finden.
 */
export function kontoDerZeile(z: Pick<PersonZeile, "deleted_at" | "blocked_at" | "deletion_pending" | "has_login">): Konto {
  if (z.deleted_at) return "geloescht";
  if (z.blocked_at) return "gesperrt";
  if (z.deletion_pending) return "antrag";
  return z.has_login ? "login" : "ohne_login";
}

export const KONTO_TON: Record<Konto, BadgeTone> = {
  geloescht: "neutral",
  gesperrt: "error",
  antrag: "warning",
  login: "success",
  ohne_login: "neutral",
};

/** Die ersten `max` Einträge und wie viele darüber hinaus — für lange Listen in einer Zelle. */
export function kuerzen<T>(liste: T[], max: number): { sichtbar: T[]; weitere: number } {
  return { sichtbar: liste.slice(0, max), weitere: Math.max(0, liste.length - max) };
}

/** Adresse der Liste mit Filtern; leere Werte und die Standardwerte bleiben draussen. */
export function listenAdresse(
  pfad: string,
  werte: { q?: string; rolle?: string; edition?: string; konto?: string; sort?: string; seite?: number },
): string {
  const p = new URLSearchParams();
  if (werte.q) p.set("q", werte.q);
  if (werte.rolle) p.set("rolle", werte.rolle);
  if (werte.edition) p.set("edition", werte.edition);
  if (werte.konto) p.set("konto", werte.konto);
  if (werte.sort && werte.sort !== "neu") p.set("sort", werte.sort);
  if (werte.seite && werte.seite > 1) p.set("seite", String(werte.seite));
  const s = p.toString();
  return s ? `${pfad}?${s}` : pfad;
}
