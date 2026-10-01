/**
 * Was eine Fehlergrenze von einem Fehler zeigen darf (QS-023) — und was nicht.
 *
 * Die Grenze zeigt **nie** die Meldung oder den Stacktrace eines Fehlers. Ein
 * Fehler aus einer Server-Komponente kommt in Produktion ohnehin nur mit einer
 * allgemeinen Meldung und einem `digest` an. Ein Fehler aus dem Browser trägt
 * seine Meldung dagegen ungekürzt, und die kann aus einer Server-Antwort
 * stammen (`throw new Error(res.error)` mit dem Wortlaut einer
 * Datenbankmeldung). Deshalb gibt es genau einen Weg vom Fehler auf den
 * Bildschirm: `fehlerId`.
 *
 * Bewusst ohne "use client": die Tests laden das Modul direkt.
 */
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, type Locale } from "@/lib/i18n/shared";

/** Die Texte der Fehlergrenze — ein Auszug aus `errors` im Wörterbuch. */
export const FEHLER_TEXTE = [
  "boundaryBody",
  "boundaryHome",
  "boundaryId",
  "boundaryRetry",
  "boundaryTitle",
] as const;

export type FehlerTexte = Record<(typeof FEHLER_TEXTE)[number], string>;

/** Nur die Schlüssel der Grenze, damit nicht `errors` ganz in den Browser geht. */
export function fehlerTexte(t: Record<string, string>): FehlerTexte {
  return Object.fromEntries(FEHLER_TEXTE.map((k) => [k, t[k] ?? k])) as FehlerTexte;
}

/**
 * Reserve für `app/global-error.tsx`. Dort ist das Wurzel-Layout selbst
 * ausgefallen: Es gibt kein Wörterbuch vom Server und keinen Kontext. Die
 * Texte stehen deshalb hier noch einmal; `tests/fehlergrenzen.test.ts` hält
 * sie gleich mit `errors` in `de.json` und `en.json`.
 */
export const FEHLER_RESERVE: Record<Locale, FehlerTexte> = {
  de: {
    boundaryBody:
      "Die Seite konnte nicht angezeigt werden. Lade sie neu, meist reicht das. Bleibt der Fehler, schreib an {mailbox} und nenn die Fehler-ID.",
    boundaryHome: "Zur Startseite",
    boundaryId: "Fehler-ID",
    boundaryRetry: "Neu laden",
    boundaryTitle: "Hier ist etwas schiefgelaufen",
  },
  en: {
    boundaryBody:
      "This page couldn't be shown. Reload it, that usually helps. If the error stays, write to {mailbox} and include the error ID.",
    boundaryHome: "Go to start page",
    boundaryId: "Error ID",
    boundaryRetry: "Reload",
    boundaryTitle: "Something went wrong here",
  },
};

/**
 * Sprache ohne Server, für `global-error`: erst die Wahl aus dem Umschalter
 * (das Cookie ist bewusst nicht `httpOnly`, `lib/i18n/actions.ts`), dann die
 * Browsersprachen, sonst Deutsch. Die Profilsprache fehlt hier — sie käme nur
 * über den Server, und der ist gerade das, was nicht antwortet.
 */
export function spracheImBrowser(cookie: string, sprachen: readonly string[]): Locale {
  for (const teil of cookie.split(";")) {
    const [name, ...wert] = teil.trim().split("=");
    if (name !== LOCALE_COOKIE) continue;
    const gewaehlt = wert.join("=");
    if (isLocale(gewaehlt)) return gewaehlt;
  }
  for (const tag of sprachen) {
    const basis = tag.toLowerCase().split("-")[0];
    if (isLocale(basis)) return basis;
  }
  return DEFAULT_LOCALE;
}

/**
 * So sieht ein Digest von Next aus: eine Prüfsumme aus Ziffern. Zugelassen
 * sind Buchstaben, Ziffern, `_` und `-` — nichts, was eine Meldung, einen
 * Pfad oder ein Leerzeichen tragen könnte.
 */
const DIGEST = /^[A-Za-z0-9_-]{1,64}$/;

/** Die Prüfsumme, unter der der Server den Fehler protokolliert hat — sonst `null`. */
export function serverDigest(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null;
  const digest = (error as { digest?: unknown }).digest;
  return typeof digest === "string" && DIGEST.test(digest) ? digest : null;
}

const browserIds = new WeakMap<object, string>();
const browserIdsFuerWerte = new Map<unknown, string>();

/**
 * Die Fehler-ID, die die Grenze zeigt.
 *
 * Ein Fehler vom Server trägt seinen `digest`; mit ihm findet man den Eintrag
 * samt Stacktrace in den Vercel-Logs. Ein Fehler aus dem Browser hat keinen.
 * Er bekommt eine eigene ID mit `B-` davor, und die Grenze schreibt sie
 * zusammen mit dem Fehler in die Konsole des Browsers — in den Server-Logs
 * steht er nicht.
 *
 * Je Fehler bleibt die ID dieselbe: React rendert die Grenze mehr als einmal.
 */
export function fehlerId(error: unknown): string {
  const digest = serverDigest(error);
  if (digest) return digest;

  const istObjekt = typeof error === "object" && error !== null;
  const bekannt = istObjekt ? browserIds.get(error) : browserIdsFuerWerte.get(error);
  if (bekannt) return bekannt;

  const id = `B-${zufall()}`;
  if (istObjekt) browserIds.set(error, id);
  else browserIdsFuerWerte.set(error, id);
  return id;
}

function zufall(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}
