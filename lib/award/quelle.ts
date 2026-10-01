import "server-only";
import { createHash } from "node:crypto";

/**
 * Quelle einer öffentlichen Anfrage als Hash (ADM-024).
 *
 * Auflage der Architektur-Session (01.10.2026): Die IP-Adresse erreicht die
 * Datenbank **nie im Klartext** — Postgres protokolliert bei Fehlern das
 * Statement samt Parametern. Deshalb wird hier `sha256(ip)` gebildet; die
 * Datenbank hasht mit Edition und Salz erneut (`award_hash`) und speichert nur
 * das Ergebnis.
 *
 * Vercel setzt `x-real-ip` und überschreibt `x-forwarded-for` selbst — der
 * Browser kann beides nicht fälschen. Ohne Header (lokal) gilt „unbekannt":
 * alle lokalen Anfragen teilen sich dann eine Quelle.
 */
export function quellHash(headers: { get(name: string): string | null }): string {
  const ip =
    headers.get("x-real-ip")?.trim() ||
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unbekannt";
  return createHash("sha256").update(ip).digest("hex");
}

/** Zustände der öffentlichen Award-Funktionen — Rückgabewerte, keine Fehler. */
export const AWARD_ZUSTAENDE = ["ok", "invalid", "closed", "rate_limited", "duplicate", "not_votable", "not_found"] as const;
export type AwardZustand = (typeof AWARD_ZUSTAENDE)[number];

export function alsZustand(wert: unknown): AwardZustand {
  return (AWARD_ZUSTAENDE as readonly string[]).includes(String(wert)) ? (wert as AwardZustand) : "invalid";
}
