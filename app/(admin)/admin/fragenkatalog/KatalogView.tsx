"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import { Input, Textarea } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Table, Tbody, Td, Th, Thead, Tr } from "@/components/ui/Table";
import { useToast } from "@/components/ui/Toast";
import { reorderQuestions, saveQuestion } from "./actions";
import { FRAGETYPEN, MIT_OPTIONEN, type KatalogFrage } from "./types";

type Strings = Record<string, string>;

/**
 * Liste und Schubfach. Der häufigste Handgriff — eine Frage für Partner
 * freigeben — geht direkt in der Zeile, ohne das Schubfach zu öffnen: genau
 * das fehlte, als PART-045 einen leeren Katalog zeigte.
 */
export function KatalogView({
  fragen,
  t,
  common,
  rpcMessages,
}: {
  fragen: KatalogFrage[];
  t: Strings;
  common: { save: string; close: string; required: string };
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [offen, setOffen] = useState<KatalogFrage | "neu" | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);

  const meldung = (key: string, detail?: string) =>
    (rpcMessages[key] ?? rpcMessages.unknown ?? key) + (detail ? ` (${detail})` : "");

  function speichern(input: Record<string, unknown>, okText: string, imSchubfach: boolean) {
    startTransition(async () => {
      const res = await saveQuestion(input);
      if (!res.ok) {
        if (imSchubfach) setFehler(meldung(res.key, res.detail));
        else toast("error", meldung(res.key, res.detail));
        return;
      }
      setFehler(null);
      setOffen(null);
      toast("success", okText);
      router.refresh();
    });
  }

  function verschieben(index: number, richtung: -1 | 1) {
    const ids = fragen.map((f) => f.id);
    const ziel = index + richtung;
    if (ziel < 0 || ziel >= ids.length) return;
    [ids[index], ids[ziel]] = [ids[ziel], ids[index]];
    startTransition(async () => {
      const res = await reorderQuestions(ids);
      if (!res.ok) toast("error", meldung(res.key, res.detail));
      router.refresh();
    });
  }

  // Für die Zeilen-Schalter: ein Update muss die Pflichtfelder mitschicken,
  // die Funktion prüft Texte bei jedem Schreiben.
  const basis = (f: KatalogFrage) => ({ id: f.id, label_de: f.label_de, label_en: f.label_en });

  return (
    <>
      <div className="mb-4">
        <Button onClick={() => { setFehler(null); setOffen("neu"); }}>{t.newQuestion}</Button>
      </div>

      {fragen.length === 0 ? (
        <EmptyState title={t.emptyTitle} description={t.emptyBody} />
      ) : (
        <Table>
          <Thead>
            <Th>{t.colOrder}</Th>
            <Th>{t.colQuestion}</Th>
            <Th>{t.colType}</Th>
            <Th>{t.colPartner}</Th>
            <Th>{t.colStatus}</Th>
            <Th>{t.colInUse}</Th>
            <Th aria-label={t.edit} />
          </Thead>
          <Tbody>
            {fragen.map((f, i) => (
              <Tr key={f.id}>
                <Td>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" aria-label={t.moveUp} disabled={pending || i === 0} onClick={() => verschieben(i, -1)}>↑</Button>
                    <Button size="sm" variant="ghost" aria-label={t.moveDown} disabled={pending || i === fragen.length - 1} onClick={() => verschieben(i, 1)}>↓</Button>
                  </div>
                </Td>
                <Td>
                  <span className="ct-label block">{f.label_de}</span>
                  <span className="ct-help">{f.key}</span>
                </Td>
                <Td className="text-muted">{t[`type_${f.type}`] ?? f.type}</Td>
                <Td>
                  <Button
                    size="sm"
                    variant={f.partner_selectable ? "secondary" : "ghost"}
                    disabled={pending || !f.active}
                    onClick={() =>
                      speichern(
                        { ...basis(f), partner_selectable: !f.partner_selectable },
                        f.partner_selectable ? t.partnerOff : t.partnerOn,
                        false,
                      )
                    }
                  >
                    {f.partner_selectable ? t.partnerYes : t.partnerNo}
                  </Button>
                </Td>
                <Td>
                  <Badge tone={f.active ? "success" : "neutral"}>{f.active ? t.active : t.inactive}</Badge>
                </Td>
                <Td className="text-muted">{f.in_use === 0 ? "—" : t.inUseCount.replace("{n}", String(f.in_use))}</Td>
                <Td>
                  <Button size="sm" variant="secondary" disabled={pending} onClick={() => { setFehler(null); setOffen(f); }}>
                    {t.edit}
                  </Button>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}

      {offen && (
        <Drawer
          open
          onClose={() => setOffen(null)}
          title={offen === "neu" ? t.newQuestion : offen.label_de}
          closeLabel={common.close}
          error={fehler ?? undefined}
        >
          <FrageFormular
            frage={offen === "neu" ? null : offen}
            pending={pending}
            t={t}
            common={common}
            onSave={(input) => speichern(input, t.saved, true)}
          />
        </Drawer>
      )}
    </>
  );
}

/** `schluessel | Deutsch | English` je Zeile — kurz genug für eine Handvoll Optionen. */
function optionenAlsText(o: KatalogFrage["options"]): string {
  return (o ?? []).map((x) => `${x.key} | ${x.label_de} | ${x.label_en}`).join("\n");
}

function textAlsOptionen(text: string) {
  return text
    .split("\n")
    .map((z) => z.trim())
    .filter(Boolean)
    .map((z) => {
      const [key = "", label_de = "", label_en = ""] = z.split("|").map((x) => x.trim());
      return { key, label_de, label_en: label_en || label_de };
    });
}

function FrageFormular({
  frage,
  pending,
  t,
  common,
  onSave,
}: {
  frage: KatalogFrage | null;
  pending: boolean;
  t: Strings;
  common: { save: string; required: string };
  onSave: (input: Record<string, unknown>) => void;
}) {
  const [form, setForm] = useState({
    key: frage?.key ?? "",
    type: frage?.type ?? "textarea",
    label_de: frage?.label_de ?? "",
    label_en: frage?.label_en ?? "",
    help_de: frage?.help_de ?? "",
    help_en: frage?.help_en ?? "",
    options: optionenAlsText(frage?.options ?? null),
    active: frage?.active ?? true,
    partner_selectable: frage?.partner_selectable ?? false,
  });
  const typFest = Boolean(frage && frage.in_use > 0);
  const setze = (k: keyof typeof form, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="flex flex-col gap-4">
      <Field label={t.fieldKey} htmlFor="q-key" required={!frage} requiredLabel={common.required} hint={frage ? t.keyFixed : t.keyHint}>
        <Input id="q-key" value={form.key} disabled={Boolean(frage)} onChange={(e) => setze("key", e.target.value)} />
      </Field>

      <Field label={t.fieldType} htmlFor="q-type" hint={typFest ? t.typeFixed.replace("{n}", String(frage?.in_use)) : undefined}>
        <Select
          id="q-type"
          className="w-56"
          value={form.type}
          disabled={typFest}
          options={FRAGETYPEN.map((x) => ({ value: x, label: t[`type_${x}`] ?? x }))}
          onChange={(e) => setze("type", e.target.value)}
        />
      </Field>

      <Field label={t.fieldLabelDe} htmlFor="q-de" required requiredLabel={common.required}>
        <Input id="q-de" value={form.label_de} onChange={(e) => setze("label_de", e.target.value)} />
      </Field>
      <Field label={t.fieldLabelEn} htmlFor="q-en" required requiredLabel={common.required}>
        <Input id="q-en" value={form.label_en} onChange={(e) => setze("label_en", e.target.value)} />
      </Field>
      <Field label={t.fieldHelpDe} htmlFor="q-hde">
        <Textarea id="q-hde" rows={2} value={form.help_de} onChange={(e) => setze("help_de", e.target.value)} />
      </Field>
      <Field label={t.fieldHelpEn} htmlFor="q-hen">
        <Textarea id="q-hen" rows={2} value={form.help_en} onChange={(e) => setze("help_en", e.target.value)} />
      </Field>

      {MIT_OPTIONEN.has(form.type) && (
        <Field label={t.fieldOptions} htmlFor="q-opt" required requiredLabel={common.required} hint={t.optionsHint}>
          <Textarea id="q-opt" rows={5} value={form.options} onChange={(e) => setze("options", e.target.value)} />
        </Field>
      )}

      <div className="flex flex-col gap-2">
        <label className="flex items-center gap-2">
          <input type="checkbox" className="h-5 w-5" checked={form.active} onChange={(e) => setze("active", e.target.checked)} />
          <span>{t.fieldActive}</span>
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" className="h-5 w-5" checked={form.partner_selectable} onChange={(e) => setze("partner_selectable", e.target.checked)} />
          <span>{t.fieldPartner}</span>
        </label>
        <p className="ct-help">{t.partnerHint}</p>
      </div>

      <div>
        <Button
          disabled={pending}
          onClick={() =>
            onSave({
              ...(frage ? { id: frage.id } : { key: form.key.trim() }),
              type: form.type,
              label_de: form.label_de,
              label_en: form.label_en,
              help_de: form.help_de,
              help_en: form.help_en,
              options: MIT_OPTIONEN.has(form.type) ? textAlsOptionen(form.options) : null,
              active: form.active,
              partner_selectable: form.partner_selectable,
            })
          }
        >
          {common.save}
        </Button>
      </div>
    </div>
  );
}
