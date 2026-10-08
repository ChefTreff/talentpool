import type { BadgeTone } from "@/components/ui/Badge";

/**
 * Einwilligungen je Person (ADM-096): der **aktuelle Stand je Art** statt jeder
 * Zeile des Nachweises. Eigene Datei ohne Server- und Client-Importe, damit
 * `npm test` sie prüft.
 */
export type Zustand = "granted" | "declined" | "revoked";
export const ZUSTAENDE: readonly Zustand[] = ["granted", "declined", "revoked"];

export type StandEintrag = { type: string; version: string; state: Zustand; at: string };

/** Eine Zeile aus `consent_overview_admin`. */
export type PersonenStand = {
  person_id: string;
  person_name: string | null;
  email: string | null;
  states: StandEintrag[];
  last_change: string;
  total: number;
};

export type Ansicht = "person" | "eintrag";

/** Standard ist die Sicht je Person; ein Tippfehler im Link zeigt sie, keine Fehlerseite. */
export function leseAnsicht(roh: string | undefined): Ansicht {
  return roh === "eintrag" ? "eintrag" : "person";
}

export function leseZustand(roh: string | undefined): Zustand | "" {
  return (ZUSTAENDE as readonly string[]).includes(roh ?? "") ? (roh as Zustand) : "";
}

export const ZUSTAND_TON: Record<Zustand, BadgeTone> = { granted: "success", declined: "neutral", revoked: "warning" };

/**
 * Aktueller Stand aus der Geschichte einer Person: je Art der Eintrag mit dem
 * jüngsten `granted_at` — derselbe Schnitt wie die View `consent_current` und
 * die Datenbankfunktion. Ein Widerruf steht am Eintrag, den er widerruft
 * (`revoked_at`), er ist kein eigener, jüngerer Eintrag.
 */
export function aktuellerStand(
  zeilen: { consent_type: string; version: string; granted: boolean; granted_at: string; revoked_at: string | null }[],
): StandEintrag[] {
  const je = new Map<string, (typeof zeilen)[number]>();
  for (const z of zeilen) {
    const alt = je.get(z.consent_type);
    if (!alt || new Date(z.granted_at) > new Date(alt.granted_at)) je.set(z.consent_type, z);
  }
  return [...je.values()]
    .sort((a, b) => a.consent_type.localeCompare(b.consent_type))
    .map((z) => ({
      type: z.consent_type,
      version: z.version,
      state: z.revoked_at ? "revoked" : z.granted ? "granted" : "declined",
      at: z.revoked_at ?? z.granted_at,
    }));
}

/** Je Zustand die Zahl der Arten — für „3 erteilt · 1 widerrufen“. */
export function zaehle(stand: StandEintrag[]): Record<Zustand, number> {
  const n: Record<Zustand, number> = { granted: 0, declined: 0, revoked: 0 };
  for (const s of stand) n[s.state] += 1;
  return n;
}

export function einwilligungenAdresse(
  pfad: string,
  w: { ansicht?: string; typ?: string; zustand?: string; q?: string; seite?: number },
): string {
  const p = new URLSearchParams();
  if (w.ansicht && w.ansicht !== "person") p.set("ansicht", w.ansicht);
  if (w.typ) p.set("typ", w.typ);
  if (w.zustand) p.set("zustand", w.zustand);
  if (w.q) p.set("q", w.q);
  if (w.seite && w.seite > 1) p.set("seite", String(w.seite));
  const s = p.toString();
  return s ? `${pfad}?${s}` : pfad;
}
