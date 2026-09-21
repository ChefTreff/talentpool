"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Input, Textarea } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/Table";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConfirmDialog } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import {
  SHUTTLE_FIELDS,
  SHUTTLE_LIMIT,
  speakerName,
  type ShuttleAdminRow,
} from "@/components/shuttle/types";
import { cancelShuttleAsLead, requestShuttleForSpeaker } from "./actions";

type Strings = Record<string, string>;

const STATUS_TONE: Record<string, BadgeTone> = {
  requested: "accent",
  confirmed: "success",
  cancelled: "neutral",
};

const LEER: Record<string, string> = {
  passenger_name: "",
  passengers: "1",
  driver_phone: "",
  pickup_at: "",
  pickup_location: "",
  pickup_address: "",
  dropoff_location: "",
  dropoff_address: "",
  latest_arrival_at: "",
  note: "",
  over_limit_reason: "",
};

/**
 * Shuttle im Lead-Portal (LEAD-011).
 *
 * Eine Lead-Person betreut mehrere Speaker und ruft oft für sie an — deshalb
 * hier eine Liste über alle Betreuten und ein Formular mit Speaker-Auswahl,
 * nicht die Ein-Personen-Ansicht des Speaker-Portals.
 *
 * **Freigeben kann das Lead-Portal nicht.** Jede Fahrt geht als Anfrage in den
 * Speaker-Admin; das ist Konrads Regel vom 17.09. und in `confirm_shuttle`
 * verankert, nicht hier.
 */
