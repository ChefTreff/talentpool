"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/Table";
import { useToast } from "@/components/ui/Toast";
import { saveAllocation, syncAllocation } from "../actions";
import { ALLOCATION_STATUS, type AdminAllocation } from "../types";

type Strings = Record<string, string>;

const TONE: Record<string, BadgeTone> = {
  active: "success",
  pending_vivenu: "accent",
  error: "error",
  disabled: "neutral",
};

export function AllocationTable({
  rows,
  passTypes,
  dateLocale,
  t,
  common,
  rpcMessages,
}: {
  rows: AdminAllocation[];
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
    <Table>
      <Thead>
        <Th>{t.colOrg}</Th>
        <Th>{t.colPassType}</Th>
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
                <div className="flex items-center gap-2">
                  <Input
                    aria-label={t.colQuantity}
                    type="number"
                    min={0}
                    className="w-20"
                    value={d.quantity}
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
  );
}
