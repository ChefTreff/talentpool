"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/Table";
import { useToast } from "@/components/ui/Toast";
import { speakerName, type ShuttleAdminRow } from "@/components/shuttle/types";
import { cancelShuttleAsAdmin, confirmShuttle } from "../actions";

type Strings = Record<string, string>;

const STATUS_TONE: Record<string, BadgeTone> = {
  requested: "accent",
  confirmed: "success",
  cancelled: "neutral",
};

/**
 * Die Shuttle-Fahrten der Edition (ADM-028).
 *
 * Zwei Aufgaben an einem Ort: **freigeben** — jede Fahrt wird einmal gesehen,
 * bevor sie ans Unternehmen geht (Konrad, 17.09.) — und **ausgeben**, als CSV
 * und als Excel.
 *
 * Die Liste zeigt auch, **wer** angefordert hat. Bei einer Fahrt, die eine
 * Lead-Person für jemanden angelegt hat, ist das der Unterschied zwischen
 * „kurz nachfragen" und „im Dunkeln raten".
 */
export function ShuttleAdmin({
  rows,
  t,
  common,
  rpcMessages,
  dateLocale,
}: {
  rows: ShuttleAdminRow[];
  t: Strings;
  common: { cancel: string };
  rpcMessages: Record<string, string>;
  dateLocale: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [nurOffen, setNurOffen] = useState(true);

  const message = (key: string) => rpcMessages[key] ?? rpcMessages.unknown ?? key;
  const dateTime = new Intl.DateTimeFormat(dateLocale, {
    dateStyle: "short",
    timeStyle: "short",
  });

  const offen = rows.filter((r) => r.status === "requested").length;
  const sichtbar = useMemo(
    () => rows.filter((r) => (nurOffen ? r.status === "requested" : r.status !== "cancelled")),
    [rows, nurOffen],
  );

  function run(fn: () => Promise<{ ok: boolean; key?: string }>, ok: string) {
    start(async () => {
      const res = await fn();
      if (!res.ok) {
        toast("error", message(res.key ?? "unknown"));
        return;
      }
      toast("success", ok);
      router.refresh();
    });
  }

  return (
    <section aria-labelledby="h-shuttle" className="mt-10 flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="h-shuttle" className="ct-h2 text-ink">
          {t.shuttleTitle}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          {/* Der Export läuft über eine Route, nicht über eine Server-Action:
              eine Datei will heruntergeladen werden, nicht zurückgegeben. */}
          <ButtonLink href="/api/admin/shuttle/export?format=csv" variant="secondary" size="sm">
            {t.shuttleExportCsv}
          </ButtonLink>
          <ButtonLink href="/api/admin/shuttle/export?format=xlsx" variant="secondary" size="sm">
            {t.shuttleExportXlsx}
          </ButtonLink>
        </div>
      </div>
      <p className="ct-help">{t.shuttleLead.replace("{n}", String(offen))}</p>

      <label className="flex w-fit items-center gap-2 ct-help">
        <input
          type="checkbox"
          className="size-4"
          checked={nurOffen}
          onChange={(e) => setNurOffen(e.target.checked)}
        />
        {t.shuttleOnlyOpen}
      </label>

      {sichtbar.length === 0 ? (
        <EmptyState
          title={nurOffen ? t.shuttleNoOpenTitle : t.shuttleEmptyTitle}
          description={nurOffen ? t.shuttleNoOpenBody : t.shuttleEmptyBody}
        />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <Thead>
              <Th>{t.colPickup}</Th>
              <Th>{t.colSpeaker}</Th>
              <Th>{t.colRoute}</Th>
              <Th>{t.colPassenger}</Th>
              <Th>{t.colRequestedBy}</Th>
              <Th>{t.colStatus}</Th>
              <Th aria-label={t.shuttleConfirm} />
            </Thead>
            <Tbody>
              {sichtbar.map((r) => (
                <Tr key={r.id}>
                  <Td className="tabular-nums whitespace-nowrap">
                    {dateTime.format(new Date(r.pickup_at))}
                    {r.latest_arrival_at && (
                      <span className="ct-help block">
                        {t.colLatest}: {dateTime.format(new Date(r.latest_arrival_at))}
                      </span>
                    )}
                  </Td>
                  <Td>{speakerName(r)}</Td>
                  <Td>
                    <span className="ct-help">
                      {r.pickup_location}
                      {r.pickup_address ? `, ${r.pickup_address}` : ""} → {r.dropoff_location}
                      {r.dropoff_address ? `, ${r.dropoff_address}` : ""}
                    </span>
                  </Td>
                  <Td>
                    {r.passenger_name}
                    <span className="ct-help block">
                      {r.passengers} · {r.driver_phone ?? t.noPhone}
                    </span>
                  </Td>
                  <Td className="ct-help break-all">{r.booked_by_email ?? "—"}</Td>
                  <Td>
                    <Badge tone={STATUS_TONE[r.status] ?? "neutral"}>
                      {t[`shuttle_${r.status}`] ?? r.status}
                    </Badge>
                    {r.over_limit_reason && (
                      <span className="ct-help mt-1 block">
                        {t.colOverLimit}: {r.over_limit_reason}
                      </span>
                    )}
                    {r.note && <span className="ct-help mt-1 block">{r.note}</span>}
                  </Td>
                  <Td>
                    <div className="flex flex-wrap gap-2">
                      {r.status === "requested" && (
                        <Button
                          size="sm"
                          disabled={pending}
                          onClick={() => run(() => confirmShuttle(r.id), t.shuttleConfirmed)}
                        >
                          {t.shuttleConfirm}
                        </Button>
                      )}
                      {r.status !== "cancelled" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={pending}
                          onClick={() =>
                            run(() => cancelShuttleAsAdmin(r.id), t.shuttleCancelled)
                          }
                        >
                          {common.cancel}
                        </Button>
                      )}
                    </div>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </div>
      )}
    </section>
  );
}
