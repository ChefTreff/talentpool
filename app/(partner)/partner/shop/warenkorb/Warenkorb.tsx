"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Locale } from "@/lib/i18n/shared";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Input, Textarea } from "@/components/ui/Input";
import { ConfirmDialog } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { checkMerchValues, parseMerchSchema, type MerchField, type MerchValues } from "@/lib/partner/merch";
import { MerchDialog, type MerchAsset } from "../MerchDialog";
import { MerchSummary, Totals } from "../Zusammenfassung";
import { money } from "../format";
import { shopCancel, shopConfirm, shopRemoveLine, shopUpsertLine } from "../../actions";
import type { PartnerOverview, ShopOrder, ShopProduct } from "../../types";

type Strings = Record<string, string>;

/**
 * Warenkorb und Kasse.
 *
 * Konrad wollte vor dem Bestellen „nochmal kurz die Rechnungsadresse
 * überprüfen plus erweiterte Infos wie ein PO eingeben". Beides ist hier —
 * mit einem Unterschied: die Adresse wird **gezeigt und bestätigt**, nicht
 * neu erfasst. Sie steht in „Eure Daten"; ein zweites Adressfeld an der Kasse
 * hiesse, dass hinterher niemand weiss, welche gilt. Der Link führt dorthin.
 *
 * Die PO-Nummer gehört dagegen an die Bestellung: viele Häuser vergeben eine
 * je Auftrag. Was in den Stammdaten steht, ist nur die Vorgabe.
 */
