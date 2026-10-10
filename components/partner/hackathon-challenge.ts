/**
 * „Nur eine Challenge je Partner“ (PART-142, Konrad & Leopold 05.10.): die Partnerseite „Hackathon“ zeigt die Challenge der **gezeigten Organisation** — nicht alles, was die Person
 * bearbeiten darf. Wunschprofil und Datensatz kommen aus `hack_challenge_profiles` und `hack_dataset_targets`; deren Recht (`can_edit`, `can_manage_hack_dataset`) ist für das
 * Hackathon-Team (`is_hack_team()`: Admin, Bereichsleitung) und für jemanden, der für mehrere Organisationen arbeitet, **nicht** an die gewählte Organisation gebunden — Konrad sah auf der Seite
 * seiner Test-Organisation deshalb beide TEST-Challenges. Beide Funktionen liefern den Anzeigenamen der Organisation (`coalesce(communication_name, legal_name)`), und denselben Namen liefert
 * `my_partner_orgs()` als `communication_name`; darüber wird gefiltert.
 *
 * Das ist **Anzeige, keine Grenze**: schreiben dürfen weiterhin nur, wer das Recht hat — die Datenbank prüft es bei jedem Speichern. Sauberer wäre `org_id` in den beiden Ergebnissen
 * (Funktionen des Talent-&-Hackathon-Chats, eine Migration); bis dahin ist der Name der Schlüssel. Eine Challenge ohne Organisation (vom Team angelegt) gehört keinem Partner und steht nie hier.
 */

/** Die Zeilen der gezeigten Organisation. Ohne Namen der Organisation lässt sich nicht eingrenzen: dann bleibt die Liste, wie sie ist. */
export function challengesDerOrganisation<T extends { org_name: string | null }>(zeilen: readonly T[], orgName: string | null | undefined): T[] {
  const name = orgName?.trim();
  if (!name) return [...zeilen];
  return zeilen.filter((z) => z.org_name?.trim() === name);
}
