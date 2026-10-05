/**
 * Die zentrale Freigabe-Übersicht (ADM-072, Paulina 05.10.: „alles Freigabepflichtige
 * an einem Ort“). Fünf Arten, jede mit einem Zähler; wer eine Art nicht entscheiden
 * darf, bekommt sie gar nicht erst gezählt oder gezeigt.
 *
 * Reine Funktionen, damit die Auswahl der Art in `tests/adm-072-freigaben.test.ts`
 * steht und nicht an der Seite hängt.
 */
import type { NavZusatz } from "@/lib/admin-navigation";

export const FREIGABE_ARTEN = ["inhalte", "slots", "reisekosten", "hotel", "shuttle"] as const;
export type FreigabeArt = (typeof FREIGABE_ARTEN)[number];

/** Zähler je Art — **nur** Arten, die die Person entscheiden darf, haben einen Eintrag. */
export type FreigabeZaehler = Partial<Record<FreigabeArt, number>>;

export function istFreigabeArt(wert: string | undefined): wert is FreigabeArt {
  return (FREIGABE_ARTEN as readonly string[]).includes(wert ?? "");
}

/** Der Admin-Abschnitt, der über eine Art entscheidet — Seite, Zähler und Verlauf prüfen dasselbe Tor. */
export const FREIGABE_ABSCHNITT: Record<FreigabeArt, "submissions" | "programme" | "expenses" | "hospitality"> = {
  inhalte: "submissions",
  slots: "programme",
  reisekosten: "expenses",
  hotel: "hospitality",
  shuttle: "hospitality",
};

/** Alle Abschnitte, über die jemand mindestens eine Art entscheiden kann. */
export const FREIGABE_ABSCHNITTE = ["submissions", "programme", "expenses", "hospitality"] as const;

/**
 * Eine bereits entschiedene Freigabe (`freigabe_verlauf`, ADM-081 Teil 2). Titel, Betrag, Notiz und der Name der
 * entscheidenden Person aus dem Team — sonst nichts. `entschieden_am` bleibt als **Zeichenkette** erhalten: es ist
 * zugleich der Cursor der nächsten Seite, und ein Weg über `Date` kappte die Mikrosekunden.
 */
export type Verlaufszeile = {
  objekt_id: string;
  entschieden_am: string;
  entschieden_von: string | null;
  titel: string;
  detail: string | null;
  notiz: string | null;
  betrag_cents: number | null;
  termin: string | null;
};

/** Zeilen je Seite der Ansicht „Bereits freigegeben“; die Oberfläche fragt eine mehr und weiß so, ob es weitergeht. */
export const VERLAUF_SEITE = 20;

export type VerlaufCursor = { at: string; id: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// ISO-8601 mit Zeitzone, Sekundenbruchteile beliebig — so liefert PostgREST `timestamptz`.
const ZEITPUNKT = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}(:?\d{2})?)$/;

/** Nimmt nur ein Paar aus Zeitpunkt und Kennung an — alles andere kommt nie bis zur Datenbank. */
export function istVerlaufCursor(wert: unknown): wert is VerlaufCursor {
  if (typeof wert !== "object" || wert === null) return false;
  const c = wert as Record<string, unknown>;
  return typeof c.at === "string" && ZEITPUNKT.test(c.at) && typeof c.id === "string" && UUID.test(c.id);
}

/** Liest die Antwort von `freigabe_verlauf` — nur Zeilen, die der Vertrag beschreibt; der Rest fällt weg. */
export function parseVerlauf(daten: unknown): Verlaufszeile[] {
  if (!Array.isArray(daten)) return [];
  const text = (v: unknown) => (typeof v === "string" && v !== "" ? v : null);
  const zeilen: Verlaufszeile[] = [];
  for (const roh of daten) {
    if (typeof roh !== "object" || roh === null) continue;
    const r = roh as Record<string, unknown>;
    const id = text(r.objekt_id);
    const am = text(r.entschieden_am);
    if (!id || !am) continue;
    zeilen.push({
      objekt_id: id,
      entschieden_am: am,
      entschieden_von: text(r.entschieden_von),
      titel: text(r.titel) ?? "—",
      detail: text(r.detail),
      notiz: text(r.notiz),
      betrag_cents: typeof r.betrag_cents === "number" && Number.isFinite(r.betrag_cents) ? r.betrag_cents : null,
      termin: text(r.termin),
    });
  }
  return zeilen;
}

