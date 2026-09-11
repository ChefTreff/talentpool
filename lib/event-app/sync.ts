import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { EventAppAdapter, ExhibitorRow, ExhibitorUpsert, RemoteExhibitor } from "@/lib/event-app/types";
import { exhibitorChanged, matchRemote, toExhibitorUpsert } from "@/lib/event-app/mapping";

export type SyncSummary = {
  dryRun: boolean;
  rows: number;
  events: number;
  create: number;
  update: number;
  /** Aussteller, den die Community schon kennt (Vorjahr): wird ans Event gehängt und aktualisiert statt verdoppelt. */
  attach: number;
  unchanged: number;
  /** Im Trockenlauf: Eingaben, die Swapcard mit `validateOnly` angenommen hat. */
  validated: number;
  refs: number;
  errors: number;
  skipped?: string;
  runs: { org: string; outcome: string; detail?: string }[];
};

/**
 * Aussteller einer Edition in die Event-App bringen: `event_app_exhibitors()` → Abbildung → bestehende Aussteller des Events und der Community lesen →
 * nur Neues und Geändertes schreiben (`upsertEventExhibitorsV2`), App-ID je Org×Edition in `external_ref` (`set_event_app_ref`).
 * `dryRun` (Standard in der Admin-Route) rechnet alles durch und lässt Swapcard mit `validateOnly` prüfen — geschrieben wird nichts.
 * Ohne Adapter (kein `SWAPCARD_API_KEY`) endet der Lauf als `skipped`. Logos werden noch nicht übertragen (privater Bucket, Rasterformat nötig; Runbook).
 */
export async function syncExhibitors(opts: {
  admin: SupabaseClient;
  adapter: EventAppAdapter | null;
  editionId?: string | null;
  dryRun: boolean;
  jobId: number | null;
  orgId?: string | null;
}): Promise<SyncSummary> {
  const { admin, adapter, dryRun, jobId } = opts;
  const summary: SyncSummary = { dryRun, rows: 0, events: 0, create: 0, update: 0, attach: 0, unchanged: 0, validated: 0, refs: 0, errors: 0, runs: [] };

  const { data, error } = await admin.rpc("event_app_exhibitors", { p_edition_id: opts.editionId ?? null });
  if (error) throw new Error(`event_app_exhibitors: ${error.message}`);
  let rows = (data ?? []) as ExhibitorRow[];
  if (opts.orgId) rows = rows.filter((r) => r.org_id === opts.orgId);
  summary.rows = rows.length;
  if (rows.length === 0) return summary;
  if (!adapter) return { ...summary, skipped: "SWAPCARD_API_KEY fehlt – nichts übertragen" };

  const byEvent = new Map<string, ExhibitorRow[]>();
  for (const r of rows) {
    if (!r.swapcard_event_id) {
      summary.runs.push({ org: r.name, outcome: "skipped", detail: `Edition ${r.edition_slug} ohne swapcard_event_id (set_edition_swapcard)` });
      continue;
    }
    byEvent.set(r.swapcard_event_id, [...(byEvent.get(r.swapcard_event_id) ?? []), r]);
  }

  for (const [eventId, eventRows] of byEvent) {
    summary.events += 1;
    let inEvent: RemoteExhibitor[];
    let inCommunity: RemoteExhibitor[];
    try {
      inEvent = await adapter.listExhibitors(eventId, "event");
      inCommunity = await adapter.listExhibitors(eventId, "community");
    } catch (e) {
      await failAll(admin, eventRows, summary, jobId, e, "exhibitors lesen", dryRun);
      continue;
    }

    const pending: { row: ExhibitorRow; wanted: ExhibitorUpsert; existing?: RemoteExhibitor; kind: "create" | "update" | "attach" }[] = [];
    for (const row of eventRows) {
      const wanted = toExhibitorUpsert(row, { logoUrl: null });
      const existing = matchRemote(inEvent, row);
      if (existing && !exhibitorChanged(existing, wanted)) {
        summary.unchanged += 1;
        summary.runs.push({ org: row.name, outcome: "unchanged", detail: existing.id });
        if (!dryRun && row.swapcard_exhibitor_id !== existing.id) await saveRef(admin, row, existing.id, adapter.system, summary);
        continue;
      }
      let kind: "create" | "update" | "attach" = existing ? "update" : "create";
      if (existing) {
        wanted.existingId = existing.id;
      } else {
        const known = matchRemote(inCommunity, row);
        if (known) {
          wanted.existingId = known.id;
          kind = "attach";
        }
      }
      pending.push({ row, wanted, existing, kind });
      summary[kind] += 1;
      summary.runs.push({ org: row.name, outcome: `${dryRun ? "would_" : ""}${kind}`, detail: wanted.existingId });
    }
    if (pending.length === 0) continue;

    try {
      const outcome = await adapter.upsertExhibitors(eventId, pending.map((p) => p.wanted), { validateOnly: dryRun });
      const byInput = new Map(pending.map((p) => [p.row.org_id, p]));
      for (const err of outcome.errors) {
        const p = byInput.get(err.inputId);
        summary.errors += 1;
        summary.runs.push({ org: p?.row.name ?? err.inputId, outcome: dryRun ? "invalid" : "error", detail: `${err.code} ${err.path.join(".")}: ${err.message}`.slice(0, 300) });
        if (!dryRun && p) await recordError(admin, p.row, jobId, `${err.code} ${err.path.join(".")}: ${err.message}`);
      }
      for (const res of outcome.results) {
        const p = byInput.get(res.inputId);
        if (!p) continue;
        if (dryRun) {
          summary.validated += 1;
          continue;
        }
        if (res.exhibitor.id !== p.row.swapcard_exhibitor_id) await saveRef(admin, p.row, res.exhibitor.id, adapter.system, summary);
      }
    } catch (e) {
      await failAll(admin, pending.map((p) => p.row), summary, jobId, e, "upsert", dryRun);
    }
  }
  return summary;
}

async function saveRef(admin: SupabaseClient, row: ExhibitorRow, externalId: string, system: string, summary: SyncSummary) {
  const { error } = await admin.rpc("set_event_app_ref", {
    p_org_edition_id: row.org_edition_id,
    p_system: system,
    p_external_id: externalId,
    p_meta: { org_id: row.org_id, edition: row.edition_slug, synced_at: new Date().toISOString() },
  });
  if (error) {
    summary.errors += 1;
    summary.runs.push({ org: row.name, outcome: "ref_error", detail: error.message.slice(0, 200) });
    return;
  }
  summary.refs += 1;
}

async function recordError(admin: SupabaseClient, row: ExhibitorRow, jobId: number | null, message: string) {
  await admin.rpc("record_sync_error", {
    p_job_id: jobId,
    p_object_type: "org_edition",
    p_object_id: row.org_edition_id,
    p_message: message.slice(0, 500),
    p_payload: { org_id: row.org_id, edition: row.edition_slug },
  });
}

async function failAll(admin: SupabaseClient, rows: ExhibitorRow[], summary: SyncSummary, jobId: number | null, e: unknown, step: string, dryRun: boolean) {
  const message = e instanceof Error ? e.message : String(e);
  for (const row of rows) {
    summary.errors += 1;
    summary.runs.push({ org: row.name, outcome: "error", detail: `${step}: ${message.slice(0, 200)}` });
    if (!dryRun) await recordError(admin, row, jobId, `${step}: ${message}`);
  }
}
