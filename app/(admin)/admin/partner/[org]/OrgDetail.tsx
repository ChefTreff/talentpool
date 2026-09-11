"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Input, Textarea } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/Table";
import { useToast } from "@/components/ui/Toast";
import {
  grantStageEditor,
  revokeStageEditor,
  saveBooth,
  setOnboardingStatus,
} from "../actions";
import { ONBOARDING_STATUS } from "../types";
import type {
  AdminContact,
  AdminDeal,
  AdminDeliverable,
  OverviewPayload,
  RoleAssignment,
} from "./types";

type Strings = Record<string, string>;

const STATUS_TONE: Record<string, BadgeTone> = {
  none: "neutral",
  invited: "warning",
  filled: "accent",
  call_done: "success",
};

const DELIVERABLE_TONE: Record<string, BadgeTone> = {
  open: "neutral",
  submitted: "accent",
  accepted: "success",
  rejected: "error",
  overdue: "warning",
  not_required: "neutral",
};

export function OrgDetail({
  overview,
  contacts,
  deliverables,
  deals,
  stageRoles,
  isAdmin,
  locale,
  dateLocale,
  t,
  common,
  rpcMessages,
}: {
  overview: OverviewPayload;
  contacts: AdminContact[];
  deliverables: AdminDeliverable[];
  deals: AdminDeal[];
  /** Aktive `standbuehne_editor`-Zuweisungen dieser Organisation, je Person. */
  stageRoles: Record<string, RoleAssignment>;
  isAdmin: boolean;
  locale: string;
  dateLocale: string;
  t: Strings;
  common: { cancel: string; none: string; save: string };
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const orgId = overview.org.id;
  const editionId = overview.edition?.edition_id ?? null;

  const [status, setStatus] = useState(overview.edition?.onboarding_status ?? "none");
  const [booth, setBooth] = useState({
    booth_number: overview.booth?.booth_number ?? "",
    booth_type: overview.booth?.booth_type ?? "",
    segment: overview.booth?.segment ?? "",
    length_m: overview.booth?.length_m == null ? "" : String(overview.booth.length_m),
    width_m: overview.booth?.width_m == null ? "" : String(overview.booth.width_m),
    backdrop_w_mm:
      overview.booth?.backdrop_w_mm == null ? "" : String(overview.booth.backdrop_w_mm),
    backdrop_h_mm:
      overview.booth?.backdrop_h_mm == null ? "" : String(overview.booth.backdrop_h_mm),
    notes: "",
  });

  const message = (key: string) => rpcMessages[key] ?? rpcMessages.unknown ?? key;
  const dateTime = new Intl.DateTimeFormat(dateLocale, {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const label = (d: AdminDeliverable) =>
    (locale === "en" ? d.label_en : d.label_de) ?? d.label_de ?? d.key;

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

  function onBooth() {
    const num = (value: string) => (value.trim() === "" ? null : Number(value.replace(",", ".")));
    run(
      saveBooth(
        orgId,
        {
          booth_number: booth.booth_number.trim() || null,
          booth_type: booth.booth_type.trim() || null,
          segment: booth.segment.trim() || null,
          length_m: num(booth.length_m),
          width_m: num(booth.width_m),
          backdrop_w_mm: num(booth.backdrop_w_mm),
          backdrop_h_mm: num(booth.backdrop_h_mm),
          ...(booth.notes.trim() ? { notes: booth.notes.trim() } : {}),
        },
        editionId,
      ),
      t.saved,
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader
          title={t.statusTitle}
          description={
            overview.edition
              ? `${t.invitedOn} ${
                  overview.edition.invited_at
                    ? dateTime.format(new Date(overview.edition.invited_at))
                    : common.none
                }`
              : t.noEditionBody
          }
        />
        <div className="flex flex-wrap items-end gap-2">
          <Badge tone={STATUS_TONE[status] ?? "neutral"}>{t[`status_${status}`] ?? status}</Badge>
          <Field label={t.colStatus} htmlFor="ob-status">
            <Select
              id="ob-status"
              className="w-48"
              value={status}
              options={ONBOARDING_STATUS.map((s) => ({ value: s, label: t[`status_${s}`] ?? s }))}
              onChange={(e) => setStatus(e.target.value)}
            />
          </Field>
          <Button
            size="sm"
            disabled={pending || !overview.edition}
            onClick={() => run(setOnboardingStatus(orgId, status, editionId), t.saved)}
          >
            {common.save}
          </Button>
        </div>
        <p className="ct-help mt-2">{t.statusHint}</p>

        <dl className="mt-4 grid gap-2 text-[15px] md:grid-cols-3">
          <div>
            <dt className="ct-eyebrow text-muted">{t.colChecklist}</dt>
            <dd className="text-ink">
              {overview.checklist
                ? `${overview.checklist.done}/${overview.checklist.total}` +
                  (overview.checklist.overdue > 0
                    ? ` · ${overview.checklist.overdue} ${t.shortOverdue}`
                    : "")
                : "—"}
            </dd>
          </div>
          <div>
            <dt className="ct-eyebrow text-muted">{t.sessions}</dt>
            <dd className="text-ink">{overview.sessions_count}</dd>
          </div>
          <div>
            <dt className="ct-eyebrow text-muted">{t.stage}</dt>
            <dd className="text-ink">{overview.has_stage ? t.yes : t.no}</dd>
          </div>
        </dl>
      </Card>

      <Card>
        <CardHeader title={t.boothTitle} description={t.boothLead} />
        <div className="grid gap-4 md:grid-cols-4">
          {(
            [
              ["booth_number", t.boothNumber],
              ["booth_type", t.boothType],
              ["segment", t.boothSegment],
              ["length_m", t.boothLength],
              ["width_m", t.boothWidth],
              ["backdrop_w_mm", t.boothBackdropW],
              ["backdrop_h_mm", t.boothBackdropH],
            ] as const
          ).map(([key, text]) => (
            <Field key={key} label={text} htmlFor={`b-${key}`}>
              <Input
                id={`b-${key}`}
                value={booth[key]}
                onChange={(e) => setBooth((b) => ({ ...b, [key]: e.target.value }))}
              />
            </Field>
          ))}
          <Field label={t.boothNotes} htmlFor="b-notes" className="md:col-span-4">
            <Textarea
              id="b-notes"
              rows={2}
              value={booth.notes}
              onChange={(e) => setBooth((b) => ({ ...b, notes: e.target.value }))}
            />
          </Field>
        </div>
        <div className="mt-4">
          <Button disabled={pending || !overview.edition} onClick={onBooth}>
            {common.save}
          </Button>
        </div>
      </Card>

      <Card>
        <CardHeader title={t.contactsTitle} description={`${t.contactsLead} · ${contacts.length}`} />
        <Table>
          <Thead>
            <Th>{t.colName}</Th>
            <Th>{t.colEmail}</Th>
            <Th>{t.colRoles}</Th>
            <Th>{t.colStageEditor}</Th>
          </Thead>
          <Tbody>
            {contacts.map((c) => {
              const primary = (c.roles ?? []).includes("primary_ops");
              const assignment = stageRoles[c.person_id];
              return (
                <Tr key={c.person_id}>
                  <Td>
                    <span className="ct-label text-ink">
                      {[c.first_name, c.last_name].filter(Boolean).join(" ") || common.none}
                    </span>
                    {c.contact_position && <div className="ct-help">{c.contact_position}</div>}
                  </Td>
                  <Td className="text-muted">{c.email ?? common.none}</Td>
                  <Td className="text-muted">
                    {(c.roles ?? []).map((r) => t[`contactRole_${r}`] ?? r).join(", ") || "—"}
                    {!c.has_login && (
                      <div className="ct-help">{t.noLoginYet}</div>
                    )}
                  </Td>
                  <Td>
                    {primary ? (
                      // Der Hauptkontakt bekommt die Rolle mit der Buchung
                      // automatisch (Trigger, Migration 0058) — hier ist
                      // nichts zu vergeben.
                      <span className="ct-help">{t.stageEditorAutomatic}</span>
                    ) : !isAdmin ? (
                      <span className="ct-help">{t.stageEditorAdminOnly}</span>
                    ) : assignment?.active ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={pending}
                        onClick={() => run(revokeStageEditor(assignment.id, orgId), t.saved)}
                      >
                        {t.stageEditorRevoke}
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={pending || !editionId}
                        onClick={() =>
                          run(grantStageEditor(c.person_id, orgId, editionId as string), t.saved)
                        }
                      >
                        {t.stageEditorGrant}
                      </Button>
                    )}
                  </Td>
                </Tr>
              );
            })}
          </Tbody>
        </Table>
      </Card>

      <Card>
        <CardHeader
          title={t.checklistTitle}
          description={`${t.checklistLead} · ${deliverables.length}`}
        />
        <Table>
          <Thead>
            <Th>{t.colDeliverable}</Th>
            <Th>{t.colStatus}</Th>
            <Th>{t.colDue}</Th>
            <Th>{t.colSubmitted}</Th>
          </Thead>
          <Tbody>
            {deliverables.map((d) => (
              <Tr key={d.id}>
                <Td>
                  <span className="ct-label text-ink">{label(d)}</span>
                  <div className="ct-help">
                    {d.key}
                    {!d.required && ` · ${t.optional}`}
                    {d.fulfilled_by_sku && ` · ${t.fulfilledBy} ${d.fulfilled_by_sku}`}
                  </div>
                  {d.review_note && <div className="ct-help text-error-ink">{d.review_note}</div>}
                </Td>
                <Td>
                  <Badge tone={DELIVERABLE_TONE[d.status] ?? "neutral"}>
                    {t[`deliverable_${d.status}`] ?? d.status}
                  </Badge>
                </Td>
                <Td className="text-muted tabular-nums">
                  {d.due_at ? dateTime.format(new Date(d.due_at)) : "—"}
                </Td>
                <Td className="text-muted tabular-nums">
                  {d.submitted_at ? dateTime.format(new Date(d.submitted_at)) : "—"}
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </Card>

      <Card>
        <CardHeader title={t.dealsTitle} description={t.dealsLead} />
        {deals.length === 0 ? (
          <p className="ct-help">{t.dealsEmpty}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {deals.map((d) => (
              <li key={d.hubspot_deal_id} className="rounded-ct-md border p-3">
                <div className="ct-label text-ink">{d.deal_name ?? d.hubspot_deal_id}</div>
                <div className="ct-help">
                  {d.hubspot_deal_id}
                  {d.ingested_at && ` · ${dateTime.format(new Date(d.ingested_at))}`}
                </div>
                {d.line_items && d.line_items.length > 0 && (
                  <ul className="ct-help mt-2 flex flex-col gap-1">
                    {d.line_items.map((line, i) => (
                      <li key={`${d.hubspot_deal_id}-${i}`}>
                        {line.sku ?? "—"} · {line.name ?? ""} · {line.qty ?? ""}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="ct-help mt-3">{t.dealsReprocessHint}</p>
      </Card>

      <Card>
        <CardHeader title={t.bookedTitle} description={t.bookedLead} />
        {overview.products.length === 0 ? (
          <p className="ct-help">{t.bookedEmpty}</p>
        ) : (
          <Table>
            <Thead>
              <Th>{t.colProduct}</Th>
              <Th numeric>{t.colQty}</Th>
              <Th>{t.colStatus}</Th>
            </Thead>
            <Tbody>
              {overview.products.map((p) => (
                <Tr key={p.sku}>
                  <Td>
                    {(locale === "en" ? p.name_en : p.name_de) ?? p.name_de ?? p.sku}
                    <div className="ct-help">{p.sku}</div>
                  </Td>
                  <Td numeric>{p.qty}</Td>
                  <Td className="text-muted">{p.status ?? "—"}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
