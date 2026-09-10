"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Locale } from "@/lib/i18n/shared";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/Table";
import { useToast } from "@/components/ui/Toast";
import { saveDeadline } from "../actions";

type Strings = Record<string, string>;

export type DeadlineRow = {
  id: string;
  edition_id: string;
  key: string;
  audience: string;
  due_at: string;
  label_de: string | null;
  label_en: string | null;
  description_de: string | null;
  description_en: string | null;
  reminder_lead_hours: number;
};

/** `timestamptz` ↔ `datetime-local` (Browserzeit; für eine Frist genau genug). */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

export function DeadlineList({
  deadlines,
  editions,
  locale,
  dateLocale,
  t,
  common,
  rpcMessages,
}: {
  deadlines: DeadlineRow[];
  editions: { id: string; name: string }[];
  locale: Locale;
  dateLocale: string;
  t: Strings;
  common: { choose: string; none: string; save: string };
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [edits, setEdits] = useState<Record<string, { due: string; lead: string }>>({});
  const [draft, setDraft] = useState({
    edition_id: editions[0]?.id ?? "",
    key: "",
    audience: "speaker",
    label_de: "",
    label_en: "",
    due: "",
    lead: "48",
  });

  const message = (key: string) => rpcMessages[key] ?? rpcMessages.unknown ?? key;
  const dateTime = new Intl.DateTimeFormat(dateLocale, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  function run(data: Record<string, unknown>, okText: string) {
    startTransition(async () => {
      const res = await saveDeadline(data);
      if (!res.ok) {
        toast("error", message(res.key) + (res.detail ? ` (${res.detail})` : ""));
        return;
      }
      toast("success", okText);
      router.refresh();
    });
  }

  function onSaveRow(row: DeadlineRow) {
    const edit = edits[row.id] ?? {
      due: toLocalInput(row.due_at),
      lead: String(row.reminder_lead_hours),
    };
    const hours = Number(edit.lead);
    if (!Number.isInteger(hours) || hours < 0 || hours > 720) {
      toast("error", t.leadInvalid);
      return;
    }
    // `upsert_deadline` schlüsselt auf Edition + Key; Label muss deshalb mit.
    run(
      {
        edition_id: row.edition_id,
        key: row.key,
        audience: row.audience,
        due_at: new Date(edit.due).toISOString(),
        label_de: row.label_de,
        label_en: row.label_en,
        description_de: row.description_de,
        description_en: row.description_en,
        reminder_lead_hours: hours,
      },
      t.saved,
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {deadlines.length > 0 && (
        <Table>
          <Thead>
            <Th>{t.colKey}</Th>
            <Th>{t.colAudience}</Th>
            <Th>{t.colDue}</Th>
            <Th>{t.colReminder}</Th>
            <Th aria-label={t.colAction} />
          </Thead>
          <Tbody>
            {deadlines.map((d) => {
              const edit = edits[d.id] ?? {
                due: toLocalInput(d.due_at),
                lead: String(d.reminder_lead_hours),
              };
              return (
                <Tr key={d.id}>
                  <Td>
                    <span className="ct-label">
                      {(locale === "en" ? d.label_en : d.label_de) ?? d.key}
                    </span>
                    <div className="ct-help">{d.key}</div>
                  </Td>
                  <Td className="text-muted">{d.audience}</Td>
                  <Td>
                    <Input
                      aria-label={t.colDue}
                      type="datetime-local"
                      value={edit.due}
                      onChange={(e) =>
                        setEdits((s) => ({ ...s, [d.id]: { ...edit, due: e.target.value } }))
                      }
                    />
                    <div className="ct-help">{dateTime.format(new Date(d.due_at))}</div>
                  </Td>
                  <Td>
                    <Input
                      aria-label={t.colReminder}
                      type="number"
                      min={0}
                      max={720}
                      className="w-24"
                      value={edit.lead}
                      onChange={(e) =>
                        setEdits((s) => ({ ...s, [d.id]: { ...edit, lead: e.target.value } }))
                      }
                    />
                    <div className="ct-help">{t.reminderHint}</div>
                  </Td>
                  <Td>
                    <Button size="sm" disabled={pending} onClick={() => onSaveRow(d)}>
                      {common.save}
                    </Button>
                  </Td>
                </Tr>
              );
            })}
          </Tbody>
        </Table>
      )}

      <Card className="p-4">
        <h2 className="ct-h3 mb-1 text-ink">{t.newTitle}</h2>
        <p className="ct-help mb-4">{t.newHint}</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={t.fieldEdition} htmlFor="d-edition">
            <Select
              id="d-edition"
              value={draft.edition_id}
              options={editions.map((e) => ({ value: e.id, label: e.name }))}
              onChange={(e) => setDraft((d) => ({ ...d, edition_id: e.target.value }))}
            />
          </Field>
          <Field label={t.fieldKey} htmlFor="d-key" hint={t.fieldKeyHint}>
            <Input
              id="d-key"
              value={draft.key}
              onChange={(e) => setDraft((d) => ({ ...d, key: e.target.value }))}
            />
          </Field>
          <Field label={t.colAudience} htmlFor="d-audience" hint={t.fieldAudienceHint}>
            {/* Die Tabelle gehört allen Bereichen; wer hier nichts wählt,
                legt sonst unbemerkt eine Speaker-Frist an. */}
            <Input
              id="d-audience"
              value={draft.audience}
              onChange={(e) => setDraft((d) => ({ ...d, audience: e.target.value }))}
            />
          </Field>
          <Field label={t.fieldDue} htmlFor="d-due">
            <Input
              id="d-due"
              type="datetime-local"
              value={draft.due}
              onChange={(e) => setDraft((d) => ({ ...d, due: e.target.value }))}
            />
          </Field>
          <Field label={t.fieldLabelDe} htmlFor="d-label-de">
            <Input
              id="d-label-de"
              value={draft.label_de}
              onChange={(e) => setDraft((d) => ({ ...d, label_de: e.target.value }))}
            />
          </Field>
          <Field label={t.fieldLabelEn} htmlFor="d-label-en">
            <Input
              id="d-label-en"
              value={draft.label_en}
              onChange={(e) => setDraft((d) => ({ ...d, label_en: e.target.value }))}
            />
          </Field>
          <Field label={t.colReminder} htmlFor="d-lead" hint={t.reminderHint}>
            <Input
              id="d-lead"
              type="number"
              min={0}
              max={720}
              value={draft.lead}
              onChange={(e) => setDraft((d) => ({ ...d, lead: e.target.value }))}
            />
          </Field>
        </div>
        <div className="mt-4">
          <Button
            disabled={
              pending ||
              draft.key.trim() === "" ||
              draft.due === "" ||
              draft.label_de.trim() === ""
            }
            onClick={() =>
              run(
                {
                  edition_id: draft.edition_id,
                  key: draft.key.trim(),
                  audience: draft.audience.trim() || "speaker",
                  due_at: new Date(draft.due).toISOString(),
                  label_de: draft.label_de,
                  label_en: draft.label_en || draft.label_de,
                  reminder_lead_hours: Number(draft.lead) || 48,
                },
                t.created,
              )
            }
          >
            {t.create}
          </Button>
        </div>
      </Card>
    </div>
  );
}
