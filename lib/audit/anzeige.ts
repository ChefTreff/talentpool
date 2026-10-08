/**
 * Anzeige der Protokolleinträge (ADM-095): Aktionen mit Anzeigenamen statt
 * Systemnamen, Vorher/Nachher als Feldliste statt als JSON.
 *
 * Eigene Datei ohne `server-only` und ohne Client-Importe, damit `npm test` sie
 * prüfen kann. Die Anzeigenamen stehen in den Wörterbüchern (`auditAction`,
 * `auditDomain`, DE und EN); was dort fehlt, bekommt einen lesbaren Rückfall
 * aus dem Systemnamen — ein neuer Eintrag im Protokoll bleibt nie unsichtbar.
 */

export type Beschriftungen = Record<string, string>;

/** „kb_article“ → „kb article“. */
export function lesbar(name: string): string {
  return name.replace(/[_.]+/g, " ").trim();
}

/**
 * Anzeigename einer Aktion: der eigene Eintrag, sonst „Bereich: was“ aus dem
 * Systemnamen (`kb.something_new` → „Wiki: something new“), sonst der Name selbst.
 */
export function aktionsName(action: string, aktionen: Beschriftungen, bereiche: Beschriftungen): string {
  const eigener = aktionen[action];
  if (eigener) return eigener;
  const punkt = action.indexOf(".");
  if (punkt <= 0) return lesbar(action);
  const bereich = action.slice(0, punkt);
  return `${bereiche[bereich] ?? lesbar(bereich)}: ${lesbar(action.slice(punkt + 1))}`;
}

export type Aenderung = { feld: string; vorher: string; nachher: string };

const MAX = 240;

function wert(v: unknown): string {
  if (v === undefined) return "—";
  if (v === null) return "leer";
  const text = typeof v === "string" ? v : JSON.stringify(v);
  return text.length > MAX ? `${text.slice(0, MAX)} …` : text;
}

const istObjekt = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Was sich geändert hat, Feld für Feld. Nur Felder, die sich unterscheiden oder
 * nur auf einer Seite stehen; ein Eintrag ohne Vorher listet alle Felder des
 * Nachher. Keine Objekte zum Ausrechnen: ein verschachtelter Wert erscheint als
 * kurzer JSON-Text in seiner Zeile.
 */
export function aenderungen(vorher: unknown, nachher: unknown): Aenderung[] {
  if (istObjekt(vorher) || istObjekt(nachher)) {
    const v = istObjekt(vorher) ? vorher : {};
    const n = istObjekt(nachher) ? nachher : {};
    const schluessel = [...new Set([...Object.keys(v), ...Object.keys(n)])];
    return schluessel
      .filter((k) => JSON.stringify(v[k]) !== JSON.stringify(n[k]))
      .map((k) => ({ feld: lesbar(k), vorher: wert(v[k]), nachher: wert(n[k]) }));
  }
  if (vorher == null && nachher == null) return [];
  return [{ feld: "Wert", vorher: wert(vorher), nachher: wert(nachher) }];
}

/** Die Zeile unter dem Namen: die ersten Felder, dann „+ n weitere“. Leer, wenn nichts zu zeigen ist. */
export function kurzfassung(rows: Aenderung[], max = 3): { felder: string[]; weitere: number } {
  return { felder: rows.slice(0, max).map((r) => r.feld), weitere: Math.max(0, rows.length - max) };
}

/** Der Umschalter „von wem“: ohne Angabe gilt „Personen“ (die Systemeinträge sind der Strom, nicht die Frage). */
export type Von = "person" | "system" | "alle";
export function leseVon(roh: string | undefined): Von {
  return roh === "system" || roh === "alle" ? roh : "person";
}
/** Der Wert für `audit_log_admin(p_by)`: „alle“ heisst kein Filter. */
export function rpcVon(von: Von): "person" | "system" | null {
  return von === "alle" ? null : von;
}
