/**
 * Die Antwort der öffentlichen Seite `/side-event/<token>` und ihrer Route (ADM-077, SPK-091).
 *
 * Der Link aus der Einladungsmail führt auf eine Seite **ohne Anmeldung**. Sie zeigt nur das Event (Titel, Zeit, Ort) und den eigenen Stand —
 * **nie** Personendaten — und setzt den Stand **nur per POST**: Mail-Scanner rufen Links vorab ab, ein GET darf nichts entscheiden.
 * Die Datenbankfunktion `side_event_respond_by_token` ist die einzige Stelle, die darüber befindet; hier steht nur, wie ihre Antwort gelesen wird.
 *
 * Reine Funktionen ohne Server-Abhängigkeit, damit Seite, Route und Tests dieselbe Lesart benutzen.
 */

/** Form des Tokens: 32 Zufallsbytes, URL-sicher als Base64 ohne Füllzeichen = 43 Zeichen. Alles andere ist `invalid`, ohne die Datenbank zu fragen. */
export const TOKEN_FORM = /^[A-Za-z0-9_-]{43}$/;

export function istToken(wert: unknown): wert is string {
  return typeof wert === "string" && TOKEN_FORM.test(wert);
}

/** Zustände als Wert, nie als Fehler: unbekannt, abgelaufen und unveröffentlicht sehen von außen gleich aus (`invalid`). */
export const LINK_ZUSTAENDE = ["ok", "invalid", "closed", "full", "rate_limited"] as const;
export type LinkZustand = (typeof LINK_ZUSTAENDE)[number];

export type LinkStatus = "invited" | "yes" | "no";
const STATUS: readonly string[] = ["invited", "yes", "no"];

/** Was die Seite vom Event zeigen darf. Keine Person, kein Hinweis, keine Zahl anderer Gäste. */
export type LinkEvent = {
  title_de: string;
  title_en: string | null;
  starts_at: string;
  ends_at: string | null;
  location: string;
  address: string | null;
};

export type LinkAntwort = {
  state: LinkZustand;
  status: LinkStatus | null;
  event: LinkEvent | null;
};

const UNGUELTIG: LinkAntwort = { state: "invalid", status: null, event: null };

function text(wert: unknown): string | null {
  return typeof wert === "string" && wert.length > 0 ? wert : null;
}

/**
 * Liest die Antwort der Datenbankfunktion streng: ein unbekannter Zustand ist `invalid`, ein Event ohne Titel oder Beginn gibt es nicht, und
 * es wird **nur** übernommen, was die Seite zeigen darf — auch wenn die Funktion eines Tages mehr liefern sollte, bleibt es draußen.
 */
export function leseLinkAntwort(daten: unknown): LinkAntwort {
  if (!daten || typeof daten !== "object") return UNGUELTIG;
  const roh = daten as { state?: unknown; status?: unknown; event?: unknown };
  const zustand = LINK_ZUSTAENDE.find((z) => z === roh.state);
  if (!zustand) return UNGUELTIG;
  const status = STATUS.includes(String(roh.status)) ? (roh.status as LinkStatus) : null;

  if (!roh.event || typeof roh.event !== "object") {
    // Ohne Event gibt es nur die Zustände, die kein Event brauchen.
    return zustand === "invalid" || zustand === "rate_limited" ? { state: zustand, status: null, event: null } : UNGUELTIG;
  }
  const e = roh.event as Record<string, unknown>;
  const titel = text(e.title_de);
  const beginn = text(e.starts_at);
  const ort = text(e.location);
  if (!titel || !beginn || !ort) return UNGUELTIG;
  return {
    state: zustand,
    status,
    event: {
      title_de: titel,
      title_en: text(e.title_en),
      starts_at: beginn,
      ends_at: text(e.ends_at),
      location: ort,
      address: text(e.address),
    },
  };
}
