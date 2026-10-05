/**
 * Mail-Variablen, die ein Geheimnis tragen — heute der One-Click-Token einer Side-Event-Einladung (ADM-077).
 *
 * Die Vorlage wird erst beim Versand gerendert, deshalb steht der Token bis dahin in `mail_log.meta.vars`. **Danach** hat er dort nichts mehr
 * zu suchen: das Protokoll ist für Admins lesbar, und der Token öffnet eine Zu- oder Absage. Die Datenbank hält nur seinen Hash. Wer einen
 * neuen Link braucht, lädt erneut ein (der Token wird dabei ersetzt, der alte Link ist tot).
 *
 * Kommt eine weitere Mail mit einem Geheimnis dazu, gehört ihr Schlüssel hierher — und in nichts anderes.
 */
export const GEHEIME_VARS = ["side_event_token"] as const;

type Meta = { vars?: Record<string, unknown>; [schluessel: string]: unknown } | null;

/** Das `meta` ohne die geheimen Variablen; gibt es keine, kommt dasselbe Objekt zurück. */
export function ohneGeheimnisse<T extends Meta>(meta: T): T {
  const vars = meta?.vars;
  if (!meta || !vars || !GEHEIME_VARS.some((k) => k in vars)) return meta;
  const rest = Object.fromEntries(Object.entries(vars).filter(([k]) => !(GEHEIME_VARS as readonly string[]).includes(k)));
  return { ...meta, vars: rest } as T;
}

/**
 * Für ein Update nach dem Versand: `{ meta }` ohne Geheimnisse — oder `{}`, wenn es nichts zu entfernen gibt (dann bleibt die Spalte
 * unberührt). Gedacht zum Auffächern: `finish({ status: "sent", ...metaOhneGeheimnisse(row.meta) })`.
 */
export function metaOhneGeheimnisse(meta: Meta): { meta?: Meta } {
  const bereinigt = ohneGeheimnisse(meta);
  return bereinigt === meta ? {} : { meta: bereinigt };
}
