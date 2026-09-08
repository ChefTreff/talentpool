/**
 * Client-taugliche i18n-Konstanten. `lib/i18n/index.ts` ist `server-only`
 * (cookies/headers) und darf deshalb nicht aus Client-Komponenten importiert werden.
 */
export const LOCALES = ["de", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "de";
export const LOCALE_COOKIE = "ct_locale";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}
