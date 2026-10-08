/**
 * Wartezeit der Zusage-Mail (PART-124, Plan-Entscheidung 08.10.2026): Eine Zusage schickt die Mail nicht sofort, sondern nach zehn
 * Minuten — in der Zeit stoppt jede andere Entscheidung über dieselbe Bewerbung sie. Die Datenbank hält die Frist
 * (`application_mail_trigger`: `queue_mail_debounced(…, interval '10 minutes')`, Migration `v6_zusage_mail_verzoegert`); der Mail-Cron
 * läuft alle zehn Minuten, die reale Verzögerung ist also 10 bis 20 Minuten — Texte sagen deshalb „erst nach etwa“. Diese Zahl steht
 * in den Hinweisen für Partner und Team; `tests/zusage-mail.test.ts` hält sie mit der Migration gleich.
 */
export const ZUSAGE_MAIL_FRIST_MINUTEN = 10;

/** Setzt die Frist in einen Wörterbuchtext ein: `{minuten}` → „10“. */
export function mitZusageFrist(text: string): string {
  return text.replaceAll("{minuten}", String(ZUSAGE_MAIL_FRIST_MINUTEN));
}

/**
 * Zeigt die Seite den Hinweis zur Zusage-Mail? Nur dort, wo entschieden werden kann (`canEdit`, nicht im Reiter Teilnehmende) **und**
 * die Entscheidungen der Session schon freigegeben sind: vorher verschickt ChefTreff nichts — dort steht schon, dass aus der Oberfläche
 * keine Mail rausgeht, und ein Hinweis auf eine Frist wäre falsch.
 */
export function zeigtZusageHinweis(x: { freigegeben: boolean; canEdit: boolean; nurTeilnehmende: boolean }): boolean {
  return x.freigegeben && x.canEdit && !x.nurTeilnehmende;
}
