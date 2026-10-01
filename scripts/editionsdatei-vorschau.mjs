/**
 * Vorschauen für Editionsbilder nachholen, die vor ADM-042 hochgeladen wurden.
 *
 *   node --env-file=.env.local scripts/editionsdatei-vorschau.mjs [--apply]
 *
 * Sucht alle Einträge in `edition_file` mit Rasterbild und ohne Vorschau,
 * erzeugt die verkleinerte Fassung mit derselben Regel wie die Upload-Route
 * (`lib/edition-files/verkleinern.mjs`) und trägt sie über
 * `set_edition_file_preview` ein — die Funktion nimmt nur den Server an, das
 * Skript läuft mit dem Secret Key. Ohne `--apply` wird nichts geschrieben.
 *
 * Scheitert eine Datei, bleibt sie ohne Vorschau, und die Portale zeigen weiter
 * das Original. Das Original wird nie angefasst.
 */
import { createClient } from "@supabase/supabase-js";
import { url, secretKey, requireEnv } from "./supabase-env.mjs";
import { BILD_MIMES, verkleinere, vorschauPfad } from "../lib/edition-files/verkleinern.mjs";

requireEnv(true);
const apply = process.argv.includes("--apply");
const admin = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });

const { data: dateien, error } = await admin
  .from("edition_file")
  .select("id, kind, storage_path, filename, mime, size_bytes")
  .is("preview_path", null)
  .in("mime", [...BILD_MIMES]);
if (error) throw error;

console.log(`${dateien.length} Bild(er) ohne Vorschau, ${apply ? "SCHREIBEND" : "Trockenlauf"}\n`);
let ok = 0;
let fehler = 0;

for (const d of dateien) {
  const groesse = d.size_bytes ? `${(d.size_bytes / 1048576).toFixed(1)} MB` : "?";
  try {
    const { data: original, error: e1 } = await admin.storage.from("edition-files").download(d.storage_path);
    if (e1 || !original) throw new Error(`Original nicht lesbar: ${e1?.message ?? "leer"}`);
    const eingang = Buffer.from(await original.arrayBuffer());
    const klein = await verkleinere(eingang);
    console.log(
      `  ${d.kind.padEnd(12)} ${d.filename.slice(0, 40).padEnd(40)} ${groesse.padStart(8)} → ` +
        `${klein.width}×${klein.height}, ${(klein.buffer.length / 1024).toFixed(0)} KB`,
    );
    if (!apply) continue;

    const ziel = vorschauPfad(d.storage_path);
    const { error: e2 } = await admin.storage
      .from("edition-files")
      .upload(ziel, klein.buffer, { contentType: "image/webp", upsert: true });
    if (e2) throw new Error(`Vorschau nicht gespeichert: ${e2.message}`);
    const { error: e3 } = await admin.rpc("set_edition_file_preview", {
      p_id: d.id, p_path: ziel, p_width: klein.width, p_height: klein.height,
    });
    if (e3) {
      await admin.storage.from("edition-files").remove([ziel]);
      throw new Error(`nicht eingetragen: ${e3.message}`);
    }
    ok++;
  } catch (e) {
    fehler++;
    console.log(`  FEHLER ${d.filename}: ${e instanceof Error ? e.message : e}`);
  }
}

console.log(`\n${apply ? `eingetragen ${ok}` : "nichts geschrieben"} · Fehler ${fehler}`);
if (!apply && dateien.length) console.log("Mit --apply übernehmen (erst nach „Migration live“).");
