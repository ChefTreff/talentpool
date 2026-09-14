"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Locale } from "@/lib/i18n/shared";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { Totals } from "../Zusammenfassung";
import { money } from "../format";
import { shopCancel, shopEdit } from "../../actions";
import type { ShopOrder } from "../../types";

type Strings = Record<string, string>;

const STATUS_TONE: Record<string, BadgeTone> = {
  draft: "neutral",
  pending: "accent",
  editing: "warning",
  completed: "success",
  cancelled: "neutral",
};

/**
 * Die Bestellungen als Liste (Archetyp A): Nummer, Datum, Stand, Summe in
 * einer Zeile — Einzelheiten beim Aufklappen, eine Zeile gleichzeitig.
 *
 * Vorher stand jede Bestellung als Karte mit allen Positionen untereinander.
 * Bei fünf Bestellungen war das eine Wand; wer nachsehen wollte, was er im
 * Januar bestellt hat, musste scrollen statt lesen.
 */
export function Bestellungen({
  orders,
  canOrder,
  locale,
  dateLocale,
  t,
  common,
  rpcMessages,
}: {
  orders: ShopOrder[];
  canOrder: boolean;
  locale: Locale;
  dateLocale: string;
  t: Strings;
  common: { cancel: string };
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [offen, setOffen] = useState<string | null>(orders[0]?.id ?? null);
  const [askCancel, setAskCancel] = useState<ShopOrder | null>(null);

  const message = (key: string) => rpcMessages[key] ?? rpcMessages.unknown ?? key;
  const datum = new Intl.DateTimeFormat(dateLocale, { dateStyle: "medium" });
  const dateTime = new Intl.DateTimeFormat(dateLocale, { dateStyle: "medium", timeStyle: "short" });
  const name = (p: { name_de: string | null; name_en: string | null; sku?: string }) =>
    (locale === "en" ? p.name_en : p.name_de) ?? p.name_de ?? p.sku ?? "—";

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

  return (
    <section aria-labelledby="h-orders">
      <div className="mb-2 flex flex-wrap items-baseline gap-2 border-b pb-2">
        <h2 id="h-orders" className="ct-h3 text-ink">
          {t.orders}
        </h2>
        <span className="ct-help ml-auto tabular-nums">{orders.length}</span>
      </div>

      <Card className="p-0">
        <ul className="flex flex-col">
          {orders.map((o) => {
            const auf = offen === o.id;
            return (
              <li key={o.id} className="border-b last:border-b-0">
                <div className="flex flex-wrap items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-hover">
                  <button
                    type="button"
                    aria-expanded={auf}
                    aria-controls={`o-${o.id}`}
                    onClick={() => setOffen(auf ? null : o.id)}
                    className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <span className="ct-label tabular-nums text-ink">{o.order_no ?? "—"}</span>
                    <svg
                      viewBox="0 0 12 12"
                      className={`h-3 w-3 shrink-0 text-muted transition-transform ${auf ? "rotate-90" : ""}`}
                      aria-hidden
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                    >
                      <path d="M4.5 3 7.5 6 4.5 9" />
                    </svg>
                  </button>

                  <span className="ct-small hidden w-[130px] shrink-0 tabular-nums text-muted sm:block">
                    {o.confirmed_at ? datum.format(new Date(o.confirmed_at)) : "—"}
                  </span>
                  <span className="ct-small w-[120px] shrink-0 text-right tabular-nums text-ink">
                    {money(o.gross_cents, dateLocale)}
                  </span>
                  <Badge tone={STATUS_TONE[o.status] ?? "neutral"}>
                    {t[`order_${o.status}`] ?? o.status}
                  </Badge>
                </div>

                {auf && (
                  <div id={`o-${o.id}`} className="border-t bg-canvas px-4 py-4">
                    <ul className="ct-small flex flex-col gap-1">
                      {o.lines.map((line) => (
                        <li key={line.sku} className="flex flex-wrap gap-x-2 tabular-nums">
                          <span>{line.qty} ×</span>
                          <span className="min-w-0 flex-1">{name(line)}</span>
                          <span>{money(line.line_net_cents, dateLocale)}</span>
                        </li>
                      ))}
                    </ul>
                    <Totals order={o} dateLocale={dateLocale} t={t} />

                    <dl className="ct-help mt-3 flex flex-col gap-0.5">
                      <div className="flex gap-1">
                        <dt className="font-semibold">{t.phaseShort}:</dt>
                        <dd className="tabular-nums">{o.phase}</dd>
                      </div>
                      {o.confirmed_at && (
                        <div className="flex gap-1">
                          <dt className="font-semibold">{t.confirmedOn}:</dt>
                          <dd>{dateTime.format(new Date(o.confirmed_at))}</dd>
                        </div>
                      )}
                      {o.po_number && (
                        <div className="flex gap-1">
                          <dt className="font-semibold">{t.poNumber}:</dt>
                          <dd>{o.po_number}</dd>
                        </div>
                      )}
                      {o.note && (
                        <div className="flex gap-1">
                          <dt className="font-semibold">{t.note}:</dt>
                          <dd className="whitespace-pre-line">{o.note}</dd>
                        </div>
                      )}
                    </dl>

                    {canOrder && o.editable && (
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={pending}
                          onClick={() => run(shopEdit(o.id), t.editing)}
                        >
                          {t.edit}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={pending}
                          onClick={() => setAskCancel(o)}
                        >
                          {t.cancelOrder}
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </Card>

      {askCancel && (
        <ConfirmDialog
          title={t.cancelTitle}
          body={t.cancelBody}
          detail={<p className="ct-label">{askCancel.order_no ?? "—"}</p>}
          confirmLabel={t.cancelOrder}
          cancelLabel={common.cancel}
          pending={pending}
          onCancel={() => setAskCancel(null)}
          onConfirm={() => {
            const o = askCancel;
            setAskCancel(null);
            run(shopCancel(o.id), t.cancelled);
          }}
        />
      )}
    </section>
  );
}
