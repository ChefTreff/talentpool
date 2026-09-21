"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/Table";
import { useToast } from "@/components/ui/Toast";
import { removeBoothAssignment, saveBoothAssignment } from "../actions";
import type { BoothDayRow, FreeBooth, OrgEditionOption } from "../types";

type Strings = Record<string, string>;

/** „Beide Tage" ist keine Tages-ID, sondern deren Abwesenheit — `event_day_id = null`. */
const ALLE_TAGE = "";

export function BoothPlan({
  plan,
  days,
  free,
  orgs,
  t,
  common,
  rpcMessages,
}: {
  plan: BoothDayRow[];
  days: { id: string; label: string }[];
  /** Stände ohne Belegung „beide Tage" — nur die lassen sich noch vergeben. */
  free: FreeBooth[];
  orgs: OrgEditionOption[];
  t: Strings;
  common: { none: string; save: string };
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [neu, setNeu] = useState({ boothId: "", orgEditionId: "", eventDayId: ALLE_TAGE, note: "" });

  const message = (key: string) => rpcMessages[key] ?? rpcMessages.unknown ?? key;

  function run(action: Promise<{ ok: boolean; key?: string; detail?: string }>, okText: string, danach?: () => void) {
    startTransition(async () => {
      const res = await action;
      if (!res.ok) {
        toast("error", message(res.key ?? "unknown") + (res.detail ? ` (${res.detail})` : ""));
        return;
      }
      danach?.();
      toast("success", okText);
      router.refresh();
    });
  }

  function onAssign() {
    if (!neu.boothId || !neu.orgEditionId) {
      toast("error", message("fields_required"));
      return;
    }
    run(
      saveBoothAssignment({
        boothId: neu.boothId,
        orgEditionId: neu.orgEditionId,
        eventDayId: neu.eventDayId === ALLE_TAGE ? null : neu.eventDayId,
        note: neu.note.trim() || null,
      }),
      t.saved,
      () => setNeu({ boothId: "", orgEditionId: "", eventDayId: ALLE_TAGE, note: "" }),
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader title={t.boothAssignTitle} description={t.boothAssignLead} />
        <div className="flex flex-wrap items-end gap-3">
          <Field label={t.colBooth} htmlFor="b-booth" hint={t.boothFreeHint}>
            <Select
              id="b-booth"
              className="w-56"
              value={neu.boothId}
              placeholder={common.none}
              options={free.map((b) => ({
                value: b.booth_id,
                label:
                  (b.booth_number ?? b.booth_id.slice(0, 8)) +
                  (b.belegte_tage > 0 ? ` · ${b.belegte_tage} ${t.boothDaysTaken}` : ""),
              }))}
              onChange={(e) => setNeu((n) => ({ ...n, boothId: e.target.value }))}
            />
          </Field>
          <Field label={t.colOrg} htmlFor="b-org">
            <Select
              id="b-org"
              className="w-72"
              value={neu.orgEditionId}
              placeholder={common.none}
              options={orgs.map((o) => ({ value: o.org_edition_id, label: o.org_name ?? o.org_id }))}
              onChange={(e) => setNeu((n) => ({ ...n, orgEditionId: e.target.value }))}
            />
          </Field>
          <Field label={t.colDay} htmlFor="b-day" hint={t.boothAllDaysHint}>
            <Select
              id="b-day"
              className="w-48"
              value={neu.eventDayId}
              options={[
                { value: ALLE_TAGE, label: t.boothAllDays },
                ...days.map((d) => ({ value: d.id, label: d.label })),
              ]}
              onChange={(e) => setNeu((n) => ({ ...n, eventDayId: e.target.value }))}
            />
          </Field>
          <Field label={t.colNote} htmlFor="b-note">
            <Input
              id="b-note"
              className="w-56"
              value={neu.note}
              onChange={(e) => setNeu((n) => ({ ...n, note: e.target.value }))}
            />
          </Field>
          <Button disabled={pending} onClick={onAssign}>
            {t.boothAssign}
          </Button>
        </div>
      </Card>

      {days.map((d) => {
        const rows = plan.filter((r) => r.event_day_id === d.id);
        return (
          <Card key={d.id}>
            <CardHeader title={d.label} description={`${rows.length} ${t.boothsOnDay}`} />
            {rows.length === 0 ? (
              <p className="ct-help">{t.boothDayEmpty}</p>
            ) : (
              <Table>
                <Thead>
                  <Th>{t.colBooth}</Th>
                  <Th>{t.colOrg}</Th>
                  <Th>{t.colNote}</Th>
                  <Th aria-label={t.colAction} />
                </Thead>
                <Tbody>
                  {rows.map((r) => (
                    <Tr key={r.assignment_id}>
                      <Td>
                        <span className="ct-label text-ink">{r.booth_number ?? common.none}</span>
                        {r.geteilt && (
                          <div className="mt-1">
                            <Badge tone="accent">{t.boothShared}</Badge>
                          </div>
                        )}
                        {r.booth_type && <div className="ct-help">{r.booth_type}</div>}
                      </Td>
                      <Td className="text-muted">{r.org_name ?? common.none}</Td>
                      <Td className="text-muted">{r.note ?? ""}</Td>
                      <Td>
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={pending}
                          onClick={() => run(removeBoothAssignment(r.assignment_id), t.boothReleased)}
                        >
                          {t.boothRelease}
                        </Button>
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            )}
          </Card>
        );
      })}
    </div>
  );
}
