/**
 * Wer im Board veröffentlichen darf.
 *
 * `publish_session` verlangt `is_programme_editor()` — also die Rolle `admin`
 * oder `programme_team`. Das ist enger als „Team": eine Bereichsleitung oder
 * die Produktion gehören zum Staff, dürfen aber nicht veröffentlichen, und ein
 * Speaker-Manager oder Bühnen-Editor schon gar nicht.
 *
 * Entschieden wird das weiterhin in der Datenbank. Diese Funktion sagt nur,
 * ob die Oberfläche den Knopf überhaupt anbieten soll — ein Knopf, der immer
 * in 42501 läuft, ist schlimmer als keiner.
 */
const PUBLISHERS: readonly string[] = ["admin", "programme_team"];

export function canPublishSessions(roleNames: readonly string[]): boolean {
  return roleNames.some((r) => PUBLISHERS.includes(r));
}
