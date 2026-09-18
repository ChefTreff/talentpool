import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/** Wie viele Zeilen ein Lauf höchstens anfasst. */
const PRO_LAUF = 100;
/** Nach so vielen vergeblichen Versuchen fasst der Cron eine Zeile nicht mehr an. */
const MAX_VERSUCHE = 5;

export type PurgeErgebnis = {
  /** Dateien, die der Speicher jetzt nicht mehr hat. */
  removed: number;
  /** Zeilen, die stehen bleiben, weil das Entfernen fehlschlug. */
  failed: number;
  /** Zeilen, die zu oft gescheitert sind und niemand mehr anfasst. */
  giveUp: number;
};

/**
 * Die Dateien wegräumen, die eine Profillöschung zurückgelassen hat.
 *
 * SQL kann Storage nicht anfassen, deshalb trägt `anonymize_person()` nur die
 * Pfade in `storage_purge_queue` ein und dieser Schritt räumt sie mit
 * `service_role` weg. **Gelöscht wird die Zeile erst, wenn die Datei weg ist** —
 * eine Warteschlange, die ihre Einträge auch im Fehlerfall abräumt, meldet
 * Vollzug und lässt das Foto im Bucket liegen.
 *
 * Nach `MAX_VERSUCHE` vergeblichen Läufen bleibt die Zeile mit ihrem Fehlertext
 * stehen und wird nicht mehr abgeholt. Sie ist dann der Hinweis, dass jemand
 * nachsehen muss, und nicht eine Schleife, die sich alle zehn Minuten am selben
 * Pfad versucht.
 */
export async function processStoragePurgeQueue(): Promise<PurgeErgebnis> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("storage_purge_queue")
    .select("id,bucket,path,attempts")
    .lt("attempts", MAX_VERSUCHE)
    .order("requested_at")
    .limit(PRO_LAUF);

  if (error) {
    console.error("[storage-purge] Warteschlange nicht lesbar:", error.message);
    return { removed: 0, failed: 0, giveUp: 0 };
  }

  const zeilen = (data ?? []) as { id: string; bucket: string; path: string; attempts: number }[];
  if (zeilen.length === 0) return { removed: 0, failed: 0, giveUp: 0 };

  // Je Bucket ein Aufruf: `remove` nimmt eine Liste, und hundert einzelne
  // Anfragen wären hundertmal derselbe Weg.
  const jeBucket = new Map<string, typeof zeilen>();
  for (const z of zeilen) {
    const liste = jeBucket.get(z.bucket) ?? [];
    liste.push(z);
    jeBucket.set(z.bucket, liste);
  }

  let removed = 0;
  let failed = 0;
  let giveUp = 0;

  for (const [bucket, liste] of jeBucket) {
    const { error: wegFehler } = await admin.storage.from(bucket).remove(liste.map((z) => z.path));
    if (wegFehler) {
      // Der Speicher meldet den Fehler für den ganzen Aufruf, nicht je Datei —
      // also zählt jede Zeile dieses Buckets einen Versuch hoch.
      for (const z of liste) {
        const versuche = z.attempts + 1;
        if (versuche >= MAX_VERSUCHE) giveUp += 1;
        else failed += 1;
        await admin
          .from("storage_purge_queue")
          .update({ attempts: versuche, error: wegFehler.message })
          .eq("id", z.id);
      }
      console.error(`[storage-purge] ${bucket}: ${wegFehler.message}`);
      continue;
    }
    const { error: loeschFehler } = await admin
      .from("storage_purge_queue")
      .delete()
      .in("id", liste.map((z) => z.id));
    if (loeschFehler) {
      // Die Dateien sind weg, die Zeilen nicht. Beim nächsten Lauf läuft
      // `remove` auf schon entfernte Pfade — das ist harmlos.
      console.error("[storage-purge] Zeilen nicht entfernt:", loeschFehler.message);
      failed += liste.length;
      continue;
    }
    removed += liste.length;
  }

  return { removed, failed, giveUp };
}
