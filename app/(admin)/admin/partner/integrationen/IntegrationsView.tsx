"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { ConfirmDialog } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import {
  reprocessDeal,
  resolveSyncError,
  runSwapcardExhibitors,
  saveEditionHubspot,
  saveEditionSwapcard,
  saveEditionVivenu,
} from "../actions";
import type { AdminEdition, DryRunResult, IngestLogRow } from "../types";

type Strings = Record<string, string>;

const LOG_TONE: Record<string, BadgeTone> = {
  received: "accent",
  processed: "success",
  done: "success",
  error: "error",
  failed: "error",
  ignored: "neutral",
};

export function IntegrationsView({
  editions,
  log,
  dateLocale,
  t,
  common,
  rpcMessages,
}: {
  editions: AdminEdition[];
  log: IngestLogRow[];
  dateLocale: string;
  t: Strings;
  common: { cancel: string; none: string; save: string };
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [edits, setEdits] = useState<Record<string, Partial<AdminEdition>>>({});
  const [swapEdition, setSwapEdition] = useState(editions[0]?.id ?? "");
  const [dry, setDry] = useState<DryRunResult | null>(null);
  const [askLive, setAskLive] = useState(false);
  const [deal, setDeal] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const message = (key: string) => rpcMessages[key] ?? rpcMessages.unknown ?? key;
  const dateTime = new Intl.DateTimeFormat(dateLocale, {
    dateStyle: "short",
    timeStyle: "short",
  });
  const value = (e: AdminEdition, key: keyof AdminEdition) =>
    (edits[e.id]?.[key] as string | null | undefined) ?? e[key] ?? "";
  const patch = (e: AdminEdition, part: Partial<AdminEdition>) =>
    setEdits((all) => ({ ...all, [e.id]: { ...all[e.id], ...part } }));

  function run(action: Promise<{ ok: boolean; key?: string; detail?: string }>, okText: string) {
    startTransition(async () => {
      const res = await action;
      if (!res.ok) {
        toast("error", message(res.key ?? "unknown") + (res.detail ? ` (${res.detail})` : ""));
        return;
      }
      toast("success", okText);
      router.refresh();
    });
  }

  /** Aussteller nach Swapcard. Ohne `dryRun: false` bleibt es bei der Vorschau. */
  function exhibitors(dryRun: boolean) {
    if (!swapEdition) return;
    startTransition(async () => {
      const res = await runSwapcardExhibitors({ editionId: swapEdition, dryRun });
      if (!res.ok) {
        toast("error", message(res.key) + (res.detail ? ` (${res.detail})` : ""));
        return;
      }
      setDry(res.data);
      toast("success", dryRun ? t.dryRunDone : t.liveRunDone);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader title={t.editionsTitle} description={t.editionsLead} />
        <div className="flex flex-col gap-4">
          {editions.map((e) => (
            <div key={e.id} className="rounded-ct-md border p-4">
              <div className="ct-label text-ink">{e.name ?? e.slug ?? e.id}</div>
              <div className="ct-help">{e.slug}</div>

              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <Field label={t.hubspotPipeline} htmlFor={`hp-${e.id}`}>
                  <Input
                    id={`hp-${e.id}`}
                    value={String(value(e, "hubspot_pipeline_id"))}
                    onChange={(ev) => patch(e, { hubspot_pipeline_id: ev.target.value })}
                  />
                </Field>
                <Field label={t.hubspotStage} htmlFor={`hs-${e.id}`}>
                  <Input
                    id={`hs-${e.id}`}
                    value={String(value(e, "hubspot_onboarding_stage_id"))}
                    onChange={(ev) => patch(e, { hubspot_onboarding_stage_id: ev.target.value })}
                  />
                </Field>
                <Field label={t.hubspotDoneStage} htmlFor={`hd-${e.id}`} hint={t.hubspotDoneHint}>
                  <Input
                    id={`hd-${e.id}`}
                    value={String(value(e, "hubspot_done_stage_id"))}
                    onChange={(ev) => patch(e, { hubspot_done_stage_id: ev.target.value })}
                  />
                </Field>
              </div>
              <div className="mt-2">
                <Button
                  size="sm"
                  disabled={pending}
                  onClick={() =>
                    run(
                      saveEditionHubspot(
                        e.id,
                        String(value(e, "hubspot_pipeline_id")),
                        String(value(e, "hubspot_onboarding_stage_id")),
                        String(value(e, "hubspot_done_stage_id")),
                      ),
                      t.saved,
                    )
                  }
                >
                  {t.saveHubspot}
                </Button>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <Field label={t.vivenuEvent} htmlFor={`vi-${e.id}`} hint={t.vivenuHint}>
                  <div className="flex gap-2">
                    <Input
                      id={`vi-${e.id}`}
                      value={String(value(e, "vivenu_event_id"))}
                      onChange={(ev) => patch(e, { vivenu_event_id: ev.target.value })}
                    />
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={pending}
                      onClick={() =>
                        run(saveEditionVivenu(e.id, String(value(e, "vivenu_event_id"))), t.saved)
                      }
                    >
                      {common.save}
                    </Button>
                  </div>
                </Field>
                <Field label={t.swapcardEvent} htmlFor={`sw-${e.id}`} hint={t.swapcardHint}>
                  <div className="flex gap-2">
                    <Input
                      id={`sw-${e.id}`}
                      value={String(value(e, "swapcard_event_id"))}
                      onChange={(ev) => patch(e, { swapcard_event_id: ev.target.value })}
                    />
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={pending}
                      onClick={() =>
                        run(
                          saveEditionSwapcard(e.id, String(value(e, "swapcard_event_id"))),
                          t.saved,
                        )
                      }
                    >
                      {common.save}
                    </Button>
                  </div>
                </Field>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader title={t.exhibitorsTitle} description={t.exhibitorsLead} />
        <div className="flex flex-wrap items-end gap-2">
          <Field label={t.editionLabel} htmlFor="sw-edition">
            <Select
              id="sw-edition"
              className="w-72"
              value={swapEdition}
              options={editions.map((e) => ({ value: e.id, label: e.name ?? e.slug ?? e.id }))}
              onChange={(e) => {
                setSwapEdition(e.target.value);
                setDry(null);
              }}
            />
          </Field>
          <Button variant="secondary" disabled={pending} onClick={() => exhibitors(true)}>
            {t.dryRun}
          </Button>
          <Button disabled={pending || !dry} onClick={() => setAskLive(true)}>
            {t.liveRun}
          </Button>
        </div>
        {!dry && <p className="ct-help mt-2">{t.dryRunFirst}</p>}
        {dry && (
          <div className="mt-3">
            <p className="ct-help">
              {t.rows}: {dry.rows ?? 0} · {t.errors}: {dry.errors ?? 0}
              {dry.skipped && ` · ${t.skipped}: ${dry.skipped}`}
              {dry.job != null && ` · Job ${dry.job}`}
            </p>
            {dry.runs && dry.runs.length > 0 && (
              <ul className="ct-help mt-2 flex flex-col gap-1">
                {dry.runs.map((r, i) => (
                  <li key={`${r.org}-${i}`}>
                    {r.org} · {t[`outcome_${r.outcome}`] ?? r.outcome}
                    {r.detail && ` · ${r.detail}`}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title={t.dealTitle} description={t.dealLead} />
        <div className="flex flex-wrap items-end gap-2">
          <Field label={t.dealId} htmlFor="deal">
            <Input
              id="deal"
              className="w-64"
              value={deal}
              onChange={(e) => setDeal(e.target.value)}
            />
          </Field>
          <Button
            variant="secondary"
            disabled={pending || deal.trim() === ""}
            onClick={() => run(reprocessDeal(deal.trim()), t.dealQueued)}
          >
            {t.dealReprocess}
          </Button>
        </div>
      </Card>

      <Card>
        <CardHeader title={t.logTitle} description={`${t.logLead} · ${log.length}`} />
        {log.length === 0 ? (
          <p className="ct-help">{t.logEmpty}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {log.map((row) => {
              const key = `${row.kind}-${row.id}`;
              return (
                <li key={key} className="rounded-ct-md border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={LOG_TONE[row.status ?? ""] ?? "neutral"}>
                      {t[`logKind_${row.kind}`] ?? row.kind}
                    </Badge>
                    <span className="ct-help">{dateTime.format(new Date(row.happened_at))}</span>
                    {row.external_id && <span className="ct-help">{row.external_id}</span>}
                    {row.resolved && <Badge tone="success">{t.resolved}</Badge>}
                  </div>
                  {row.message && (
                    <p className="mt-1 text-[15px] text-ink">{row.message}</p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-2">
                    {row.payload && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setOpen(open === key ? null : key)}
                      >
                        {open === key ? t.hidePayload : t.showPayload}
                      </Button>
                    )}
                    {row.kind === "sync_error" && !row.resolved && (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={pending}
                        onClick={() => run(resolveSyncError(row.id), t.resolvedDone)}
                      >
                        {t.markResolved}
                      </Button>
                    )}
                    {row.external_id && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={pending}
                        onClick={() => run(reprocessDeal(row.external_id as string), t.dealQueued)}
                      >
                        {t.dealReprocess}
                      </Button>
                    )}
                  </div>
                  {open === key && row.payload && (
                    <pre className="ct-help mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-ct-sm bg-surface-hover p-3">
                      {JSON.stringify(row.payload, null, 2)}
                    </pre>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {askLive && (
        <ConfirmDialog
          title={t.liveRunConfirmTitle}
          body={t.exhibitorsConfirmBody}
          detail={
            dry?.runs && dry.runs.length > 0 ? (
              <ul className="ct-help flex flex-col gap-1">
                {dry.runs.map((r, i) => (
                  <li key={`${r.org}-confirm-${i}`}>
                    {r.org} · {t[`outcome_${r.outcome}`] ?? r.outcome}
                  </li>
                ))}
              </ul>
            ) : undefined
          }
          confirmLabel={t.liveRun}
          cancelLabel={common.cancel}
          pending={pending}
          onConfirm={() => {
            setAskLive(false);
            exhibitors(false);
          }}
          onCancel={() => setAskLive(false)}
        />
      )}
    </div>
  );
}
