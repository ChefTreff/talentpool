/**
 * Wissensbasis aus den Quelldateien in `content/wiki` nach `kb_article` bringen.
 *
 *   node --env-file=.env.local scripts/wiki-import.mjs [--ordner content/wiki] [--apply]
 *
 * Ohne `--apply` wird **nichts geschrieben** — der Lauf zeigt nur, was er täte.
 * Ein zweiter Lauf aktualisiert denselben Slug, statt zu doppeln.
 *
 * Warum Quelldateien und kein Notion-Export mehr (ADM-008, 01.10.2026):
 * Die Artikel aus dem Wiki 2026 liessen sich nicht mechanisch übernehmen. Sie
 * tragen Fristen, Preise, Dienstleisterkontakte und Dateilinks des Vorjahres;
 * ein Skript, das Jahreszahlen ersetzt, hätte daraus Artikel gemacht, die
 * falsche Angaben als Tatsache behaupten. Jede Datei unter `content/wiki` ist
 * deshalb redaktionell geprüft, trägt ihre Notion-Herkunft im Kopf und nennt
 * unter `pruefen`, was für 2027 noch offen ist. Der Import schreibt diese
 * offenen Punkte **sichtbar** in den Artikel.
 *
 * Der Weg geht bewusst über den Admin-Client an `upsert_kb_article` vorbei:
 * das RPC verlangt eine angemeldete Person mit Bereichsleitung, und ein
 * Importlauf hat keine. Die Pflichtkategorie hängt deshalb nicht an diesem
 * Skript, sondern am Prüfsatz der Tabelle (`kb_article_audience_nicht_leer`).
 */
import { createClient } from "@supabase/supabase-js";
import { url as supabaseUrl, secretKey, requireEnv } from "./supabase-env.mjs";
import { leseQuellen } from "./wiki-quelle.mjs";

requireEnv(true);

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const ordner = args.includes("--ordner") ? args[args.indexOf("--ordner") + 1] : "content/wiki";

const admin = createClient(supabaseUrl, secretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const artikel = leseQuellen(ordner);
console.log(`${artikel.length} Quelldateien aus ${ordner}, ${apply ? "SCHREIBEND" : "Trockenlauf"}\n`);

let neu = 0;
let aktualisiert = 0;
let unveraendert = 0;
const offenGesamt = [];

for (const a of artikel) {
  const { data: vorhanden, error: leseFehler } = await admin
    .from("kb_article")
    .select("id, title, body_md, audience, phase, status")
    .eq("slug", a.slug)
    .eq("language", "de")
    .is("edition_id", null)
    .maybeSingle();
  if (leseFehler) throw leseFehler;

  const gleich =
    vorhanden &&
    vorhanden.title === a.titel &&
    vorhanden.body_md === a.koerper &&
    vorhanden.phase === a.phase &&
    vorhanden.status === a.status &&
    [...vorhanden.audience].sort().join(",") === [...a.zielgruppe].sort().join(",");

  const was = !vorhanden ? "neu" : gleich ? "unverändert" : "aktualisiert";
  if (was === "neu") neu++;
  else if (was === "aktualisiert") aktualisiert++;
  else unveraendert++;

  console.log(
    `  ${was.padEnd(12)} ${a.slug.padEnd(30)} ${a.zielgruppe.join("/").padEnd(26)} ` +
      `${a.status.padEnd(10)} ${String(a.koerper.length).padStart(5)}z` +
      `${a.pruefen.length ? `  offen: ${a.pruefen.length}` : ""}`,
  );
  for (const p of a.pruefen) offenGesamt.push(`${a.slug}: ${p}`);

  if (!apply || gleich) continue;

  const felder = {
    title: a.titel,
    body_md: a.koerper,
    audience: a.zielgruppe,
    phase: a.phase,
    status: a.status,
    published_at: a.status === "published" ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  };

  if (vorhanden) {
    // `roles` bleibt unangetastet: Rollen-Seiten kommen aus dem Volunteer-Wiki,
    // nicht aus dieser Quelle, und ein Import darf sie nicht leerräumen.
    const { error } = await admin.from("kb_article").update(felder).eq("id", vorhanden.id);
    if (error) throw error;
  } else {
    const { error } = await admin
      .from("kb_article")
      .insert({ slug: a.slug, language: "de", roles: [], sort_order: 0, ...felder });
    if (error) throw error;
  }
}

console.log(`\nneu ${neu} · aktualisiert ${aktualisiert} · unverändert ${unveraendert}`);
console.log(`offene Punkte für Konrad: ${offenGesamt.length}`);
if (!apply) console.log("\nNichts geschrieben. Mit --apply übernehmen.");
