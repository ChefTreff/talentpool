"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/Table";
import { useToast } from "@/components/ui/Toast";
import { saveAllocation, saveAllocationDiscount, syncAllocation } from "../actions";
import { ALLOCATION_STATUS, type AdminAllocation, type OrgEditionOption } from "../types";

type Strings = Record<string, string>;

const TONE: Record<string, BadgeTone> = {
  active: "success",
  pending_vivenu: "accent",
  error: "error",
  disabled: "neutral",
};

export function AllocationTable({
  rows,
  orgs,
  passTypes,
  dateLocale,
  t,
  common,
  rpcMessages,
}: {
  rows: AdminAllocation[];
  /** Teilnahmen der Edition — das Formular braucht die `org_edition_id`. */
  orgs: OrgEditionOption[];
  passTypes: Record<string, string>;
  dateLocale: string;
  t: Strings;
  common: { none: string; save: string };
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [edits, setEdits] = useState<Record<string, { quantity: string; code: string; url: string; status: string; notes: string }>>({});
  const [neu, setNeu] = useState({ orgEditionId: "", passType: "", quantity: "" });

  const message = (key: string) => rpcMessages[key] ?? rpcMessages.unknown ?? key;
  const dateTime = new Intl.DateTimeFormat(dateLocale, { dateStyle: "short", timeStyle: "short" });
  const draft = (a: AdminAllocation) =>
    edits[a.id] ?? {
      quantity: String(a.quantity),
      code: a.coupon_code ?? "",
      url: a.undershop_url ?? "",
      status: a.status,
      notes: a.notes ?? "",
    };
  const patch = (a: AdminAllocation, part: Partial<ReturnType<typeof draft>>) =>
    setEdits((e) => ({ ...e, [a.id]: { ...draft(a), ...part } }));

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

  /**
   * Ein Rabattkontingent von Hand. Nur 50 % — die 100er-Zeile leitet der
   * Abgleich aus den gebuchten Produkten ab, und die RPC weist sie ab.
   */
  function onNew() {
    const quantity = Number(neu.quantity);
    if (!neu.orgEditionId || !neu.passType) {
      toast("error", message("fields_required"));
      return;
    }
    if (!Number.isInteger(quantity) || quantity < 0) {
      toast("error", message("invalid_quantity"));
      return;
    }
    startTransition(async () => {
      const res = await saveAllocationDiscount({
        orgEditionId: neu.orgEditionId,
        passType: neu.passType,
        discountPercent: 50,
        quantity,
      });
      if (!res.ok) {
        toast("error", message(res.key) + (res.detail ? ` (${res.detail})` : ""));
        return;
      }
      setNeu({ orgEditionId: "", passType: "", quantity: "" });
      toast("success", t.saved);
      router.refresh();
    });
  }

  function onSave(a: AdminAllocation) {
    const d = draft(a);
    const quantity = Number(d.quantity);
    if (!Number.isInteger(quantity) || quantity < 0) {
      toast("error", message("invalid_quantity"));
      return;
    }
    run(
      saveAllocation({
        id: a.id,
        quantity,
        couponCode: d.code.trim() || null,
        undershopUrl: d.url.trim() || null,
        status: d.status,
        notes: d.notes.trim() || null,
      }),
      t.saved,
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader title={t.discountTitle} description={t.discountLead} />
        <div className="flex flex-wrap items-end gap-3">
          <Field label={t.colOrg} htmlFor="d-org">
            <Select
              id="d-org"
              className="w-72"
              value={neu.orgEditionId}
              placeholder={common.none}
              options={orgs.map((o) => ({ value: o.org_edition_id, label: o.org_name ?? o.org_id }))}
              onChange={(e) => setNeu((n) => ({ ...n, orgEditionId: e.target.value }))}
            />
          </Field>
          <Field label={t.colPassType} htmlFor="d-pass">
            <Select
              id="d-pass"
              className="w-48"
              value={neu.passType}
              placeholder={common.none}
              options={Object.entries(passTypes).map(([value, label]) => ({ value, label }))}
              onChange={(e) => setNeu((n) => ({ ...n, passType: e.target.value }))}
            />
          </Field>
          <Field label={t.colQuantity} htmlFor="d-qty" hint={t.discountZeroHint}>
            <Input
              id="d-qty"
              type="number"
              min={0}
              className="w-24"
              value={neu.quantity}
              onChange={(e) => setNeu((n) => ({ ...n, quantity: e.target.value }))}
            />
          </Field>
          <Button disabled={pending} onClick={onNew}>
            {t.discountAdd}
          </Button>
        </div>
      </Card>

    <Table>
      <Thead>
        <Th>{t.colOrg}</Th>
        <Th>{t.colPassType}</Th>
        <Th>{t.colDiscount}</Th>
        <Th>{t.colQuantity}</Th>
        <Th>{t.colCode}</Th>
        <Th>{t.colStatus}</Th>
        <Th aria-label={t.colAction} />
      </Thead>
      <Tbody>
        {rows.map((a) => {
          const d = draft(a);
          return (
            <Tr key={a.id}>
              <Td>
                <span className="ct-label text-ink">{a.org_name ?? common.none}</span>
                {a.synced_at && (
                  <div className="ct-help">
                    {t.syncedAt} {dateTime.format(new Date(a.synced_at))}
                  </div>
                )}
                {a.last_error && <div className="ct-help text-error-ink">{a.last_error}</div>}
              </Td>
              <Td className="text-muted">{passTypes[a.pass_type] ?? a.pass_type}</Td>
              <Td>
                <Badge tone={a.discount_percent === 100 ? "neutral" : "accent"}>
                  {a.discount_percent} %
                </Badge>
                <div className="ct-help">
                  {a.discount_percent === 100 ? t.discountDerived : t.discountManual}
                </div>
              </Td>
              <Td>
                <div className="flex items-center gap-2">
                  <Input
                    aria-label={t.colQuantity}
                    type="number"
                    min={0}
                    className="w-20"
                    value={d.quantity}
                    /* Die Menge der 100er-Zeile gehört der Ableitung (0123/0137):
                       die RPC weist sie ab, und das Feld sagt es vorher. */
                    disabled={a.discount_percent === 100}
                    onChange={(e) => patch(a, { quantity: e.target.value })}
                  />
                  <span className="ct-help tabular-nums">
                    {t.used}: {a.used_count}
                  </span>
                </div>
              </Td>
              <Td>
                <Input
                  aria-label={t.colCode}
                  className="w-48"
                  value={d.code}
                  onChange={(e) => patch(a, { code: e.target.value })}
                />
                <Input
                  aria-label={t.colShopUrl}
                  className="mt-1 w-48"
                  placeholder={t.colShopUrl}
                  value={d.url}
                  onChange={(e) => patch(a, { url: e.target.value })}
                />
              </Td>
              <Td>
                <Select
                  aria-label={t.colStatus}
                  className="w-40"
                  value={d.status}
                  options={ALLOCATION_STATUS.map((s) => ({
                    value: s,
                    label: t[`alloc_${s}`] ?? s,
                  }))}
                  onChange={(e) => patch(a, { status: e.target.value })}
                />
                <div className="mt-1">
                  <Badge tone={TONE[a.status] ?? "neutral"}>
                    {t[`alloc_${a.status}`] ?? a.status}
                  </Badge>
                </div>
              </Td>
              <Td>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" disabled={pending} onClick={() => onSave(a)}>
                    {common.save}
                  </Button>
                  {/* Ruft die Cron-Route serverseitig mit dem Secret auf. */}
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={pending}
                    onClick={() => run(syncAllocation(a.id), t.syncStarted)}
                  >
                    {t.syncNow}
                  </Button>
                </div>
              </Td>
            </Tr>
          );
        })}
      </Tbody>
    </Table>
    </div>
  );
}
