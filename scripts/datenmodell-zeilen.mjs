// Trägt in docs/datenmodell-v2.md je Welle-6-Migration eine Zeile nach (Architektur-Session, nach jedem Anwenden).
// Aufruf: node scripts/datenmodell-zeilen.mjs [<repo-wurzel>]  — Dubletten je Version fallen weg (Nummer vor Zeitstempel).
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
const root = process.argv[2] ?? process.cwd();
const f = `${root}/docs/datenmodell-v2.md`;
const L = readFileSync(f, "utf8").split("\n");
const idx = L.map((l, i) => (l.startsWith("| Welle 6 · ") ? i : -1)).filter((i) => i >= 0);
const first = idx[0], last = idx[idx.length - 1];
const rows = new Map();
const put = (row) => {
  const ver = (row.match(/`(2026\d{10})`/) || [, row])[1];
  const key = row.match(/^\| Welle 6 · `?(\w+)`?/)[1];
  const cur = rows.get(ver);
  if (!cur || (/^\d{4}$/.test(key) && !/^\d{4}$/.test(cur.key))) rows.set(ver, { key, row });
};
for (const r of L.slice(first, last + 1)) put(r);
let added = 0;
for (const n of readdirSync(`${root}/supabase/migrations`).filter((n) => /^\d{14}_.*\.sql$/.test(n) && n >= "20260917183022").sort()) {
  const [, ver, name] = n.match(/^(\d{14})_(.*)\.sql$/);
  if (rows.has(ver)) continue;
  const head = readFileSync(`${root}/supabase/migrations/${n}`, "utf8").split("\n").slice(0, 8)
    .find((l) => /^-- .*\S/.test(l) && !/^-- =+\s*$/.test(l)) || "";
  const num = (head.match(/^-- (\d{4}) · /) || [])[1];
  const title = head.replace(/^-- (\d{4} · )?/, "").replace(/\.$/, "").trim();
  put(`| Welle 6 · ${num ?? "`" + ver + "`"} | **${title}** (\`${ver}\`, \`${name}\`; Details im Migrationskopf) | — |`);
  added++;
}
const out = [...rows.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([, v]) => v.row);
L.splice(first, last - first + 1, ...out);
writeFileSync(f, L.join("\n"));
console.log(`datenmodell-v2: ${added} Zeile(n) nachgetragen, ${out.length} Welle-6-Zeilen`);
