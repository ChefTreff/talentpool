// Produktstamm-Import (Welle 3 A1): Item-Liste 2026 + Stücklisten → product / product_component.
// Aufruf: node --env-file=.env.local scripts/import-products.mjs [--dry-run]
// Quelle: docs/referenz/item-liste-2026.csv (186 Zeilen, ohne Personenbezug), docs/referenz/product-bundles-2026.csv.
// Regeln (Arbeitsauftrag Welle 3 A1, Entscheidungen 2–4): Platzhalter ohne Namen entfallen, Namen/Kategorien getrimmt, SKU = Item-ID,
// USt 7 % (Entscheidung 3), Typ aus Quelle × Kategorie × Listenpreis, Shop-Sichtbarkeit aus den Exhibitor-Shop-Feldern. Idempotent (Upsert).
// Bilder: die Attachment-URLs der CSV sind abgelaufen — Bilder kommen in einem eigenen Schritt (Bucket product-images).
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const DRY = process.argv.includes("--dry-run");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
if (!url || !key) { console.error("URL oder Secret Key fehlt in der Env."); process.exit(1); }

/** Kleiner RFC-4180-Parser (Anführungszeichen, doppelte Anführungszeichen, Zeilenumbrüche in Feldern). */
function parseCsv(text) {
  const rows = []; let row = []; let field = ""; let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else { quoted = false; } }
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = ""; if (row.some((v) => v !== "")) rows.push(row); row = [];
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); if (row.some((v) => v !== "")) rows.push(row); }
  const header = rows.shift();
  return rows.map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? "").trim()])));
}

const CATEGORY = {
  "Standgastronomie": "standgastronomie", "Branding": "branding", "Mobiliar": "mobiliar", "Hackathon": "hackathon",
  "Company Tours": "company_tours", "Technik": "technik", "Standflaeche": "standflaeche",
  "Infrastruktur – Versorgung & Anschluesse": "infrastruktur", "Specials": "specials", "Stage Products": "stage_products",
  "Standbau": "standbau", "Nebenkosten": "nebenkosten", "Pflanzen": "pflanzen", "Tickets": "tickets", "Essentials": "essentials", "Personal": "personal",
};
const PACKAGE_CATEGORIES = new Set(["standflaeche", "stage_products", "company_tours", "hackathon", "specials", "tickets"]);
const UNIT_OVERRIDE = { "I-73593": "sqm", "I-91411": "sqm", "I-24313": "m", "I-33612": "m" };
// Einzelne Zeilen ohne Kategorie in der Item-Liste (Agency Area Partner = Platzierung, Paketcharakter)
const CATEGORY_OVERRIDE = { "I-69384": "specials" };

