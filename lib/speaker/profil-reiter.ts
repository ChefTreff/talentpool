/**
 * Die Reiter der Profilseite im Speaker-Portal (SPK-088, Feedbackrunde Konrad und Paulina 05.10.2026): statt einer langen Liste drei
 * Bereiche. Der gewählte steht in der Adresse (`?reiter=`), wie bei den Fristen (QS-059) — die Seite rendert auf dem Server, die
 * Rückwärtstaste geht zum vorigen Reiter, und `useUngesichert` fragt beim Wechsel mit Ungespeichertem von selbst nach. Reine Hilfen ohne
 * Server- und Client-Importe, damit `npm test` sie prüft.
 */

/** Reihenfolge der Reiter auf der Seite; der erste ist der Vorgabewert. */
export const PROFIL_REITER = ["person", "auftritt", "einwilligungen"] as const;
export type ProfilReiter = (typeof PROFIL_REITER)[number];

/** Wer `/speaker/profil` ohne Abfrage öffnet — etwa über die Seitenleiste —, landet hier. */
export const STANDARD_REITER: ProfilReiter = "person";

/** Der Reiter aus der Adresse; alles Unbekannte (auch ein mehrfach gesetzter Wert) ⇒ der erste Reiter. */
export function leseReiter(roh: string | string[] | undefined): ProfilReiter {
  const wert = Array.isArray(roh) ? roh[0] : roh;
  return (PROFIL_REITER as readonly string[]).includes(wert ?? "") ? (wert as ProfilReiter) : STANDARD_REITER;
}

/** Die Adresse eines Reiters: der erste ohne Abfrage (wie ihn die Seitenleiste verlinkt), die übrigen mit `?reiter=`. */
export function reiterHref(reiter: ProfilReiter): string {
  return reiter === STANDARD_REITER ? "/speaker/profil" : `/speaker/profil?reiter=${reiter}`;
}

/**
 * Wohin „Profil vervollständigen“ auf der Übersicht führt. Der Schritt gilt als offen, solange Vorname, Nachname, Position oder die kurze
 * englische Bio fehlen (`speaker_next_steps`): die Namen stehen im Reiter „Person“, alles Übrige in „Auftritt & Bio“. Fehlt ein Name, ist
 * „Person“ der erste Halt; sind beide da, fehlt nur noch etwas im anderen Reiter — dorthin führt der Link gleich.
 */
export function profilSchrittHref(person: { first_name: string | null; last_name: string | null }): string {
  const hatNamen = (person.first_name ?? "").trim() !== "" && (person.last_name ?? "").trim() !== "";
  return reiterHref(hatNamen ? "auftritt" : "person");
}

/** Schlüssel der Beschriftung im Wörterbuch (`speaker`); ohne Ernährung (Assistenz) heißt der letzte Reiter nur „Einwilligungen“. */
export function reiterTextSchluessel(reiter: ProfilReiter, mitErnaehrung: boolean): string {
  if (reiter === "person") return "tabPerson";
  if (reiter === "auftritt") return "tabAppearance";
  return mitErnaehrung ? "tabConsent" : "tabConsentOnly";
}
