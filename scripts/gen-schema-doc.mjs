#!/usr/bin/env node
/**
 * Erzeugt `docs/schema.md` aus dem laufenden Supabase-Projekt.
 *
 *   node --env-file=.env.local scripts/gen-schema-doc.mjs
 *
 * Quelle ist die OpenAPI-Beschreibung von PostgREST (`GET /rest/v1/`). Sie wird
 * aus `information_schema` plus den `comment on`-Texten gebaut und liefert
 * Tabellen, Views, Spalten (Typ, Default, Pflicht), Primär-/Fremdschlüssel sowie
 * die aufrufbaren Funktionen.
 *
 * Bewusste Grenze: PostgREST zeigt nur die über die Data-API exponierten Schemas
 * (`public`). Das Schema `integration` ist absichtlich nicht exponiert und steht
 * deshalb nicht in der generierten Doku — es wird in `docs/masterplan.md` §2 und
 * in den Migrationen beschrieben.
 *
 * Es werden keine Datenzeilen gelesen und keine Keys ausgegeben.
 */
import { writeFile } from "node:fs/promises";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const OUT = "docs/schema.md";

if (!url || !key) {
  console.error(
    "❌ NEXT_PUBLIC_SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY (oder ANON_KEY) fehlen.\n" +
      "   Aufruf: node --env-file=.env.local scripts/gen-schema-doc.mjs",
  );
  process.exit(1);
}

const res = await fetch(`${url.replace(/\/$/, "")}/rest/v1/`, {
  headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/openapi+json" },
});
if (!res.ok) {
  console.error(`❌ OpenAPI-Abruf fehlgeschlagen: HTTP ${res.status}`);
  process.exit(1);
}
const spec = await res.json();

const defs = spec.definitions ?? spec.components?.schemas ?? {};
const paths = spec.paths ?? {};

/** "Note:\nThis is a Primary Key.<pk/>" → strukturierte Hinweise + reiner Kommentar. */
function splitDescription(raw) {
  if (!raw) return { comment: "", pk: false, fk: null };
  const pk = /<pk\/>/.test(raw);
  const fkMatch = raw.match(/<fk table='([^']+)' column='([^']+)'\/>/);
  const comment = raw
    .replace(/<pk\/>/g, "")
    .replace(/<fk table='[^']+' column='[^']+'\/>/g, "")
    .replace(/Note:\s*/g, "")
    .replace(/This is a Primary Key\.?/g, "")
    .replace(/This is a Foreign Key to `[^`]+`\.?/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return { comment, pk, fk: fkMatch ? `${fkMatch[1]}.${fkMatch[2]}` : null };
}

const esc = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");

/** Relationen, für die PostgREST kein POST anbietet, sind Views (nur lesbar). */
function isView(name) {
  const p = paths[`/${name}`];
  return Boolean(p) && !p.post;
}

const relations = Object.keys(defs).sort();
const tables = relations.filter((n) => !isView(n));
const views = relations.filter((n) => isView(n));

const rpcNames = Object.keys(paths)
  .filter((p) => p.startsWith("/rpc/"))
  .map((p) => p.slice(5))
  .sort();

const lines = [];
lines.push("# Datenmodell (generiert)");
lines.push("");
lines.push(
  "> **Nicht von Hand bearbeiten.** Erzeugt mit `node --env-file=.env.local scripts/gen-schema-doc.mjs` " +
    "aus dem laufenden Supabase-Projekt (PostgREST-OpenAPI über `information_schema` + `comment on`).",
);
lines.push(">");
lines.push(`> Stand: ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC · ` +
  `${tables.length} Tabellen · ${views.length} Views · ${rpcNames.length} Funktionen`);
lines.push(">");
lines.push(
  "> Nur über die Data-API exponierte Schemas erscheinen hier — `public`. Das Schema " +
    "`integration` ist absichtlich nicht exponiert (Masterplan §2) und wird in den Migrationen beschrieben.",
);
lines.push("");

function renderRelation(name) {
  const def = defs[name];
  const meta = splitDescription(def.description);
  const required = new Set(def.required ?? []);
  lines.push(`### \`${name}\``);
  if (meta.comment) lines.push(meta.comment);
  lines.push("");
  lines.push("| Spalte | Typ | Pflicht | Default | Verweis | Kommentar |");
  lines.push("|---|---|---|---|---|---|");
  for (const [col, p] of Object.entries(def.properties ?? {})) {
    const c = splitDescription(p.description);
    const type = p.format ?? p.type ?? "";
    const flag = c.pk ? "PK" : required.has(col) ? "ja" : "";
    lines.push(
      `| \`${col}\` | ${esc(type)} | ${flag} | ${p.default !== undefined ? `\`${esc(p.default)}\`` : ""} | ${c.fk ? `\`${esc(c.fk)}\`` : ""} | ${esc(c.comment)} |`,
    );
  }
  lines.push("");
}

lines.push("## Tabellen");
lines.push("");
for (const name of tables) renderRelation(name);

if (views.length) {
  lines.push("## Views");
  lines.push("");
  for (const name of views) renderRelation(name);
}

lines.push("## Funktionen (RPC)");
lines.push("");
lines.push("| Funktion | Parameter |");
lines.push("|---|---|");
for (const fn of rpcNames) {
  const op = paths[`/rpc/${fn}`]?.post ?? paths[`/rpc/${fn}`]?.get ?? {};
  const params = (op.parameters ?? [])
    .flatMap((p) =>
      p.schema?.properties
        ? Object.entries(p.schema.properties).map(([k, v]) => `${k}: ${v.format ?? v.type ?? "?"}`)
        : p.name
          ? [`${p.name}: ${p.format ?? p.type ?? "?"}`]
          : [],
    )
    .join(", ");
  lines.push(`| \`${fn}\` | ${esc(params)} |`);
}
lines.push("");

await writeFile(OUT, lines.join("\n"), "utf8");
console.log(
  `✅ ${OUT} geschrieben — ${tables.length} Tabellen, ${views.length} Views, ${rpcNames.length} Funktionen.`,
);