const cents = (v) => { const n = Number(String(v).replace(/[^0-9.,-]/g, "").replace(",", ".")); return v === "" || !Number.isFinite(n) ? null : Math.round(n * 100); };
const int = (v) => (v === "" || !Number.isFinite(Number(v)) ? null : Math.round(Number(v)));
const num = (v) => (v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const nn = (v) => (v === "" ? null : v);

const items = parseCsv(readFileSync("docs/referenz/item-liste-2026.csv", "utf8"));
const bundles = parseCsv(readFileSync("docs/referenz/product-bundles-2026.csv", "utf8"));

const skipped = []; const warnings = []; const products = [];
for (const r of items) {
  const sku = r["Item-ID (SKU)"]; const name = r["Article Name (Displayed)"].replace(/\s+/g, " ").trim();
  if (!name) { skipped.push(sku); continue; }
  const category = CATEGORY_OVERRIDE[sku] ?? CATEGORY[r["Category"].replace(/\s+/g, " ").trim()];
  if (!category) { warnings.push(`${sku}: unbekannte Kategorie „${r["Category"]}"`); continue; }
  const source = r["Source"]; const hubspot = /Hubspot/i.test(source); const shop = /Messe-Shop/i.test(source);
  const net = cents(r["Price - Selling Price (Net)"]);
  let type;
  if (shop && !hubspot) type = "shop_item";
  else if (hubspot) type = PACKAGE_CATEGORIES.has(category) && net !== null ? "package" : "addon";
  else { type = "addon"; warnings.push(`${sku}: ohne Quelle, als addon übernommen`); }
  const shopVisible = r["Exhibitor Shop - Item (True/False)"] === "TRUE" && r["Exhibitor Shop - Status"] === "publish"
    && ["Visible", "Search"].includes(r["Exhibitor Shop - Product Visibility"]);
  products.push({
    sku, name_de: name, description_de: nn(r["Description"]), type, category,
    unit: UNIT_OVERRIDE[sku] ?? "piece",
    net_price_cents: net, purchase_price_cents: cents(r["Price - Net EK"]), margin: num(r["Price - Margin"]),
    vat_rate: num(r["VAT rate (%)"]) ?? 7,
    supplier: nn(r["Supplier"]), supplier_sku: nn(r["Item-Number (Supplier Logic)"]), supplier_url: nn(r["Item Link (Supplier Logic)"]),
    stock_total: int(r["Stock Amount"]), track_stock: r["Exhibitor Shop - Stock Tracking (True/False)"] === "TRUE",
    shop_visible: shopVisible, shop_sort: int(r["Exhibitor Shop - Item Order"]),
    purchase_note_de: nn(r["Exhibitor Shop - Purchase note to customer (extern)"]),
    source_hubspot: hubspot, source_shop: shop || r["Exhibitor Shop - Item (True/False)"] === "TRUE",
    internal_comment: nn(r["Comment (Internal)"]), active: true,
  });
}
const skus = new Set(products.map((p) => p.sku));
const components = []; const droppedComponents = [];
for (const b of bundles) {
  if (!skus.has(b.bundle_sku) || !skus.has(b.component_sku)) { droppedComponents.push(`${b.bundle_sku} → ${b.component_sku} ×${b.qty}`); continue; }
  components.push({ bundle_sku: b.bundle_sku, component_sku: b.component_sku, qty: Number(b.qty) });
}

const byType = {}; const byCat = {};
for (const p of products) { byType[p.type] = (byType[p.type] ?? 0) + 1; byCat[p.category] = (byCat[p.category] ?? 0) + 1; }
console.log(`Item-Liste: ${items.length} Zeilen → ${products.length} Produkte, ${skipped.length} Platzhalter übersprungen`);
console.log("Typen:", byType); console.log("Kategorien:", byCat);
console.log(`Shop sichtbar: ${products.filter((p) => p.shop_visible).length} · mit Listenpreis: ${products.filter((p) => p.net_price_cents !== null).length}`);
console.log(`Stücklisten: ${components.length} Zeilen übernommen, ${droppedComponents.length} verworfen (Platzhalter):`, droppedComponents);
for (const w of warnings) console.log("Hinweis:", w);
if (DRY) { console.log("Dry-Run: nichts geschrieben."); process.exit(0); }

const sb = createClient(url, key, { auth: { persistSession: false } });
const { data: ed } = await sb.from("event").select("id").eq("is_edition", true).eq("slug", "fls27").maybeSingle();
if (!ed) { console.error("Edition fls27 nicht gefunden."); process.exit(1); }
for (const p of products) p.edition_id = ed.id;
for (let i = 0; i < products.length; i += 100) {
  const { error } = await sb.from("product").upsert(products.slice(i, i + 100), { onConflict: "sku" });
  if (error) { console.error("Produkt-Upsert fehlgeschlagen:", error.message); process.exit(1); }
}
const { error: cErr } = await sb.from("product_component").upsert(components, { onConflict: "bundle_sku,component_sku" });
if (cErr) { console.error("Stücklisten-Upsert fehlgeschlagen:", cErr.message); process.exit(1); }
const { count } = await sb.from("product").select("*", { count: "exact", head: true });
const { count: cc } = await sb.from("product_component").select("*", { count: "exact", head: true });
console.log(`✅ Import fertig — product: ${count} Zeilen, product_component: ${cc} Zeilen.`);
