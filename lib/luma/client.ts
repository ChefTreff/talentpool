import "server-only";
import { createLumaClient } from "./core";

export { LumaError, LUMA_BASE, type LumaClient } from "./core";

/** Ist ein Schlüssel gesetzt? Ohne ihn zeigt die Events-Seite einen Hinweis statt Fehler. */
export function hasLumaKey(): boolean {
  return Boolean(process.env.LUMA_API_KEY?.trim());
}

/**
 * Der Luma-Client für den Server. Der Schlüssel liegt nur in Vercel (sensibel)
 * und lokal in `.env.local`; er geht nie in den Browser.
 */
export function lumaClient() {
  const key = process.env.LUMA_API_KEY?.trim();
  if (!key) throw new Error("LUMA_API_KEY fehlt (docs/zugangs-liste.md)");
  return createLumaClient({ apiKey: key });
}
