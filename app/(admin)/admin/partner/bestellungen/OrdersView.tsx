"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Input, Textarea } from "@/components/ui/Input";
import { ConfirmDialog } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/Table";
import { useToast } from "@/components/ui/Toast";
import {
  adminQuoteWithdraw,
  adminSetOrderLine,
  adminSetOrderStatus,
  answerRequest,
  runShopInvoices,
} from "../actions";
import { describeMerch, type MerchField } from "@/lib/partner/merch";
import { money } from "../format";
import {
  ORDER_STATUS,
  REQUEST_STATUS,
  type AdminOrder,
  type AdminRequest,
  type DryRunResult,
  type ShopReportRow,
} from "../types";
import type { AdminQuoteRow } from "./angebote";

type Strings = Record<string, string>;

const ORDER_TONE: Record<string, BadgeTone> = {
  draft: "neutral",
  pending: "accent",
  editing: "warning",
  quoted: "warning",
  completed: "success",
  cancelled: "neutral",
};

const REQUEST_TONE: Record<string, BadgeTone> = {
  open: "warning",
  answered: "accent",
  closed: "neutral",
};

export function OrdersView({
  editionId,
  orders,
  quotes,
  requests,
  report,
  merchSchemas,
  dateLocale,
  t,
  common,
  rpcMessages,
}: {
  editionId: string;
  orders: AdminOrder[];
  /** Warenkörbe mit offenem Angebot (PART-116, `shop_quotes_admin`). */
  quotes: AdminQuoteRow[];
  requests: AdminRequest[];
  report: ShopReportRow[];
  /** Merch-Schema je SKU (S4) — nur zum Anzeigen der Konfiguration. */
  merchSchemas: Record<string, MerchField[]>;
  dateLocale: string;
  t: Strings;
  common: { cancel: string; none: string; save: string };
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState<string | null>(null);
  const [status, setStatus] = useState<Record<string, string>>({});
  const [note, setNote] = useState<Record<string, string>>({});
  const [qty, setQty] = useState<Record<string, string>>({});
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [dry, setDry] = useState<DryRunResult | null>(null);
  const [askLive, setAskLive] = useState(false);
  const [askWithdraw, setAskWithdraw] = useState<AdminQuoteRow | null>(null);
  const [askCancelQuote, setAskCancelQuote] = useState<AdminQuoteRow | null>(null);

  const message = (key: string) => rpcMessages[key] ?? rpcMessages.unknown ?? key;
  const dateTime = new Intl.DateTimeFormat(dateLocale, {
    dateStyle: "medium",
    timeStyle: "short",
  });
  // Das Angebot gilt „bis zum Ende des Tages“ in Berlin — ohne die Zeitzone stünde am Browser eines anderen Landes der falsche Tag.
  const dateOnly = new Intl.DateTimeFormat(dateLocale, { dateStyle: "medium", timeZone: "Europe/Berlin" });
  const quoteOf = new Map(quotes.map((q) => [q.order_id, q]));

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
   * Rechnungslauf. Ohne `dryRun: false` passiert nichts in SevDesk — das
   * Ergebnis des Trockenlaufs steht danach unter dem Knopf, und erst die
   * Rückfrage schaltet scharf.
   */
  function invoices(dryRun: boolean) {
    startTransition(async () => {
      const res = await runShopInvoices({ editionId, dryRun });
      if (!res.ok) {
        toast("error", message(res.key) + (res.detail ? ` (${res.detail})` : ""));
        return;
      }
      setDry(res.data);
      toast("success", dryRun ? t.dryRunDone : t.liveRunDone);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader ebene="h2" title={t.invoiceTitle} description={t.invoiceLead} />
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" disabled={pending} onClick={() => invoices(true)}>
            {t.dryRun}
          </Button>
          <Button disabled={pending || !dry} onClick={() => setAskLive(true)}>
            {t.liveRun}
          </Button>
        </div>
        {!dry && <p className="ct-help mt-2">{t.dryRunFirst}</p>}
        {dry && (
          <div className="mt-4">
            <p className="ct-help">
              {t.candidates}: {dry.candidates ?? 0} · {t.created}: {dry.created ?? 0} ·{" "}
              {t.errors}: {dry.errors ?? 0}
              {dry.job != null && ` · Job ${dry.job}`}
            </p>
            {dry.runs && dry.runs.length > 0 && (
              <ul className="ct-help mt-2 flex flex-col gap-1">
                {dry.runs.map((r, i) => (
                  <li key={`${r.org}-${i}`}>
                    {r.org} · {r.outcome}
                    {r.net_cents != null && ` · ${money(r.net_cents, dateLocale)}`}
                    {r.detail && ` · ${r.detail}`}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Card>

      {/* PART-116: Warenkörbe, die mit einem Angebot festgesetzt sind. Hier zieht das Team eines zurück oder storniert die Bestellung — dieselben Wege wie die Partner,
          plus der Blick auf alle Organisationen. Ein verfallenes Angebot hält den Bestand, bis die Bereinigung läuft; die Zeile sagt es. */}
      <Card>
        <CardHeader ebene="h2" title={t.quotesTitle} description={`${t.quotesLead} · ${quotes.length}`} />
        {quotes.length === 0 ? (
          <p className="ct-help">{t.quotesEmpty}</p>
        ) : (
          <Table>
            <Thead>
              <Th>{t.quotesColOrg}</Th>
              <Th>{t.quotesColQuote}</Th>
              <Th>{t.quotesColValid}</Th>
              <Th numeric>{t.quotesColNet}</Th>
              <Th aria-label={t.colAction} />
            </Thead>
            <Tbody>
              {quotes.map((q) => (
                <Tr key={q.order_id} controls>
                  <Td>
                    {q.org_name ?? common.none}
                    <div className="ct-help">{q.order_no ?? q.order_id.slice(0, 8)}</div>
                  </Td>
                  <Td>
                    <span className="flex flex-wrap items-center gap-2">
                      {q.quote_number ?? "—"}
                      {q.probe && <Badge tone="warning">{t.quotesProbe}</Badge>}
                    </span>
                  </Td>
                  <Td>
                    {q.valid_until == null ? (
                      <Badge tone="neutral">{t.quotesInProgress}</Badge>
                    ) : (
                      <span className="flex flex-wrap items-center gap-2">
                        {dateOnly.format(new Date(q.valid_until))}
                        {q.expired && <Badge tone="error">{t.quotesExpired}</Badge>}
                      </span>
                    )}
                  </Td>
                  <Td numeric>{money(q.net_cents, dateLocale)}</Td>
                  <Td>
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button size="sm" variant="secondary" disabled={pending} onClick={() => setAskWithdraw(q)}>
                        {t.quotesWithdraw}
                      </Button>
                      <Button size="sm" variant="ghost" disabled={pending} onClick={() => setAskCancelQuote(q)}>
                        {t.quotesCancel}
                      </Button>
                    </div>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </Card>

      <Card>
        <CardHeader ebene="h2" title={t.ordersTitle} description={`${t.ordersLead} · ${orders.length}`} />
        {orders.length === 0 ? (
          <p className="ct-help">{t.ordersEmpty}</p>
        ) : (
          <div className="flex flex-col gap-3">
            {orders.map((o) => {
              const expanded = open === o.id;
              return (
                <div key={o.id} className="rounded-ct-md border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <button
                        type="button"
                        className="ct-link ct-label text-left"
                        aria-expanded={expanded}
                        onClick={() => setOpen(expanded ? null : o.id)}
                      >
                        {o.org_name ?? common.none} · {o.order_no ?? o.id.slice(0, 8)}
                      </button>
                      <div className="ct-help">
                        {t.phase} {o.phase} · {dateTime.format(new Date(o.created_at))} ·{" "}
                        {money(o.net_cents, dateLocale)} {t.net}
                      </div>
                      {o.note && <div className="ct-help">{o.note}</div>}
                      {o.internal_note && (
                        <div className="ct-help">
                          {t.internalNote}: {o.internal_note}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-wrap items-end gap-2">
                      <Badge tone={ORDER_TONE[o.status] ?? "neutral"}>
                        {t[`order_${o.status}`] ?? o.status}
                      </Badge>
                      {/* Ein festgesetzter Warenkorb hat keinen frei wählbaren Stand: `shop_admin_set_status` nimmt dort nur „storniert“, und
                          die Positionen bleiben stehen (`order_quoted`). Zurückziehen und Stornieren stehen in „Offene Angebote“ darüber. */}
                      {o.status === "quoted" ? (
                        <p className="ct-help max-w-80">
                          {quoteOf.get(o.id)?.quote_number ? `${quoteOf.get(o.id)?.quote_number} · ` : ""}
                          {t.orderQuotedHint}
                        </p>
                      ) : (
                        <>
                          <Select
                            aria-label={t.colStatus}
                            className="w-40"
                            value={status[o.id] ?? o.status}
                            options={ORDER_STATUS.map((s) => ({
                              value: s,
                              label: t[`order_${s}`] ?? s,
                            }))}
                            onChange={(e) => setStatus((s) => ({ ...s, [o.id]: e.target.value }))}
                          />
                          <Input
                            aria-label={t.internalNote}
                            className="w-56"
                            placeholder={t.internalNote}
                            value={note[o.id] ?? ""}
                            onChange={(e) => setNote((n) => ({ ...n, [o.id]: e.target.value }))}
                          />
                          <Button
                            size="sm"
                            disabled={pending}
                            onClick={() =>
                              run(
                                adminSetOrderStatus(o.id, status[o.id] ?? o.status, note[o.id] ?? ""),
                                t.saved,
                              )
                            }
                          >
                            {common.save}
                          </Button>
                        </>
                      )}
                    </div>
                  </div>

                  {expanded && (
                    <div className="mt-4">
                      <Table>
                        <Thead>
                          <Th>{t.colProduct}</Th>
                          <Th numeric>{t.colQty}</Th>
                          <Th numeric>{t.colUnitPrice}</Th>
                          <Th numeric>{t.colLineTotal}</Th>
                          <Th aria-label={t.colAction} />
                        </Thead>
                        <Tbody>
                          {o.lines.map((line) => {
                            const key = `${o.id}:${line.sku}`;
                            return (
                              <Tr key={key}>
                                <Td>
                                  {line.name_de ?? line.sku}
                                  <div className="ct-help">{line.sku}</div>
                                  {describeMerch(
                                    merchSchemas[line.sku] ?? [],
                                    line.merch_config,
                                    "de",
                                  ).map((row) => (
                                    <div key={row.label} className="ct-help">
                                      {row.label}: {row.value}
                                    </div>
                                  ))}
                                </Td>
                                <Td numeric>
                                  <Input
                                    aria-label={t.colQty}
                                    type="number"
                                    min={0}
                                    className="w-20"
                                    disabled={o.status === "quoted"}
                                    value={qty[key] ?? String(line.qty)}
                                    onChange={(e) =>
                                      setQty((q) => ({ ...q, [key]: e.target.value }))
                                    }
                                  />
                                </Td>
                                <Td numeric>{money(line.price_net_cents, dateLocale)}</Td>
                                <Td numeric>{money(line.line_net_cents, dateLocale)}</Td>
                                <Td>
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    disabled={pending || o.status === "quoted"}
                                    onClick={() => {
                                      const value = Number(qty[key] ?? line.qty);
                                      if (!Number.isFinite(value) || value < 0) {
                                        toast("error", message("invalid_quantity"));
                                        return;
                                      }
                                      run(adminSetOrderLine(o.id, line.sku, value), t.saved);
                                    }}
                                  >
                                    {common.save}
                                  </Button>
                                </Td>
                              </Tr>
                            );
                          })}
                        </Tbody>
                      </Table>
                      <p className="ct-help mt-2">{o.status === "quoted" ? t.orderQuotedLines : t.lineZeroRemoves}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card>
        <CardHeader
          ebene="h2"
          title={t.requestsTitle}
          description={`${t.requestsLead} · ${requests.filter((r) => r.status === "open").length} ${t.countOpen}`}
        />
        {requests.length === 0 ? (
          <p className="ct-help">{t.requestsEmpty}</p>
        ) : (
          <div className="flex flex-col gap-3">
            {requests.map((r) => (
              <div key={r.id} className="rounded-ct-md border p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="ct-label text-ink">{r.org_name ?? common.none}</span>
                  <Badge tone={REQUEST_TONE[r.status] ?? "neutral"}>
                    {t[`request_${r.status}`] ?? r.status}
                  </Badge>
                  {r.product_name && <span className="ct-help">{r.product_name}</span>}
                  <span className="ct-help">{dateTime.format(new Date(r.created_at))}</span>
                </div>
                <p className="mt-1 whitespace-pre-line text-ink">{r.text}</p>
                {r.answer && (
                  <p className="ct-help mt-1">
                    {t.lastAnswer}: {r.answer}
                  </p>
                )}
                <div className="mt-2 flex flex-wrap items-end gap-2">
                  <Field label={t.answer} htmlFor={`a-${r.id}`} className="min-w-70 flex-1">
                    <Textarea
                      id={`a-${r.id}`}
                      rows={2}
                      value={answers[r.id] ?? r.answer ?? ""}
                      onChange={(e) => setAnswers((a) => ({ ...a, [r.id]: e.target.value }))}
                    />
                  </Field>
                  {REQUEST_STATUS.filter((s) => s !== "open").map((s) => (
                    <Button
                      key={s}
                      size="sm"
                      variant={s === "answered" ? "primary" : "secondary"}
                      disabled={pending}
                      onClick={() =>
                        run(answerRequest(r.id, answers[r.id] ?? r.answer ?? "", s), t.saved)
                      }
                    >
                      {t[`requestAction_${s}`] ?? s}
                    </Button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <CardHeader ebene="h2" title={t.reportTitle} description={t.reportLead} />
        {report.length === 0 ? (
          <p className="ct-help">{t.reportEmpty}</p>
        ) : (
          <Table>
            <Thead>
              <Th>{t.colProduct}</Th>
              <Th>{t.colCategory}</Th>
              <Th numeric>{t.colQty}</Th>
              <Th numeric>{t.colNetTotal}</Th>
              <Th numeric>{t.colOrders}</Th>
              <Th numeric>{t.colOrgs}</Th>
            </Thead>
            <Tbody>
              {report.map((row) => (
                <Tr key={row.sku}>
                  <Td>
                    {row.name_de ?? row.sku}
                    <div className="ct-help">{row.sku}</div>
                  </Td>
                  <Td className="text-muted">{row.category ?? "—"}</Td>
                  <Td numeric>
                    {row.qty_total} {row.unit ?? ""}
                  </Td>
                  <Td numeric>{money(row.net_total_cents, dateLocale)}</Td>
                  <Td numeric>{row.orders}</Td>
                  <Td numeric>{row.orgs}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </Card>

      {askWithdraw && (
        <ConfirmDialog
          title={t.quotesWithdrawTitle}
          body={t.quotesWithdrawBody}
          detail={
            <p className="ct-label">
              {askWithdraw.org_name ?? common.none} · {askWithdraw.quote_number ?? askWithdraw.order_no ?? "—"}
            </p>
          }
          confirmLabel={t.quotesWithdraw}
          cancelLabel={common.cancel}
          pending={pending}
          onCancel={() => setAskWithdraw(null)}
          onConfirm={() => {
            const q = askWithdraw;
            setAskWithdraw(null);
            run(adminQuoteWithdraw(q.order_id), t.quotesWithdrawn);
          }}
        />
      )}
      {askCancelQuote && (
        <ConfirmDialog
          title={t.quotesCancelTitle}
          body={t.quotesCancelBody}
          detail={
            <p className="ct-label">
              {askCancelQuote.org_name ?? common.none} · {askCancelQuote.quote_number ?? askCancelQuote.order_no ?? "—"}
            </p>
          }
          confirmLabel={t.quotesCancel}
          cancelLabel={common.cancel}
          pending={pending}
          onCancel={() => setAskCancelQuote(null)}
          onConfirm={() => {
            const q = askCancelQuote;
            setAskCancelQuote(null);
            run(adminSetOrderStatus(q.order_id, "cancelled", ""), t.saved);
          }}
        />
      )}
      {askLive && (
        <ConfirmDialog
          title={t.liveRunConfirmTitle}
          body={t.liveRunConfirmBody}
          detail={
            dry?.runs && dry.runs.length > 0 ? (
              <ul className="ct-help flex flex-col gap-1">
                {dry.runs.map((r, i) => (
                  <li key={`${r.org}-confirm-${i}`}>
                    {r.org} · {r.outcome}
                  </li>
                ))}
              </ul>
            ) : undefined
          }
          confirmLabel={t.liveRun}
          cancelLabel={common.cancel}
          pending={pending}
          onConfirm={() => {
            setAskLive(false);
            invoices(false);
          }}
          onCancel={() => setAskLive(false)}
        />
      )}
    </div>
  );
}
