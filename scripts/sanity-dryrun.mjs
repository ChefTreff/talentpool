// Trockenlauf der Sanity-Veröffentlichung (Welle 3 A11, Kontrakt v2) von der Kommandozeile — ohne Portal-Login, mit denselben
// Bausteinen wie die Admin-Route `POST /api/admin/sanity/partner-logos` (lib/sanity/publish.ts). Schreibt nichts nach Sanity
// (`dryRun=true` der API), gibt den Token nie aus, protokolliert den Lauf wie die Route in `integration.sync_job`.
//
// Aufruf (Flags in dieser Reihenfolge, damit Node die TypeScript-Dateien der App lädt):
//   node --env-file=.env.local --conditions=react-server --experimental-transform-types --no-warnings=ExperimentalWarning \
//        --import ./tests/register-alias.mjs scripts/sanity-dryrun.mjs [--edition fls27] [--org <uuid>] [--beispiel] [--json <datei>]
//
//   --edition  Slug der Edition (Standard: alle Editionen mit Swapcard-ID, wie der Export)
//   --org      nur diese Organisation
//   --beispiel zusätzlich ein Musterdokument (fester Beispiel-Org, ohne Datenbank) durch Sanitys Prüfung schicken —
//              auch dann sinnvoll, wenn noch kein Logo freigegeben ist (zeigt dem Web-Team das Dokument, das kommen wird)
//   --json     Zusammenfassung zusätzlich als JSON-Datei schreiben (Prüfergebnis für das Web-Team)
//
// Braucht in .env.local: SANITY_PROJECT_ID, SANITY_DATASET, SANITY_API_TOKEN (Viewer reicht) und SUPABASE_SECRET_KEY.
// `--conditions=react-server` lässt `import "server-only"` ins Leere laufen (Marker-Paket, sonst wirft es außerhalb von Next).
import { writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { sanityConfig, sanityMutate, sanityQuery, SanityError } from "@/lib/sanity/client";
import { partnerLogoDocument, PARTNER_LOGO_TYPE } from "@/lib/sanity/mapping";
import { publishPartnerLogos } from "@/lib/sanity/publish";

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const editionSlug = flag("--edition");
const orgId = flag("--org");
const jsonPath = flag("--json");
const withSample = args.includes("--beispiel");

const cfg = sanityConfig();
if (!cfg) {
  console.error("SANITY_PROJECT_ID/SANITY_API_TOKEN fehlen in .env.local — `sh scripts/env-set.sh SANITY_API_TOKEN` (docs/zugangs-liste.md).");
  process.exit(1);
}
console.log(`Sanity-Projekt ${cfg.projectId}, Dataset ${cfg.dataset}, Token gesetzt (${cfg.token.length} Zeichen, wird nicht ausgegeben).`);

const report = { at: new Date().toISOString(), projectId: cfg.projectId, dataset: cfg.dataset, read: null, sample: null, publish: null };

// 1) Lesen: beweist Token und Dataset. Zählt nur unseren Typ — fremde Inhalte der Website fassen wir nicht an.
try {
  const count = await sanityQuery("count(*[_type == $t])", { t: PARTNER_LOGO_TYPE });
  const drafts = await sanityQuery('count(*[_type == $t && _id in path("drafts.**")])', { t: PARTNER_LOGO_TYPE });
  report.read = { ok: true, ourDocuments: count, ourDrafts: drafts };
  console.log(`Lesen ok — ${count} Dokument(e) vom Typ ${PARTNER_LOGO_TYPE} im Dataset, davon ${drafts} als Entwurf (soll 0 bleiben).`);
} catch (e) {
  report.read = { ok: false, error: String(e instanceof Error ? e.message : e).slice(0, 300) };
  console.error(`Lesen fehlgeschlagen: ${report.read.error}`);
}

// 2) Musterdokument: dieselbe Abbildung wie der Echtlauf, feste Beispiel-Org, Sanity prüft mit dryRun=true.
if (withSample) {
  const sample = partnerLogoDocument(
    {
      org_id: "00000000-0000-4000-8000-000000000001", org_edition_id: "00000000-0000-4000-8000-000000000002", edition_slug: editionSlug ?? "fls27",
      name: "Beispiel Partner GmbH", website: "https://example.org", sponsoring_level: "Premium", sponsoring_key: "premium", sponsoring_rank: 40,
      partner_category: "talent", logo_svg_path: "fls27/beispiel/logo_vector/beispiel.svg", logo_png_path: null, logo_png_asset_id: null,
    },
    { transparent: true, now: new Date() },
  );
  console.log("Musterdokument:\n" + JSON.stringify(sample, null, 2));
  try {
    const res = await sanityMutate([{ createOrReplace: sample }], { dryRun: true });
    report.sample = { ok: true, document: sample, result: res.results?.map((r) => r.operation) ?? [] };
    console.log(`Sanity-Prüfung des Musterdokuments: ok (${report.sample.result.join(", ") || "keine Operationen gemeldet"}) — nichts geschrieben.`);
  } catch (e) {
    const status = e instanceof SanityError ? e.status : null;
    report.sample = { ok: false, status, document: sample, error: String(e instanceof Error ? e.message : e).slice(0, 300) };
    console.log(
      status === 403 || status === 401
        ? `Sanity-Prüfung des Musterdokuments: ${status} — das Token darf nicht schreiben (Viewer). Erwartet, solange das Web-Team kein Editor-Token gibt; die Struktur prüfen unsere Tests.`
        : `Sanity-Prüfung des Musterdokuments fehlgeschlagen: ${report.sample.error}`,
    );
  }
}

// 3) Echte Zeilen: Trockenlauf über lib/sanity/publish.ts, protokolliert in integration.sync_job (system sanity, job_type partner_logos_preview).
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
if (!url || !/^(sb_secret_[A-Za-z0-9_-]{16,}|eyJ[A-Za-z0-9_.-]{32,})$/.test(secret)) {
  console.error("SUPABASE_SECRET_KEY fehlt oder ist ein Platzhalter — Trockenlauf über die Datenbank übersprungen.");
} else {
  const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  let editionId = null;
  if (editionSlug) {
    const { data: ed, error } = await admin.from("event").select("id").eq("slug", editionSlug).eq("is_edition", true).maybeSingle();
    if (error || !ed) {
      console.error(`Edition ${editionSlug} nicht gefunden${error ? `: ${error.message}` : ""}.`);
      process.exit(1);
    }
    editionId = ed.id;
  }
  const { data: jobId } = await admin.rpc("start_sync_job", { p_system: "sanity", p_direction: "out", p_job_type: "partner_logos_preview", p_triggered_by: "script" });
  const job = jobId ?? null;
  try {
    const summary = await publishPartnerLogos({ admin, editionId, dryRun: true, jobId: job, orgId: orgId ?? null });
    if (job) await admin.rpc("finish_sync_job", { p_id: job, p_status: summary.errors > 0 ? "partial" : "ok", p_stats: { ...summary, runs: undefined }, p_error: summary.skipped ?? null });
    report.publish = { job, ...summary };
    const { runs, ...counts } = summary;
    console.log(`Trockenlauf (Job ${job ?? "-"}): ${JSON.stringify(counts)}`);
    for (const r of runs) console.log(`  ${r.outcome.padEnd(13)} ${r.org}${r.detail ? ` — ${r.detail}` : ""}${r.raster ? " · enthält Rasterbild" : ""}`);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (job) await admin.rpc("finish_sync_job", { p_id: job, p_status: "failed", p_stats: {}, p_error: message.slice(0, 500) });
    report.publish = { job, error: message.slice(0, 300) };
    console.error(`Trockenlauf fehlgeschlagen: ${message}`);
  }
}

if (jsonPath) {
  await writeFile(jsonPath, JSON.stringify(report, null, 2));
  console.log(`Prüfergebnis geschrieben: ${jsonPath}`);
}
