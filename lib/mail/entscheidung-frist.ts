/**
 * Wartezeit der Entscheidungs-Mails (PART-124 Zusage, PART-146 Warteliste und Absage, Plan-Entscheidung 08.10.2026): Eine Entscheidung über eine Bewerbung
 * schickt ihre Mail nicht sofort, sondern nach zehn Minuten — in der Zeit stoppt jede andere Entscheidung über dieselbe Bewerbung sie, und die Person
 * bekommt nur die Mail zur letzten. Die Datenbank hält die Frist (`application_mail_trigger`: `queue_mail_debounced(…, interval '10 minutes')`,
 * Migrationen `v6_zusage_mail_verzoegert` und `v6_entscheidungsmails_verzoegert`); der Mail-Cron läuft alle zehn Minuten, die reale Verzögerung ist also
 * 10 bis 20 Minuten — Texte sagen deshalb „erst nach etwa“. Die Eingangsbestätigung und das Nachrücken gehen ohne Frist. Diese Zahl steht in den
 * Hinweisen für Partner und Team; `tests/entscheidungs-mail.test.ts` hält sie mit der Migration gleich.
 */
export const ENTSCHEIDUNG_MAIL_FRIST_MINUTEN = 10;

/** Setzt die Frist in einen Wörterbuchtext ein: `{minuten}` → „10“. */
export function mitEntscheidungFrist(text: string): string {
  return text.replaceAll("{minuten}", String(ENTSCHEIDUNG_MAIL_FRIST_MINUTEN));
}

/**
 * Zeigt die Seite den Hinweis zu den Entscheidungs-Mails? Nur dort, wo entschieden werden kann (`canEdit`, nicht im Reiter Teilnehmende) **und**
 * die Entscheidungen der Session schon freigegeben sind: vorher verschickt ChefTreff nichts — dort steht schon, dass aus der Oberfläche keine Mail
 * rausgeht, und ein Hinweis auf eine Frist wäre falsch.
 */
export function zeigtEntscheidungHinweis(x: { freigegeben: boolean; canEdit: boolean; nurTeilnehmende: boolean }): boolean {
  return x.freigegeben && x.canEdit && !x.nurTeilnehmende;
}
