"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Locale } from "@/lib/i18n/shared";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input, Textarea } from "@/components/ui/Input";
import { ConfirmDialog } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { parseMerchSchema, type MerchField } from "@/lib/partner/merch";
import { MerchDialog, type MerchAsset } from "./MerchDialog";
import { shopRequestProduct, shopUpsertLine } from "../actions";
import type { ShopProduct } from "../types";

type Strings = Record<string, string>;

/**
 * Menge wählen und in den Warenkorb legen — die einzige Aktion, die ein
 * Produkt kennt.
 *
 * Sie steht auf der Katalogkarte **und** auf der Produktseite. Deshalb hier
 * und nicht in einer der beiden: zwei Fassungen desselben Knopfes wären zwei
 * Gelegenheiten, die Merch-Konfiguration zu vergessen.
 */
export function AddToCart({
  orgId,
  product,
  inCart,
  canOrder,
  merchAssets,
  locale,
  t,
  common,
  rpcMessages,
  size = "sm",
}: {
  orgId: string;
  product: ShopProduct;
  /** Menge, die schon im Warenkorb liegt. `null` = nichts drin. */
  inCart: number | null;
  canOrder: boolean;
  merchAssets: MerchAsset[];
  locale: Locale;
  t: Strings;
  common: { cancel: string; none: string; save: string };
  rpcMessages: Record<string, string>;
  size?: "sm" | "md";
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [qty, setQty] = useState(inCart ? String(inCart) : "1");
  const [asking, setAsking] = useState(false);
  const [requestText, setRequestText] = useState("");
  const [configuring, setConfiguring] = useState<{ fields: MerchField[]; qty: number } | null>(null);

  const message = (key: string) => rpcMessages[key] ?? rpcMessages.unknown ?? key;
  const name = (locale === "en" ? product.name_en : product.name_de) ?? product.sku;
  const fields = parseMerchSchema(product.merch_config);

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

  function onAdd() {
    const value = Number(qty);
    if (!Number.isFinite(value) || value <= 0) {
      toast("error", t.qtyInvalid);
      return;
    }
    if (fields) {
      // Erst konfigurieren, dann in den Warenkorb — eine halbe Konfiguration
      // soll gar nicht erst entstehen.
      setConfiguring({ fields, qty: value });
      return;
    }
    run(shopUpsertLine({ orgId, sku: product.sku, qty: value }), t.added);
  }

  if (product.request_only) {
    return (
      <>
        <Button
          size={size}
          variant="secondary"
          disabled={!canOrder || pending}
          onClick={() => {
            setAsking(true);
            setRequestText("");
          }}
        >
          {t.request}
        </Button>
        {asking && (
          <ConfirmDialog
            title={t.requestTitle}
            body={t.requestBody.replace("{product}", name)}
            detail={
              <Field label={t.requestText} htmlFor={`req-${product.sku}`} hint={t.requestTextHint}>
                <Textarea
                  id={`req-${product.sku}`}
                  rows={3}
                  value={requestText}
                  onChange={(e) => setRequestText(e.target.value)}
                />
              </Field>
            }
            confirmLabel={t.requestSend}
            cancelLabel={common.cancel}
            pending={pending}
            onCancel={() => setAsking(false)}
            onConfirm={() => {
              if (requestText.trim() === "") {
                toast("error", message("text_required"));
                return;
              }
              const text = requestText;
              setAsking(false);
              setRequestText("");
              run(shopRequestProduct({ orgId, text, sku: product.sku }), t.requested);
            }}
          />
        )}
      </>
    );
  }

  if (!product.orderable) return <p className="ct-help">{t.notOrderable}</p>;
  if (!canOrder) return <p className="ct-help">{t.readOnly}</p>;

  return (
    <>
      <div className="flex flex-wrap items-end gap-2">
        <Field label={t.qty} htmlFor={`q-${product.sku}`} className="w-24">
          <Input
            id={`q-${product.sku}`}
            type="number"
            min={1}
            value={qty}
            onChange={(e) => setQty(e.target.value)}
          />
        </Field>
        <Button size={size} disabled={pending} onClick={onAdd}>
          {inCart ? t.update : t.add}
        </Button>
        {inCart != null && (
          <span className="ct-help">
            {t.inCart}: {inCart}
          </span>
        )}
      </div>

      {configuring && (
        <MerchDialog
          title={name}
          fields={configuring.fields}
          initial={null}
          qty={configuring.qty}
          assets={merchAssets}
          locale={locale}
          pending={pending}
          t={t}
          common={common}
          onCancel={() => setConfiguring(null)}
          onSave={(config) => {
            const amount = configuring.qty;
            setConfiguring(null);
            run(shopUpsertLine({ orgId, sku: product.sku, qty: amount, merchConfig: config }), t.added);
          }}
        />
      )}
    </>
  );
}
