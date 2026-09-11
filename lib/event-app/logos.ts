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