export function Warenkorb({
  orgId,
  cart,
  products,
  overview,
  closed,
  canOrder,
  merchAssets,
  locale,
  dateLocale,
  t,
  common,
  rpcMessages,
}: {
  orgId: string;
  cart: ShopOrder;
  products: ShopProduct[];
  overview: PartnerOverview | null;
  closed: boolean;
  canOrder: boolean;
  merchAssets: MerchAsset[];
  locale: Locale;
  dateLocale: string;
  t: Strings;
  common: { cancel: string; none: string; save: string };
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState("");
  const [po, setPo] = useState(cart.po_number ?? overview?.edition.po_number ?? "");
  const [adresseOk, setAdresseOk] = useState(false);
  const [askConfirm, setAskConfirm] = useState(false);
  const [askCancel, setAskCancel] = useState(false);
  const [configuring, setConfiguring] = useState<
    { sku: string; name: string; fields: MerchField[]; qty: number; initial: Record<string, unknown> | null } | null
  >(null);

  const message = (key: string) => rpcMessages[key] ?? rpcMessages.unknown ?? key;
  const name = (p: { name_de: string | null; name_en: string | null; sku?: string }) =>
    (locale === "en" ? p.name_en : p.name_de) ?? p.name_de ?? p.name_en ?? p.sku ?? "—";

  const merchOf = new Map<string, MerchField[]>();
  for (const p of products) {
    const fields = parseMerchSchema(p.merch_config);
    if (fields) merchOf.set(p.sku, fields);
  }

  /** Zeilen, deren Konfiguration fehlt — `shop_confirm` weist sie ohnehin ab. */
  const incomplete = cart.lines.filter((line) => {
    const fields = merchOf.get(line.sku);
    if (!fields) return false;
    return checkMerchValues(fields, (line.merch_config ?? {}) as MerchValues, line.qty).length > 0;
  });

  const org = overview?.org;
  const adresse = [
    org?.address.street,
    [org?.address.zip, org?.address.city].filter(Boolean).join(" "),
    org?.address.country,
  ].filter((x) => x && x.trim() !== "");
  const rechnungsName = overview?.edition.invoice_name ?? org?.legal_name ?? null;
  const adresseVollstaendig = adresse.length > 0 && rechnungsName !== null;

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
    <div className="flex flex-col gap-6">
      <p>
        <Link className="ct-link ct-small" href="/partner/shop">
          ← {t.backToCatalogue}
        </Link>
      </p>

      {cart.status === "editing" && <p className="ct-help">{t.cartReopened}</p>}

      <section aria-labelledby="h-cart">
        <div className="mb-2 flex flex-wrap items-baseline gap-2 border-b pb-2">
          <h2 id="h-cart" className="ct-h3 text-ink">
            {t.cart}
          </h2>
          <span className="ct-help ml-auto tabular-nums">
            {cart.lines.length} {t.positions}
          </span>
        </div>

        <Card className="p-0">
          <ul className="flex flex-col">
            {cart.lines.map((line) => (
              <li key={line.sku} className="flex flex-wrap items-center gap-3 border-b px-4 py-3 last:border-b-0">
                <span className="min-w-0 flex-1">
                  <Link
                    href={`/partner/shop/${encodeURIComponent(line.sku)}`}
                    className="ct-label ct-link"
                  >
                    {name(line)}
                  </Link>
                  <MerchSummary
                    fields={merchOf.get(line.sku)}
                    config={line.merch_config}
                    locale={locale}
                    empty={t.merchMissing}
                  />
                </span>

                {canOrder && cart.editable ? (
                  <Field label={t.qty} htmlFor={`cq-${line.sku}`} className="w-24">
                    <Input
                      id={`cq-${line.sku}`}
                      type="number"
                      min={1}
                      defaultValue={line.qty}
                      disabled={pending}
                      // Beim Verlassen des Feldes, nicht bei jeder Taste: sonst
                      // liefe für „12" erst eine Bestellung über 1 durch.
                      onBlur={(e) => {
                        const value = Number(e.target.value);
                        if (!Number.isFinite(value) || value <= 0) {
                          toast("error", t.qtyInvalid);
                          return;
                        }
                        if (value === line.qty) return;
                        run(shopUpsertLine({ orgId, sku: line.sku, qty: value }), t.added);
                      }}
                    />
                  </Field>
                ) : (
                  <span className="ct-small tabular-nums">{line.qty} ×</span>
                )}

                <span className="ct-small w-[140px] shrink-0 text-right tabular-nums text-ink">
                  {money(line.line_net_cents, dateLocale)}
                </span>

                {canOrder && cart.editable && merchOf.has(line.sku) && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() => {
                      const fields = merchOf.get(line.sku);
                      if (!fields) return;
                      setConfiguring({
                        sku: line.sku,
                        name: name(line),
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
          <div className="px-4 pb-4">
            <Totals order={cart} dateLocale={dateLocale} t={t} />
          </div>
        </Card>
      </section>

      {canOrder && cart.editable && (
        <section aria-labelledby="h-checkout">
          <div className="mb-2 border-b pb-2">
            <h2 id="h-checkout" className="ct-h3 text-ink">
              {t.checkout}
            </h2>
          </div>

          <div className="flex flex-col gap-4">
            {/* Rechnungsdaten: zeigen, bestätigen, bei Bedarf dorthin gehen,
                wo sie gepflegt werden. */}
            <Card>
              <h3 className="ct-label text-ink">{t.invoiceTitle}</h3>
              {adresseVollstaendig ? (
                <address className="ct-small mt-2 leading-6 not-italic">
                  {rechnungsName}
                  {adresse.map((zeile) => (
                    <span key={zeile} className="block">
                      {zeile}
                    </span>
                  ))}
                  {overview?.edition.invoice_email && (
                    <span className="block">{overview.edition.invoice_email}</span>
                  )}
                  {overview?.edition.vat_id && (
                    <span className="block">
                      {t.vatId}: {overview.edition.vat_id}
                    </span>
                  )}
                </address>
              ) : (
                <p className="ct-small mt-2 leading-6 text-error-ink">{t.invoiceMissing}</p>
              )}
              <p className="ct-help mt-2">
                <Link className="ct-link" href="/partner/onboarding">
                  {t.invoiceEdit}
                </Link>
              </p>
              <label className="mt-3 flex items-start gap-2">
                <input
                  type="checkbox"
                  className="mt-0.5 h-5 w-5"
                  checked={adresseOk}
                  disabled={!adresseVollstaendig}
                  onChange={(e) => setAdresseOk(e.target.checked)}
                />
                <span className="ct-small">{t.invoiceConfirm}</span>
              </label>
            </Card>

            <Card>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t.poNumber} htmlFor="po" hint={t.poHint}>
                  <Input id="po" value={po} onChange={(e) => setPo(e.target.value)} maxLength={80} />
                </Field>
                <Field label={t.note} htmlFor="cart-note" hint={t.noteHint}>
                  <Textarea
                    id="cart-note"
                    rows={2}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </Field>
              </div>

              {incomplete.length > 0 && (
                <p className="ct-help mt-3 text-error-ink">
                  {t.merchIncomplete}: {incomplete.map((l) => name(l)).join(", ")}
                </p>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  disabled={
                    pending ||
                    cart.lines.length === 0 ||
                    closed ||
                    incomplete.length > 0 ||
                    !adresseOk
                  }
                  onClick={() => setAskConfirm(true)}
                >
                  {t.confirm}
                </Button>
                <Button variant="ghost" disabled={pending} onClick={() => setAskCancel(true)}>
                  {t.cancelOrder}
                </Button>
              </div>
              {!adresseOk && <p className="ct-help mt-2">{t.invoiceConfirmFirst}</p>}
              <p className="ct-help mt-3">{t.invoiceHint}</p>
            </Card>
          </div>
        </section>
      )}

      {askConfirm && (
        <ConfirmDialog
          title={t.confirmTitle}
          body={t.confirmBody}
          detail={
            <p className="ct-label">
              {cart.lines.length} {t.positions} · {money(cart.gross_cents, dateLocale)}
              {po.trim() !== "" && ` · ${t.poNumber}: ${po.trim()}`}
            </p>
          }
          confirmLabel={t.confirm}
          cancelLabel={common.cancel}
          pending={pending}
          onCancel={() => setAskConfirm(false)}
          onConfirm={() => {
            setAskConfirm(false);
            run(shopConfirm(cart.id, note, po.trim() || null), t.confirmed);
            setNote("");
          }}
        />
      )}
      {askCancel && (
        <ConfirmDialog
          title={t.cancelTitle}
          body={t.cancelBody}
          detail={<p className="ct-label">{cart.order_no ?? t.cart}</p>}
          confirmLabel={t.cancelOrder}
          cancelLabel={common.cancel}
          pending={pending}
          onCancel={() => setAskCancel(false)}
          onConfirm={() => {
            setAskCancel(false);
            run(shopCancel(cart.id), t.cancelled);
          }}
        />
      )}
      {configuring && (
        <MerchDialog
          title={configuring.name}
          fields={configuring.fields}
          initial={configuring.initial}
          qty={configuring.qty}
          assets={merchAssets}
          locale={locale}
          pending={pending}
          t={t}
          common={common}
          onCancel={() => setConfiguring(null)}
          onSave={(config) => {
            const { sku, qty } = configuring;
            setConfiguring(null);
            run(shopUpsertLine({ orgId, sku, qty, merchConfig: config }), t.added);
          }}
        />
      )}
    </div>
  );
}
