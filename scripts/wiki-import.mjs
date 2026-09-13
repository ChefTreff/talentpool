/**
 * Volunteer-Wiki aus dem Notion-Export in `kb_article` übernehmen.
 *
 *   node --env-file=.env.local scripts/wiki-import.mjs <ordner> [--apply] [--zielgruppe volunteer]
 *
 * Erwartet den **Markdown-Export** von Notion (Export → Markdown & CSV,
 * entpackt). Jede `.md`-Datei wird ein Artikel:
 *
 * - **Slug** aus dem Dateinamen ohne Notions Id-Anhang
 *   (`Einlass 2c017aa69eee80… .md` ⇒ `einlass`).
 * - **Titel** aus der ersten `# `-Zeile, sonst aus dem Dateinamen.
 * - **Rollen** aus einer Zeile `Rolle: Einlass, Garderobe` im Kopf, sonst leer
 *   („gilt für alle"). Die Rollen-Seiten sind der Grund für `kb_article.roles`.
 * - **Phase** aus `Phase: aufbau`, sonst `evergreen`.
 * - Notion-interne Links (`[Text](Seite%20abc123.md)`) werden zu einfachem
 *   Text: sie zeigen auf Dateien, die es im Portal nicht gibt. Lieber ein Wort
 *   ohne Link als ein Link ins Leere.
 *
 * Ohne `--apply` wird **nichts geschrieben** — das Skript zeigt, was es täte.
 * Artikel kommen als Entwurf (`status = draft`) an; veröffentlicht wird im
 * Editor, nachdem jemand daraufgeschaut hat. Ein zweiter Lauf aktualisiert
 * denselben Slug, statt zu doppeln.
 */
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { url as supabaseUrl, secretKey, requireEnv } from "./supabase-env.mjs";

requireEnv(true);

const args = process.argv.slice(2);
const dir = args.find((a) => !a.startsWith("--"));
const apply = args.includes("--apply");
const audience = args[args.indexOf("--zielgruppe") + 1] ?? "volunteer";

if (!dir) {
  console.error("Aufruf: node --env-file=.env.local scripts/wiki-import.mjs <ordner> [--apply]");
  process.exit(2);
}

const admin = createClient(supabaseUrl, secretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** Notion hängt an jeden Namen eine 32-stellige Id — die gehört nicht in den Slug. */
function slugOf(file) {
  return path
    .basename(file, ".md")
    .replace(/\s+[0-9a-f]{32}$/i, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function parse(file) {
  const raw = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
  const lines = raw.split("\n");

  let title = null;
  const roles = [];
  let phase = "evergreen";
  const body = [];

  for (const line of lines) {
    if (title === null) {
      const h1 = /^#\s+(.*)$/.exec(line);
      if (h1) { title = h1[1].trim(); continue; }
    }
    const rolle = /^\s*Rolle[n]?\s*:\s*(.+)$/i.exec(line);
    if (rolle) {
      roles.push(...rolle[1].split(/[,;]/).map((r) => r.trim().toLowerCase()).filter(Boolean));
      continue;
    }
    const ph = /^\s*Phase\s*:\s*(.+)$/i.exec(line);
    if (ph) { phase = ph[1].trim().toLowerCase(); continue; }
    body.push(line);
  }

  const text = body
    .join("\n")
    // Notion-interne Links auf .md-Dateien: Text behalten, Ziel wegwerfen.
    .replace(/\[([^\]]+)\]\((?!https?:)[^)]*\.md[^)]*\)/gi, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return {
    slug: slugOf(file),
    title: title ?? path.basename(file, ".md").replace(/\s+[0-9a-f]{32}$/i, ""),
    body_md: text,
    roles: [...new Set(roles)],
    phase,
  };
}

const files = fs
  .readdirSync(dir, { recursive: true })
  .filter((f) => typeof f === "string" && f.endsWith(".md"))
  .map((f) => path.join(dir, f));

if (files.length === 0) {
  console.error(`Keine .md-Dateien unter ${dir}.`);
  process.exit(1);
}

console.log(`${files.length} Dateien, Zielgruppe ${audience}, ${apply ? "SCHREIBEND" : "Trockenlauf"}\n`);

const seen = new Map();
let neu = 0;
let aktualisiert = 0;
let uebersprungen = 0;

for (const file of files) {
  const a = parse(file);
  if (!a.slug) { console.log(`  übersprungen (kein Slug): ${file}`); uebersprungen++; continue; }
  if (seen.has(a.slug)) {
    console.log(`  übersprungen (Slug doppelt: ${a.slug}): ${file}`);
    uebersprungen++;
    continue;
  }
  seen.set(a.slug, file);

  const { data: vorhanden } = await admin
    .from("kb_article")
    .select("id, status")
    .eq("slug", a.slug)
    .is("edition_id", null)
    .eq("language", "de")
    .maybeSingle();

  const was = vorhanden ? "aktualisiert" : "neu";
  if (was === "neu") neu++; else aktualisiert++;
  console.log(
    `  ${was.padEnd(12)} ${a.slug.padEnd(32)} ${JSON.stringify(a.title).slice(0, 40)}` +
      `${a.roles.length ? ` Rollen=${a.roles.join("/")}` : ""}` +
      `${a.phase !== "evergreen" ? ` Phase=${a.phase}` : ""} ${a.body_md.length} Zeichen`,
  );

  if (!apply) continue;

  if (vorhanden) {
    const { error } = await admin
      .from("kb_article")
      .update({ title: a.title, body_md: a.body_md, roles: a.roles, phase: a.phase, updated_at: new Date().toISOString() })
      .eq("id", vorhanden.id);
    if (error) throw error;
  } else {
    const { error } = await admin.from("kb_article").insert({
      slug: a.slug,
      language: "de",
      audience: [audience],
      roles: a.roles,
      phase: a.phase,
      title: a.title,
      body_md: a.body_md,
      // Entwurf: veröffentlicht wird erst, wenn jemand daraufgeschaut hat.
      status: "draft",
    });
    if (error) throw error;
  }
}

console.log(`\nneu ${neu} · aktualisiert ${aktualisiert} · übersprungen ${uebersprungen}`);
if (!apply) console.log("Nichts geschrieben. Mit --apply übernehmen.");
else console.log("Alle Artikel liegen als Entwurf in /admin/wiki — dort prüfen und veröffentlichen.");
