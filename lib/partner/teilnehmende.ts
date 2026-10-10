/**
 * Teilnehmerliste (PART-130, Konrad & Leopold 05.10.2026): wer teilnimmt — und der Weg zur CSV-Datei dazu.
 *
 * Die Teilnehmerliste ist keine zweite Auskunft, sondern die Bewerbungsliste, gefiltert: dieselbe Route, dieselbe Einwilligungsgrenze
 * (`export_session_applications` und `export_tour_applications` liefern nur Bewerbungen mit Einwilligung), derselbe Eintrag im Protokoll.
 * Der Reiter „Teilnehmende“ und die Datei nehmen dieselben Status.
 */

/** Status, mit denen jemand teilnimmt: zugesagt, nachgerückt oder bestätigt. */
const TEILNEHMENDE_STATUS: ReadonlySet<string> = new Set(["accepted", "promoted", "confirmed"]);

export function nimmtTeil(status: string): boolean {
  return TEILNEHMENDE_STATUS.has(status);
}

/** Nur die, die teilnehmen — für den Reiter und für die Datei. */
export function filterTeilnehmende<T extends { status: string }>(zeilen: readonly T[]): T[] {
  return zeilen.filter((z) => nimmtTeil(z.status));
}

/** Der Filter in der Adresse des Downloads: `?nur=teilnehmende`. */
export const EXPORT_NUR_PARAM = "nur";
export const EXPORT_NUR_TEILNEHMENDE = "teilnehmende";

/** Adresse des Downloads: die der Bewerbungen, bei der Teilnehmerliste mit dem Filter. */
export function exportAdresse(basis: string, teilnehmende: boolean): string {
  return teilnehmende ? `${basis}?${EXPORT_NUR_PARAM}=${EXPORT_NUR_TEILNEHMENDE}` : basis;
}

/** Will die Anfrage die Teilnehmerliste? Jeder andere Wert (oder keiner) bleibt der Bewerbungsexport — nie ein Fehler, nie mehr als sonst. */
export function willTeilnehmende(adresse: string): boolean {
  try {
    return new URL(adresse, "http://localhost").searchParams.get(EXPORT_NUR_PARAM) === EXPORT_NUR_TEILNEHMENDE;
  } catch {
    return false;
  }
}
