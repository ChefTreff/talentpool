#!/usr/bin/env node
// Datenbankzugriff der Architektur-Session direkt aus Dateien — die Migration wandert nicht als Text durch den Chat (18.09.2026).
// Node + pg statt psql, weil auf dem Mac weder Homebrew noch psql liegt. Aufruf über `sh scripts/db.sh <befehl>` (siehe dort).
// Verbindungs-URL: ~/.config/fls27/db.env (sh scripts/db-url-set.sh) — ausserhalb des Repos, nicht in .env.local, nicht in Vercel.
// TLS ist Pflicht; ohne SUPABASE_DB_CA wird das Zertifikat nicht gegen eine CA geprüft (wie psql sslmode=require).
// Für volle Prüfung: CA-Datei aus dem Supabase-Dashboard laden und in db.env `SUPABASE_DB_CA=/pfad/prod-ca-2021.crt` eintragen.
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import pg from "pg";

const envFile = join(homedir(), ".config", "fls27", "db.env");
const fail = (msg, code = 2) => { console.error(msg); process.exit(code); };

function readEnv() {
  let txt;
  try { txt = readFileSync(envFile, "utf8"); } catch { fail("Keine Datenbank-URL hinterlegt: sh scripts/db-url-set.sh"); }
  const get = (k) => (txt.match(new RegExp(`^${k}=(.+)$`, "m")) ?? [])[1]?.trim();
  const url = get("SUPABASE_DB_URL");
  if (!url) fail(`SUPABASE_DB_URL fehlt in ${envFile}`);
  const ca = get("SUPABASE_DB_CA");
  return { url, ca };
}

async function withClient(fn) {
  const { url, ca } = readEnv();
  const ssl = ca ? { ca: readFileSync(ca, "utf8"), rejectUnauthorized: true } : { rejectUnauthorized: false };
  const client = new pg.Client({ connectionString: url, ssl, application_name: "fls27-architektur" });
  await client.connect();
  try { return await fn(client, { verified: Boolean(ca) }); }
  finally { await client.end().catch(() => {}); }
}

function printResults(res) {
  const list = Array.isArray(res) ? res : [res];
  for (const r of list) {
    if (r.rows?.length) console.table(r.rows);
    else if (r.command && !["BEGIN", "ROLLBACK", "COMMIT", "SET"].includes(r.command) && r.rowCount != null && r.rows?.length === 0 && r.fields?.length) console.log(`(${r.command}: keine Zeilen)`);
  }
}

function stripTestWrapper(sql) {
  return sql.split("\n").filter((l) => !/^\s*(begin|rollback);\s*$/.test(l)).join("\n");
}

