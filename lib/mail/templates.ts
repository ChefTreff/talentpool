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
 * Eingebaute Vorlagen. Sobald `mail_template` existiert (Schema v2, A4), gewinnt
 * die Datenbank-Version — diese hier bleibt als Fallback, damit ein fehlender
 * Datenbank-Eintrag nie einen Versand verhindert.
 *
 * Platzhalter folgen der Konvention der Datenbank-Vorlagen aus Schema v2 A4:
 * {{first_name}}, {{portal_url}}, dazu vorlagenspezifische wie {{url}}.
 * E-Mail-Minimierung ist Grundsatz (Entscheidungslog): keine Vorlage ohne Anlass.
 */
export const BUILTIN_TEMPLATES: MailTemplate[] = [
  {
    key: "login_magic_link",
    locale: "de",
    version: 1,
    subject: "Dein Login-Link für das ChefTreff-Portal",
    body_md: [
      "Hallo {{first_name}},",
      "",
      "hier ist dein Login-Link. Er gilt {{validity}} und funktioniert nur einmal.",
      "",
      "[Jetzt anmelden]({{url}})",
      "",
      "Wenn du das nicht angefordert hast, ignoriere diese Mail einfach.",
      "",
      "Dein ChefTreff-Team",
    ].join("\n"),
  },
  {
    key: "login_magic_link",
    locale: "en",
    version: 1,
    subject: "Your sign-in link for the ChefTreff portal",
    body_md: [
      "Hi {{first_name}},",
      "",
      "here is your sign-in link. It is valid for {{validity}} and works once.",
      "",
      "[Sign in now]({{url}})",
      "",
      "If you didn't request this, just ignore this email.",
      "",
      "Your ChefTreff team",
    ].join("\n"),
  },
  {
    key: "welcome",
    locale: "de",
    version: 1,
    subject: "Willkommen im ChefTreff-Portal",
    body_md: [
      "Hallo {{first_name}},",
      "",
      "schön, dass du da bist. Ein Profil, ein Login — für alle ChefTreff-Formate.",
      "",
      "## Deine nächsten Schritte",
      "",
      "- Profil vervollständigen",
      "- Programm ansehen",
      "- Für Formate bewerben, sobald sie offen sind",
      "",
      "[Zum Profil]({{portal_url}})",
      "",
      "Dein ChefTreff-Team",
    ].join("\n"),
  },
  {
    key: "welcome",
    locale: "en",
    version: 1,
    subject: "Welcome to the ChefTreff portal",
    body_md: [
      "Hi {{first_name}},",
      "",
      "good to have you. One profile, one login — for every ChefTreff format.",
      "",
      "## Your next steps",
      "",
      "- Complete your profile",
      "- Browse the programme",
      "- Apply to formats as they open",
      "",
      "[Go to your profile]({{portal_url}})",
      "",
      "Your ChefTreff team",
    ].join("\n"),
  },
  {
    key: "test",
    locale: "de",
    version: 1,
    subject: "Testmail aus dem ChefTreff-Portal",
    body_md: [
      "Diese Mail bestätigt, dass der Versandweg steht.",
      "",
      "- Zeitpunkt: {{sent_at}}",
      "- Umgebung: {{environment}}",
    ].join("\n"),
  },
  {
    key: "test",
    locale: "en",
    version: 1,
    subject: "Test email from the ChefTreff portal",
    body_md: [
      "This email confirms the delivery path works.",
      "",
      "- Timestamp: {{sent_at}}",
      "- Environment: {{environment}}",
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
