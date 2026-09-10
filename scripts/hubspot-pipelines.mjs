#!/usr/bin/env node
/**
 * Pipelines, Phasen, Zuordnungs-Labels und Firmen-Eigenschaften aus HubSpot auflisten —
 * um `set_edition_hubspot(edition, pipeline_id, stage_id)` zu füllen und die Property-Namen in
 * lib/hubspot/mapping.ts gegenzuprüfen. Gibt nur IDs und Labels aus, nie den Token.
 *
 *   node --env-file=.env.local scripts/hubspot-pipelines.mjs
 */
const token = process.env.HUBSPOT_ACCESS_TOKEN?.trim();
if (!token) {
  console.error("HUBSPOT_ACCESS_TOKEN fehlt in .env.local (docs/zugangs-liste.md).");
  process.exit(1);
}
const BASE = "https://api.hubapi.com";
async function get(path) {
  const res = await fetch(`${BASE}${path}`, { headers: { authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`${res.status} ${path}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

const pipelines = await get("/crm/v3/pipelines/deals");
console.log("Deal-Pipelines und Phasen:");
for (const p of pipelines.results ?? []) {
  console.log(`  ${p.label}  pipeline_id=${p.id}`);
  for (const s of p.stages ?? []) console.log(`      ${s.label}  stage_id=${s.id}`);
}

try {
  const labels = await get("/crm/v4/associations/deals/contacts/labels");
  console.log("\nZuordnungs-Labels Deal → Kontakt (Kontaktrollen):");
  for (const l of labels.results ?? []) console.log(`  ${l.label ?? "(ohne Label)"}  typeId=${l.typeId} ${l.category}`);
} catch (e) {
  console.log(`\nZuordnungs-Labels nicht lesbar: ${e.message}`);
}

const wanted = /legal|communication|invoice|rechnung|vat|ust|po_|partner|sponsoring|organization|type/i;
const props = await get("/crm/v3/properties/companies");
console.log("\nFirmen-Eigenschaften (Auswahl, interne Namen):");
for (const p of (props.results ?? []).filter((p) => wanted.test(p.name) || wanted.test(p.label))) {
  console.log(`  ${p.name}  („${p.label}“, ${p.type})`);
}
console.log("\nErwartet von lib/hubspot/mapping.ts: legal_name, communication_name, invoice_email, invoice_name, vat_id, po_number, organization_type, partner_category, sponsoring_level (fehlende ⇒ Gate meldet Pflichtfeld).");
