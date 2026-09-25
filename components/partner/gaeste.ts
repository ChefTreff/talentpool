/**
 * Standbühnen-Gäste (PART-081) — Typen und Regeln, die Partnerportal und Admin
 * teilen (Regel vom 22.09.: eine Liste, zwei Bereiche, dieselben RPCs).
 */

/** Zeile aus `partner_stage_guests()`, ergänzt um die signierte Adresse des Porträts. */
export type GastRow = {
  profile_id: string;
  person_id: string;
  edition_id: string;
  first_name: string | null;
  last_name: string | null;
  /** Nur bei selbst angelegten Personen vor dem ersten Login, sonst `null`. */
  email: string | null;
  job_title: string | null;
  organization_name: string | null;
  /** Name und Adresse darf die Organisation noch pflegen. */
  editable: boolean;
  consent_at: string | null;
  photo_asset_id: string | null;
  photo_path: string | null;
  sessions: { session_id: string; title_de: string | null; start_at: string | null; publish_status: string }[];
  /** Signierte Adresse des Porträts, von der Seite erzeugt; `null` ohne Porträt. */
  photo_url: string | null;
};

export type GastErgebnis<T = void> = { ok: true; data: T } | { ok: false; key: string; detail?: string };

export type GastNeu = {
  orgId: string;
  firstName: string;
  lastName: string;
  jobTitle: string;
  organization: string;
  email: string;
  consent: boolean;
};

export type GastAenderung = {
  profileId: string;
  /** `null` oder weggelassen heißt „unverändert“. */
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  jobTitle?: string | null;
  organization?: string | null;
};

export type GastFoto = {
  profileId: string;
  storagePath: string;
  filename: string;
  mime: string | null;
  sizeBytes: number | null;
};

/** Die Wege von außen: Gate und Neuladen sind je Bereich verschieden, die RPCs dahinter dieselben. */
export type GastActions = {
  add: (input: GastNeu) => Promise<GastErgebnis<{ profileId: string; editionId: string }>>;
  update: (input: GastAenderung) => Promise<GastErgebnis>;
  remove: (profileId: string) => Promise<GastErgebnis>;
  registerPhoto: (input: GastFoto) => Promise<GastErgebnis>;
};

/** Bucket und Regeln des Porträts — dieselben wie beim Speaker-Foto (SPK-004). */
export const GAST_BUCKET = "speaker-assets";
export const GAST_FOTO_MIME = ["image/jpeg", "image/png", "image/webp"];
export const GAST_FOTO_MAX_BYTES = 10 * 1024 * 1024;

/** Pfad im Bucket, wie ihn `speaker_asset_path_allowed` und `register_speaker_asset` verlangen. */
export function gastFotoPfad(editionId: string, profileId: string, dateiname: string, id: string): string {
  return `${editionId}/${profileId}/photo/${id}-${dateiname}`;
}

export function gastName(g: Pick<GastRow, "first_name" | "last_name">): string {
  return [g.first_name, g.last_name].filter(Boolean).join(" ");
}

/** Was die Oberfläche vor dem Absenden prüft — dieselben Pflichtfelder wie `partner_add_stage_guest`. */
export function gastFehlt(d: Omit<GastNeu, "orgId">): (keyof Omit<GastNeu, "orgId">)[] {
  const leer = (v: string) => v.trim() === "";
  const fehlt: (keyof Omit<GastNeu, "orgId">)[] = [];
  if (leer(d.firstName)) fehlt.push("firstName");
  if (leer(d.lastName)) fehlt.push("lastName");
  if (leer(d.jobTitle)) fehlt.push("jobTitle");
  if (leer(d.organization)) fehlt.push("organization");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email.trim())) fehlt.push("email");
  if (!d.consent) fehlt.push("consent");
  return fehlt;
}

/** Ein Gast zur Auswahl an einem Programmpunkt (Standbühne oder Talk). */
export type GastWahl = { profile_id: string; person_id: string; name: string };
