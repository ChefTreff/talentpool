"use client";

import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/Table";
import { EmptyState } from "@/components/ui/EmptyState";
import type { VolunteerTicketRow } from "./types";

type Strings = Record<string, string>;

const TONE: Record<string, BadgeTone> = {
  none: "neutral",
  pending: "accent",
  issued: "warning",
  redeemed: "success",
  error: "error",
  revoked: "neutral",
};

/**
 * Offene Fälle stehen oben — die Reihenfolge kommt aus der RPC, die Tabelle
 * ordnet nicht um. Sie ist eine Arbeitsliste, keine Statistik.
 */
export function TicketTable({
  rows,
  locale,
  t,
}: {
  rows: VolunteerTicketRow[];
  locale: string;
  t: Strings;
}) {
  if (rows.length === 0) {
    return <EmptyState title={t.emptyTickets} description={t.emptyTicketsBody} />;
  }
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "short" });
  const open = rows.filter((r) => r.coupon_status !== "redeemed" && r.coupon_status !== "revoked").length;
  const label = (status: string) =>
    t[`coupon${status[0].toUpperCase()}${status.slice(1)}`] ?? status;

  return (
    <div className="flex flex-col gap-3">
      <p className="ct-help tabular-nums">{t.openCount.replace("{n}", String(open))}</p>
      <Table>
        <Thead>
          <Th>{t.colPerson}</Th>
          <Th>{t.colCouponStatus}</Th>
          <Th>{t.colCode}</Th>
          <Th>{t.colIssued}</Th>
          <Th>{t.colRedeemed}</Th>
          <Th>{t.colReminded}</Th>
          <Th numeric>{t.colShifts}</Th>
        </Thead>
        <Tbody>
          {rows.map((r) => (
            <Tr key={r.profile_id}>
              <Td>
                <span className="ct-label">{r.display_name ?? "—"}</span>
                <div className="ct-help">{r.email ?? "—"}</div>
              </Td>
              <Td>
                <Badge tone={TONE[r.coupon_status] ?? "neutral"}>{label(r.coupon_status)}</Badge>
                {r.coupon_error && <div className="ct-help text-error-ink">{r.coupon_error}</div>}
              </Td>
              <Td className="text-muted">{r.coupon_code ?? "—"}</Td>
              <Td className="text-muted tabular-nums">
                {r.coupon_issued_at ? date.format(new Date(r.coupon_issued_at)) : "—"}
              </Td>
              <Td className="text-muted tabular-nums">
                {r.redeemed_at ? date.format(new Date(r.redeemed_at)) : "—"}
              </Td>
              <Td className="text-muted tabular-nums">
                {r.reminded_at ? date.format(new Date(r.reminded_at)) : "—"}
              </Td>
              <Td numeric className="tabular-nums">{r.shifts}</Td>
            </Tr>
          ))}
        </Tbody>
      </Table>
    </div>
  );
}
