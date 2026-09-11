"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Input, Textarea } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/Table";
import { useToast } from "@/components/ui/Toast";
import {
  MERCH_FIELD_TYPES,
  parseMerchSchema,
  type MerchField,
} from "@/lib/partner/merch";
import { saveProduct, saveProductComponent } from "../actions";
import { money } from "../format";
import type { AdminProduct, ProductComponent } from "../types";

type Strings = Record<string, string>;

/** Die RPC weist alles ab, was nicht so aussieht — also prüft die Maske mit. */
const SKU_PATTERN = /^I-\d{5}$/;

const BLANK: AdminProduct = {
  sku: "",
  name_de: "",
  name_en: null,
  description_de: null,
  description_en: null,
  type: "shop_item",
  category: null,
  unit: "piece",
  net_price_cents: null,
  purchase_price_cents: null,
  margin: null,
  vat_rate: 7,
  supplier: null,
  supplier_sku: null,
  supplier_url: null,
  stock_total: null,
  track_stock: false,
  available_until: null,
  shop_visible: false,
  shop_sort: null,
  late_orderable: false,
  shop_hint_de: null,
  shop_hint_en: null,
  purchase_note_de: null,
  purchase_note_en: null,
  internal_comment: null,
  merch_config: null,
  images: null,
  source_hubspot: false,
  source_shop: true,
  pass_type: null,
  grants_role: null,
  active: true,
  edition_id: null,
};

