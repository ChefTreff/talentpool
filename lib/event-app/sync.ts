import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { EventAppAdapter, ExhibitorRow, ExhibitorUpsert, RemoteExhibitor } from "@/lib/event-app/types";
import { chunks, exhibitorChanged, matchRemote, toExhibitorUpsert } from "@/lib/event-app/mapping";

export type SyncSummary = {
  dryRun: boolean;
  rows: number;
  events: number;
  create: number;
  update: number;
  unchanged: number;
  refs: number;
  errors: number;
  skipped?: string;
  runs: { org: string; outcome: string; detail?: string }[];
};

/**
 * Aussteller einer Edition in die Event-App bringen: `event_app_exhibitors()` → Abbildung → bestehende Aussteller je Event lesen → nur Neues und
 * Geändertes schreiben → App-ID je Org×Edition in `external_ref` (`set_event_app_ref`). `dryRun` (Standard in der Admin-Route) rechnet alles durch und
 * schreibt nichts nach Swapcard. Ohne Adapter (kein `SWAPCARD_API_KEY`) endet der Lauf als `skipped`. Logos werden noch nicht übertragen: der Bucket
 * `partner-assets` ist privat und Swapcard braucht eine öffentlich abrufbare Bilddatei (Rasterformat) — offener Punkt im Runbook.
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
  const summary: SyncSummary = { dryRun, rows: 0, events: 0, create: 0, update: 0, unchanged: 0, refs: 0, errors: 0, runs: [] };

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
    let remotes: RemoteExhibitor[];
    try {
      remotes = await adapter.listExhibitors(eventId);
    } catch (e) {
      await failAll(admin, eventRows, summary, jobId, e, "exhibitors lesen");
      continue;
    }

    const pending: { row: ExhibitorRow; wanted: ExhibitorUpsert; existing?: RemoteExhibitor }[] = [];
    for (const row of eventRows) {
      const wanted = toExhibitorUpsert(row, { locale: "de", logoUrl: null });
      const existing = matchRemote(remotes, row);
      if (existing && !exhibitorChanged(existing, wanted)) {
        summary.unchanged += 1;
        summary.runs.push({ org: row.name, outcome: "unchanged", detail: existing.id });
        if (!dryRun && row.swapcard_exhibitor_id !== existing.id) await saveRef(admin, row, existing.id, adapter.system, summary);
        continue;
      }
      pending.push({ row, wanted, existing });
      if (existing) summary.update += 1;
      else summary.create += 1;
      summary.runs.push({ org: row.name, outcome: `${dryRun ? "would_" : ""}${existing ? "update" : "create"}`, detail: existing?.id });
    }
    if (dryRun) continue;

    for (const part of chunks(pending, 25)) {
      try {
        const result = await adapter.upsertExhibitors(eventId, part.map((p) => p.wanted));
        for (const p of part) {
          const remote =
            result.find((r) => (r.clientIds ?? []).includes(p.row.org_id)) ??
            result.find((r) => r.name.trim().toLowerCase() === p.wanted.name.toLowerCase()) ??
            p.existing;
          if (remote && remote.id !== p.row.swapcard_exhibitor_id) await saveRef(admin, p.row, remote.id, adapter.system, summary);
        }
      } catch (e) {
        await failAll(admin, part.map((p) => p.row), summary, jobId, e, "upsert");
      }
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

async function failAll(admin: SupabaseClient, rows: ExhibitorRow[], summary: SyncSummary, jobId: number | null, e: unknown, step: string) {
  const message = e instanceof Error ? e.message : String(e);
  for (const row of rows) {
    summary.errors += 1;
    summary.runs.push({ org: row.name, outcome: "error", detail: `${step}: ${message.slice(0, 200)}` });
    await admin.rpc("record_sync_error", {
      p_job_id: jobId,
      p_object_type: "org_edition",
      p_object_id: row.org_edition_id,
      p_message: `${step}: ${message}`.slice(0, 500),
      p_payload: { org_id: row.org_id, edition: row.edition_slug },
    });
  }
}
