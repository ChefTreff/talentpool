"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Input, Textarea } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import { requestTicketIncrease } from "../actions";
import { REQUEST_PASS_TYPES, type TicketAllocationRow } from "../types";

type Strings = Record<string, string>;

const TONE: Record<string, BadgeTone> = {
  active: "success",
  pending_vivenu: "accent",
  error: "warning",
};

export function TicketView({
  orgId,
  allocations,
  passTypes,
  canRequest,
  dateLocale,
  t,
  common,
  rpcMessages,
}: {
  orgId: string;
  allocations: TicketAllocationRow[];
  /** Beschriftungen aus dem Vokabular `ticket_type`. */
  passTypes: Record<string, string>;
  canRequest: boolean;
  dateLocale: string;
  t: Strings;
  common: { cancel: string; none: string; choose: string };
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [copied, setCopied] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [draft, setDraft] = useState({ passType: "partner", additional: "1", text: "" });

  const message = (key: string) => rpcMessages[key] ?? rpcMessages.unknown ?? key;
  const dateTime = new Intl.DateTimeFormat(dateLocale, {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const passLabel = (key: string) => passTypes[key] ?? key;

  async function onCopy(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(code);
      toast("success", t.copied);
      setTimeout(() => setCopied(null), 3000);
    } catch {
      // Ohne Zwischenablage-Recht bleibt der Code lesbar danebenstehen.
      toast("error", t.copyFailed);
    }
  }

  function onRequest() {
    const additional = Number(draft.additional);
    if (!Number.isInteger(additional) || additional <= 0) {
      toast("error", message("quantity_required"));
      return;
    }
    startTransition(async () => {
      const res = await requestTicketIncrease({
        orgId,
        passType: draft.passType,
        additional,
        text: draft.text,
      });
      if (!res.ok) {
        toast("error", message(res.key) + (res.detail ? ` (${res.detail})` : ""));
        return;
      }
      toast("success", t.requested);
      setDraft({ passType: "partner", additional: "1", text: "" });
      setAsking(false);
      router.refresh();
    });
  }

  const due = allocations.find((a) => a.codes_due_at)?.codes_due_at ?? null;

  return (
    <div className="flex flex-col gap-6">
      {due && (
        <p className="ct-help">
          {t.dueOn} {dateTime.format(new Date(due))}
        </p>
      )}

      <ul className="grid gap-4 lg:grid-cols-2">
        {allocations.map((a) => (
          <Card as="li" key={a.id}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="ct-h3 text-ink">{passLabel(a.pass_type)}</span>
              <Badge tone={TONE[a.status] ?? "neutral"}>
                {t[`status_${a.status}`] ?? a.status}
              </Badge>
            </div>
            <p className="ct-label mt-2 tabular-nums text-ink">
              {a.used_count} / {a.quantity}
            </p>
            <p className="ct-help">{t.used}</p>

            {a.status === "active" ? (
              <div className="mt-4 flex flex-col gap-3">
                {a.coupon_code && (
                  <div>
                    <p className="ct-label text-ink">{t.code}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <code className="rounded-ct-sm border bg-surface-hover px-2 py-1 text-[14px]">
                        {a.coupon_code}
                      </code>
                      <Button size="sm" variant="secondary" onClick={() => onCopy(a.coupon_code!)}>
                        {copied === a.coupon_code ? t.copied : t.copy}
                      </Button>
                    </div>
                  </div>
                )}
                {a.undershop_url && (
                  <div>
                    <p className="ct-label text-ink">{t.shopLink}</p>
                    <a
                      className="ct-link mt-1 inline-block break-all"
                      href={a.undershop_url}
                      target="_blank"
                      rel="noreferrer noopener"
                    >
                      {a.undershop_url}
                    </a>
                  </div>
                )}
                <p className="ct-help">{t.howTo}</p>
              </div>
            ) : (
              // `pending_vivenu` und `error` sehen für den Partner gleich aus:
              // die Menge steht, der Code kommt noch (Kontrakt B5).
              <p className="ct-help mt-4">{t.codesPending}</p>
            )}
          </Card>
        ))}
      </ul>

      {canRequest &&
        (asking ? (
          <Card>
            <h2 className="ct-h3 mb-1 text-ink">{t.requestTitle}</h2>
            <p className="ct-help mb-4">{t.requestHint}</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t.fieldPassType} htmlFor="r-pass">
                <Select
                  id="r-pass"
                  value={draft.passType}
                  options={REQUEST_PASS_TYPES.map((p) => ({ value: p, label: passLabel(p) }))}
                  onChange={(e) => setDraft((d) => ({ ...d, passType: e.target.value }))}
                />
              </Field>
              <Field label={t.fieldAdditional} htmlFor="r-count" hint={t.fieldAdditionalHint}>
                <Input
                  id="r-count"
                  type="number"
                  min={1}
                  value={draft.additional}
                  onChange={(e) => setDraft((d) => ({ ...d, additional: e.target.value }))}
                />
              </Field>
              <Field
                label={t.fieldText}
                htmlFor="r-text"
                hint={t.fieldTextHint}
                className="sm:col-span-2"
              >
                <Textarea
                  id="r-text"
                  rows={3}
                  value={draft.text}
                  onChange={(e) => setDraft((d) => ({ ...d, text: e.target.value }))}
                />
              </Field>
            </div>
            <div className="mt-6 flex flex-wrap gap-2">
              <Button disabled={pending} onClick={onRequest}>
                {t.requestSend}
              </Button>
              <Button variant="ghost" disabled={pending} onClick={() => setAsking(false)}>
                {common.cancel}
              </Button>
            </div>
          </Card>
        ) : (
          <div>
            <Button variant="secondary" onClick={() => setAsking(true)}>
              {t.requestTitle}
            </Button>
          </div>
        ))}
    </div>
  );
}
