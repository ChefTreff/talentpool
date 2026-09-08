import "server-only";
import { cookies, headers } from "next/headers";
import { getSessionContext } from "@/lib/auth";
import de from "./de.json";
import en from "./en.json";
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, type Locale } from "./shared";

export { LOCALES, DEFAULT_LOCALE, LOCALE_COOKIE, isLocale } from "./shared";
export type { Locale } from "./shared";

/** de.json ist die Referenz; en.json muss strukturgleich sein (sonst Compile-Fehler). */
export type Dictionary = typeof de;
const dictionaries: Record<Locale, Dictionary> = {
  de,
  en: en satisfies Dictionary,
};

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale] ?? dictionaries[DEFAULT_LOCALE];
}

/**
 * Reihenfolge laut Arbeitsauftrag B9:
 *   person.preferred_language → Cookie → Accept-Language → de
 *
 * Die Profilsprache holt sich die Funktion selbst aus `getSessionContext()`
 * (gecacht, kostet innerhalb eines Requests nichts). So rendert auch `/login`
 * in der richtigen Sprache, und keine Seite muss die Sprache durchreichen.
 */
export async function resolveLocale(): Promise<Locale> {
  const { preferredLanguage } = await getSessionContext();
  if (isLocale(preferredLanguage)) return preferredLanguage;

  const cookieStore = await cookies();
  const fromCookie = cookieStore.get(LOCALE_COOKIE)?.value;
  if (isLocale(fromCookie)) return fromCookie;

  return parseAcceptLanguage((await headers()).get("accept-language"));
}

/** Erste unterstützte Sprache aus dem Accept-Language-Header, sonst Default. */
export function parseAcceptLanguage(header: string | null): Locale {
  if (!header) return DEFAULT_LOCALE;
  const ranked = header
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.find((p) => p.trim().startsWith("q="));
      return { tag: tag.trim().toLowerCase(), q: q ? Number(q.split("=")[1]) : 1 };
    })
    .filter((x) => x.tag && !Number.isNaN(x.q))
    .sort((a, b) => b.q - a.q);

  for (const { tag } of ranked) {
    const base = tag.split("-")[0];
    if (isLocale(base)) return base;
  }
  return DEFAULT_LOCALE;
}

/** Bequemer Einstieg für Layouts und Seiten: Locale + Dictionary in einem Schritt. */
export async function getI18n() {
  const locale = await resolveLocale();
  return { locale, t: getDictionary(locale) };
}
