import type { Locale } from "@/lib/i18n/shared";

/**
 * PART-091: Verwaltet ein Partner alles, gehen die Speaker-Mails an seinen
 * Kontakt statt an die Speakerin (`queue_speaker_mail`, Vorschlag
 * v6_speaker_mail_weiche). Die Datenbank legt dann den Namen in
 * `vars.on_behalf_of` — nur, wenn wirklich umgeleitet wurde. Der Versand
 * stellt daraus eine Zeile über die Mail, statt jede Vorlage doppelt zu führen.
 */
const ZEILE: Record<Locale, string> = {
  de: "**Diese Mail betrifft {name}.** Ihr bekommt sie, weil euer Unternehmen die Kommunikation für die Speaker übernimmt.",
  en: "**This email concerns {name}.** You receive it because your company handles communication for its speakers.",
};

/**
 * Der Name kommt aus Eingaben von Partnern und Team: Zeichen, die in der
 * Markdown-Teilmenge der Mails etwas bedeuten (Link, Fett), fallen weg.
 */
function ohneMarkdown(name: string): string {
  return name.replace(/[[\]()*_`#]/g, "").replace(/\s+/g, " ").trim();
}

export function mitBetrifftZeile(bodyMd: string, vars: Record<string, unknown>, locale: Locale): string {
  const roh = vars.on_behalf_of;
  const name = typeof roh === "string" ? ohneMarkdown(roh) : "";
  if (!name) return bodyMd;
  return `${ZEILE[locale].replaceAll("{name}", name)}\n\n${bodyMd}`;
}
