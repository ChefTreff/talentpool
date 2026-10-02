import "server-only";
import { createAcClient } from "./core";

export { AcError, type AcApi } from "./core";

/** Ist die Verbindung eingerichtet? Ohne Adresse und Schlüssel zeigt der Admin „Verbindung fehlt“. */
export function hasAcKey(): boolean {
  return Boolean(process.env.ACTIVECAMPAIGN_API_KEY?.trim() && process.env.ACTIVECAMPAIGN_API_URL?.trim());
}

/** Schreibt der Sync wirklich nach ActiveCampaign? Erst, wenn Konrad es freischaltet. */
export function acWriteEnabled(): boolean {
  return process.env.ACTIVECAMPAIGN_WRITE_ENABLED?.trim() === "true";
}

/** Die Liste, in der Kontakte mit Themen stehen (Konfigwert, optional). */
export function acListId(): string | null {
  return process.env.ACTIVECAMPAIGN_LIST_ID?.trim() || null;
}

export function acClient() {
  const key = process.env.ACTIVECAMPAIGN_API_KEY?.trim();
  const url = process.env.ACTIVECAMPAIGN_API_URL?.trim();
  if (!key || !url) throw new Error("ACTIVECAMPAIGN_API_KEY/_URL fehlen (docs/zugangs-liste.md)");
  return createAcClient({ apiKey: key, baseUrl: url });
}
