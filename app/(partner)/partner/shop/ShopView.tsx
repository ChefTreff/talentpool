"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Locale } from "@/lib/i18n/shared";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Input, Textarea } from "@/components/ui/Input";
import { ConfirmDialog } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/components/ui/cn";
import {
  checkMerchValues,
  describeMerch,
  parseMerchSchema,
  type MerchField,
  type MerchValues,
} from "@/lib/partner/merch";
import { MerchDialog, type MerchAsset } from "./MerchDialog";
import {
  shopCancel,
  shopConfirm,
  shopEdit,
  shopRemoveLine,
  shopRequestProduct,
  shopUpsertLine,
} from "../actions";
import {
  cartOf,
  type ShopOrder,
  type ShopPhase,
  type ShopProduct,
} from "../types";

type Strings = Record<string, string>;

const STATUS_TONE: Record<string, BadgeTone> = {
  draft: "neutral",
  pending: "accent",
  editing: "warning",
  completed: "success",
  cancelled: "neutral",
};

/** Netto in Euro — Preise sind im Shop immer netto (Arbeitsauftrag C). */
function money(cents: number, dateLocale: string): string {
  return (cents / 100).toLocaleString(dateLocale, {
    style: "currency",
    currency: "EUR",
  });
}

export function ShopView({
  orgId,
  phase,
  products,
  orders,
  categories,
  merchAssets,
  canOrder,
  locale,
  dateLocale,
  t,
  common,
  rpcMessages,
}: {
  orgId: string;
  phase: ShopPhase;
  products: ShopProduct[];
  orders: ShopOrder[];
  /** Beschriftungen aus dem Vokabular `product_category`. */
  categories: Record<string, string>;
  /** Aktuelle Dateien der Organisation — Auswahl für ein Logo-Feld (S4). */
  merchAssets: MerchAsset[];
  canOrder: boolean;
  locale: Locale;
  dateLocale: string;
  t: Strings;
  common: { cancel: string; none: string; save: string };
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [tab, setTab] = useState<string | null>(null);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [asking, setAsking] = useState<ShopProduct | null>(null);
  const [requestText, setRequestText] = useState("");
  const [askConfirm, setAskConfirm] = useState(false);
  const [configuring, setConfiguring] = useState<
    { product: ShopProduct; fields: MerchField[]; qty: number; initial: Record<string, unknown> | null } | null
  >(null);
  const [askCancel, setAskCancel] = useState<ShopOrder | null>(null);

  const message = (key: string) => rpcMessages[key] ?? rpcMessages.unknown ?? key;
  const dateTime = new Intl.DateTimeFormat(dateLocale, {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const name = (p: { name_de: string | null; name_en: string | null; sku?: string }) =>
    (locale === "en" ? p.name_en : p.name_de) ?? p.name_de ?? p.name_en ?? p.sku ?? "—";
  const hint = (p: ShopProduct) => (locale === "en" ? p.shop_hint_en : p.shop_hint_de);
  const description = (p: ShopProduct) =>
    (locale === "en" ? p.description_en : p.description_de) ?? p.description_de;

  /**
   * Welche Produkte eine Konfiguration verlangen, steht am Produkt (S4).
   * Kein Merch-Schema ⇒ der Knopf legt wie bisher direkt in den Warenkorb.
   */
  const merchOf = useMemo(() => {
    const map = new Map<string, MerchField[]>();
    for (const p of products) {
      const fields = parseMerchSchema(p.merch_config);
      if (fields) map.set(p.sku, fields);
    }
    return map;
  }, [products]);

  const cart = cartOf(orders);

  // Die Bestellung im Warenkorb steht nicht noch einmal in der Historie.
  const history = orders.filter((o) => o.id !== cart?.id);
  const inCart = useMemo(() => {
    const map = new Map<string, number>();
    for (const line of cart?.lines ?? []) map.set(line.sku, line.qty);
    return map;
  }, [cart]);

  /**
   * Zeilen, deren Konfiguration noch nicht vollständig ist. Bestätigen wäre
   * sonst eine Bestellung ohne Größen — `shop_confirm` weist sie ohnehin ab.
   */
  const incomplete = (cart?.lines ?? []).filter((line) => {
    const fields = merchOf.get(line.sku);
    if (!fields) return false;
    return (
      checkMerchValues(fields, (line.merch_config ?? {}) as MerchValues, line.qty).length > 0
    );
  });

  const tabs = useMemo(() => {
    const keys = [...new Set(products.map((p) => p.category ?? ""))].filter(Boolean);
    return keys.sort((a, b) =>
      (categories[a] ?? a).localeCompare(categories[b] ?? b, locale),
    );
  }, [products, categories, locale]);
  const current = tab ?? tabs[0] ?? null;
  const shown = products.filter((p) => (p.category ?? "") === current);

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

  function onAdd(p: ShopProduct) {
    const raw = qty[p.sku] ?? "1";
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) {
      toast("error", t.qtyInvalid);
      return;
    }
    const fields = merchOf.get(p.sku);
    if (fields) {
      // Erst konfigurieren, dann in den Warenkorb — eine halbe Konfiguration
      // soll gar nicht erst entstehen.
      setConfiguring({
        product: p,
        fields,
        qty: value,
        initial: cart?.lines.find((l) => l.sku === p.sku)?.merch_config ?? null,
      });
      return;
    }
    run(shopUpsertLine({ orgId, sku: p.sku, qty: value }), t.added);
  }

  function onRequest() {
    if (requestText.trim() === "") {
      toast("error", message("text_required"));
      return;
    }
    const sku = asking?.sku ?? null;
    setAsking(null);
    const text = requestText;
    setRequestText("");
    run(shopRequestProduct({ orgId, text, sku }), t.requested);
  }

  const closed = phase.phase === 0;

  return (
    <div className="flex flex-col gap-6">
      {/* Phasen-Banner: was gerade geht, und bis wann. */}
      <Card
        className={cn(
          closed ? "border-warning-soft bg-warning-soft" : "border-accent-soft bg-accent-soft",
        )}
      >
        <h2 className={cn("ct-h3", closed ? "text-warning-ink" : "text-accent-deep")}>
          {closed
            ? t.phaseClosed
            : (t[`phase_${phase.phase}`] ?? t.phaseOpen).replace("{n}", String(phase.phase))}
        </h2>
        <p className={cn("ct-help mt-1", closed ? "text-warning-ink" : "text-accent-deep")}>
          {closed
            ? t.phaseClosedBody
            : phase.late_only
              ? t.phaseLateOnly
              : t.phaseOpenBody}
        </p>
        {phase.ends_at && !closed && (
          <p className={cn("ct-help mt-1", "text-accent-deep")}>
            {t.phaseEnds} {dateTime.format(new Date(phase.ends_at))}
          </p>
        )}
      </Card>

      {/* Katalog */}
      <section aria-labelledby="h-catalogue">
        <h2 id="h-catalogue" className="ct-h3 mb-3 text-ink">
          {t.catalogue}
        </h2>
        {tabs.length > 1 && (
          <div className="mb-4 flex flex-wrap gap-1" role="tablist" aria-label={t.categories}>
            {tabs.map((key) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={key === current}
                onClick={() => setTab(key)}
                className={cn(
                  "rounded-ct-sm px-2.5 py-1.5 text-[14px] font-semibold transition-colors",
                  key === current
                    ? "bg-accent-soft text-accent-deep"
                    : "text-muted hover:bg-surface-hover hover:text-ink",
                )}
              >
                {categories[key] ?? key}
              </button>
            ))}
          </div>
        )}

        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((p) => {
            const image = p.images?.[0];
            const already = inCart.get(p.sku);
            return (
              <Card as="li" key={p.sku} className="flex flex-col">
                {image && (
                  // Bilder liegen im öffentlichen Bucket; kein next/image,
                  // weil die Domain je Umgebung wechselt.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={image.url}
                    alt=""
                    className="mb-3 h-32 w-full rounded-ct-sm object-cover"
                    loading="lazy"
                  />
                )}
                <h3 className="ct-label text-ink">{name(p)}</h3>
                {description(p) && (
                  <p className="ct-help mt-1 line-clamp-3">{description(p)}</p>
                )}
                {hint(p) && <p className="ct-help mt-1 font-semibold">{hint(p)}</p>}

                <div className="mt-3 flex flex-wrap items-baseline gap-2">
                  {p.net_price_cents != null ? (
                    <>
                      <span className="ct-label text-ink">
                        {money(p.net_price_cents, dateLocale)}
                      </span>
                      <span className="ct-help">{t.plusVat}</span>
                      {p.unit && <span className="ct-help">/ {t[`unit_${p.unit}`] ?? p.unit}</span>}
                    </>
                  ) : (
                    <span className="ct-help">{t.priceOnRequest}</span>
                  )}
                </div>
                {p.track_stock && (
                  <p className="ct-help mt-1">
                    {t.stock}: {p.stock_available ?? 0}
                  </p>
                )}
                {p.available_until && (
                  <p className="ct-help mt-1">
                    {t.availableUntil} {dateTime.format(new Date(p.available_until))}
                  </p>
                )}

                <div className="mt-auto pt-3">
                  {p.request_only ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={!canOrder || pending}
                      onClick={() => {
                        setAsking(p);
                        setRequestText("");
                      }}
                    >
                      {t.request}
                    </Button>
                  ) : !p.orderable ? (
                    <p className="ct-help">{t.notOrderable}</p>
                  ) : canOrder ? (
                    <div className="flex flex-wrap items-end gap-2">
                      <Field label={t.qty} htmlFor={`q-${p.sku}`} className="w-24">
                        <Input
                          id={`q-${p.sku}`}
                          type="number"
                          min={1}
                          value={qty[p.sku] ?? (already ? String(already) : "1")}
                          onChange={(e) =>
                            setQty((prev) => ({ ...prev, [p.sku]: e.target.value }))
                          }
                        />
                      </Field>
                      <Button size="sm" disabled={pending} onClick={() => onAdd(p)}>
                        {already ? t.update : t.add}
                      </Button>
                      {already != null && (
                        <span className="ct-help">
                          {t.inCart}: {already}
                        </span>
                      )}
                    </div>
                  ) : (
                    <p className="ct-help">{t.readOnly}</p>
                  )}
                </div>
              </Card>
            );
          })}
        </ul>
      </section>

      {/* Warenkorb = Entwurf der laufenden Phase */}
      {cart && (
        <section aria-labelledby="h-cart">
          <h2 id="h-cart" className="ct-h3 mb-3 text-ink">
            {t.cart}
          </h2>
          {cart.status === "editing" && <p className="ct-help mb-2">{t.cartReopened}</p>}
          <Card>
            <ul className="flex flex-col gap-2">
              {cart.lines.map((line) => (
                <li
                  key={line.sku}
                  className="flex flex-wrap items-baseline justify-between gap-2 border-b pb-2 last:border-0"
                >
                  <span className="ct-label text-ink">{name(line)}</span>
                  <span className="ct-help tabular-nums">
                    {line.qty} × {money(line.price_net_cents, dateLocale)} ={" "}
                    {money(line.line_net_cents, dateLocale)}
                  </span>
                  <MerchSummary
                    fields={merchOf.get(line.sku)}
                    config={line.merch_config}
                    locale={locale}
                    empty={t.merchMissing}
                  />
                  {canOrder && cart.editable && merchOf.has(line.sku) && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => {
                        const product = products.find((p) => p.sku === line.sku);
                        const fields = merchOf.get(line.sku);
                        if (!product || !fields) return;
                        setConfiguring({
                          product,
                          fields,
                          qty: line.qty,
                          initial: line.merch_config,
                        });
                      }}
                    >
                      {t.merchEdit}
                    </Button>
                  )}
                  {canOrder && cart.editable && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => run(shopRemoveLine(cart.id, line.sku), t.removed)}
                    >
                      {t.remove}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
            <Totals order={cart} dateLocale={dateLocale} t={t} />
            {canOrder && cart.editable && (
              <div className="mt-4 flex flex-col gap-3">
                <Field label={t.note} htmlFor="cart-note" hint={t.noteHint}>
                  <Textarea
                    id="cart-note"
                    rows={2}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </Field>
                {incomplete.length > 0 && (
                  <p className="ct-help text-error-ink">
                    {t.merchIncomplete}: {incomplete.map((l) => name(l)).join(", ")}
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button
                    disabled={
                      pending || cart.lines.length === 0 || closed || incomplete.length > 0
                    }
                    onClick={() => setAskConfirm(true)}
                  >
                    {t.confirm}
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={pending}
                    onClick={() => setAskCancel(cart)}
                  >
                    {t.cancelOrder}
                  </Button>
                </div>
              </div>
            )}
            <p className="ct-help mt-3">{t.invoiceHint}</p>
          </Card>
        </section>
      )}

      {/* Bestellhistorie */}
      {history.length > 0 && (
        <section aria-labelledby="h-orders">
          <h2 id="h-orders" className="ct-h3 mb-3 text-ink">
            {t.orders}
          </h2>
          <ul className="flex flex-col gap-3">
            {history.map((o) => (
              <Card as="li" key={o.id}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="ct-label text-ink">{o.order_no ?? "—"}</span>
                  <Badge tone={STATUS_TONE[o.status] ?? "neutral"}>
                    {t[`order_${o.status}`] ?? o.status}
                  </Badge>
                  <span className="ct-help">
                    {t.phaseShort} {o.phase}
                  </span>
                  {o.confirmed_at && (
                    <span className="ct-help">
                      {t.confirmedOn} {dateTime.format(new Date(o.confirmed_at))}
                    </span>
                  )}
                </div>
                <ul className="ct-help mt-2 flex flex-col gap-0.5">
                  {o.lines.map((line) => (
                    <li key={line.sku} className="tabular-nums">
                      {line.qty} × {name(line)} — {money(line.line_net_cents, dateLocale)}
                      <MerchSummary
                        fields={merchOf.get(line.sku)}
                        config={line.merch_config}
                        locale={locale}
                      />
                    </li>
                  ))}
                </ul>
                <Totals order={o} dateLocale={dateLocale} t={t} />
                {o.note && (
                  <p className="ct-help mt-2">
                    {t.note}: {o.note}
                  </p>
                )}
                {canOrder && o.editable && (
                  <div className="mt-3 flex flex-wrap gap-2">
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
              </Card>
            ))}
          </ul>
        </section>
      )}

      {asking && (
        <ConfirmDialog
          title={t.requestTitle}
          body={t.requestBody.replace("{product}", name(asking))}
          detail={
            <Field label={t.requestText} htmlFor="req-text" hint={t.requestTextHint}>
              <Textarea
                id="req-text"
                rows={3}
                value={requestText}
                onChange={(e) => setRequestText(e.target.value)}
              />
            </Field>
          }
          confirmLabel={t.requestSend}
          cancelLabel={common.cancel}
          pending={pending}
          onCancel={() => setAsking(null)}
          onConfirm={onRequest}
        />
      )}
      {askConfirm && cart && (
        <ConfirmDialog
          title={t.confirmTitle}
          body={t.confirmBody}
          detail={
            <p className="ct-label">
              {cart.lines.length} {t.positions} · {money(cart.gross_cents, dateLocale)}
            </p>
          }
          confirmLabel={t.confirm}
          cancelLabel={common.cancel}
          pending={pending}
          onCancel={() => setAskConfirm(false)}
          onConfirm={() => {
            setAskConfirm(false);
            run(shopConfirm(cart.id, note), t.confirmed);
            setNote("");
          }}
        />
      )}
      {askCancel && (
        <ConfirmDialog
          title={t.cancelTitle}
          body={t.cancelBody}
          detail={<p className="ct-label">{askCancel.order_no ?? t.cart}</p>}
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
      {configuring && (
        <MerchDialog
          title={name(configuring.product)}
          fields={configuring.fields}
          initial={configuring.initial}
          qty={configuring.qty}
          assets={merchAssets}
          locale={locale}
          pending={pending}
          t={t}
          common={{ cancel: common.cancel, save: common.save, none: common.none }}
          onCancel={() => setConfiguring(null)}
          onSave={(config) => {
            const { product, qty: amount } = configuring;
            setConfiguring(null);
            run(
              shopUpsertLine({ orgId, sku: product.sku, qty: amount, merchConfig: config }),
              t.added,
            );
          }}
        />
      )}
    </div>
  );
}

/**
 * Konfiguration einer Zeile in einem Satz. `empty` sagt, dass noch etwas
 * fehlt — ohne Text bleibt die Zeile stumm (Historie).
 */
function MerchSummary({
  fields,
  config,
  locale,
  empty,
}: {
  fields: MerchField[] | undefined;
  config: Record<string, unknown> | null;
  locale: Locale;
  empty?: string;
}) {
  if (!fields) return null;
  const rows = describeMerch(fields, config, locale);
  if (rows.length === 0) return empty ? <span className="ct-help text-error-ink">{empty}</span> : null;
  return (
    <span className="ct-help">
      {rows.map((r) => `${r.label}: ${r.value}`).join(" · ")}
    </span>
  );
}

function Totals({
  order,
  dateLocale,
  t,
}: {
  order: ShopOrder;
  dateLocale: string;
  t: Strings;
}) {
  return (
    <dl className="ct-help mt-3 flex flex-wrap gap-x-4 gap-y-1">
      <div className="flex gap-1">
        <dt className="font-semibold">{t.net}:</dt>
        <dd className="tabular-nums">{money(order.net_cents, dateLocale)}</dd>
      </div>
      <div className="flex gap-1">
        <dt className="font-semibold">{t.vat}:</dt>
        <dd className="tabular-nums">{money(order.vat_cents, dateLocale)}</dd>
      </div>
      <div className="flex gap-1">
        <dt className="font-semibold">{t.gross}:</dt>
        <dd className="tabular-nums">{money(order.gross_cents, dateLocale)}</dd>
      </div>
    </dl>
  );
}
