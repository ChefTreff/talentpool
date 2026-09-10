/**
 * Einwilligungen sind versioniert: jede Zustimmung **und** jeder Widerruf ist
 * eine eigene Zeile in `consent_record`, `consent_current` zeigt den letzten
 * Stand je Typ. Damit der Nachweis nicht bei jedem Speichern um Duplikate
 * wächst, wird nur geschrieben, was sich wirklich geändert hat.
 */

/** Fassung der Texte, auf die sich eine Einwilligung bezieht. */
export const CONSENT_VERSION = "2026-09";

export type ConsentState = { consent_type: string; granted: boolean; version: string };

export type ConsentRow = {
  person_id: string;
  consent_type: string;
  version: string;
  granted: boolean;
  source: string;
};

/**
 * Die Zeilen, die geschrieben werden müssen: neu, umentschieden oder auf eine
 * neuere Textfassung bezogen. Alles andere bleibt, wie es ist.
 */
export function consentRowsToWrite(
  current: ConsentState[],
  wanted: Record<string, boolean>,
  personId: string,
  source = "portal",
): ConsentRow[] {
  const known = new Map(current.map((c) => [c.consent_type, c]));
  return Object.entries(wanted)
    .filter(([consent_type, granted]) => {
      const before = known.get(consent_type);
      return !before || before.granted !== granted || before.version !== CONSENT_VERSION;
    })
    .map(([consent_type, granted]) => ({
      person_id: personId,
      consent_type,
      version: CONSENT_VERSION,
      granted,
      source,
    }));
}
