/**
 * Fehlertext zu einer abgewiesenen Side-Event-Aktion (ADM-077, SPK-091).
 *
 * Die Datenbank meldet Zahlen im `detail`: freie Plätze bei `side_event_full`, die Frist bei `side_event_closed`, die Zahl der Zusagen bei
 * `invalid_side_event` mit `has_guests:<n>`. Ein Text, der „nur noch 0 Plätze“ sagt, ist ungeschickt — deshalb steht hier, welcher Satz wann
 * gilt. `rpc` ist das Wörterbuch der Fehlerschlüssel (`t.rpc`).
 */
export function sideEventFehler(key: string, detail: string | undefined, rpc: Record<string, string>): string {
  const text = (k: string) => rpc[k] ?? rpc.unknown ?? k;
  if (key === "side_event_full") {
    const n = Number(detail);
    return Number.isFinite(n) && n > 0 ? text("side_event_full").replace("{n}", String(n)) : text("side_event_full_none");
  }
  if (key === "side_event_closed") return text("side_event_closed").replace("{datum}", detail ?? "");
  if (key === "invalid_side_event" && detail?.startsWith("has_guests:")) {
    return text("side_event_has_guests").replace("{n}", detail.slice("has_guests:".length));
  }
  return text(key);
}
