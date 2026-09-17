#!/usr/bin/env node
// Erzeugt docs/feld-matrix-2026-09.md aus docs/schema.md + Code (Migrationen, app/lib/components).
// Methode: docs/plan-ergaenzung-2026-09-17.md Abschnitt 5.2. Nur Node-Core (fs/path), keine DB-Verbindung.
//
// Vorgehen (siehe Arbeitsauftrag fuer Details):
//  1. docs/schema.md parsen: Tabellen, Spalten, Typen, Verweise, Kommentare.
//  2. supabase/migrations/*.sql parsen: welche Funktion/welcher Trigger schreibt (insert/update/delete,
//     new.<col> in Trigger-Funktionen) in welche Tabelle/Spalte. "Zuletzt geoeffnete Funktion" = Zuordnung;
//     eine erneute "create or replace function" mit gleichem Namen loescht die vorherige Zuordnung
//     (spaetere Definition ueberschreibt fruehere).
//  3. app/**/*.ts(x), lib/**/*.ts, components/**/*.tsx nach .from("tabelle") / .rpc("fn") durchsuchen und
//     auf Seiten (Ordner mit page.tsx, Klammergruppen entfernt) abbilden; lib/components ueber importierende
//     Seiten (eine Ebene), sonst "lib". app/api/** wird als Cron/Webhook/API gekennzeichnet (kein Portal).
//  4. Heuristiken fachlich/technisch und Datenschutz-Klasse (Vorschlag) anwenden.
//  5. Domaenen aus Plan 5.2, dann Tabellen je Domaene rendern.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const SCHEMA_PATH = path.join(ROOT, "docs/schema.md");
const MIGRATIONS_DIR = path.join(ROOT, "supabase/migrations");
const OUT_PATH = path.join(ROOT, "docs/feld-matrix-2026-09.md");

// ===========================================================================
// 0. Domaenen aus docs/plan-ergaenzung-2026-09-17.md Abschnitt 5.2 (woertlich uebernommen)
// ===========================================================================

const DOMAINS = [
  {
    name: "Identität & Zugang",
    tables: [
      "person", "person_email", "person_acquisition_channel", "person_eligibility",
      "person_interest", "person_merge_log", "potential_duplicate", "consent_record",
      "suppression", "registration", "role_assignment", "staff_user", "audit_log",
    ],
  },
  {
    name: "Edition & Programm",
    tables: [
      "event", "event_day", "stage", "stage_day", "track", "slot", "slot_history",
      "session", "session_speaker", "session_question", "session_submission",
      "question_catalog", "programme_backlog", "application", "decision_release", "regie_cue",
    ],
  },
  {
    name: "Speaker",
    tables: ["speaker_profile", "speaker_asset", "speaker_travel", "hospitality_quota", "hospitality_booking", "expense_claim"],
  },
  {
    name: "Partner & Leistungen",
    tables: [
      "organization", "org_membership", "org_edition", "org_product", "org_step", "org_step_check",
      "org_ticket_allocation", "partner_asset", "partner_deal", "deliverable", "deliverable_template",
      "deadline", "booth", "booth_service_check",
    ],
  },
  {
    name: "Messeshop & Produkte",
    tables: ["product", "product_component", "stock_ledger", "shop_order", "shop_order_line", "shop_request"],
  },
  {
    name: "Tickets & Einlass",
    tables: ["ticket", "ticket_secret", "ticket_type_map", "checkin"],
  },
  {
    name: "Volunteers",
    tables: ["volunteer_profile", "shift", "shift_assignment", "volunteer_coupon_revocation"],
  },
  {
    name: "Hackathon",
    tables: ["hack_application", "hack_challenge", "hack_team", "hack_team_member", "hack_submission", "hack_judging_score"],
  },
  {
    name: "Inhalte, Kommunikation, Stammdaten, Integration",
    tables: [
      "kb_article", "mail_log", "mail_template", "portal_video", "edition_contact", "edition_file",
      "edition_info", "vocab_term", "external_ref",
    ],
  },
];

// ===========================================================================
// 1. docs/schema.md parsen
// ===========================================================================

