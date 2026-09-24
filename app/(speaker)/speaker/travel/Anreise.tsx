"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
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
  /** Wunsch, zur Abreise gebracht zu werden (SPK-032). */
  needs_dropoff: boolean;
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
  angeboten,
  dateLocale,
  t,
  common,
  rpcMessages,
}: {
  travel: SpeakerTravel | null;
  isAssistant: boolean;
  modes: Record<string, string>;
  /** Aktive Schlüssel aus `travel_mode` — nur sie stehen zur Wahl. */
  angeboten: Set<string>;
  dateLocale: string;
  t: Strings;
  common: { save: string; choose: string };
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  // Ein stillgelegtes Verkehrsmittel beginnt leer (SPK-059, siehe `optionen`).
  const modus = (m: string | null | undefined) => (m && angeboten.has(m) ? m : "");
  const [form, setForm] = useState({
    arrival_date: travel?.arrival_date ?? "",
    arrival_time: (travel?.arrival_time ?? "").slice(0, 5),
    arrival_mode: modus(travel?.arrival_mode),
    arrival_ref: travel?.arrival_ref ?? "",
    departure_date: travel?.departure_date ?? "",
    departure_time: (travel?.departure_time ?? "").slice(0, 5),
    departure_mode: modus(travel?.departure_mode),
    departure_ref: travel?.departure_ref ?? "",
    note: travel?.note ?? "",
  });

  const message = (key: string) => rpcMessages[key] ?? rpcMessages.unknown ?? key;
  const set = (k: keyof typeof form, v: string | boolean) =>
    setForm((f) => ({ ...f, [k]: v }));
  // Nur, was noch angeboten wird (SPK-059: „Fernbus" und „Wohnt in Hamburg"
  // sind raus). Die Datenbank nimmt auch nur aktive Werte an
  // (`check_travel_mode` → `is_vocab_key`): ein stillgelegter Wert liesse sich
  // nicht speichern. Deshalb beginnt das Feld dann leer (siehe `modus`), und
  // man wählt neu — statt beim Speichern an `invalid_travel_mode` zu scheitern.
  const optionen = Object.entries(modes)
    .filter(([value]) => angeboten.has(value))
    .map(([value, label]) => ({ value, label }));

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
      <h2 className="ct-h2 text-ink">{t.travelTitle2}</h2>
      <p className="ct-small mt-1 leading-6">{t.travelBody2}</p>
      {isAssistant && <p className="ct-help mt-1">{t.travelAssistantHint}</p>}

      {/* Kompakt (SPK-057, Konrad 24.09.: „zu gross für eine nicht zwingende
          Info"): je Richtung eine Zeile mit Datum, Uhrzeit, Verkehrsmittel und
          Nummer. Die Ortszeit steht in der Beschriftung statt in einem
          Hinweis darunter — die Hinweise machten jedes Feld doppelt so hoch. */}
      <div className="mt-5 flex flex-col gap-5">
        <fieldset>
          <legend className="ct-label text-ink">{t.arrival}</legend>
          <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label={t.date} htmlFor="an-datum">
              <Input
                id="an-datum"
                type="date"
                value={form.arrival_date}
                onChange={(e) => set("arrival_date", e.target.value)}
              />
            </Field>
            <Field label={t.timeLocal} htmlFor="an-zeit">
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
                options={optionen}
                onChange={(e) => set("arrival_mode", e.target.value)}
              />
            </Field>
            <Field label={t.refOptional} htmlFor="an-nr">
              <Input
                id="an-nr"
                value={form.arrival_ref}
                onChange={(e) => set("arrival_ref", e.target.value)}
              />
            </Field>
          </div>
        </fieldset>
        <fieldset>
          <legend className="ct-label text-ink">{t.departure}</legend>
          <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label={t.date} htmlFor="ab-datum">
              <Input
                id="ab-datum"
                type="date"
                value={form.departure_date}
                onChange={(e) => set("departure_date", e.target.value)}
              />
            </Field>
            <Field label={t.timeLocal} htmlFor="ab-zeit">
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
                options={optionen}
                onChange={(e) => set("departure_mode", e.target.value)}
              />
            </Field>
            <Field label={t.refOptional} htmlFor="ab-nr">
              <Input
                id="ab-nr"
                value={form.departure_ref}
                onChange={(e) => set("departure_ref", e.target.value)}
              />
            </Field>
          </div>
        </fieldset>
      </div>

      {/* Eine Frage statt zweier Haken (SPK-058, ersetzt diesen Teil von
          SPK-032): „abgeholt werden" und „weggebracht werden" lösten nichts
          aus — eine Fahrt entsteht erst als Shuttle-Buchung, mit Telefonnummer
          und Adressen. Also die Frage und der Weg dorthin. */}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-ct-md bg-accent-soft px-4 py-3">
        <div className="min-w-0 flex-1 basis-64">
          <p className="ct-label text-accent-deep">{t.shuttleQuestion}</p>
          <p className="ct-small text-ink">{t.shuttleQuestionBody}</p>
        </div>
        <ButtonLink href="#shuttle" variant="secondary" size="sm">
          {t.shuttleQuestionAction}
        </ButtonLink>
      </div>

      <Field className="mt-4" label={t.travelNote} htmlFor="reise-notiz" hint={t.travelNoteHint}>
        {/* Kurztext statt Textfeld (SPK-032): ein Satz reicht, und ein
            grosses Feld sah neben den schmalen Datumsfeldern aus wie der
            Hauptgegenstand der Seite. */}
        <Input
          id="reise-notiz"
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
