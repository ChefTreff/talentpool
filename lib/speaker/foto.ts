import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SPEAKER_BUCKET } from "@/app/(speaker)/speaker/types";

/**
 * Das Profilfoto für Leads und Team (LEAD-029). Gelesen wird mit der Sitzung,
 * nicht mit `service_role`: `sa_read` und die Storage-Policy
 * (`speaker_asset_path_allowed`) lassen nur durch, wer den Speaker betreut
 * (`can_manage_speaker`) oder Admin ist — alle anderen bekommen `null`.
 */
export async function aktuellesFotoAdresse(
  supabase: SupabaseClient,
  profileId: string,
  sekunden = 3600,
): Promise<string | null> {
  const { data } = await supabase
    .from("speaker_asset")
    .select("storage_path")
    .eq("profile_id", profileId)
    .eq("kind", "photo")
    .eq("is_current", true)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data?.storage_path) return null;
  const { data: signed } = await supabase.storage.from(SPEAKER_BUCKET).createSignedUrl(data.storage_path, sekunden);
  return signed?.signedUrl ?? null;
}

/**
 * Für das Lead-Fenster: Foto-Adresse und Edition des Profils — der Speicherpfad
 * braucht die Edition (`<edition>/<profil>/photo/…`), und `manager_speakers`
 * liefert sie nicht mit. `sp_manage_sel` lässt nur betreute Profile durch.
 */
export async function fotoFuerProfil(
  supabase: SupabaseClient,
  profileId: string,
): Promise<{ url: string | null; editionId: string | null }> {
  const [{ data: profil }, url] = await Promise.all([
    supabase.from("speaker_profile").select("edition_id").eq("id", profileId).maybeSingle(),
    aktuellesFotoAdresse(supabase, profileId),
  ]);
  return { url, editionId: (profil?.edition_id as string | undefined) ?? null };
}

export type FotoEingang = {
  profileId: string;
  storagePath: string;
  filename: string;
  mime: string | null;
  sizeBytes: number | null;
};

/** Das hochgeladene Foto eintragen — dieselbe RPC wie im Speaker-Portal; sie prüft Recht und Pfad. */
export function registriereFoto(supabase: SupabaseClient, input: FotoEingang) {
  return supabase.rpc("register_speaker_asset", {
    p_profile_id: input.profileId,
    p_kind: "photo",
    p_storage_path: input.storagePath,
    p_filename: input.filename,
    p_mime: input.mime,
    p_size_bytes: input.sizeBytes,
    p_session_id: null,
  });
}
