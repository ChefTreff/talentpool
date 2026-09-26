import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExhibitorRow } from "@/lib/event-app/types";
import { publicLogoPath, speakerPhotoPath, veralteteFotoKopien } from "@/lib/event-app/mapping";

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
 * Bucket der Speaker-Fotokopien für die Event-App (0136). Seit SPK-047
 * **privat** (Security-Check F2): Swapcard bekommt eine signierte Adresse;
 * Kopieren, Signieren und Aufräumen nur mit `service_role`, keine Policies für
 * anon oder authenticated. Die Partnerlogos oben bleiben öffentlich.
 */
export const PHOTO_BUCKET = "speaker-photos";
export const SPEAKER_BUCKET = "speaker-assets";

/**
 * Laufzeit der Adresse für Swapcard (Plan-Chat 25.09.2026): Swapcard holt das
 * Bild beim Import ab. Ob es das Bild selbst ablegt oder nur verlinkt, zeigt
 * nach dem ersten Echtlauf mit Porträt `scripts/swapcard-foto-hosts.mjs` — bei
 * einem Link bräuchte es mindestens einen Lauf je Woche.
 */
export const PHOTO_URL_TTL_SECONDS = 7 * 24 * 60 * 60;
/** Im Trockenlauf prüft Swapcard nur; die Adresse muss keine Woche gelten. */
const PHOTO_URL_TTL_TROCKENLAUF = 10 * 60;

type FotoZeile = { edition_slug: string; photo_asset_id: string | null; photo_mime: string | null; photo_path: string | null };

async function kopieVorhanden(admin: SupabaseClient, dest: string): Promise<boolean> {
  const ordner = dest.slice(0, dest.lastIndexOf("/"));
  const datei = dest.slice(dest.lastIndexOf("/") + 1);
  const { data } = await admin.storage.from(PHOTO_BUCKET).list(ordner, { search: datei, limit: 1 });
  return Boolean(data?.some((f) => f.name === datei));
}

/**
 * Signierte Adresse der Fotokopie für Swapcard. Im Echtlauf wird die Kopie
 * vorher angelegt, falls sie fehlt; im Trockenlauf wird nichts angelegt — ohne
 * Kopie gibt es dort auch keine Adresse.
 */
export async function photoUrlForApp(admin: SupabaseClient, row: FotoZeile, dryRun: boolean): Promise<string | null> {
  const dest = speakerPhotoPath(row);
  if (!dest || !row.photo_path) return null;
  if (!(await kopieVorhanden(admin, dest))) {
    if (dryRun) return null;
    const { error } = await admin.storage.from(SPEAKER_BUCKET).copy(row.photo_path, dest, { destinationBucket: PHOTO_BUCKET });
    if (error) {
      // Fallback wie bei den Logos, falls das Kopieren über Bucket-Grenzen nicht geht.
      const { data: blob, error: dl } = await admin.storage.from(SPEAKER_BUCKET).download(row.photo_path);
      if (dl || !blob) throw new Error(`Foto kopieren: ${error.message}`);
      const { error: up } = await admin.storage
        .from(PHOTO_BUCKET)
        .upload(dest, blob, { contentType: row.photo_mime ?? "image/jpeg", upsert: true });
      if (up) throw new Error(`Foto hochladen: ${up.message}`);
    }
  }
  const { data, error } = await admin.storage
    .from(PHOTO_BUCKET)
    .createSignedUrl(dest, dryRun ? PHOTO_URL_TTL_TROCKENLAUF : PHOTO_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) throw new Error(`Foto signieren: ${error?.message ?? "keine Adresse"}`);
  return data.signedUrl;
}

/** Alle Dateien eines Ordners, seitenweise; Unterordner zählen nicht (die haben keine `id`). */
async function dateienIn(admin: SupabaseClient, ordner: string): Promise<string[]> {
  const out: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await admin.storage.from(PHOTO_BUCKET).list(ordner, { limit: 1000, offset });
    if (error) throw new Error(`Fotos auflisten: ${error.message}`);
    const seite = data ?? [];
    for (const f of seite) if (f.id) out.push(`${ordner}/${f.name}`);
    if (seite.length < 1000) return out;
  }
}

/**
 * SPK-047, der Weg hinaus: Kopien entfernen, die zu keinem Speaker mehr
 * gehören, der in die App geht. `ordner` sind Edition-Kürzel; `null` heisst
 * alle Ordner im Bucket (Lauf über alle Editionen). Im Trockenlauf wird nur
 * gezählt. Nichts geht verloren: die Kopie entsteht beim nächsten Lauf neu aus
 * dem Original in `speaker-assets`.
 */
export async function entferneVeralteteFotos(
  admin: SupabaseClient,
  ordner: string[] | null,
  behalten: ReadonlySet<string>,
  dryRun: boolean,
): Promise<number> {
  let alle = ordner;
  if (!alle) {
    const { data, error } = await admin.storage.from(PHOTO_BUCKET).list("", { limit: 1000 });
    if (error) throw new Error(`Fotos auflisten: ${error.message}`);
    alle = (data ?? []).filter((f) => !f.id).map((f) => f.name);
  }
  let n = 0;
  for (const o of alle) {
    const weg = veralteteFotoKopien(await dateienIn(admin, o), behalten);
    n += weg.length;
    if (dryRun) continue;
    for (let i = 0; i < weg.length; i += 100) {
      const { error } = await admin.storage.from(PHOTO_BUCKET).remove(weg.slice(i, i + 100));
      if (error) throw new Error(`Fotos entfernen: ${error.message}`);
    }
  }
  return n;
}