export function ProductEditor({
  products,
  components,
  categories,
  roles,
  passTypes,
  dateLocale,
  t,
  common,
  rpcMessages,
}: {
  products: AdminProduct[];
  components: ProductComponent[];
  /** Vokabular `product_category`. */
  categories: Record<string, string>;
  /** Vokabular `role` — `grants_role` prüft die RPC dagegen. */
  roles: Record<string, string>;
  /** Die drei Pass-Typen, die `upsert_product` erlaubt. */
  passTypes: readonly string[];
  dateLocale: string;
  t: Strings;
  common: { cancel: string; none: string; save: string };
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [filter, setFilter] = useState("");
  const [draft, setDraft] = useState<AdminProduct | null>(null);
  const [component, setComponent] = useState({ sku: "", qty: "1" });
  /** `null` = kein Merch-Artikel; die leere Liste schaltet die Felder frei. */
  const [merch, setMerch] = useState<MerchField[] | null>(null);

  const message = (key: string) => rpcMessages[key] ?? rpcMessages.unknown ?? key;
  const isNew = draft !== null && !products.some((p) => p.sku === draft.sku);

  const shown = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return products;
    return products.filter((p) =>
      [p.sku, p.name_de, p.name_en, p.category, p.supplier]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(needle)),
    );
  }, [products, filter]);

  const parts = useMemo(
    () => components.filter((c) => c.bundle_sku === draft?.sku),
    [components, draft],
  );

  function patch(part: Partial<AdminProduct>) {
    setDraft((d) => (d ? { ...d, ...part } : d));
  }

  function cents(value: string): number | null {
    const n = Number(value.replace(",", "."));
    return Number.isFinite(n) ? Math.round(n * 100) : null;
  }

  function onSave() {
    if (!draft) return;
    if (!SKU_PATTERN.test(draft.sku.trim())) {
      toast("error", message("invalid_sku"));
      return;
    }
    const payload: Record<string, unknown> = {
      sku: draft.sku.trim(),
      name_de: draft.name_de ?? "",
      name_en: draft.name_en ?? null,
      description_de: draft.description_de ?? null,
      description_en: draft.description_en ?? null,
      type: draft.type ?? "shop_item",
      unit: draft.unit ?? "piece",
      net_price_cents: draft.net_price_cents,
      purchase_price_cents: draft.purchase_price_cents,
      vat_rate: draft.vat_rate,
      supplier: draft.supplier ?? null,
      supplier_sku: draft.supplier_sku ?? null,
      supplier_url: draft.supplier_url ?? null,
      stock_total: draft.stock_total,
      track_stock: draft.track_stock,
      available_until: draft.available_until,
      shop_visible: draft.shop_visible,
      shop_sort: draft.shop_sort,
      late_orderable: draft.late_orderable,
      shop_hint_de: draft.shop_hint_de ?? null,
      shop_hint_en: draft.shop_hint_en ?? null,
      internal_comment: draft.internal_comment ?? null,
      active: draft.active,
    };
    // Kategorie, Pass-Typ und Rolle prüft die RPC gegen das Vokabular; leere
    // Werte schicken wir gar nicht erst mit, sonst wird aus „nicht gesetzt"
    // ein ungültiger Schlüssel.
    if (draft.category) payload.category = draft.category;
    // Merch-Schema (S4): leere Liste heißt „kein Merch-Artikel", sonst stünde
    // im Shop ein Dialog ohne Felder.
    payload.merch_config = merch && merch.length > 0 ? merch : null;
    payload.pass_type = draft.pass_type || null;
    payload.grants_role = draft.grants_role || null;

    startTransition(async () => {
      const res = await saveProduct(payload);
      if (!res.ok) {
        toast("error", message(res.key) + (res.detail ? ` (${res.detail})` : ""));
        return;
      }
      toast("success", t.productSaved);
      setDraft(null);
      setMerch(null);
      router.refresh();
    });
  }

  function onComponent() {
    if (!draft) return;
    const qty = Number(component.qty.replace(",", "."));
    if (!component.sku || !Number.isFinite(qty)) {
      toast("error", message("invalid_argument"));
      return;
    }
    startTransition(async () => {
      const res = await saveProductComponent(draft.sku, component.sku, qty);
      if (!res.ok) {
        toast("error", message(res.key) + (res.detail ? ` (${res.detail})` : ""));
        return;
      }
      toast("success", t.productSaved);
      setComponent({ sku: "", qty: "1" });
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader
          title={t.productsTitle}
          description={`${t.productsLead} · ${products.length}`}
          action={
            <Button
              disabled={pending}
              onClick={() => {
                setDraft({ ...BLANK });
                setMerch(null);
              }}
            >
              {t.productNew}
            </Button>
          }
        />
        <Field label={t.search} htmlFor="p-search" className="max-w-sm">
          <Input id="p-search" value={filter} onChange={(e) => setFilter(e.target.value)} />
        </Field>
        <div className="mt-4">
          <Table>
            <Thead>
              <Th>{t.colProduct}</Th>
              <Th>{t.colCategory}</Th>
              <Th numeric>{t.colUnitPrice}</Th>
              <Th numeric>{t.colStock}</Th>
              <Th>{t.colShop}</Th>
              <Th aria-label={t.colAction} />
            </Thead>
            <Tbody>
              {shown.map((p) => (
                <Tr key={p.sku}>
                  <Td>
                    <span className="ct-label text-ink">{p.name_de ?? p.sku}</span>
                    <div className="ct-help">
                      {p.sku}
                      {p.grants_role && ` · ${t.grantsRole} ${roles[p.grants_role] ?? p.grants_role}`}
                      {p.pass_type && ` · ${p.pass_type}`}
                    </div>
                  </Td>
                  <Td className="text-muted">{categories[p.category ?? ""] ?? p.category ?? "—"}</Td>
                  <Td numeric>{money(p.net_price_cents, dateLocale)}</Td>
                  <Td numeric>{p.track_stock ? (p.stock_total ?? 0) : "—"}</Td>
                  <Td>
                    {p.shop_visible ? (
                      <Badge tone="success">{t.shopVisible}</Badge>
                    ) : (
                      <Badge tone="neutral">{t.shopHidden}</Badge>
                    )}
                    {!p.active && <Badge tone="warning">{t.inactive}</Badge>}
                  </Td>
                  <Td>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={pending}
                      onClick={() => {
                        setDraft({ ...p });
                        setMerch(parseMerchSchema(p.merch_config));
                      }}
                    >
                      {t.edit}
                    </Button>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </div>
      </Card>

      {draft && (
        <Card>
          <CardHeader
            title={isNew ? t.productNew : (draft.name_de ?? draft.sku)}
            description={isNew ? t.productNewLead : draft.sku}
          />
          <div className="grid gap-4 md:grid-cols-3">
            <Field
              label="SKU"
              htmlFor="p-sku"
              hint={t.skuHint}
              required
              requiredLabel={t.requiredLabel}
            >
              <Input
                id="p-sku"
                value={draft.sku}
                disabled={!isNew}
                invalid={draft.sku !== "" && !SKU_PATTERN.test(draft.sku)}
                onChange={(e) => patch({ sku: e.target.value })}
              />
            </Field>
            <Field label={t.fieldLabelDe} htmlFor="p-de" required requiredLabel={t.requiredLabel}>
              <Input
                id="p-de"
                value={draft.name_de ?? ""}
                onChange={(e) => patch({ name_de: e.target.value })}
              />
            </Field>
            <Field label={t.fieldLabelEn} htmlFor="p-en">
              <Input
                id="p-en"
                value={draft.name_en ?? ""}
                onChange={(e) => patch({ name_en: e.target.value })}
              />
            </Field>
            <Field label={t.colCategory} htmlFor="p-cat">
              <Select
                id="p-cat"
                value={draft.category ?? ""}
                placeholder={common.none}
                options={Object.entries(categories).map(([value, label]) => ({ value, label }))}
                onChange={(e) => patch({ category: e.target.value || null })}
              />
            </Field>
            <Field label={t.fieldUnit} htmlFor="p-unit">
              <Input
                id="p-unit"
                value={draft.unit ?? ""}
                onChange={(e) => patch({ unit: e.target.value })}
              />
            </Field>
            <Field label={t.fieldVat} htmlFor="p-vat">
              <Input
                id="p-vat"
                type="number"
                value={String(draft.vat_rate ?? 7)}
                onChange={(e) => patch({ vat_rate: Number(e.target.value) })}
              />
            </Field>
            <Field label={t.fieldNetPrice} htmlFor="p-price" hint={t.priceHint}>
              <Input
                id="p-price"
                value={draft.net_price_cents == null ? "" : String(draft.net_price_cents / 100)}
                onChange={(e) => patch({ net_price_cents: cents(e.target.value) })}
              />
            </Field>
            <Field label={t.fieldPurchasePrice} htmlFor="p-buy" hint={t.priceHint}>
              <Input
                id="p-buy"
                value={
                  draft.purchase_price_cents == null ? "" : String(draft.purchase_price_cents / 100)
                }
                onChange={(e) => patch({ purchase_price_cents: cents(e.target.value) })}
              />
            </Field>
            <Field label={t.fieldSupplier} htmlFor="p-sup">
              <Input
                id="p-sup"
                value={draft.supplier ?? ""}
                onChange={(e) => patch({ supplier: e.target.value })}
              />
            </Field>
            <Field label={t.fieldStock} htmlFor="p-stock" hint={t.stockHint}>
              <Input
                id="p-stock"
                type="number"
                value={draft.stock_total == null ? "" : String(draft.stock_total)}
                onChange={(e) =>
                  patch({ stock_total: e.target.value === "" ? null : Number(e.target.value) })
                }
              />
            </Field>
            <Field label={t.fieldPassType} htmlFor="p-pass" hint={t.passTypeHint}>
              <Select
                id="p-pass"
                value={draft.pass_type ?? ""}
                placeholder={common.none}
                options={passTypes.map((value) => ({ value, label: value }))}
                onChange={(e) => patch({ pass_type: e.target.value || null })}
              />
            </Field>
            <Field label={t.fieldGrantsRole} htmlFor="p-role" hint={t.grantsRoleHint}>
              <Select
                id="p-role"
                value={draft.grants_role ?? ""}
                placeholder={common.none}
                options={Object.entries(roles).map(([value, label]) => ({ value, label }))}
                onChange={(e) => patch({ grants_role: e.target.value || null })}
              />
            </Field>
            <Field label={t.fieldShopSort} htmlFor="p-sort">
              <Input
                id="p-sort"
                type="number"
                value={draft.shop_sort == null ? "" : String(draft.shop_sort)}
                onChange={(e) =>
                  patch({ shop_sort: e.target.value === "" ? null : Number(e.target.value) })
                }
              />
            </Field>
            <Field label={t.fieldHintDe} htmlFor="p-hde" className="md:col-span-2">
              <Textarea
                id="p-hde"
                rows={2}
                value={draft.shop_hint_de ?? ""}
                onChange={(e) => patch({ shop_hint_de: e.target.value })}
              />
            </Field>
            <Field label={t.fieldHintEn} htmlFor="p-hen" className="md:col-span-2">
              <Textarea
                id="p-hen"
                rows={2}
                value={draft.shop_hint_en ?? ""}
                onChange={(e) => patch({ shop_hint_en: e.target.value })}
              />
            </Field>
            <Field label={t.fieldInternal} htmlFor="p-int" className="md:col-span-3">
              <Textarea
                id="p-int"
                rows={2}
                value={draft.internal_comment ?? ""}
                onChange={(e) => patch({ internal_comment: e.target.value })}
              />
            </Field>
          </div>

          <div className="mt-4 flex flex-wrap gap-4">
            {(
              [
                ["shop_visible", t.fieldShopVisible],
                ["late_orderable", t.fieldLateOrderable],
                ["track_stock", t.fieldTrackStock],
                ["active", t.fieldActive],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="ct-label flex items-center gap-2 text-ink">
                <input
                  type="checkbox"
                  className="h-5 w-5"
                  checked={Boolean(draft[key])}
                  onChange={(e) => patch({ [key]: e.target.checked } as Partial<AdminProduct>)}
                />
                {label}
              </label>
            ))}
          </div>

          <div className="mt-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="ct-h3 text-ink">{t.merchTitle}</h3>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={pending}
                  onClick={() =>
                    setMerch([
                      ...(merch ?? []),
                      {
                        key: "",
                        label_de: "",
                        label_en: "",
                        type: "text",
                        required: true,
                        options: null,
                        max_length: null,
                      },
                    ])
                  }
                >
                  {t.merchAddField}
                </Button>
                {merch && merch.length > 0 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() => setMerch(null)}
                  >
                    {t.merchClear}
                  </Button>
                )}
              </div>
            </div>
            <p className="ct-help mt-1">{t.merchHint}</p>
            <ul className="mt-3 flex flex-col gap-3">
              {(merch ?? []).map((f, i) => {
                const patchField = (part: Partial<MerchField>) =>
                  setMerch((all) => (all ?? []).map((x, j) => (j === i ? { ...x, ...part } : x)));
                return (
                  <li key={i} className="rounded-ct-md border p-3">
                    <div className="grid gap-3 md:grid-cols-4">
                      <Field label={t.fieldKey} htmlFor={`mf-key-${i}`}>
                        <Input
                          id={`mf-key-${i}`}
                          value={f.key}
                          onChange={(e) => patchField({ key: e.target.value })}
                        />
                      </Field>
                      <Field label={t.fieldLabelDe} htmlFor={`mf-de-${i}`}>
                        <Input
                          id={`mf-de-${i}`}
                          value={f.label_de ?? ""}
                          onChange={(e) => patchField({ label_de: e.target.value })}
                        />
                      </Field>
                      <Field label={t.fieldLabelEn} htmlFor={`mf-en-${i}`}>
                        <Input
                          id={`mf-en-${i}`}
                          value={f.label_en ?? ""}
                          onChange={(e) => patchField({ label_en: e.target.value })}
                        />
                      </Field>
                      <Field label={t.fieldType} htmlFor={`mf-type-${i}`}>
                        <Select
                          id={`mf-type-${i}`}
                          value={f.type}
                          options={MERCH_FIELD_TYPES.map((value) => ({
                            value,
                            label: t[`merchType_${value}`] ?? value,
                          }))}
                          onChange={(e) =>
                            patchField({ type: e.target.value as MerchField["type"] })
                          }
                        />
                      </Field>
                    </div>
                    <div className="mt-2 flex flex-wrap items-end gap-3">
                      {(f.type === "select" || f.type === "sizes") && (
                        <Field
                          label={f.type === "sizes" ? t.merchSizes : t.fieldOptions}
                          htmlFor={`mf-opt-${i}`}
                          hint={t.fieldOptionsHint}
                          className="min-w-[280px] flex-1"
                        >
                          <Input
                            id={`mf-opt-${i}`}
                            value={(f.options ?? []).join(", ")}
                            onChange={(e) =>
                              patchField({
                                options: e.target.value
                                  .split(",")
                                  .map((o) => o.trim())
                                  .filter(Boolean),
                              })
                            }
                          />
                        </Field>
                      )}
                      {(f.type === "text" || f.type === "textarea") && (
                        <Field label={t.merchMaxLength} htmlFor={`mf-max-${i}`} className="w-40">
                          <Input
                            id={`mf-max-${i}`}
                            type="number"
                            min={1}
                            value={f.max_length == null ? "" : String(f.max_length)}
                            onChange={(e) =>
                              patchField({
                                max_length:
                                  e.target.value === "" ? null : Number(e.target.value),
                              })
                            }
                          />
                        </Field>
                      )}
                      <label className="ct-label flex items-center gap-2 text-ink">
                        <input
                          type="checkbox"
                          className="h-5 w-5"
                          checked={f.required}
                          onChange={(e) => patchField({ required: e.target.checked })}
                        />
                        {t.fieldRequired}
                      </label>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={pending}
                        onClick={() =>
                          setMerch((all) => (all ?? []).filter((_, j) => j !== i))
                        }
                      >
                        {t.schemaRemoveField}
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          {!isNew && (
            <div className="mt-6">
              <h3 className="ct-h3 text-ink">{t.componentsTitle}</h3>
              <p className="ct-help mt-1">{t.componentsLead}</p>
              {parts.length > 0 && (
                <ul className="ct-help mt-2 flex flex-col gap-1">
                  {parts.map((c) => (
                    <li key={c.component_sku}>
                      {c.component_sku} · {c.qty}
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-3 flex flex-wrap items-end gap-2">
                <Field label={t.componentSku} htmlFor="c-sku">
                  <Select
                    id="c-sku"
                    className="w-64"
                    value={component.sku}
                    placeholder={common.none}
                    options={products
                      .filter((p) => p.sku !== draft.sku)
                      .map((p) => ({ value: p.sku, label: `${p.sku} · ${p.name_de ?? ""}` }))}
                    onChange={(e) => setComponent((c) => ({ ...c, sku: e.target.value }))}
                  />
                </Field>
                <Field label={t.colQty} htmlFor="c-qty">
                  <Input
                    id="c-qty"
                    className="w-24"
                    value={component.qty}
                    onChange={(e) => setComponent((c) => ({ ...c, qty: e.target.value }))}
                  />
                </Field>
                <Button size="sm" variant="secondary" disabled={pending} onClick={onComponent}>
                  {common.save}
                </Button>
              </div>
              <p className="ct-help mt-1">{t.componentZeroRemoves}</p>
            </div>
          )}

          <div className="mt-6 flex gap-2">
            <Button disabled={pending} onClick={onSave}>
              {common.save}
            </Button>
            <Button
              variant="secondary"
              disabled={pending}
              onClick={() => {
                setDraft(null);
                setMerch(null);
              }}
            >
              {common.cancel}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
