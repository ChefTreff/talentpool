import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { BILD_MIMES, verkleinere, vorschauPfad } from "./verkleinern.mjs";

const BUCKET = "edition-files";

/**
 * Vorschau zu einer gerade eingetragenen Editionsdatei erzeugen (ADM-042).
 *
 * Läuft **nach** Rollenprüfung und Eintrag, mit dem Admin-Client: das Original
 * liegt im privaten Bucket, und `set_edition_file_preview` nimmt nur den
 * Server an. Scheitert irgendein Schritt, bleibt der Upload gültig — die
 * Portale zeigen dann das Original wie bisher. Kein Fehler hier darf eine
 * hochgeladene Datei kosten.
 *
 * Gibt zurück, ob eine Vorschau entstanden ist.
 */
export async function erzeugeVorschau(
  admin: SupabaseClient,
  datei: { id: string; storage_path: string; mime: string | null },
): Promise<boolean> {
  if (!datei.mime || !BILD_MIMES.has(datei.mime)) return false;
  const ziel = vorschauPfad(datei.storage_path);
  try {
    const { data: original, error: ladeFehler } = await admin.storage.from(BUCKET).download(datei.storage_path);
    if (ladeFehler || !original) throw new Error(`Original nicht lesbar: ${ladeFehler?.message ?? "leer"}`);
    const klein = await verkleinere(Buffer.from(await original.arrayBuffer()));

    const { error: schreibFehler } = await admin.storage
      .from(BUCKET)
      .upload(ziel, klein.buffer, { contentType: "image/webp", upsert: true });
    if (schreibFehler) throw new Error(`Vorschau nicht gespeichert: ${schreibFehler.message}`);

    const { error: rpcFehler } = await admin.rpc("set_edition_file_preview", {
      p_id: datei.id,
      p_path: ziel,
      p_width: klein.width,
      p_height: klein.height,
    });
    if (rpcFehler) {
      // Ohne Eintrag kennt niemand die Datei — sie darf nicht liegen bleiben.
      await admin.storage.from(BUCKET).remove([ziel]);
      throw new Error(`Vorschau nicht eingetragen: ${rpcFehler.message}`);
    }
    return true;
  } catch (fehler) {
    console.error("[edition-files] Vorschau:", datei.storage_path, fehler instanceof Error ? fehler.message : fehler);
    return false;
  }
}
