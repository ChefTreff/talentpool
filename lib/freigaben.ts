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
