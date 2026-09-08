import type { Locale } from "@/lib/i18n/shared";

export type MailTemplate = {
  key: string;
  locale: Locale;
  subject: string;
  /** Markdown-Teilmenge: Absätze, **fett**, [Link](url), Listen, ## Überschrift. */
  body_md: string;
  version: number;
};

/**
 * Kanonisch ist `mail_template` in der Datenbank — dort werden Vorlagen
 * gepflegt und versioniert. Hier steht nur `test`, damit sich der Versandweg
 * auch dann prüfen lässt, wenn die Tabelle leer oder frisch aufgesetzt ist.
 *
 * Kein `login_magic_link`: die Login-Mails verschickt Supabase Auth.
 * Kein `welcome`: das kommt aus der Datenbank.
 *
 * Platzhalter folgen der Konvention der Datenbank-Vorlagen:
 * {{first_name}}, {{portal_url}}, dazu vorlagenspezifische.
 */
export const BUILTIN_TEMPLATES: MailTemplate[] = [
  {
    key: "test",
    locale: "de",
    version: 1,
    subject: "Testmail aus dem ChefTreff-Portal",
    body_md: [
      "Hallo {{first_name}},",
      "",
      "diese Mail bestätigt, dass der Versandweg steht.",
      "",
      "- Zeitpunkt: {{sent_at}}",
      "- Umgebung: {{environment}}",
      "",
      "Dein ChefTreff-Team",
    ].join("\n"),
  },
  {
    key: "test",
    locale: "en",
    version: 1,
    subject: "Test email from the ChefTreff portal",
    body_md: [
      "Hi {{first_name}},",
      "",
      "this email confirms the delivery path works.",
      "",
      "- Timestamp: {{sent_at}}",
      "- Environment: {{environment}}",
      "",
      "Your ChefTreff team",
    ].join("\n"),
  },
];

export function findBuiltin(key: string, locale: Locale): MailTemplate | null {
  return (
    BUILTIN_TEMPLATES.find((t) => t.key === key && t.locale === locale) ??
    BUILTIN_TEMPLATES.find((t) => t.key === key && t.locale === "de") ??
    null
  );
}
