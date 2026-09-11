"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Input, Textarea } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Stepper } from "@/components/ui/Stepper";
import { useToast } from "@/components/ui/Toast";
import { isTooYoung } from "@/lib/volunteers/rules";
import { applyVolunteer } from "./actions";
import type { ApplyDraft, EventDay } from "./types";

type Strings = Record<string, string>;

const STEPS = ["person", "prefs", "consent"] as const;

export function ApplyForm({
  days,
  shirtSizes,
  areas,
  firstDay,
  locale,
  dateLocale,
  t,
  common,
  consentLabels,
  rpcMessages,
}: {
  days: EventDay[];
  /** Vokabular `shirt_size`. */
  shirtSizes: Record<string, string>;
  /** Vokabular `volunteer_area` — noch leer, die Liste kommt aus dem Export 2026. */
  areas: Record<string, string>;
  /** Erster Tag der Edition; gegen ihn wird das Mindestalter gerechnet. */
  firstDay: string | null;
  locale: string;
  dateLocale: string;
  t: Strings;
  common: { back: string; next: string; save: string };
  consentLabels: Record<string, string>;
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<ApplyDraft>({
    birthdate: "",
    shirt_size: "",
    areas: [],
    day_prefs: [],
    availability: "",
    buddy_note: "",
    consents: { terms: false, privacy: false, photo_video: false },
  });

  const message = (key: string) => rpcMessages[key] ?? rpcMessages.unknown ?? key;
  const dayLabel = (d: EventDay) =>
    (locale === "en" ? d.label_en : d.label_de) ??
    new Intl.DateTimeFormat(dateLocale, { dateStyle: "full" }).format(new Date(d.day_date));
  const set = (part: Partial<ApplyDraft>) => setDraft((d) => ({ ...d, ...part }));
  const toggle = (list: string[], value: string) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  const young = isTooYoung(draft.birthdate, firstDay);
  const canContinue =
    step === 0
      ? draft.birthdate !== "" && !young
      : step === 1
        ? true
        : draft.consents.terms && draft.consents.privacy;

  function submit() {
    startTransition(async () => {
      const res = await applyVolunteer({
        birthdate: draft.birthdate,
        shirtSize: draft.shirt_size || null,
        areas: draft.areas,
        dayPrefs: draft.day_prefs,
        availability: draft.availability,
        buddyNote: draft.buddy_note,
        consents: draft.consents,
      });
      if (!res.ok) {
        toast("error", message(res.key) + (res.detail ? ` (${res.detail})` : ""));
        return;
      }
      toast("success", t.applied);
      router.refresh();
    });
  }

  return (
    <Card>
      <Stepper
        steps={STEPS.map((s) => ({ label: t[`step_${s}`] ?? s }))}
        current={step}
        srLabel={t.progress}
      />

      <div className="mt-6 flex flex-col gap-4">
        {step === 0 && (
          <>
            <p className="ct-help">{t.personLead}</p>
            <Field
              label={t.birthdate}
              htmlFor="v-bd"
              hint={t.birthdateHint}
              error={young ? t.tooYoung : undefined}
              required
              requiredLabel={t.requiredLabel}
            >
              <Input
                id="v-bd"
                type="date"
                value={draft.birthdate}
                invalid={young}
                onChange={(e) => set({ birthdate: e.target.value })}
              />
            </Field>
          </>
        )}

        {step === 1 && (
          <>
            <p className="ct-help">{t.prefsLead}</p>

            {Object.keys(areas).length > 0 ? (
              <fieldset>
                <legend className="ct-label text-ink">{t.areas}</legend>
                <p className="ct-help mb-2">{t.areasHint}</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(areas).map(([key, label]) => (
                    <label key={key} className="ct-label flex items-center gap-2 text-ink">
                      <input
                        type="checkbox"
                        className="h-5 w-5"
                        checked={draft.areas.includes(key)}
                        onChange={() => set({ areas: toggle(draft.areas, key) })}
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </fieldset>
            ) : (
              // Die Bereichsliste kommt aus dem Export 2026; bis dahin fragen
              // wir sie gar nicht erst ab, statt ein leeres Feld zu zeigen.
              <p className="ct-help">{t.areasPending}</p>
            )}

            {days.length > 0 && (
              <fieldset>
                <legend className="ct-label text-ink">{t.days}</legend>
                <p className="ct-help mb-2">{t.daysHint}</p>
                <div className="flex flex-wrap gap-2">
                  {days.map((d) => (
                    <label key={d.id} className="ct-label flex items-center gap-2 text-ink">
                      <input
                        type="checkbox"
                        className="h-5 w-5"
                        checked={draft.day_prefs.includes(d.id)}
                        onChange={() => set({ day_prefs: toggle(draft.day_prefs, d.id) })}
                      />
                      {dayLabel(d)}
                    </label>
                  ))}
                </div>
              </fieldset>
            )}

            <Field label={t.availability} htmlFor="v-av" hint={t.availabilityHint}>
              <Textarea
                id="v-av"
                rows={2}
                value={draft.availability}
                onChange={(e) => set({ availability: e.target.value })}
              />
            </Field>

            <Field label={t.shirt} htmlFor="v-shirt">
              <Select
                id="v-shirt"
                className="w-40"
                value={draft.shirt_size}
                placeholder={t.noChoice}
                options={Object.entries(shirtSizes).map(([value, label]) => ({ value, label }))}
                onChange={(e) => set({ shirt_size: e.target.value })}
              />
            </Field>

            <Field label={t.buddy} htmlFor="v-buddy" hint={t.buddyHint}>
              <Input
                id="v-buddy"
                value={draft.buddy_note}
                onChange={(e) => set({ buddy_note: e.target.value })}
              />
            </Field>
          </>
        )}

        {step === 2 && (
          <>
            <p className="ct-help">{t.consentLead}</p>
            {(["terms", "privacy", "photo_video"] as const).map((key) => (
              <label key={key} className="flex items-start gap-2 text-[15px] text-ink">
                <input
                  type="checkbox"
                  className="mt-0.5 h-5 w-5 shrink-0"
                  checked={draft.consents[key]}
                  onChange={(e) =>
                    set({ consents: { ...draft.consents, [key]: e.target.checked } })
                  }
                />
                <span>
                  {consentLabels[key] ?? key}
                  {key !== "photo_video" && (
                    <span aria-hidden className="ml-0.5 text-error-ink">
                      *
                    </span>
                  )}
                </span>
              </label>
            ))}
          </>
        )}
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {step > 0 && (
          <Button variant="secondary" disabled={pending} onClick={() => setStep(step - 1)}>
            {common.back}
          </Button>
        )}
        {step < STEPS.length - 1 ? (
          <Button disabled={pending || !canContinue} onClick={() => setStep(step + 1)}>
            {common.next}
          </Button>
        ) : (
          <Button disabled={pending || !canContinue} onClick={submit}>
            {t.submit}
          </Button>
        )}
      </div>
    </Card>
  );
}
