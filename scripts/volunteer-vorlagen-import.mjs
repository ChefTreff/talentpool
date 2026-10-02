/**
 * Planstellen 2026 als Schicht-Vorlagen für 2027 übernehmen (VOL-002, K-44 Frage 6).
 *
 *   node --env-file=.env.local scripts/volunteer-vorlagen-import.mjs [datei.csv] [--apply]
 *
 * Standarddatei: docs/import/volunteer-planstellen-2026.csv (ohne Personen). Ohne `--apply` wird
 * **nichts geschrieben**; der Lauf zeigt Zahlen je Bereich und die Positionen, deren Bereich nicht
 * eindeutig war (Zuordnung steht in `lib/volunteers/planstellen.mjs`). Ein zweiter Lauf legt nichts
 * doppelt an: gleiche Vorlagen (Bereich, Position, Wochentag, Zeiten) werden übersprungen.
 *
 * Die Vorlagen entstehen ohne Veranstaltungstag, nur mit Wochentag; das Team wendet sie danach unter
 * /admin/volunteers/vorlagen auf die Tage 2027 an. Der Weg geht über den Admin-Client an
 * `upsert_shift_template` vorbei (kein Login im Skriptlauf); die Tabelle hat dieselben Prüfsätze.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { url as supabaseUrl, secretKey, requireEnv } from "./supabase-env.mjs";
import { leseCsv, vorlagenAus } from "../lib/volunteers/planstellen.mjs";

requireEnv(true);

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const datei = args.find((a) => !a.startsWith("--")) ?? "docs/import/volunteer-planstellen-2026.csv";

const { vorlagen, unsicher } = vorlagenAus(leseCsv(readFileSync(datei, "utf8")));
console.log(`${vorlagen.length} Vorlagen aus ${datei}, ${apply ? "SCHREIBEND" : "Trockenlauf"}\n`);

const proBereich = new Map();
for (const v of vorlagen) proBereich.set(v.area, (proBereich.get(v.area) ?? 0) + 1);
for (const [bereich, n] of [...proBereich].sort()) console.log(`  ${bereich.padEnd(20)} ${n}`);
if (unsicher.length) {
  console.log(`\nBereich nicht eindeutig (→ event_operations), bitte prüfen:\n  ${unsicher.join("\n  ")}`);
}

const admin = createClient(supabaseUrl, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: edition, error: edErr } = await admin
  .from("event")
  .select("id")
  .eq("is_edition", true)
  .eq("slug", "fls27")
  .maybeSingle();
if (edErr || !edition) throw edErr ?? new Error("Edition fls27 nicht gefunden");

const { data: vorhanden, error: lErr } = await admin
  .from("shift_template")
  .select("area, position, weekday, start_time, end_time")
  .eq("edition_id", edition.id);
if (lErr?.code === "PGRST205" && !apply) {
  console.log("\nTabelle shift_template ist noch nicht live — Trockenlauf ohne Abgleich mit vorhandenen Vorlagen.");
  process.exit(0);
}
if (lErr) throw lErr;
const bekannt = new Set(
  (vorhanden ?? []).map((v) => [v.area, v.position, v.weekday, v.start_time.slice(0, 5), v.end_time.slice(0, 5)].join("|")),
);
const neu = vorlagen.filter((v) => !bekannt.has([v.area, v.position, v.weekday, v.start_time, v.end_time].join("|")));
console.log(`\n${neu.length} neu, ${vorlagen.length - neu.length} schon vorhanden`);

if (apply && neu.length) {
  for (let i = 0; i < neu.length; i += 200) {
    const rows = neu.slice(i, i + 200).map((v, k) => ({ ...v, edition_id: edition.id, sort_order: i + k }));
    const { error } = await admin.from("shift_template").insert(rows);
    if (error) throw error;
  }
  console.log("geschrieben.");
} else if (!apply) {
  console.log("\nNichts geschrieben (ohne --apply).");
}