export function LeadShuttle({
  rows,
  speakers,
  dateLocale,
  t,
  common,
  rpcMessages,
}: {
  rows: ShuttleAdminRow[];
  /** Die betreuten Speaker: für wen darf ich anfordern? */
  speakers: { profile_id: string; first_name: string | null; last_name: string | null }[];
  dateLocale: string;
  t: Strings;
  common: { cancel: string; choose: string };
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [offen, setOffen] = useState(false);
  const [profil, setProfil] = useState("");
  const [draft, setDraft] = useState<Record<string, string>>(LEER);
  const [fehler, setFehler] = useState<string | null>(null);
  const [askCancel, setAskCancel] = useState<ShuttleAdminRow | null>(null);
  const [nurOffen, setNurOffen] = useState(false);

  const message = (key: string) => rpcMessages[key] ?? rpcMessages.unknown ?? key;
  const dateTime = new Intl.DateTimeFormat(dateLocale, {
    dateStyle: "short",
    timeStyle: "short",
  });

  const sichtbar = useMemo(
    () => rows.filter((r) => (nurOffen ? r.status === "requested" : r.status !== "cancelled")),
    [rows, nurOffen],
  );
  const offeneAnfragen = rows.filter((r) => r.status === "requested").length;

  // Wie viele Fahrten stehen für die gewählte Person schon offen? Ab fünf
  // verlangt `request_shuttle` eine Begründung.
  const offeneFahrten = profil
    ? rows.filter((r) => r.profile_id === profil && r.status !== "cancelled").length
    : 0;
  const brauchtGrund = offeneFahrten >= SHUTTLE_LIMIT;

  function onSubmit() {
    setFehler(null);
    if (!profil) {
      setFehler(t.shuttlePickSpeaker);
      return;
    }
    start(async () => {
      const res = await requestShuttleForSpeaker(profil, {
        ...draft,
        over_limit_reason: brauchtGrund ? draft.over_limit_reason : "",
      });
      if (!res.ok) {
        setFehler(message(res.key) + (res.detail ? ` (${res.detail})` : ""));
        return;
      }
      setDraft(LEER);
      setOffen(false);
      toast("success", t.shuttleRequested);
      router.refresh();
    });
  }

  function onCancel(row: ShuttleAdminRow) {
    start(async () => {
      setAskCancel(null);
      const res = await cancelShuttleAsLead(row.id);
      if (!res.ok) {
        toast("error", message(res.key));
        return;
      }
      toast("success", t.shuttleCancelled);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 ct-help">
          <input
            type="checkbox"
            className="size-4"
            checked={nurOffen}
            onChange={(e) => setNurOffen(e.target.checked)}
          />
          {t.shuttleOnlyOpen} ({offeneAnfragen})
        </label>
        {!offen && (
          <Button size="sm" onClick={() => setOffen(true)} disabled={speakers.length === 0}>
            {t.shuttleAdd}
          </Button>
        )}
      </div>

      {offen && (
        <Card>
          {fehler && (
            <p
              role="alert"
              className="mb-4 rounded-ct-md border border-error-soft bg-error-soft p-3 ct-small text-error-ink"
            >
              {fehler}
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t.shuttleForSpeaker} htmlFor="ls-profil" required requiredLabel={t.required}>
              <Select
                id="ls-profil"
                value={profil}
                placeholder={common.choose}
                onChange={(e) => setProfil(e.target.value)}
                options={speakers.map((s) => ({
                  value: s.profile_id,
                  label: [s.first_name, s.last_name].filter(Boolean).join(" ") || s.profile_id,
                }))}
              />
            </Field>
            <div />

            {SHUTTLE_FIELDS.map((f) => (
              <Field
                key={f.key}
                label={t[`shuttle_${f.key}`] ?? f.key}
                htmlFor={`ls-${f.key}`}
                hint={t[`shuttle_${f.key}_hint`]}
                required={f.required}
                requiredLabel={t.required}
              >
                <Input
                  id={`ls-${f.key}`}
                  type={f.kind === "text" ? "text" : f.kind}
                  min={f.kind === "number" ? 1 : undefined}
                  max={f.kind === "number" ? 8 : undefined}
                  value={draft[f.key] ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                />
              </Field>
            ))}

            <Field label={t.shuttle_note} htmlFor="ls-note" className="sm:col-span-2">
              <Textarea
                id="ls-note"
                rows={2}
                value={draft.note}
                onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
              />
            </Field>

            {brauchtGrund && (
              <Field
                label={t.shuttle_over_limit_reason}
                htmlFor="ls-grund"
                hint={t.shuttleLimitHintLead.replace("{n}", String(SHUTTLE_LIMIT))}
                required
                requiredLabel={t.required}
                className="sm:col-span-2"
              >
                <Textarea
                  id="ls-grund"
                  rows={2}
                  value={draft.over_limit_reason}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, over_limit_reason: e.target.value }))
                  }
                />
              </Field>
            )}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={onSubmit} loading={pending}>
              {t.shuttleSubmit}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setOffen(false);
                setFehler(null);
                setDraft(LEER);
              }}
            >
              {common.cancel}
            </Button>
          </div>
          <p className="ct-help mt-3">{t.shuttleLeadNote}</p>
        </Card>
      )}

      {sichtbar.length === 0 ? (
        <EmptyState title={t.shuttleEmptyTitle} description={t.shuttleEmptyBody} />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <Thead>
              <Th>{t.colPickup}</Th>
              <Th>{t.colSpeaker}</Th>
              <Th>{t.colRoute}</Th>
              <Th>{t.colPassenger}</Th>
              <Th>{t.colStatus}</Th>
              <Th aria-label={t.shuttleCancel} />
            </Thead>
            <Tbody>
              {sichtbar.map((r) => (
                <Tr key={r.id}>
                  <Td className="tabular-nums whitespace-nowrap">
                    {dateTime.format(new Date(r.pickup_at))}
                  </Td>
                  <Td>{speakerName(r)}</Td>
                  <Td>
                    <span className="ct-help">
                      {r.pickup_location} → {r.dropoff_location}
                    </span>
                  </Td>
                  <Td>
                    {r.passenger_name}
                    <span className="ct-help"> ({r.passengers})</span>
                  </Td>
                  <Td>
                    <Badge tone={STATUS_TONE[r.status] ?? "neutral"}>
                      {t[`shuttle_${r.status}`] ?? r.status}
                    </Badge>
                  </Td>
                  <Td>
                    {r.status !== "cancelled" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={pending}
                        onClick={() => setAskCancel(r)}
                      >
                        {t.shuttleCancel}
                      </Button>
                    )}
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </div>
      )}

      {askCancel && (
        <ConfirmDialog
          title={t.shuttleCancelTitle}
          body={t.shuttleCancelBody}
          detail={
            <p className="ct-label tabular-nums">
              {dateTime.format(new Date(askCancel.pickup_at))} · {speakerName(askCancel)} ·{" "}
              {askCancel.pickup_location} → {askCancel.dropoff_location}
            </p>
          }
          confirmLabel={t.shuttleCancelConfirm}
          cancelLabel={common.cancel}
          pending={pending}
          onCancel={() => setAskCancel(null)}
          onConfirm={() => onCancel(askCancel)}
        />
      )}
    </div>
  );
}