/**
 * Welche Art die Seite zeigt: die gewählte, wenn die Person sie entscheiden darf;
 * sonst die erste mit offenen Einträgen; sonst die erste erlaubte. `null`, wenn
 * die Person gar keine Art entscheiden darf.
 */
export function waehleArt(param: string | undefined, zaehler: FreigabeZaehler): FreigabeArt | null {
  const erlaubt = FREIGABE_ARTEN.filter((a) => zaehler[a] !== undefined);
  if (erlaubt.length === 0) return null;
  if (istFreigabeArt(param) && zaehler[param] !== undefined) return param;
  return erlaubt.find((a) => (zaehler[a] ?? 0) > 0) ?? erlaubt[0];
}

/** Summe aller offenen Einträge über alle erlaubten Arten. */
export function summeOffen(zaehler: FreigabeZaehler): number {
  return FREIGABE_ARTEN.reduce((n, a) => n + (zaehler[a] ?? 0), 0);
}

/** Adresse der zentralen Freigabe-Übersicht — der Menüpunkt und die Unterpunkte zeigen dorthin. */
export const FREIGABE_PFAD = "/admin/einreichungen";

/**
 * Zähler und Unterpunkte für den Menüpunkt „Freigaben“ (ADM-080/081): die Summe am Punkt, darunter je Art,
 * die die Person entscheiden darf, ein Unterpunkt mit eigener Zahl. Eine Art, die nicht im Zähler steht,
 * bekommt keinen Unterpunkt — dieselbe Regel wie bei den Reitern der Seite. Der Unterpunkt, den die Seite
 * ohne Parameter wählt (`waehleArt`), trägt `standard`, damit das Menü ihn dann ebenfalls als aktiv zeigt.
 * `undefined`, wenn die Person keine Art entscheiden darf — dann bleibt der Menüpunkt, wie er war.
 */
export function freigabeNavigation(
  zaehler: FreigabeZaehler,
  texte: { tab: Record<FreigabeArt, string>; offen: string },
): NavZusatz | undefined {
  const arten = FREIGABE_ARTEN.filter((a) => zaehler[a] !== undefined);
  if (arten.length === 0) return undefined;
  const standard = waehleArt(undefined, zaehler);
  const vorlesen = (n: number) => `${n} ${texte.offen}`;
  const summe = summeOffen(zaehler);
  return {
    count: summe,
    countLabel: vorlesen(summe),
    kinder: arten.map((a) => ({
      href: `${FREIGABE_PFAD}?art=${a}`,
      label: texte.tab[a],
      count: zaehler[a],
      countLabel: vorlesen(zaehler[a] ?? 0),
      param: { name: "art", value: a, standard: a === standard },
    })),
  };
}

/**
 * Antwort von `freigabe_zaehler()` (ADM-072b): je Art, die die Person entscheiden darf, eine Zahl.
 * Gelesen wird nur, was der Vertrag verspricht — bekannte Arten mit ganzen Zahlen ab 0. Alles andere
 * (fremde Schlüssel, Texte, negative oder gebrochene Zahlen, keine Zahl) fällt weg: eine Art ohne
 * Eintrag heißt „nicht erlaubt“, nie „0“, und ein beschädigter Wert soll nicht als 0 durchgehen.
 */
export function parseFreigabeZaehler(daten: unknown): FreigabeZaehler {
  if (typeof daten !== "object" || daten === null || Array.isArray(daten)) return {};
  const roh = daten as Record<string, unknown>;
  const zaehler: FreigabeZaehler = {};
  for (const art of FREIGABE_ARTEN) {
    const n = roh[art];
    if (typeof n === "number" && Number.isInteger(n) && n >= 0) zaehler[art] = n;
  }
  return zaehler;
}
