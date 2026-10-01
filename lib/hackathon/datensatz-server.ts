import type { SupabaseClient } from "@supabase/supabase-js";
import { DATASET_BUCKET } from "@/lib/hackathon/datensatz";

/** Laufzeit der Download-Adresse: kurz, die Seite erzeugt sie bei jedem Aufruf neu. */
const URL_GUELTIG_SEKUNDEN = 10 * 60;

/**
 * Download-Adresse für einen Datensatz (HACK-012) — mit der **Sitzung der
 * Person**, nicht dem Dienstschlüssel: die Lese-Policy des Buckets
 * (`hack_dataset_path_allowed`) entscheidet also auch hier. Wer nicht lesen
 * darf, bekommt `null`.
 */
export async function datasetUrl(supabase: SupabaseClient, path: string, filename: string): Promise<string | null> {
  const { data } = await supabase.storage.from(DATASET_BUCKET).createSignedUrl(path, URL_GUELTIG_SEKUNDEN, { download: filename });
  return data?.signedUrl ?? null;
}

export type DatasetTarget = {
  challenge_id: string;
  title: string;
  org_name: string | null;
  dataset_id: string | null;
  storage_path: string | null;
  filename: string | null;
  size_bytes: number | null;
  uploaded_at: string | null;
};

/** Download-Adressen für Abgabe-Dateien (HACK-011) — ebenfalls mit der Sitzung der Person. */
export async function abgabeUrls(
  supabase: SupabaseClient,
  dateien: { storage_path: string; filename: string }[],
): Promise<Map<string, string | null>> {
  const urls = new Map<string, string | null>();
  await Promise.all(
    dateien.map(async (d) => {
      const { data } = await supabase.storage
        .from("hack-submissions")
        .createSignedUrl(d.storage_path, 10 * 60, { download: d.filename });
      urls.set(d.storage_path, data?.signedUrl ?? null);
    }),
  );
  return urls;
}

export type AbgabeZeile = {
  file_id: string;
  team_id: string;
  storage_path: string;
  filename: string;
  mime: string | null;
  size_bytes: number | null;
  late: boolean;
  uploaded_at: string;
};
