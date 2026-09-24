"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/Table";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { setBoothCheck } from "./actions";
import type { BoothItem } from "./types";

type Strings = Record<string, string>;

/**
 * Was ein Partner gebucht hat, Position für Position, abgehakt beim Aufbau.
 *
 * Gruppiert nach Stand, weil der Aufbau so läuft: man steht vor einem Stand
 * und geht die Liste durch. Der Fortschritt steht je Stand in der Überschrift,
 * damit sichtbar ist, wo noch etwas fehlt, ohne jede Zeile zu lesen.
 */
export function BoothChecklist({
  items,
  locale,
  t,
  rpcMessages,
}: {
  items: BoothItem[];
  locale: string;
  t: Strings;
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const message = (key: string) => rpcMessages[key] ?? rpcMessages.unknown ?? key;
  const dateTime = new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" });

  if (items.length === 0) {
    return <EmptyState title={t.emptyBooths} description={t.emptyBoothsBody} />;
  }

  const byOrg = new Map<string, BoothItem[]>();
  for (const i of items) byOrg.set(i.org_edition_id, [...(byOrg.get(i.org_edition_id) ?? []), i]);

  function toggle(item: BoothItem, checked: boolean) {
    startTransition(async () => {
      const res = await setBoothCheck({
        orgEditionId: item.org_edition_id,
        sku: item.product_sku,
        checked,
      });
      if (!res.ok) {
        toast("error", message(res.key ?? "unknown"));
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-8">
      {[...byOrg.values()].map((rows) => {
        const first = rows[0];
        const done = rows.filter((r) => r.checked).length;
        return (
          <section key={first.org_edition_id} className="flex flex-col gap-2">
            <div className="flex flex-wrap items-baseline gap-3">
              <h2 className="ct-h3">{first.org_name}</h2>
              {first.booth_number && <Badge>{first.booth_number}</Badge>}
              <span className="ct-help tabular-nums">
                {t.progress.replace("{done}", String(done)).replace("{total}", String(rows.length))}
              </span>
            </div>
            <Table>
              <Thead>
                <Th>{t.colProduct}</Th>
                <Th>{t.colSupplier}</Th>
                <Th numeric>{t.colQty}</Th>
                <Th>{t.colChecked}</Th>
              </Thead>
              <Tbody>
                {rows.map((r) => (
                  <Tr key={r.product_sku}>
                    <Td>
                      <span className="ct-label">{r.product_name}</span>
                      <div className="ct-help">{r.product_sku}</div>
                    </Td>
                    <Td className="text-muted">{r.supplier ?? "—"}</Td>
                    <Td numeric className="tabular-nums">{r.qty}</Td>
                    <Td>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          className="h-5 w-5"
                          checked={r.checked}
                          disabled={pending}
                          onChange={(e) => toggle(r, e.target.checked)}
                        />
                        <span className="ct-help">
                          {r.checked && r.checked_at
                            ? t.checkedBy
                                .replace("{name}", r.checked_by_name ?? "—")
                                .replace("{time}", dateTime.format(new Date(r.checked_at)))
                            : t.colChecked}
                        </span>
                      </label>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </section>
        );
      })}
    </div>
  );
}
