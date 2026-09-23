"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/Table";
import { useToast } from "@/components/ui/Toast";
import { deleteSpeakerTask, saveSpeakerTask } from "../actions";

export type TaskRow = {
  id: string;
  edition_id: string;
  key: string;
  label_de: string;
  label_en: string;
  description_de: string | null;
  description_en: string | null;
  deadline_key: string | null;
  sort_order: number;
  is_active: boolean;
  /** Wie oft die Aufgabe schon abgehakt wurde — entscheidet über „Löschen". */
  tick_count: number;
};

const LEER = {
  key: "",
  label_de: "",
  label_en: "",
  description_de: "",
  description_en: "",
  deadline_key: "",
  sort_order: "0",
};

/**
 * Pflege der Aufgaben, die der Speaker selbst abhakt (0149).
 *
 * **Gelöscht wird nur, was niemand abgehakt hat.** Sobald `tick_count > 0`
 * ist, steht an der Stelle „Stilllegen": die Aufgabe verschwindet aus dem
 * Portal, die Haken bleiben nachlesbar. Der Knopf verschwindet also nicht
 * kommentarlos — er wechselt seine Bedeutung, und der Hinweistext sagt warum.
 */
export function AufgabenListe({
  tasks,
  editionen,
  fristen,
  t,
  common,
  rpcMessages,
}: {
  tasks: TaskRow[];
  editionen: { id: string; name: string }[];
  fristen: { key: string; label: string }[];
  t: Record<string, string>;
  common: { cancel: string; none: string; save: string };
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [neu, setNeu] = useState({ ...LEER });
  const editionId = editionen[0]?.id ?? "";

  const message = (key: string) => rpcMessages[key] ?? rpcMessages.unknown ?? key;

  function run(data: Record<string, unknown>, okText: string, danach?: () => void) {
    startTransition(async () => {
      const res = await saveSpeakerTask({ ...data, edition_id: editionId });
      if (!res.ok) {
        toast("error", message(res.key) + (res.detail ? ` (${res.detail})` : ""));
        return;
      }
      toast("success", okText);
      danach?.();
      router.refresh();
    });
  }

  /** Aus einer Zeile wieder die Daten machen, die `upsert_speaker_task` erwartet. */
  const alsDaten = (row: TaskRow) => ({
    key: row.key,
    label_de: row.label_de,
    label_en: row.label_en,
    description_de: row.description_de ?? "",
    description_en: row.description_en ?? "",
    deadline_key: row.deadline_key ?? "",
    sort_order: row.sort_order,
  });

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader title={t.newTitle} description={t.newHint} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t.key} htmlFor="nk" hint={t.keyHint}>
            <Input
              id="nk"
              value={neu.key}
              onChange={(e) => setNeu((d) => ({ ...d, key: e.target.value }))}
            />
          </Field>
          <Field label={t.sortOrder} htmlFor="ns">
            <Input
              id="ns"
              inputMode="numeric"
              value={neu.sort_order}
              onChange={(e) => setNeu((d) => ({ ...d, sort_order: e.target.value }))}
            />
          </Field>
          <Field label={t.labelDe} htmlFor="nld">
            <Input
              id="nld"
              value={neu.label_de}
              onChange={(e) => setNeu((d) => ({ ...d, label_de: e.target.value }))}
            />
          </Field>
          <Field label={t.labelEn} htmlFor="nle">
            <Input
              id="nle"
              value={neu.label_en}
              onChange={(e) => setNeu((d) => ({ ...d, label_en: e.target.value }))}
            />
          </Field>
          <Field label={t.descDe} htmlFor="ndd">
            <Input
              id="ndd"
              value={neu.description_de}
              onChange={(e) => setNeu((d) => ({ ...d, description_de: e.target.value }))}
            />
          </Field>
          <Field label={t.descEn} htmlFor="nde">
            <Input
              id="nde"
              value={neu.description_en}
              onChange={(e) => setNeu((d) => ({ ...d, description_en: e.target.value }))}
            />
          </Field>
          <Field label={t.deadline} htmlFor="ndl" hint={t.deadlineHint}>
            <Select
              id="ndl"
              value={neu.deadline_key}
              onChange={(e) => setNeu((d) => ({ ...d, deadline_key: e.target.value }))}
              options={[
                { value: "", label: common.none },
                ...fristen.map((f) => ({ value: f.key, label: f.label })),
              ]}
            />
          </Field>
        </div>
        <div className="mt-4">
          <Button
            disabled={pending || !neu.key.trim() || !neu.label_de.trim() || !neu.label_en.trim()}
            onClick={() => run(neu, t.saved, () => setNeu({ ...LEER }))}
          >
            {t.add}
          </Button>
        </div>
      </Card>

      <Table>
        <Thead>
          <Tr>
            <Th>{t.labelDe}</Th>
            <Th>{t.key}</Th>
            <Th>{t.deadline}</Th>
            <Th>{t.ticks}</Th>
            <Th>{t.state}</Th>
            <Th>{t.actions}</Th>
          </Tr>
        </Thead>
        <Tbody>
          {tasks.map((row) => (
            <Tr key={row.id}>
              <Td>
                <span className="ct-label text-ink">{row.label_de}</span>
                {row.description_de && <p className="ct-help">{row.description_de}</p>}
              </Td>
              <Td>
                <code className="ct-help">{row.key}</code>
              </Td>
              <Td>
                {fristen.find((f) => f.key === row.deadline_key)?.label ??
                  row.deadline_key ??
                  common.none}
              </Td>
              <Td>{row.tick_count}</Td>
              <Td>
                {row.is_active ? (
                  <Badge tone="success">{t.active}</Badge>
                ) : (
                  <Badge>{t.inactive}</Badge>
                )}
              </Td>
              <Td>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={pending}
                    onClick={() =>
                      run(
                        { ...alsDaten(row), is_active: !row.is_active },
                        row.is_active ? t.deactivated : t.activated,
                      )
                    }
                  >
                    {row.is_active ? t.deactivate : t.activate}
                  </Button>
                  {/* Gelöscht wird nur, was niemand abgehakt hat — sonst ginge
                      mit der Zeile auch die Auskunft verloren, wer wann
                      „erledigt" gesagt hat. */}
                  {row.tick_count === 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={pending}
                      onClick={() => {
                        if (!window.confirm(t.deleteConfirm.replace("{key}", row.key))) return;
                        startTransition(async () => {
                          const res = await deleteSpeakerTask(row.id);
                          if (!res.ok) {
                            toast("error", message(res.key));
                            return;
                          }
                          toast("success", t.deleted);
                          router.refresh();
                        });
                      }}
                    >
                      {t.delete}
                    </Button>
                  )}
                </div>
              </Td>
            </Tr>
          ))}
        </Tbody>
      </Table>
    </div>
  );
}
