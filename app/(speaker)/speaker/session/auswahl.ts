/**
 * Die Auswahl der Session auf `/speaker/session` (SPK-085) — reine Regeln, ohne Netz und ohne React, damit `npm test` sie ausführt.
 *
 * Konrad am 05.10. beim Durchgang durch das Speaker-Portal: hat ein Speaker zwei Sessions, stehen Titel, Beschreibung, Themen, Technik und Präsentation heute
 * **zweimal untereinander** — und jeder Anker (`#slot`, `#inhalt`, `#praesentation`, `#technik`) zweimal im Dokument; „der gesamte Session-Bereich läuft über eine
 * Session-Auswahl — sonst doppelte Infos auf einer Seite“. Seitdem wählt man oben die Session (Reiter), und darunter steht der ganze Bereich **einmal**, für die
 * gewählte. Mit nur einer Session gibt es keine Auswahl: die Seite bleibt, wie sie war.
 */

/**
 * Welche Session die Seite zeigt: `?session=<Kennung>`. Ohne Angabe, bei einer unbekannten Kennung (ein alter Link, eine Session einer anderen Person) und bei einer
 * doppelten Angabe gilt die **erste** — `my_sessions` sortiert nach Beginn, das ist die, die zuerst stattfindet. Ohne Sessions gibt es nichts zu wählen.
 */
export function waehleSession(param: string | string[] | undefined, sessions: readonly { session_id: string }[]): string | null {
  if (sessions.length === 0) return null;
  const roh = typeof param === "string" ? param : undefined;
  return sessions.find((s) => s.session_id === roh)?.session_id ?? sessions[0].session_id;
}

/** Wochentag und Uhrzeit in der Zeitzone der Veranstaltung („Sa., 10:00“) — so steht der Slot im Programm, nicht in der Zone des Besuchers. */
export function reiterZeit(iso: string, timeZone: string, dateLocale: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(dateLocale, { weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone }).format(d);
}

export type ReiterQuelle = { session_id: string; format: string | null; start_at: string | null; timezone: string | null };

/**
 * Die Beschriftung der Reiter: das **Format** der Session („Keynote“), mit Zeit, sobald es einen Slot gibt („Keynote · Sa., 10:00“). Titel stehen nicht im Reiter —
 * sie sind oft noch leer, werden hier erst eingereicht und sind lang. Dasselbe Format zweimal bekommt eine Zählung („Keynote 1“, „Keynote 2“); ohne Format steht
 * „Session 1“, „Session 2“. Die Reihenfolge ist die der Sessions.
 */
export function sessionReiter(
  sessions: readonly ReiterQuelle[],
  o: { formate: Record<string, string>; nummer: (n: number) => string; dateLocale: string },
): { id: string; label: string }[] {
  const art = sessions.map((s, i) => (s.format ? (o.formate[s.format] ?? s.format) : "") || o.nummer(i + 1));
  const gleiche = new Map<string, number>();
  for (const a of art) gleiche.set(a, (gleiche.get(a) ?? 0) + 1);
  const gezaehlt = new Map<string, number>();
  return sessions.map((s, i) => {
    let label = art[i];
    if ((gleiche.get(label) ?? 0) > 1) {
      const n = (gezaehlt.get(label) ?? 0) + 1;
      gezaehlt.set(label, n);
      label = `${label} ${n}`;
    }
    const zeit = s.start_at ? reiterZeit(s.start_at, s.timezone ?? "Europe/Berlin", o.dateLocale) : "";
    return { id: s.session_id, label: zeit ? `${label} · ${zeit}` : label };
  });
}
