/**
 * Die Checkliste auf der Speaker-Startseite (SPK-024, SPK-082): welche Punkte stehen in der Liste, und in welchem Zustand? Reine Hilfen ohne Server- und
 * Client-Importe, damit `npm test` sie prüft.
 *
 * **Zwei Quellen.** Was das Portal selbst ableitet (`next_steps` aus `speaker_next_steps`: das Foto liegt, die Einwilligung steht …) und was die Speakerin davon
 * **wieder geöffnet** hat (`my_speaker_step_reopened`, SPK-082). Die abgeleitete Wahrheit bleibt unberührt: „wieder geöffnet“ ist eine Ausnahme darüber, kein
 * zweiter Haken neben dem Bucket. Von Hand umlegen lässt sich deshalb nur, was das Portal schon selbst als erledigt kennt — vorher gäbe es „abgehakt, aber kein
 * Foto da“ (Paulina, Feedbackrunde 05.10.2026).
 */

/** Die Schritte, die das Portal selbst ableitet — in der Reihenfolge der Checkliste (dieselben sieben Schlüssel wie in `speaker_next_steps`). */
export const SCHRITTE = ["profile", "photo", "consents", "session", "session_content", "presentation", "ticket"] as const;
export type Schritt = (typeof SCHRITTE)[number];

/**
 * Was die Liste aus `next_steps` liest. `null` heißt „nicht anwendbar“: ohne Session gibt es weder einen Inhalt noch eine Präsentation, die man erledigen
 * könnte — `open` führt sie dann nicht, und „erledigt“ wäre falsch.
 */
export type AbgeleiteterStand = { [K in Schritt]?: boolean | null } & { open?: string[] };

export type SchrittStand = {
  key: Schritt;
  /** Wie die Liste den Punkt zeigt: abgeleitet erledigt **und** nicht wieder geöffnet. */
  erledigt: boolean;
  /** Das Portal selbst sieht den Punkt als erledigt (das Foto liegt, die Einwilligung steht …). */
  abgeleitetErledigt: boolean;
  /** Von Hand wieder geöffnet — nur bei abgeleitet Erledigtem; ein Punkt, der ohnehin offen ist, hat nichts zu öffnen. */
  wiederGeoeffnet: boolean;
  /** Ist der Haken klickbar? Nur bei abgeleitet Erledigtem (er lässt sich öffnen und wieder abhaken); ein offener Punkt wird erst durch die Aktion selbst erledigt. */
  schaltbar: boolean;
};

/**
 * Die Punkte der Liste mit ihrem Zustand.
 *
 * - Nicht anwendbare Punkte (`null`, ohne Session) fehlen ganz: sie zu zeigen, hieße, etwas als erledigt auszugeben, das es nicht gibt (und der Zähler im
 *   Band „x / y“ rechnete mit zwei Punkten zu viel).
 * - Eine geöffnete Markierung zählt nur, solange der Punkt abgeleitet erledigt ist — wird er (Foto gelöscht) wieder offen, ist er offen, mit oder ohne Markierung.
 */
export function schrittStaende(
  naechste: AbgeleiteterStand | null | undefined,
  wiederGeoeffnet: readonly string[] | null | undefined,
): SchrittStand[] {
  const offen = new Set(naechste?.open ?? []);
  const geoeffnet = new Set(wiederGeoeffnet ?? []);
  return SCHRITTE.filter((key) => naechste?.[key] !== null).map((key) => {
    const abgeleitetErledigt = !offen.has(key);
    const wieder = abgeleitetErledigt && geoeffnet.has(key);
    return { key, erledigt: abgeleitetErledigt && !wieder, abgeleitetErledigt, wiederGeoeffnet: wieder, schaltbar: abgeleitetErledigt };
  });
}

/**
 * Die Antwort von `my_speaker_step_reopened` als Liste von Schlüsseln. Alles, was keine Liste ist (Fehler, noch keine Migration), ergibt die leere Liste:
 * die Checkliste zeigt dann, was das Portal ableitet — ein fehlender Schalter ist besser als eine kaputte Startseite.
 */
export function leseWiederGeoeffnet(roh: unknown): string[] {
  return Array.isArray(roh) ? roh.filter((k): k is string => typeof k === "string") : [];
}
