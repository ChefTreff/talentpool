import { supabaseUrl } from "@/lib/supabase/env";

const BUCKET = "contact-photos";

/**
 * Öffentliche Adresse eines Kontaktbilds. Der Bucket ist öffentlich lesbar.
 *
 * Steht bewusst in einer eigenen Datei: `load.ts` daneben zieht den
 * Server-Client herein und lässt sich deshalb nicht aus einer Client-Komponente
 * importieren — die Pflegeseite braucht die Adresse aber für ihre Vorschau.
 */
export function contactPhotoUrl(path: string | null): string | null {
  const base = supabaseUrl();
  if (!path || !base) return null;
  return `${base}/storage/v1/object/public/${BUCKET}/${path.replace(/^\/+/, "")}`;
}