function parseSchema(text) {
  const tablesMatch = text.match(/^## Tabellen\n([\s\S]*?)\n## Views\b/m);
  if (!tablesMatch) throw new Error("Abschnitt '## Tabellen' nicht in docs/schema.md gefunden");
  const blocks = tablesMatch[1].split(/^### `/m).slice(1);
  const tables = new Map();
  for (const block of blocks) {
    const nameEnd = block.indexOf("`");
    const name = block.slice(0, nameEnd).trim();
    let rest = block.slice(nameEnd + 1);
    if (rest.startsWith("\n")) rest = rest.slice(1);
    const headerIdx = rest.indexOf("| Spalte");
    const comment = headerIdx >= 0 ? rest.slice(0, headerIdx).trim() : rest.trim();
    const rowsText = headerIdx >= 0 ? rest.slice(headerIdx) : "";
    const columns = [];
    for (const line of rowsText.split("\n")) {
      const m = line.match(/^\|\s*`([^`]+)`\s*\|([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)\|\s*$/);
      if (!m) continue;
      columns.push({
        col: m[1].trim(),
        type: m[2].trim(),
        pflicht: m[3].trim(),
        default: m[4].trim().replace(/^`(.*)`$/, "$1"),
        verweis: m[5].trim().replace(/^`(.*)`$/, "$1"),
        kommentar: m[6].trim(),
      });
    }
    tables.set(name, { name, comment, columns });
  }
  return tables;
}

// ===========================================================================
// 2. supabase/migrations/*.sql parsen
// ===========================================================================

function listMigrationFiles() {
  return fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
}

// Top-Level-Komma-Split, der Klammertiefe und '...'-Stringliterale respektiert.
function splitTopLevel(str, sepChar) {
  const parts = [];
  let depth = 0;
  let inStr = false;
  let cur = "";
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (inStr) {
      cur += c;
      if (c === "'") {
        if (str[i + 1] === "'") { cur += str[++i]; } else { inStr = false; }
      }
      continue;
    }
    if (c === "'") { inStr = true; cur += c; continue; }
    if (c === "(") { depth++; cur += c; continue; }
    if (c === ")") { depth--; cur += c; continue; }
    if (c === sepChar && depth === 0) { parts.push(cur); cur = ""; continue; }
    cur += c;
  }
  parts.push(cur);
  return parts.map((s) => s.trim()).filter((s) => s.length > 0);
}

function extractParenGroup(text, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < text.length; i++) {
    const c = text[i];
    if (c === "(") depth++;
    else if (c === ")") { depth--; if (depth === 0) return text.slice(openIdx + 1, i); }
  }
  return text.slice(openIdx + 1);
}

// Ende einer SET-Klausel: top-level 'where' / 'from' / 'returning' oder ';' (klammer-/string-bewusst).
function findClauseEnd(text, fromIdx) {
  let depth = 0;
  let inStr = false;
  for (let i = fromIdx; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (c === "'") { if (text[i + 1] === "'") { i++; } else { inStr = false; } }
      continue;
    }
    if (c === "'") { inStr = true; continue; }
    if (c === "(") { depth++; continue; }
    if (c === ")") { depth--; continue; }
    if (depth === 0) {
      if (c === ";") return i;
      const prev = text[i - 1];
      if (/[a-z]/i.test(c) && !(prev && /[a-z0-9_]/i.test(prev))) {
        const rest = text.slice(i, i + 10).toLowerCase();
        if (/^where\b/.test(rest) || /^from\b/.test(rest) || /^returning\b/.test(rest)) return i;
      }
    }
  }
  return text.length;
}

const DECL_FN_RE = /create\s+(?:or\s+replace\s+)?function\s+([a-z_][a-z0-9_]*)/gi;
const DOLLAR_TAG_RE = /\$([a-zA-Z_]*)\$/g;
const TRIGGER_RE = /create\s+trigger\s+(\w+)[\s\S]{0,400}?\bon\s+([a-z_][a-z0-9_]*)\b[\s\S]{0,400}?execute\s+(?:function|procedure)\s+([a-z_][a-z0-9_]*)\s*\(/gi;
const INSERT_RE = /\binsert\s+into\s+([a-z_][a-z0-9_]*)\s*\(/gi;
const UPDATE_RE = /\bupdate\s+([a-z_][a-z0-9_]*)\s*(?:[a-z_][a-z0-9_]*\s+)?set\b/gi;
const DELETE_RE = /\bdelete\s+from\s+([a-z_][a-z0-9_]*)/gi;
const NEWCOL_RE = /\bnew\.([a-z_][a-z0-9_]*)\s*:?=(?!=)/gi;

// Funktions-"Spannen" ueber die $$...$$ (bzw. $tag$...$tag$) Dollar-Quotierung des Bodys finden.
// Das ist robuster als Einrueckung: manche Migrationen ruecken "language ... as $$"/"declare"/"begin"
// auf Spalte 0 ein, andere nicht - beide Stile kommen in diesem Repo vor.
function findFunctionSpans(text) {
  const spans = [];
  DECL_FN_RE.lastIndex = 0;
  let dm;
  while ((dm = DECL_FN_RE.exec(text))) {
    const name = dm[1].toLowerCase();
    DOLLAR_TAG_RE.lastIndex = dm.index + dm[0].length;
    const openM = DOLLAR_TAG_RE.exec(text);
    if (!openM) continue; // keine Body-Grenze gefunden (z. B. reine Deklaration) - ignorieren
    const tag = openM[0];
    const bodyStart = openM.index + tag.length;
    const closeIdx = text.indexOf(tag, bodyStart);
    const end = closeIdx === -1 ? text.length : closeIdx + tag.length;
    spans.push({ start: dm.index, end, name });
  }
  return spans;
}

function functionAtOffset(spans, offset) {
  for (const s of spans) if (offset >= s.start && offset < s.end) return s.name;
  return null;
}

function parseMigrations(tableNames) {
  const files = listMigrationFiles();
  const functionWrites = new Map(); // fn -> [{table, kind, columns, file}]
  const functionNewCol = new Map(); // fn -> [{column, file}]
  const triggers = []; // {trigger, table, function, file}
  const topLevelWrites = []; // {table, kind, columns, file} (kein umschliessendes Funktions-create)
  const allFunctionNames = new Set(); // jede in einer Migration definierte Funktion (fuer Code-Abgleich)

  for (const file of files) {
    const text = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");

    // Reihenfolge der Spans = Reihenfolge im Text = chronologisch innerhalb der Datei.
    // Reset je Span: "spaetere Definition ueberschreibt fruehere" (gilt auch dateiuebergreifend,
    // da Dateien in Zeitstempel-Reihenfolge verarbeitet werden).
    const spans = findFunctionSpans(text);
    for (const s of spans) {
      functionWrites.set(s.name, []);
      functionNewCol.set(s.name, []);
      allFunctionNames.add(s.name);
    }

    let m;

    INSERT_RE.lastIndex = 0;
    while ((m = INSERT_RE.exec(text))) {
      const table = m[1].toLowerCase();
      if (!tableNames.has(table)) continue;
      const parenStart = m.index + m[0].length - 1;
      const inner = extractParenGroup(text, parenStart);
      const cols = splitTopLevel(inner, ",").map((c) => c.replace(/^"|"$/g, "").toLowerCase());
      const fn = functionAtOffset(spans, m.index);
      const rec = { table, kind: "insert", columns: cols, file };
      if (fn) functionWrites.get(fn).push(rec); else topLevelWrites.push(rec);
    }

    UPDATE_RE.lastIndex = 0;
    while ((m = UPDATE_RE.exec(text))) {
      const table = m[1].toLowerCase();
      if (!tableNames.has(table)) continue;
      const afterSet = m.index + m[0].length;
      const end = findClauseEnd(text, afterSet);
      const clause = text.slice(afterSet, end);
      const cols = [];
      for (const a of splitTopLevel(clause, ",")) {
        const eq = a.indexOf("=");
        if (eq < 0) continue;
        const cand = a.slice(0, eq).trim().replace(/^"|"$/g, "");
        if (/^[a-z_][a-z0-9_]*$/i.test(cand)) cols.push(cand.toLowerCase());
      }
      const fn = functionAtOffset(spans, m.index);
      const rec = { table, kind: "update", columns: cols, file };
      if (fn) functionWrites.get(fn).push(rec); else topLevelWrites.push(rec);
    }

    DELETE_RE.lastIndex = 0;
    while ((m = DELETE_RE.exec(text))) {
      const table = m[1].toLowerCase();
      if (!tableNames.has(table)) continue;
      const fn = functionAtOffset(spans, m.index);
      const rec = { table, kind: "delete", columns: [], file };
      if (fn) functionWrites.get(fn).push(rec); else topLevelWrites.push(rec);
    }

    NEWCOL_RE.lastIndex = 0;
    while ((m = NEWCOL_RE.exec(text))) {
      const fn = functionAtOffset(spans, m.index);
      if (!fn || !functionNewCol.has(fn)) continue;
      functionNewCol.get(fn).push({ column: m[1].toLowerCase(), file });
    }

    TRIGGER_RE.lastIndex = 0;
    while ((m = TRIGGER_RE.exec(text))) {
      const table = m[2].toLowerCase();
      if (!tableNames.has(table)) continue;
      triggers.push({ trigger: m[1], table, function: m[3].toLowerCase(), file });
    }
  }

  return { functionWrites, functionNewCol, triggers, topLevelWrites, allFunctionNames };
}

function resolveWriters(migData) {
  const { functionWrites, functionNewCol, triggers, topLevelWrites } = migData;

  const triggerFnTables = new Map(); // fn -> Set(table)
  const tableTriggerInfo = new Map(); // table -> [{trigger, function}]
  for (const t of triggers) {
    if (!triggerFnTables.has(t.function)) triggerFnTables.set(t.function, new Set());
    triggerFnTables.get(t.function).add(t.table);
    if (!tableTriggerInfo.has(t.table)) tableTriggerInfo.set(t.table, []);
    tableTriggerInfo.get(t.table).push({ trigger: t.trigger, function: t.function });
  }

  const columnWriters = new Map(); // "table.col" -> Set(label)
  const tableWriterLabels = new Map(); // table -> Set(label)
  const tableDeleteLabels = new Map(); // table -> Set(label)
  const writerFnNamesByTable = new Map(); // table -> Set(fn) (nur echte Funktionsnamen, fuer Pflegbar-in)

  function addColWriter(table, col, label) {
    const key = table + "." + col;
    if (!columnWriters.has(key)) columnWriters.set(key, new Set());
    columnWriters.get(key).add(label);
  }
  function addTableWriter(table, label) {
    if (!tableWriterLabels.has(table)) tableWriterLabels.set(table, new Set());
    tableWriterLabels.get(table).add(label);
  }
  function addWriterFn(table, fn) {
    if (!writerFnNamesByTable.has(table)) writerFnNamesByTable.set(table, new Set());
    writerFnNamesByTable.get(table).add(fn);
  }

  for (const [fn, writes] of functionWrites) {
    for (const w of writes) {
      const label = `${fn}()`;
      addTableWriter(w.table, label);
      addWriterFn(w.table, fn);
      if (w.kind === "delete") {
        if (!tableDeleteLabels.has(w.table)) tableDeleteLabels.set(w.table, new Set());
        tableDeleteLabels.get(w.table).add(label);
      } else {
        for (const c of w.columns) addColWriter(w.table, c, label);
      }
    }
  }

  for (const w of topLevelWrites) {
    const label = `Migration/Seed (${w.file})`;
    addTableWriter(w.table, label);
    if (w.kind !== "delete") for (const c of w.columns) addColWriter(w.table, c, label);
  }

  for (const [fn, assigns] of functionNewCol) {
    const tables = triggerFnTables.get(fn);
    if (!tables || assigns.length === 0) continue;
    for (const table of tables) {
      const trigNames = triggers.filter((t) => t.function === fn && t.table === table).map((t) => t.trigger);
      const label = `${fn}() [Trigger ${trigNames.join("/")}]`;
      addTableWriter(table, label);
      addWriterFn(table, fn);
      for (const a of assigns) addColWriter(table, a.column, label);
    }
  }

  return { columnWriters, tableWriterLabels, tableDeleteLabels, tableTriggerInfo, writerFnNamesByTable };
}

// ===========================================================================
// 3. app/**/*.ts(x), lib/**/*.ts, components/**/*.tsx scannen
// ===========================================================================

function listFilesRec(dir, exts) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listFilesRec(abs, exts));
    else if (exts.some((ext) => e.name.endsWith(ext))) out.push(abs);
  }
  return out;
}

function scanCode(tableNames, allFunctionNames) {
  const appFiles = listFilesRec(path.join(ROOT, "app"), [".ts", ".tsx"]);
  const libFiles = listFilesRec(path.join(ROOT, "lib"), [".ts", ".tsx"]);
  const componentFiles = listFilesRec(path.join(ROOT, "components"), [".ts", ".tsx"]);
  const allFiles = [...appFiles, ...libFiles, ...componentFiles];

  const fileText = new Map();
  const fileTableRefs = new Map();
  const fileRpcRefs = new Map();
  const fileDirectWriteTables = new Map(); // Datei -> Set(Tabelle), .from(t)....insert/update/upsert/delete() ohne RPC

  const FROM_RE = /\.from\("([a-z_][a-z0-9_]*)"\)/g;
  // .rpc("name"...) direkt ODER indirekt ueber einen duennen Wrapper wie
  // `async function ruf(name, args) { ...supabase.rpc(name, args)... }` mit
  // `ruf("upsert_x", {...})` an der Aufrufstelle (kommt im Code vor, z. B. admin/videos,
  // admin/ansprechpartner). Deshalb: jeder Aufruf mit einem String-Literal-Argument, das
  // exakt einem in supabase/migrations/*.sql definierten Funktionsnamen entspricht, zaehlt
  // als RPC-Aufruf dieser Funktion - nicht nur woertliches ".rpc(".
  const RPC_RE = /\.rpc\("([a-z_][a-z0-9_]*)"/g;
  const CALL_STR_ARG_RE = /\b[a-zA-Z_$][\w$]*\(\s*"([a-z_][a-z0-9_]*)"\s*[,)]/g;
  const WRITE_METHOD_RE = /\.(insert|update|upsert|delete)\(/;

  for (const f of allFiles) {
    const text = fs.readFileSync(f, "utf8");
    fileText.set(f, text);
    const tables = new Set();
    const rpcs = new Set();
    const directWrites = new Set();
    let m;
    FROM_RE.lastIndex = 0;
    while ((m = FROM_RE.exec(text))) {
      if (!tableNames.has(m[1])) continue;
      tables.add(m[1]);
      // Direkter Schreibzugriff (kein RPC): .from("t")....insert/update/upsert/delete(...) in derselben
      // Aufrufkette - Fenster bis zum naechsten ';' oder naechsten '.from(' (je nachdem, was zuerst kommt).
      const restStart = m.index + m[0].length;
      let windowEnd = text.length;
      const nextSemi = text.indexOf(";", restStart);
      const nextFrom = text.indexOf(".from(", restStart);
      if (nextSemi !== -1) windowEnd = Math.min(windowEnd, nextSemi);
      if (nextFrom !== -1) windowEnd = Math.min(windowEnd, nextFrom);
      windowEnd = Math.min(windowEnd, restStart + 300);
      if (WRITE_METHOD_RE.test(text.slice(restStart, windowEnd))) directWrites.add(m[1]);
    }
    RPC_RE.lastIndex = 0;
    while ((m = RPC_RE.exec(text))) rpcs.add(m[1]);
    CALL_STR_ARG_RE.lastIndex = 0;
    while ((m = CALL_STR_ARG_RE.exec(text))) if (allFunctionNames.has(m[1])) rpcs.add(m[1]);
    fileTableRefs.set(f, tables);
    fileRpcRefs.set(f, rpcs);
    fileDirectWriteTables.set(f, directWrites);
  }

  // Import-Graph (eine Ebene reicht fuer die Seiten-Zuordnung von lib/components).
  const IMPORT_RE1 = /\bfrom\s+["']([^"']+)["']/g;
  const IMPORT_RE2 = /\bimport\s*\(\s*["']([^"']+)["']/g;

  function resolveModule(spec, fromFile) {
    let basePath;
    if (spec.startsWith("@/")) basePath = path.join(ROOT, spec.slice(2));
    else if (spec.startsWith("./") || spec.startsWith("../")) basePath = path.resolve(path.dirname(fromFile), spec);
    else return null;
    const candidates = [basePath, `${basePath}.ts`, `${basePath}.tsx`, path.join(basePath, "index.ts"), path.join(basePath, "index.tsx")];
    for (const c of candidates) {
      try { if (fs.statSync(c).isFile()) return c; } catch { /* nicht vorhanden */ }
    }
    return null;
  }

  const importers = new Map(); // targetAbs -> Set(importerAbs)
  for (const f of allFiles) {
    const text = fileText.get(f);
    const specs = new Set();
    let m;
    IMPORT_RE1.lastIndex = 0;
    while ((m = IMPORT_RE1.exec(text))) specs.add(m[1]);
    IMPORT_RE2.lastIndex = 0;
    while ((m = IMPORT_RE2.exec(text))) specs.add(m[1]);
    for (const s of specs) {
      const target = resolveModule(s, f);
      if (!target) continue;
      if (!importers.has(target)) importers.set(target, new Set());
      importers.get(target).add(f);
    }
  }
  // Seiten = Ordner mit page.tsx (Klammergruppen entfernt); app/api/** = Cron/Webhook/API.
  function toRoute(dirAbs) {
    const rel = path.relative(path.join(ROOT, "app"), dirAbs);
    const segments = rel.split(path.sep).filter((s) => s && !/^\(.*\)$/.test(s));
    return `/${segments.join("/")}`;
  }
  const pageDirs = new Map(); // absDir -> route
  for (const f of appFiles) {
    if (path.basename(f) === "page.tsx") pageDirs.set(path.dirname(f), toRoute(path.dirname(f)));
  }

  function apiLabel(f) {
    const rel = path.relative(path.join(ROOT, "app/api"), f).split(path.sep).join("/");
    const clean = rel.replace(/\/route\.tsx?$/, "");
    if (clean.startsWith("cron/")) return `Cron: /api/${clean}`;
    if (clean.startsWith("webhooks/")) return `Webhook: /api/${clean}`;
    return `API-Route: /api/${clean}`;
  }

  const appDirAbs = path.join(ROOT, "app");
  const apiDirAbs = path.join(ROOT, "app/api");
  const routeCache = new Map();

  // Direkte Route einer Datei (Seite selbst / Geschwister-page.tsx / app/api-Route), sonst null.
  // Rein und zustandslos - unabhaengig von der Aufrufreihenfolge (siehe Fehlerhinweis unten).
  function directRoute(f) {
    const dir = path.dirname(f);
    const base = path.basename(f);
    const underApp = f.startsWith(appDirAbs + path.sep);
    const underApi = f.startsWith(apiDirAbs + path.sep);
    if (underApp && base === "page.tsx") return pageDirs.get(dir) || null;
    if (underApp && pageDirs.has(dir)) return pageDirs.get(dir);
    if (underApi) return apiLabel(f);
    return null;
  }

  // Vorsicht bei Aenderung: eine fruehere, rekursive Fassung mit "depth"-Parameter cachte
  // faelschlich "lib" fuer Dateien, die zuerst ueber die Importer-Kette EINES ANDEREN, oft
  // importierten lib-Moduls (z. B. lib/auth.ts) mit depth>0 besucht wurden - vor ihrem eigenen
  // depth-0-Aufruf. Deshalb hier bewusst ohne Mehrfach-Hop-Rekursion: direkte Route der Datei
  // selbst, sonst Union der DIREKTEN Routen ihrer Importeure (genau eine Ebene), sonst "lib".
  function routesForFile(f) {
    if (routeCache.has(f)) return routeCache.get(f);
    const result = new Set();
    const direct = directRoute(f);
    if (direct) {
      result.add(direct);
    } else {
      const imps = importers.get(f);
      if (imps) for (const imp of imps) { const d = directRoute(imp); if (d) result.add(d); }
      if (result.size === 0) result.add("lib");
    }
    routeCache.set(f, result);
    return result;
  }

  const fnCallerRoutes = new Map(); // fn -> Set(label)
  const tableDirectRoutes = new Map(); // table -> Set(label) (jede .from()-Fundstelle, lesend oder schreibend)
  const tableDirectWriteRoutes = new Map(); // table -> Set(label) (nur .from()....insert/update/upsert/delete(), kein RPC)
  for (const f of allFiles) {
    const routes = routesForFile(f);
    for (const t of fileTableRefs.get(f)) {
      if (!tableDirectRoutes.has(t)) tableDirectRoutes.set(t, new Set());
      for (const r of routes) tableDirectRoutes.get(t).add(r);
    }
    for (const t of fileDirectWriteTables.get(f)) {
      if (!tableDirectWriteRoutes.has(t)) tableDirectWriteRoutes.set(t, new Set());
      for (const r of routes) tableDirectWriteRoutes.get(t).add(r);
    }
    for (const fn of fileRpcRefs.get(f)) {
      if (!fnCallerRoutes.has(fn)) fnCallerRoutes.set(fn, new Set());
      for (const r of routes) fnCallerRoutes.get(fn).add(r);
    }
  }

  return { fnCallerRoutes, tableDirectRoutes, tableDirectWriteRoutes };
}

// ===========================================================================
// 4. Heuristiken: fachlich/technisch, Datenschutz-Klasse (Vorschlag)
// ===========================================================================

function isTechnicalColumn(col) {
  if (col === "id") return true;
  if (col === "created_at" || col === "updated_at" || col === "deleted_at") return true;
  if (/_by$/.test(col)) return true;
  if (/_at$/.test(col)) return true; // Systemzeitstempel *_at (grobe Heuristik, siehe Befunde/Unsicherheiten)
  if (col === "external_ref") return true;
  if (/_asset_id$/.test(col)) return true;
  if (/_id$/.test(col)) return true; // Fremdschluessel (mit Verweis)
  return false;
}

const PRIVACY_HEALTH = /diet|allerg|ernähr|gesundheit|health/i;
const PRIVACY_BANK = /\biban\b|\bbic\b|\bbank|vault|swift/i;
const PRIVACY_PERSONAL_COLS = new Set([
  "first_name", "last_name", "birthdate", "phone", "phone_e164", "email", "nationality",
  "photo_url", "photo_path", "gender", "pronouns", "linkedin_url", "linkedin_normalized",
  "cv_url", "salutation_de", "salutation_en",
]);
const PRIVACY_PERSONAL_HINT = /e-?mail|telefon|geburtsdatum|\bfoto\b/i;

function suggestPrivacyClass(table) {
  const haystack = [table.comment, ...table.columns.map((c) => `${c.col} ${c.kommentar}`)].join(" \n ");
  if (PRIVACY_HEALTH.test(haystack)) return "besonders geschützt (Art. 9)";
  if (PRIVACY_BANK.test(haystack)) return "Bank/Vault";
  const hasPersonId = table.columns.some((c) => c.col === "person_id");
  const personalCol = table.columns.some((c) => PRIVACY_PERSONAL_COLS.has(c.col));
  if (hasPersonId || personalCol || PRIVACY_PERSONAL_HINT.test(haystack)) return "personenbezogen";
  return "keine";
}

// ===========================================================================
// 5. Rendern
// ===========================================================================

function fmtSet(set, fallback = "") {
  if (!set || set.size === 0) return fallback;
  return [...set].sort().join(", ");
}

function mdEscape(s) {
  return (s || "").replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function render(schemaTables, writers, codeIndex) {
  const { columnWriters, tableWriterLabels, tableDeleteLabels, tableTriggerInfo, writerFnNamesByTable } = writers;
  const { fnCallerRoutes, tableDirectRoutes, tableDirectWriteRoutes } = codeIndex;

  const PORTAL_ROUTE_RE = /^\/[a-z0-9(].*$/; // echte Portalroute, kein "lib"/"Cron: ..."/"Webhook: ..."/"API-Route: ..."
  function isPortalRoute(r) {
    return r !== "lib" && !r.startsWith("Cron:") && !r.startsWith("Webhook:") && !r.startsWith("API-Route:");
  }

  function pagesForTable(tableName) {
    const routes = new Set(tableDirectRoutes.get(tableName) || []);
    const fns = writerFnNamesByTable.get(tableName) || new Set();
    for (const fn of fns) for (const r of fnCallerRoutes.get(fn) || []) routes.add(r);
    return routes;
  }

  function pflegbarInForColumn(tableName, col) {
    const labels = columnWriters.get(`${tableName}.${col}`);
    if (!labels) return new Set();
    const routes = new Set();
    for (const label of labels) {
      const fn = label.split("(")[0]; // "fnname()" oder "fnname() [Trigger ...]" -> "fnname"
      for (const r of fnCallerRoutes.get(fn) || []) if (isPortalRoute(r)) routes.add(r);
    }
    return routes;
  }

  const usedTables = new Set();
  const lines = [];

  lines.push("# Feld-Eigentümer-Matrix");
  lines.push("");
  lines.push(
    `> Generiert mit \`node scripts/gen-feld-matrix.mjs\` aus \`docs/schema.md\` und dem Code, ` +
      `Stand ${new Date().toISOString().slice(0, 10)}. Handkorrekturen nur im Abschnitt „Befunde (Vorbereitung Walkthrough)“ ` +
      `am Ende der Datei — alles davor wird beim naechsten Lauf ueberschrieben.`
  );
  lines.push("");
  lines.push(
    "Leitfrage je Spalte: **fachlich oder technisch?** · **wer schreibt es** (RPC/Trigger/Ingest/Cron) · " +
      "**wo im Portal pflegbar**. Ziel: Jedes fachliche Feld hat genau einen Pflegeort im Portal " +
      "(Supabase Studio ist kein Pflegeort — nur Konrad und die Architektur-Session)."
  );
  lines.push("");

  function renderTable(tableName, headingLevel) {
    const table = schemaTables.get(tableName);
    if (!table) {
      lines.push(`${"#".repeat(headingLevel)} \`${tableName}\``);
      lines.push("");
      lines.push("_Nicht in docs/schema.md gefunden (Plan nennt sie, aber keine Tabelle dieses Namens in public)._");
      lines.push("");
      return;
    }
    usedTables.add(tableName);
    const privacy = suggestPrivacyClass(table);
    const writerLabels = tableWriterLabels.get(tableName);
    const deleteLabels = tableDeleteLabels.get(tableName);
    const triggerInfo = tableTriggerInfo.get(tableName);
    const pages = pagesForTable(tableName);

    lines.push(`${"#".repeat(headingLevel)} \`${tableName}\``);
    lines.push("");
    lines.push(`**Zweck:** ${table.comment ? mdEscape(table.comment) : "_(kein Kommentar in schema.md)_"}`);
    lines.push("");
    lines.push(`**Datenschutz-Klasse (Vorschlag):** ${privacy}`);
    lines.push("");
    let schreibwege = fmtSet(writerLabels, "_keine insert/update/delete in supabase/migrations/*.sql gefunden_");
    if (deleteLabels && deleteLabels.size) schreibwege += ` · löscht Zeilen: ${fmtSet(deleteLabels)}`;
    lines.push(`**Schreibwege (Funktionen/Trigger):** ${schreibwege}`);
    if (triggerInfo && triggerInfo.length) {
      const trigTxt = triggerInfo.map((t) => `${t.trigger} → ${t.function}()`).join(", ");
      lines.push("");
      lines.push(`**Trigger auf dieser Tabelle:** ${trigTxt}`);
    }
    const directWriteRoutes = tableDirectWriteRoutes.get(tableName);
    if (directWriteRoutes && directWriteRoutes.size) {
      lines.push("");
      lines.push(
        `**Direkte Schreibzugriffe (kein RPC, \`.from().insert/update/upsert/delete()\` im Client-Code):** ${fmtSet(directWriteRoutes)}`
      );
    }
    lines.push("");
    lines.push(`**Seiten (lesen/schreiben):** ${fmtSet(pages, "_keine .from()/.rpc()-Fundstelle in app/lib/components_")}`);
    lines.push("");
    lines.push("| Spalte | Typ | fachlich/technisch | Schreibt | Pflegbar in | Anmerkung |");
    lines.push("|---|---|---|---|---|---|");
    for (const c of table.columns) {
      const art = isTechnicalColumn(c.col) ? "technisch" : "fachlich";
      const writes = fmtSet(columnWriters.get(`${tableName}.${c.col}`));
      const pflegbar = fmtSet(pflegbarInForColumn(tableName, c.col));
      lines.push(`| \`${c.col}\` | ${mdEscape(c.type)} | ${art} | ${mdEscape(writes)} | ${mdEscape(pflegbar)} | |`);
    }
    lines.push("");
  }

  DOMAINS.forEach((domain, i) => {
    lines.push(`## ${i + 1}. ${domain.name}`);
    lines.push("");
    for (const t of domain.tables) renderTable(t, 3);
  });

  const leftover = [...schemaTables.keys()].filter((t) => !usedTables.has(t)).sort();
  if (leftover.length) {
    lines.push(`## ${DOMAINS.length + 1}. Nicht zugeordnet`);
    lines.push("");
    for (const t of leftover) renderTable(t, 3);
  }

  return lines.join("\n");
}

// ===========================================================================
// main
// ===========================================================================

function main() {
  const schemaText = fs.readFileSync(SCHEMA_PATH, "utf8");
  const schemaTables = parseSchema(schemaText);
  const tableNames = new Set(schemaTables.keys());

  const migData = parseMigrations(tableNames);
  const writers = resolveWriters(migData);
  const codeIndex = scanCode(tableNames, migData.allFunctionNames);

  let out = render(schemaTables, writers, codeIndex);

  // Handkorrekturen im Abschnitt "Befunde" ueberleben einen erneuten Lauf: eine bereits
  // vorhandene Ausgabedatei wird nach dieser Ueberschrift durchsucht: gefundener Text wird
  // unveraendert an die neu generierten Abschnitte angehaengt.
  const BEFUNDE_HEADING = "## Befunde (Vorbereitung Walkthrough)";
  if (fs.existsSync(OUT_PATH)) {
    const prev = fs.readFileSync(OUT_PATH, "utf8");
    const idx = prev.indexOf(BEFUNDE_HEADING);
    if (idx !== -1) {
      out = `${out.trimEnd()}\n\n${prev.slice(idx)}`;
    }
  }

  fs.writeFileSync(OUT_PATH, out, "utf8");
  console.error(`OK: ${OUT_PATH} geschrieben (${schemaTables.size} Tabellen aus schema.md).`);
}

main();
