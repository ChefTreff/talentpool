"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Input, Textarea } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import { saveTravel } from "./actions";

type Strings = Record<string, string>;

export type SpeakerTravel = {
  arrival_date: string | null;
  arrival_time: string | null;
  arrival_mode: string | null;
  arrival_ref: string | null;
  departure_date: string | null;
  departure_time: string | null;
  departure_mode: string | null;
  departure_ref: string | null;
  needs_pickup: boolean;
  note: string | null;
  updated_at: string | null;
};

/**
 * An- und Abreise.
 *
 * Bisher landete das bestenfalls als Freitext in einer Shuttle-Buchung —
 * daraus liess sich keine Ankunftsliste bauen. Jetzt sind es Felder, und die
 * Betreuung sieht, wer wann am Dammtor steht.
 *
 * Datum und Uhrzeit sind **getrennt**: „14:30" meint Ortszeit in Hamburg. Ein
 * Zeitstempel mit Zone würde eine Genauigkeit behaupten, die die Eingabe
 * nicht hat.
 */
export function Anreise({
  travel,
  isAssistant,
  modes,
  dateLocale,
  t,
  common,
  rpcMessages,
}: {
  travel: SpeakerTravel | null;
  isAssistant: boolean;
  modes: Record<string, string>;
  dateLocale: string;
  t: Strings;
  common: { save: string; choose: string };
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState({
    arrival_date: travel?.arrival_date ?? "",
    arrival_time: (travel?.arrival_time ?? "").slice(0, 5),
    arrival_mode: travel?.arrival_mode ?? "",
    arrival_ref: travel?.arrival_ref ?? "",
    departure_date: travel?.departure_date ?? "",
    departure_time: (travel?.departure_time ?? "").slice(0, 5),
    departure_mode: travel?.departure_mode ?? "",
    departure_ref: travel?.departure_ref ?? "",
    needs_pickup: travel?.needs_pickup ?? false,
    note: travel?.note ?? "",
  });

  const message = (key: string) => rpcMessages[key] ?? rpcMessages.unknown ?? key;
  const set = (k: keyof typeof form, v: string | boolean) =>
    setForm((f) => ({ ...f, [k]: v }));
  const options = Object.entries(modes).map(([value, label]) => ({ value, label }));

  function onSave() {
    startTransition(async () => {
      const res = await saveTravel(form);
      if (!res.ok) {
        toast("error", message(res.key) + (res.detail ? ` (${res.detail})` : ""));
        return;
      }
      toast("success", t.travelSaved);
      router.refresh();
    });
  }

  const stand = travel?.updated_at
    ? new Intl.DateTimeFormat(dateLocale, { dateStyle: "medium", timeStyle: "short" }).format(
        new Date(travel.updated_at),
      )
    : null;

  return (
    <Card>
      <h2 className="ct-h3 text-ink">{t.travelTitle2}</h2>
      <p className="ct-small mt-1 leading-6">{t.travelBody2}</p>
      {isAssistant && <p className="ct-help mt-1">{t.travelAssistantHint}</p>}

      <div className="mt-5 grid gap-6 sm:grid-cols-2">
        <fieldset className="flex flex-col gap-3">
          <legend className="ct-label text-ink">{t.arrival}</legend>
          <Field label={t.date} htmlFor="an-datum">
            <Input
              id="an-datum"
              type="date"
              value={form.arrival_date}
              onChange={(e) => set("arrival_date", e.target.value)}
            />
          </Field>
          <Field label={t.time} htmlFor="an-zeit" hint={t.timeHint}>
            <Input
              id="an-zeit"
              type="time"
              value={form.arrival_time}
              onChange={(e) => set("arrival_time", e.target.value)}
            />
          </Field>
          <Field label={t.mode} htmlFor="an-mittel">
            <Select
              id="an-mittel"
              value={form.arrival_mode}
              placeholder={common.choose}
              options={options}
              onChange={(e) => set("arrival_mode", e.target.value)}
            />
          </Field>
          <Field label={t.ref} htmlFor="an-nr" hint={t.refHint}>
            <Input
              id="an-nr"
              value={form.arrival_ref}
              onChange={(e) => set("arrival_ref", e.target.value)}
            />
          </Field>
        </fieldset>

        <fieldset className="flex flex-col gap-3">
          <legend className="ct-label text-ink">{t.departure}</legend>
          <Field label={t.date} htmlFor="ab-datum">
            <Input
              id="ab-datum"
              type="date"
              value={form.departure_date}
              onChange={(e) => set("departure_date", e.target.value)}
            />
          </Field>
          <Field label={t.time} htmlFor="ab-zeit">
            <Input
              id="ab-zeit"
              type="time"
              value={form.departure_time}
              onChange={(e) => set("departure_time", e.target.value)}
            />
          </Field>
          <Field label={t.mode} htmlFor="ab-mittel">
            <Select
              id="ab-mittel"
              value={form.departure_mode}
              placeholder={common.choose}
              options={options}
              onChange={(e) => set("departure_mode", e.target.value)}
            />
          </Field>
          <Field label={t.ref} htmlFor="ab-nr">
            <Input
              id="ab-nr"
              value={form.departure_ref}
              onChange={(e) => set("departure_ref", e.target.value)}
            />
          </Field>
        </fieldset>
      </div>

      <label className="mt-5 flex items-start gap-2">
        <input
          type="checkbox"
          className="mt-0.5 h-5 w-5"
          checked={form.needs_pickup}
          onChange={(e) => set("needs_pickup", e.target.checked)}
        />
        <span className="ct-small">{t.pickup}</span>
      </label>

      <Field className="mt-4" label={t.travelNote} htmlFor="reise-notiz" hint={t.travelNoteHint}>
        <Textarea
          id="reise-notiz"
          rows={2}
          value={form.note}
          onChange={(e) => set("note", e.target.value)}
        />
      </Field>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button disabled={pending} onClick={onSave}>
          {common.save}
        </Button>
        {stand && <span className="ct-help">{t.savedAt.replace("{date}", stand)}</span>}
      </div>
    </Card>
  );
}
