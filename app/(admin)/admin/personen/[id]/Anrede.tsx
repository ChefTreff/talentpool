"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { saveSalutation } from "./actions";

type Strings = Record<string, string>;

/**
 * Die Briefanrede — redaktionell, nicht abgeleitet.
 *
 * „Sehr geehrte Frau Prof. Dr. Zehle" lässt sich aus Titel und Namen **nicht**
 * zuverlässig zusammensetzen: Doppeltitel, Namenszusätze, Personen ohne
 * Geschlechtsangabe, englische Anreden. Deshalb steht hier ein Feld und kein
 * Algorithmus.
 *
 * Der Vorschlag daneben deckt den Normalfall ab und **schweigt**, wo er
 * raten müsste — „Sehr geehrte/r" ist keine Anrede, sondern ein Formular.
 */
export function Anrede({
  personId,
  de,
  en,
  suggestDe,
  suggestEn,
  t,
  common,
  rpcMessages,
}: {
  personId: string;
  de: string | null;
  en: string | null;
  suggestDe: string | null;
  suggestEn: string | null;
  t: Strings;
  common: { save: string };
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState({ de: de ?? "", en: en ?? "" });

  const message = (key: string) => rpcMessages[key] ?? rpcMessages.unknown ?? key;

  function onSave() {
    startTransition(async () => {
      const res = await saveSalutation(personId, form.de, form.en);
      if (!res.ok) {
        toast("error", message(res.key) + (res.detail ? ` (${res.detail})` : ""));
        return;
      }
      toast("success", t.salutationSaved);
      router.refresh();
    });
  }

  const uebernehmen = (feld: "de" | "en", wert: string | null) =>
    wert ? (
      <button
        type="button"
        className="ct-link ct-help"
        onClick={() => setForm((f) => ({ ...f, [feld]: wert }))}
      >
        {t.useSuggestion.replace("{v}", wert)}
      </button>
    ) : null;

  return (
    <Card className="mt-4">
      <h2 className="ct-h2 mb-1 text-ink">{t.salutation}</h2>
      <p className="ct-small mb-3 leading-6">{t.salutationBody}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Field label={t.salutationDe} htmlFor="anrede-de">
            <Input
              id="anrede-de"
              value={form.de}
              onChange={(e) => setForm((f) => ({ ...f, de: e.target.value }))}
            />
          </Field>
          {form.de === "" && uebernehmen("de", suggestDe)}
        </div>
        <div className="flex flex-col gap-1">
          <Field label={t.salutationEn} htmlFor="anrede-en">
            <Input
              id="anrede-en"
              value={form.en}
              onChange={(e) => setForm((f) => ({ ...f, en: e.target.value }))}
            />
          </Field>
          {form.en === "" && uebernehmen("en", suggestEn)}
        </div>
      </div>
      <div className="mt-4">
        <Button disabled={pending} onClick={onSave}>
          {common.save}
        </Button>
      </div>
    </Card>
  );
}
