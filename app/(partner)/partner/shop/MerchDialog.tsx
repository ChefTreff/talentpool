"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input, Textarea } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import {
  checkMerchValues,
  merchPayload,
  sizesOf,
  sizesTotal,
  type MerchField,
  type MerchValues,
} from "@/lib/partner/merch";

type Strings = Record<string, string>;

/** Dateien der Organisation, aus denen ein Logo-Feld wählt. */
export type MerchAsset = { id: string; label: string };

/**
 * Konfiguration eines Merch-Artikels (S4). Die Felder kommen aus
 * `product.merch_config` — welche es gibt, entscheidet das Produkt, nicht
 * dieser Code.
 *
 * Ein Logo wird hier nicht hochgeladen, sondern aus dem gewählt, was die
 * Organisation schon eingereicht hat: der Dateien-Hub ist die eine Stelle,
 * an der Dateien entstehen, und was dort geprüft wurde, gilt auch hier.
 */
export function MerchDialog({
  title,
  fields,
  initial,
  qty,
  assets,
  locale,
  pending,
  t,
  common,
  onSave,
  onCancel,
}: {
  title: string;
  fields: readonly MerchField[];
  initial: Record<string, unknown> | null;
  qty: number;
  assets: readonly MerchAsset[];
  locale: string;
  pending?: boolean;
  t: Strings;
  common: { cancel: string; save: string; none: string };
  onSave: (config: Record<string, unknown>) => void;
  onCancel: () => void;
}) {
  const [values, setValues] = useState<MerchValues>((initial ?? {}) as MerchValues);
  const [showErrors, setShowErrors] = useState(false);

  const problems = checkMerchValues(fields, values, qty);
  const problemOf = (key: string) => problems.find((p) => p.key === key);
  const label = (f: MerchField) =>
    (locale === "en" ? f.label_en : f.label_de) ?? f.label_de ?? f.key;
  const set = (key: string, value: MerchValues[string]) =>
    setValues((v) => ({ ...v, [key]: value }));

  /** Meldung zu einem Feld — erst nach dem ersten Versuch, nicht beim Tippen. */
  function error(f: MerchField): string | undefined {
    if (!showErrors) return undefined;
    const problem = problemOf(f.key);
    if (!problem) return undefined;
    if (problem.reason === "required") return t.fieldRequired;
    if (problem.reason === "sizes_sum") return `${t.sizesSum} (${problem.detail})`;
    if (problem.reason === "too_long") return `${t.tooLong} (${problem.detail})`;
    return t.notAnOption;
  }

  function save() {
    if (problems.length > 0) {
      setShowErrors(true);
      return;
    }
    onSave(merchPayload(fields, values));
  }

  return (
    <Modal label={title} onCancel={onCancel}>
      <h2 className="ct-h3">{title}</h2>
      <p className="ct-help mt-1">
        {t.merchLead} · {t.qty}: {qty}
      </p>

      <div className="mt-4 flex flex-col gap-4">
        {fields.map((f) => {
          const id = `m-${f.key}`;
          const value = values[f.key];

          if (f.type === "sizes") {
            const sizes = sizesOf(values, f.key);
            const total = sizesTotal(values, f.key);
            const options = f.options ?? [];
            return (
              <Field
                key={f.key}
                label={label(f)}
                hint={`${t.sizesHint} · ${total}/${qty}`}
                error={error(f)}
                required={f.required}
                requiredLabel={t.requiredLabel}
              >
                <div className="flex flex-wrap gap-2">
                  {options.map((size) => (
                    <label key={size} className="flex w-20 flex-col gap-1">
                      <span className="ct-help">{size}</span>
                      <Input
                        aria-label={`${label(f)} ${size}`}
                        type="number"
                        min={0}
                        value={String(sizes[size] ?? "")}
                        onChange={(e) =>
                          set(f.key, {
                            ...sizes,
                            [size]: Number(e.target.value) || 0,
                          })
                        }
                      />
                    </label>
                  ))}
                </div>
              </Field>
            );
          }

          if (f.type === "logo") {
            return (
              <Field
                key={f.key}
                label={label(f)}
                htmlFor={id}
                hint={assets.length === 0 ? t.noAssets : t.logoHint}
                error={error(f)}
                required={f.required}
                requiredLabel={t.requiredLabel}
              >
                <Select
                  id={id}
                  value={typeof value === "string" ? value : ""}
                  placeholder={common.none}
                  disabled={assets.length === 0}
                  options={assets.map((a) => ({ value: a.id, label: a.label }))}
                  onChange={(e) => set(f.key, e.target.value)}
                />
              </Field>
            );
          }

          if (f.type === "boolean") {
            return (
              <Field
                key={f.key}
                label={label(f)}
                htmlFor={id}
                error={error(f)}
                required={f.required}
                requiredLabel={t.requiredLabel}
              >
                <input
                  id={id}
                  type="checkbox"
                  className="h-5 w-5"
                  checked={value === true || value === "true"}
                  onChange={(e) => set(f.key, e.target.checked)}
                />
              </Field>
            );
          }

          if (f.type === "select") {
            return (
              <Field
                key={f.key}
                label={label(f)}
                htmlFor={id}
                error={error(f)}
                required={f.required}
                requiredLabel={t.requiredLabel}
              >
                <Select
                  id={id}
                  value={typeof value === "string" ? value : ""}
                  placeholder={common.none}
                  options={(f.options ?? []).map((o) => ({ value: o, label: o }))}
                  onChange={(e) => set(f.key, e.target.value)}
                />
              </Field>
            );
          }

          if (f.type === "textarea") {
            return (
              <Field
                key={f.key}
                label={label(f)}
                htmlFor={id}
                hint={f.max_length ? `${t.maxChars} ${f.max_length}` : undefined}
                error={error(f)}
                required={f.required}
                requiredLabel={t.requiredLabel}
              >
                <Textarea
                  id={id}
                  rows={3}
                  value={value == null ? "" : String(value)}
                  onChange={(e) => set(f.key, e.target.value)}
                />
              </Field>
            );
          }

          return (
            <Field
              key={f.key}
              label={label(f)}
              htmlFor={id}
              hint={f.max_length ? `${t.maxChars} ${f.max_length}` : undefined}
              error={error(f)}
              required={f.required}
              requiredLabel={t.requiredLabel}
            >
              <Input
                id={id}
                type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
                value={value == null ? "" : String(value)}
                onChange={(e) => set(f.key, e.target.value)}
              />
            </Field>
          );
        })}
      </div>

      <div className="mt-6 flex gap-2">
        <Button disabled={pending} onClick={save}>
          {common.save}
        </Button>
        <Button variant="secondary" disabled={pending} onClick={onCancel}>
          {common.cancel}
        </Button>
      </div>
    </Modal>
  );
}
