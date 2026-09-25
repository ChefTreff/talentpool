import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { toRpcFailure } from "@/lib/rpc-error";
import { GAST_BUCKET, type GastAenderung, type GastErgebnis, type GastFoto, type GastNeu } from "@/components/partner/gaeste";

/**
 * Standbühnen-Gäste (PART-081) — die Schreibwege hinter den Actions von
 * Partnerportal und Admin. Beide rufen sie mit dem Sitzungs-Client nach ihrem
 * eigenen Gate auf; die RPCs prüfen das Recht (`partner_can_edit` bzw.
 * `partner_manages_stage_guest`) selbst. Kein `service_role`.
 */

function fehler(error: unknown): { ok: false; key: string; detail?: string } {
  const f = toRpcFailure(error as never);
  if (f.key === "unknown" && f.raw) console.error("[gaeste] RPC:", f.raw);
  return { ok: false, key: f.key, detail: f.detail };
}

export async function gastAnlegen(
  supabase: SupabaseClient,
  input: GastNeu,
): Promise<GastErgebnis<{ profileId: string; editionId: string }>> {
  const { data, error } = await supabase.rpc("partner_add_stage_guest", {
    p_org_id: input.orgId,
    p_first_name: input.firstName,
    p_last_name: input.lastName,
    p_job_title: input.jobTitle,
    p_organization: input.organization,
    p_email: input.email,
    p_consent: input.consent,
  });
  if (error) return fehler(error);
  const res = (data ?? {}) as { profile_id?: string; edition_id?: string };
  return { ok: true, data: { profileId: res.profile_id ?? "", editionId: res.edition_id ?? "" } };
}

export async function gastAendern(supabase: SupabaseClient, input: GastAenderung): Promise<GastErgebnis> {
  const { error } = await supabase.rpc("partner_update_stage_guest", {
    p_profile_id: input.profileId,
    p_first_name: input.firstName ?? null,
    p_last_name: input.lastName ?? null,
    p_email: input.email ?? null,
    p_job_title: input.jobTitle ?? null,
    p_organization: input.organization ?? null,
  });
  if (error) return fehler(error);
  return { ok: true, data: undefined };
}

/**
 * Gast entfernen (K-32 Punkt 4). **Erst die Dateien, dann das Profil:** die
 * Storage-Policy lässt den Partner nur an Porträts von Gästen, die es noch
 * gibt. Andersherum blieben die Bilder als Waisen im Bucket liegen. Scheitert
 * das Löschen der Dateien, geht es trotzdem weiter — eine verwaiste Datei ist
 * der harmlosere Fall und steht im Log (dieselbe Regel wie `deleteAsset`).
 */
export async function gastEntfernen(supabase: SupabaseClient, profileId: string): Promise<GastErgebnis> {
  const { data: pfade, error: listFehler } = await supabase.rpc("partner_stage_guest_files", { p_profile_id: profileId });
  if (listFehler) return fehler(listFehler);
  const liste = Array.isArray(pfade) ? (pfade as string[]) : [];
  if (liste.length > 0) {
    const { error: wegFehler } = await supabase.storage.from(GAST_BUCKET).remove(liste);
    if (wegFehler) console.error("[gaeste] Porträt entfernen:", wegFehler.message);
  }
  const { error } = await supabase.rpc("partner_remove_stage_guest", { p_profile_id: profileId });
  if (error) return fehler(error);
  return { ok: true, data: undefined };
}

/** Nach dem Upload: `register_speaker_asset` prüft Pfad und Recht und setzt `photo_asset_id`. */
export async function gastFotoRegistrieren(supabase: SupabaseClient, input: GastFoto): Promise<GastErgebnis> {
  const { error } = await supabase.rpc("register_speaker_asset", {
    p_profile_id: input.profileId,
    p_kind: "photo",
    p_storage_path: input.storagePath,
    p_filename: input.filename,
    p_mime: input.mime,
    p_size_bytes: input.sizeBytes,
    p_session_id: null,
  });
  if (error) return fehler(error);
  return { ok: true, data: undefined };
}

/** Gast an einem Programmpunkt der eigenen Standbühne ein- oder austragen. */
export async function gastZuordnen(
  supabase: SupabaseClient,
  sessionId: string,
  profileId: string,
  zuordnen: boolean,
): Promise<GastErgebnis> {
  const { error } = await supabase.rpc("partner_assign_stage_guest", {
    p_session_id: sessionId,
    p_profile_id: profileId,
    p_assign: zuordnen,
  });
  if (error) return fehler(error);
  return { ok: true, data: undefined };
}

/** Signierte Adressen der Porträts für die Liste (eine Stunde). */
export async function gastFotoAdressen(supabase: SupabaseClient, pfade: string[]): Promise<Map<string, string>> {
  const adressen = new Map<string, string>();
  if (pfade.length === 0) return adressen;
  const { data } = await supabase.storage.from(GAST_BUCKET).createSignedUrls(pfade, 3600);
  for (const x of data ?? []) {
    if (x.path && x.signedUrl) adressen.set(x.path, x.signedUrl);
  }
  return adressen;
}
