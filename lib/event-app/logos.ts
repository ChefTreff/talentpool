import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExhibitorRow } from "@/lib/event-app/types";
import { publicLogoPath } from "@/lib/event-app/mapping";

export const PRIVATE_BUCKET = "partner-assets";
/** Öffentlicher Bucket nur für freigegebene Logos (Migration 0057): Swapcard und Website brauchen eine frei abrufbare URL. */
export const PUBLIC_LOGO_BUCKET = "partner-logos";

type LogoRow = Pick<ExhibitorRow, "edition_slug" | "org_id" | "logo_png_path" | "logo_png_asset_id">;

/** URL, unter der die Kopie liegt oder liegen wird — ohne Netzzugriff, auch für den Trockenlauf. */
export function publicLogoUrl(admin: SupabaseClient, row: LogoRow): string | null {
  const path = publicLogoPath(row);
  return path ? admin.storage.from(PUBLIC_LOGO_BUCKET).getPublicUrl(path).data.publicUrl : null;
}

/** Freigegebenes PNG in den öffentlichen Bucket kopieren, falls noch nicht da (eine Datei je Fassung). Nur im Echtlauf. */
export async function ensurePublicLogo(admin: SupabaseClient, row: LogoRow): Promise<string | null> {
  const dest = publicLogoPath(row);
  if (!dest || !row.logo_png_path) return null;
  const folder = dest.slice(0, dest.lastIndexOf("/"));
  const file = dest.slice(dest.lastIndexOf("/") + 1);
  const { data: existing } = await admin.storage.from(PUBLIC_LOGO_BUCKET).list(folder, { search: file, limit: 1 });
  if (!existing?.some((f) => f.name === file)) {
    const { error } = await admin.storage.from(PRIVATE_BUCKET).copy(row.logo_png_path, dest, { destinationBucket: PUBLIC_LOGO_BUCKET });
    if (error) {
      // Fallback, falls das Kopieren über Bucket-Grenzen nicht geht: herunterladen und hochladen
      const { data: blob, error: dl } = await admin.storage.from(PRIVATE_BUCKET).download(row.logo_png_path);
      if (dl || !blob) throw new Error(`Logo kopieren: ${error.message}`);
      const { error: up } = await admin.storage.from(PUBLIC_LOGO_BUCKET).upload(dest, blob, { contentType: "image/png", upsert: true });
      if (up) throw new Error(`Logo hochladen: ${up.message}`);
    }
  }
  return admin.storage.from(PUBLIC_LOGO_BUCKET).getPublicUrl(dest).data.publicUrl;
}


/**
 * Öffentlicher Bucket für Speaker-Profilfotos (0136). Wie `partner-logos`:
 * Lesen über die öffentliche Adresse, Schreiben nur `service_role`, keine
 * Policies für anon oder authenticated.
 */
export const PUBLIC_PHOTO_BUCKET = "speaker-photos";
export const SPEAKER_BUCKET = "speaker-assets";

const ENDUNG: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/**
 * Pfad der öffentlichen Kopie: `<edition>/<asset_id>.<endung>`.
 *
 * Bewusst **ohne** Namen und ohne Personen-Kennung — die Adresse selbst soll
 * nichts über die Person verraten. Die Asset-Kennung ist eine UUID, also nicht
 * erratbar und nicht aufzählbar; eine neue Fassung bekommt eine neue Adresse,
 * und die alte zeigt nicht mehr auf das aktuelle Bild (Konrad, 22.09.2026:
 * „unauffindbarer, öffentlicher Link").
 */
export function publicPhotoPath(row: { edition_slug: string; photo_asset_id: string | null; photo_mime: string | null }): string | null {
  if (!row.photo_asset_id) return null;
  const endung = ENDUNG[(row.photo_mime ?? "").toLowerCase()];
  // Unbekannter Medientyp: keine Kopie, statt eine Datei mit falscher Endung
  // abzulegen, die der Browser dann nicht anzeigt.
  if (!endung) return null;
  return `${row.edition_slug}/${row.photo_asset_id}.${endung}`;
}

/** Die Adresse, unter der die Kopie liegt oder liegen wird — ohne Netzzugriff, auch für den Trockenlauf. */
export function publicPhotoUrl(
  admin: SupabaseClient,
  row: { edition_slug: string; photo_asset_id: string | null; photo_mime: string | null },
): string | null {
  const path = publicPhotoPath(row);
  return path ? admin.storage.from(PUBLIC_PHOTO_BUCKET).getPublicUrl(path).data.publicUrl : null;
}

/** Das Profilfoto in den öffentlichen Bucket kopieren, falls noch nicht da. Nur im Echtlauf. */
export async function ensurePublicPhoto(
  admin: SupabaseClient,
  row: { edition_slug: string; photo_asset_id: string | null; photo_mime: string | null; photo_path: string | null },
): Promise<string | null> {
  const dest = publicPhotoPath(row);
  if (!dest || !row.photo_path) return null;
  const ordner = dest.slice(0, dest.lastIndexOf("/"));
  const datei = dest.slice(dest.lastIndexOf("/") + 1);
  const { data: vorhanden } = await admin.storage.from(PUBLIC_PHOTO_BUCKET).list(ordner, { search: datei, limit: 1 });
  if (!vorhanden?.some((f) => f.name === datei)) {
    const { error } = await admin.storage.from(SPEAKER_BUCKET).copy(row.photo_path, dest, { destinationBucket: PUBLIC_PHOTO_BUCKET });
    if (error) {
      // Fallback wie bei den Logos, falls das Kopieren über Bucket-Grenzen nicht geht.
      const { data: blob, error: dl } = await admin.storage.from(SPEAKER_BUCKET).download(row.photo_path);
      if (dl || !blob) throw new Error(`Foto kopieren: ${error.message}`);
      const { error: up } = await admin.storage
        .from(PUBLIC_PHOTO_BUCKET)
        .upload(dest, blob, { contentType: row.photo_mime ?? "image/jpeg", upsert: true });
      if (up) throw new Error(`Foto hochladen: ${up.message}`);
    }
  }
  return admin.storage.from(PUBLIC_PHOTO_BUCKET).getPublicUrl(dest).data.publicUrl;
}