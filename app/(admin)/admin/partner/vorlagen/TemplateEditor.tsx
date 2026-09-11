"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Input, Textarea } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import { saveTemplate } from "../actions";
import {
  ANSWER_FIELD_TYPES,
  DELIVERABLE_TYPES,
  type AdminTemplate,
  type AnswerField,
} from "../types";

type Strings = Record<string, string>;

/** Leere Vorlage für „neu anlegen". */
const BLANK: AdminTemplate = {
  id: "",
  key: "",
  product_sku: null,
  category: null,
  type: "upload",
  label_de: "",
  label_en: "",
  description_de: null,
  description_en: null,
  due_rule: null,
  file_rules: null,
  required: true,
  audience_roles: null,
  sort: 100,
  active: true,
  answers_schema: null,
  fulfilled_by_sku: null,
};

export function TemplateEditor({
  templates,
  skus,
  t,
  common,
  rpcMessages,
}: {
  templates: AdminTemplate[];
  /** Produkte für `fulfilled_by_sku` — die RPC prüft den Schlüssel zusätzlich. */
  skus: { value: string; label: string }[];
  t: Strings;
  common: { cancel: string; none: string; save: string };
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState<AdminTemplate | null>(null);

  const message = (key: string) => rpcMessages[key] ?? rpcMessages.unknown ?? key;
  const isNew = draft !== null && draft.id === "";
  const fields: AnswerField[] = draft?.answers_schema ?? [];

  function patch(part: Partial<AdminTemplate>) {
    setDraft((d) => (d ? { ...d, ...part } : d));
  }

  function patchField(index: number, part: Partial<AnswerField>) {
    patch({
      answers_schema: fields.map((f, i) => (i === index ? { ...f, ...part } : f)),
    });
  }

  function onSave() {
    if (!draft) return;
    if (isNew && (!draft.key.trim() || !draft.label_de.trim() || !draft.label_en.trim())) {
      toast("error", message("fields_required"));
      return;
    }
    if (draft.type === "form" && fields.some((f) => !f.key.trim())) {
      toast("error", t.fieldKeyRequired);
      return;
    }

    // Beim Ändern nimmt `upsert_deliverable_template` nur die Felder unten
    // entgegen; Schlüssel, Art, Produkt, Kategorie und Zielgruppe stehen beim
    // Anlegen fest. Deshalb schickt die Oberfläche sie auch nur dann mit.
    const payload: Record<string, unknown> = {
      label_de: draft.label_de.trim(),
      label_en: draft.label_en.trim(),
      description_de: draft.description_de?.trim() || null,
      description_en: draft.description_en?.trim() || null,
      required: draft.required,
      sort: draft.sort ?? 100,
      active: draft.active,
      answers_schema: draft.type === "form" && fields.length > 0 ? fields : null,
      fulfilled_by_sku: draft.fulfilled_by_sku || null,
    };
    if (isNew) {
      payload.key = draft.key.trim();
      payload.type = draft.type;
      payload.product_sku = draft.product_sku || null;
      payload.category = draft.category || null;
      if (draft.audience_roles?.length) payload.audience_roles = draft.audience_roles;
      if (draft.file_rules) payload.file_rules = draft.file_rules;
      if (draft.due_rule) payload.due_rule = draft.due_rule;
    } else {
      payload.id = draft.id;
    }

    startTransition(async () => {
      const res = await saveTemplate(payload);
      if (!res.ok) {
        toast("error", message(res.key) + (res.detail ? ` (${res.detail})` : ""));
        return;
      }
      toast("success", t.templateSaved);
      setDraft(null);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader
          title={t.templatesTitle}
          description={t.templatesLead}
          action={
            <Button disabled={pending} onClick={() => setDraft({ ...BLANK })}>
              {t.templateNew}
            </Button>
          }
        />
        <p className="ct-help">{t.templatesResyncHint}</p>
        <ul className="mt-4 flex flex-col gap-2">
          {templates.map((tpl) => (
            <li
              key={tpl.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-ct-md border p-3"
            >
              <div>
                <span className="ct-label text-ink">{tpl.label_de}</span>
                <div className="ct-help">
                  {tpl.key} · {t[`deliverableType_${tpl.type}`] ?? tpl.type}
                  {tpl.product_sku && ` · ${tpl.product_sku}`}
                  {tpl.fulfilled_by_sku && ` · ${t.fulfilledBy} ${tpl.fulfilled_by_sku}`}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {!tpl.required && <Badge tone="neutral">{t.optional}</Badge>}
                {!tpl.active && <Badge tone="warning">{t.inactive}</Badge>}
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={pending}
                  onClick={() => setDraft({ ...tpl, answers_schema: tpl.answers_schema ?? null })}
                >
                  {t.edit}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      {draft && (
        <Card>
          <CardHeader
            title={isNew ? t.templateNew : draft.label_de}
            description={isNew ? t.templateNewLead : t.templateEditLead}
          />
          <div className="grid gap-4 md:grid-cols-2">
            <Field
              label={t.fieldKey}
              htmlFor="tpl-key"
              hint={isNew ? t.fieldKeyHint : t.fieldFixedAfterCreate}
              required={isNew}
              requiredLabel={t.requiredLabel}
            >
              <Input
                id="tpl-key"
                value={draft.key}
                disabled={!isNew}
                onChange={(e) => patch({ key: e.target.value })}
              />
            </Field>
            <Field
              label={t.fieldType}
              htmlFor="tpl-type"
              hint={isNew ? undefined : t.fieldFixedAfterCreate}
            >
              <Select
                id="tpl-type"
                value={draft.type}
                disabled={!isNew}
                options={DELIVERABLE_TYPES.map((value) => ({
                  value,
                  label: t[`deliverableType_${value}`] ?? value,
                }))}
                onChange={(e) => patch({ type: e.target.value })}
              />
            </Field>
            <Field label={t.fieldLabelDe} htmlFor="tpl-de" required requiredLabel={t.requiredLabel}>
              <Input
                id="tpl-de"
                value={draft.label_de}
                onChange={(e) => patch({ label_de: e.target.value })}
              />
            </Field>
            <Field label={t.fieldLabelEn} htmlFor="tpl-en" required requiredLabel={t.requiredLabel}>
              <Input
                id="tpl-en"
                value={draft.label_en}
                onChange={(e) => patch({ label_en: e.target.value })}
              />
            </Field>
            <Field label={t.fieldDescDe} htmlFor="tpl-dde">
              <Textarea
                id="tpl-dde"
                rows={2}
                value={draft.description_de ?? ""}
                onChange={(e) => patch({ description_de: e.target.value })}
              />
            </Field>
            <Field label={t.fieldDescEn} htmlFor="tpl-den">
              <Textarea
                id="tpl-den"
                rows={2}
                value={draft.description_en ?? ""}
                onChange={(e) => patch({ description_en: e.target.value })}
              />
            </Field>
            <Field label={t.fieldSort} htmlFor="tpl-sort">
              <Input
                id="tpl-sort"
                type="number"
                value={String(draft.sort ?? 100)}
                onChange={(e) => patch({ sort: Number(e.target.value) })}
              />
            </Field>
            <Field
              label={t.fieldFulfilledBy}
              htmlFor="tpl-sku"
              hint={t.fieldFulfilledByHint}
            >
              <Select
                id="tpl-sku"
                value={draft.fulfilled_by_sku ?? ""}
                placeholder={common.none}
                options={skus}
                onChange={(e) => patch({ fulfilled_by_sku: e.target.value || null })}
              />
            </Field>
            <Field label={t.fieldRequired} htmlFor="tpl-req">
              <input
                id="tpl-req"
                type="checkbox"
                className="h-5 w-5"
                checked={draft.required}
                onChange={(e) => patch({ required: e.target.checked })}
              />
            </Field>
            <Field label={t.fieldActive} htmlFor="tpl-active">
              <input
                id="tpl-active"
                type="checkbox"
                className="h-5 w-5"
                checked={draft.active}
                onChange={(e) => patch({ active: e.target.checked })}
              />
            </Field>
          </div>

          {draft.type === "form" && (
            <div className="mt-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="ct-h3 text-ink">{t.schemaTitle}</h3>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={pending}
                  onClick={() =>
                    patch({
                      answers_schema: [
                        ...fields,
                        {
                          key: "",
                          label_de: "",
                          label_en: "",
                          type: "text",
                          required: true,
                          options: null,
                        },
                      ],
                    })
                  }
                >
                  {t.schemaAddField}
                </Button>
              </div>
              <p className="ct-help mt-1">{t.schemaHint}</p>
              <ul className="mt-3 flex flex-col gap-3">
                {fields.map((f, i) => (
                  <li key={i} className="rounded-ct-md border p-3">
                    <div className="grid gap-3 md:grid-cols-4">
                      <Field label={t.fieldKey} htmlFor={`f-key-${i}`}>
                        <Input
                          id={`f-key-${i}`}
                          value={f.key}
                          onChange={(e) => patchField(i, { key: e.target.value })}
                        />
                      </Field>
                      <Field label={t.fieldLabelDe} htmlFor={`f-de-${i}`}>
                        <Input
                          id={`f-de-${i}`}
                          value={f.label_de ?? ""}
                          onChange={(e) => patchField(i, { label_de: e.target.value })}
                        />
                      </Field>
                      <Field label={t.fieldLabelEn} htmlFor={`f-en-${i}`}>
                        <Input
                          id={`f-en-${i}`}
                          value={f.label_en ?? ""}
                          onChange={(e) => patchField(i, { label_en: e.target.value })}
                        />
                      </Field>
                      <Field label={t.fieldType} htmlFor={`f-type-${i}`}>
                        <Select
                          id={`f-type-${i}`}
                          value={f.type}
                          options={ANSWER_FIELD_TYPES.map((value) => ({
                            value,
                            label: t[`answerType_${value}`] ?? value,
                          }))}
                          onChange={(e) =>
                            patchField(i, { type: e.target.value as AnswerField["type"] })
                          }
                        />
                      </Field>
                    </div>
                    <div className="mt-2 flex flex-wrap items-end gap-3">
                      {f.type === "select" && (
                        <Field
                          label={t.fieldOptions}
                          htmlFor={`f-opt-${i}`}
                          hint={t.fieldOptionsHint}
                          className="min-w-[280px] flex-1"
                        >
                          <Input
                            id={`f-opt-${i}`}
                            value={(f.options ?? []).join(", ")}
                            onChange={(e) =>
                              patchField(i, {
                                options: e.target.value
                                  .split(",")
                                  .map((o) => o.trim())
                                  .filter(Boolean),
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
                          onChange={(e) => patchField(i, { required: e.target.checked })}
                        />
                        {t.fieldRequired}
                      </label>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={pending}
                        onClick={() =>
                          patch({ answers_schema: fields.filter((_, j) => j !== i) })
                        }
                      >
                        {t.schemaRemoveField}
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-6 flex gap-2">
            <Button disabled={pending} onClick={onSave}>
              {common.save}
            </Button>
            <Button variant="secondary" disabled={pending} onClick={() => setDraft(null)}>
              {common.cancel}
            </Button>
          </div>
          <p className="ct-help mt-2">{t.templatesSaveHint}</p>
        </Card>
      )}
    </div>
  );
}
