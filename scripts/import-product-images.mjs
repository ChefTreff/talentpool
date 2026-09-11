#!/usr/bin/env node
/**
 * Produktbilder aus einer Manifest-Datei in den Bucket `product-images` laden und `product.images` setzen.
 *
 * Manifest (JSON, z. B. aus der Airtable-Item-Liste über den Airtable-Connector erzeugt):
 *   [{ "sku": "I-11329", "images": [{ "url": "https://…", "filename": "gitterbox.jpg", "type": "image/jpeg" }] }, …]
 * Airtable-Anhang-URLs laufen nach wenigen Stunden ab — Manifest direkt vor dem Lauf erzeugen.
 *
 *   node --env-file=.env.local scripts/import-product-images.mjs <manifest.json> [--dry-run] [--replace]
 *
 * Ohne --replace bleiben vorhandene Bilder eines Produkts stehen (nur Produkte mit leerem images-Array werden gefüllt).
 * Läuft mit dem Secret Key (service_role) — nur lokal, nie im Browser.
 */
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const [manifestPath, ...flags] = process.argv.slice(2);
if (!manifestPath) {
  console.error("Aufruf: node --env-file=.env.local scripts/import-product-images.mjs <manifest.json> [--dry-run] [--replace]");
  process.exit(1);
}
const dryRun = flags.includes("--dry-run");
const replace = flags.includes("--replace");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = [process.env.SUPABASE_SECRET_KEY, process.env.SUPABASE_SERVICE_ROLE_KEY].find((v) => v && /^(sb_secret_|eyJ)/.test(v));
if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL oder Secret Key fehlt in .env.local (sh scripts/env-pull.sh; Secret Key von Hand).");
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const BUCKET = "product-images";
const ALLOWED = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"]);

function safeName(name) {
  return name.normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || "bild";
}

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const skus = manifest.map((m) => m.sku);
const { data: products, error } = await supabase.from("product").select("sku, images").in("sku", skus);
if (error) throw new Error(`product nicht lesbar: ${error.message}`);
const existing = new Map(products.map((p) => [p.sku, p.images ?? []]));

let uploaded = 0, skipped = 0, failed = 0, updated = 0;
for (const entry of manifest) {
  const current = existing.get(entry.sku);
  if (current === undefined) { console.warn(`  ${entry.sku}: kein Produkt — übersprungen`); skipped += 1; continue; }
  if (current.length > 0 && !replace) { skipped += 1; continue; }
  const images = [];
  for (const img of entry.images ?? []) {
    const type = img.type ?? "image/jpeg";
    if (!ALLOWED.has(type)) { console.warn(`  ${entry.sku}: ${img.filename} (${type}) nicht erlaubt — übersprungen`); continue; }
    const path = `${entry.sku}/${safeName(img.filename ?? "bild")}`;
    if (images.some((i) => i.path === path)) continue; // dieselbe Datei in mehreren Airtable-Feldern
    if (dryRun) { images.push({ path, name: img.filename, type, size: img.size ?? null }); continue; }
    try {
      const res = await fetch(img.url);
      if (!res.ok) throw new Error(`Download ${res.status}`);
      const bytes = new Uint8Array(await res.arrayBuffer());
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, bytes, { contentType: type, upsert: true });
      if (upErr) throw new Error(upErr.message);
      const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
      images.push({ path, url: pub.publicUrl, name: img.filename ?? null, type, size: bytes.byteLength });
      uploaded += 1;
    } catch (e) {
      failed += 1;
      console.error(`  ${entry.sku}: ${img.filename} fehlgeschlagen — ${e instanceof Error ? e.message : e}`);
    }
  }
  if (images.length === 0) continue;
  if (dryRun) { console.log(`  [dry-run] ${entry.sku}: ${images.map((i) => i.path).join(", ")}`); continue; }
  const { error: updErr } = await supabase.from("product").update({ images }).eq("sku", entry.sku);
  if (updErr) { failed += 1; console.error(`  ${entry.sku}: product.images nicht gesetzt — ${updErr.message}`); continue; }
  updated += 1;
}
console.log(`Fertig${dryRun ? " (dry-run)" : ""}: ${uploaded} Dateien hochgeladen, ${updated} Produkte aktualisiert, ${skipped} übersprungen, ${failed} Fehler.`);
process.exit(failed > 0 ? 2 : 0);