function functionNames(sql) {
  return [...new Set([...sql.matchAll(/create\s+or\s+replace\s+function\s+([a-z_0-9]+)\s*\(/gi)].map((m) => m[1].toLowerCase()))];
}

function newBody(sql, fn) {
  const re = new RegExp(`create\\s+(?:or\\s+replace\\s+)?function\\s+${fn}\\s*\\([\\s\\S]*?\\bas\\s+\\$\\$([\\s\\S]*?)\\$\\$;`, "i");
  return (sql.match(re) ?? [])[1] ?? null;
}

function showError(e) {
  const pos = e.position ? ` (Position ${e.position})` : "";
  console.error(`FEHLER ${e.code ?? ""}: ${e.message}${pos}${e.detail ? `\n  detail: ${e.detail}` : ""}${e.hint ? `\n  hint: ${e.hint}` : ""}`);
}

const [cmd, a1, a2] = process.argv.slice(2);

const commands = {
  async check(client, { verified }) {
    const a = await client.query("select left(version(), 40) as server, current_database() as db, current_user as rolle");
    const b = await client.query("select version, name from supabase_migrations.schema_migrations order by version desc limit 3");
    printResults([a, b]);
    console.log(verified ? "TLS mit CA-Prüfung" : "TLS ohne CA-Prüfung (SUPABASE_DB_CA in db.env setzen für verify-full)");
  },
  async test(client) {
    if (!a1) fail("Testdatei angeben");
    printResults(await client.query(readFileSync(a1, "utf8")));
  },
  async "dry-run"(client) {
    if (!a1) fail("Migrationsdatei angeben");
    const mig = readFileSync(a1, "utf8");
    const test = a2 ? stripTestWrapper(readFileSync(a2, "utf8")) : "";
    try {
      await client.query("begin");
      const r1 = await client.query(mig);
      const r2 = test ? await client.query(test) : [];
      printResults([...(Array.isArray(r1) ? r1 : [r1]), ...(Array.isArray(r2) ? r2 : [r2])]);
      console.log("PROBELAUF OK — alles zurückgerollt");
    } catch (e) { showError(e); process.exitCode = 1; }
    finally { await client.query("rollback").catch(() => {}); }
  },
  async "fn-diff"(client) {
    if (!a1) fail("Migrationsdatei angeben");
    const mig = readFileSync(a1, "utf8");
    const dir = mkdtempSync(join(tmpdir(), "fndiff-"));
    let changed = 0;
    try {
      for (const fn of functionNames(mig)) {
        const { rows } = await client.query(
          "select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = $1", [fn]);
        if (!rows.length) { console.log(`== ${fn}: NEU (live nicht vorhanden)`); continue; }
        const live = rows.map((r) => r.prosrc).join("\n-- (weitere Überladung)\n");
        const neu = newBody(mig, fn);
        if (neu == null) { console.log(`== ${fn}: Body in der Datei nicht extrahierbar`); continue; }
        const lf = join(dir, `${fn}.live.sql`), nf = join(dir, `${fn}.neu.sql`);
        writeFileSync(lf, live.trim() + "\n"); writeFileSync(nf, neu.trim() + "\n");
        const d = spawnSync("diff", ["-w", lf, nf], { encoding: "utf8" });
        if (d.status === 0) console.log(`== ${fn}: unverändert gegen live`);
        else { changed++; console.log(`== ${fn}: ÄNDERUNG gegen live (< live | > neu)`); console.log(d.stdout.split("\n").slice(0, 80).join("\n")); }
      }
    } finally { rmSync(dir, { recursive: true, force: true }); }
    process.exitCode = changed ? 1 : 0;
  },
  async apply(client) {
    if (!a1 || !a2) fail("Aufruf: apply <migration.sql> <name>  (Name z. B. v6_formate)");
    if (!/^[a-z0-9_]+$/.test(a2)) fail("Name nur aus a-z, 0-9, _");
    const mig = readFileSync(a1, "utf8");
    if (!/harden_definer_functions\s*\(\s*\)/.test(mig)) fail("Migration endet nicht mit select harden_definer_functions();");
    let v = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
    try {
      await client.query("begin");
      // Zwei Anwendungen in derselben Sekunde: Version muss streng steigen (18.09.2026, Kollision bei 0113/0114).
      const { rows: [{ max }] } = await client.query("select coalesce(max(version), '0') as max from supabase_migrations.schema_migrations");
      if (v <= max) v = String(BigInt(max) + 1n);
      await client.query(mig);
      await client.query("insert into supabase_migrations.schema_migrations (version, name, statements) values ($1, $2, $3)", [v, a2, [mig]]);
      await client.query("commit");
      console.log(`ANGEWENDET als ${v} (${a2}) — Datei umbenennen nach supabase/migrations/${v}_${a2}.sql, Kopfvermerk setzen, Entscheidungslog`);
    } catch (e) { await client.query("rollback").catch(() => {}); showError(e); process.exitCode = 1; }
  },
};

if (!commands[cmd]) fail("Befehle: check | test <test.sql> | dry-run <migration.sql> [<test.sql>] | fn-diff <migration.sql> | apply <migration.sql> <name>");
withClient(commands[cmd]).catch((e) => { showError(e); process.exit(1); });
