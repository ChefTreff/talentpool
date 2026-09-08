"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Stepper } from "@/components/ui/Stepper";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/components/ui/cn";
import { saveStep } from "./actions";
import type { WizardData, WizardStep } from "./types";

type Opt = { key: string; label: string };
type Strings = Record<string, string>;

const STEPS: WizardStep[] = ["basics", "work", "interests", "consent"];

/** Pflicht ist nur das Badge-Minimum plus die beiden rechtlichen Häkchen. */
function stepIsValid(step: WizardStep, data: WizardData): boolean {
  if (step === "basics") {
    return data.first_name.trim() !== "" && data.last_name.trim() !== "";
  }
  if (step === "consent") {
    return data.consents.terms === true && data.consents.privacy === true;
  }
  return true;
}

export function Wizard({
  initial,
  vocab,
  consentLabels,
  languages,
  t,
  common,
  messages,
}: {
  initial: WizardData;
  vocab: {
    occupation_status: Opt[];
    career_level: Opt[];
    study_field: Opt[];
    interests: Opt[];
    interests_founder: Opt[];
  };
  consentLabels: Record<string, string>;
  languages: Opt[];
  t: Strings;
  common: {
    back: string;
    next: string;
    save: string;
    saving: string;
    choose: string;
    required: string;
  };
  messages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [index, setIndex] = useState(0);
  const [data, setData] = useState<WizardData>(initial);

  const step = STEPS[index];
  const isLast = index === STEPS.length - 1;
  const valid = stepIsValid(step, data);

  function set<K extends keyof WizardData>(key: K, value: WizardData[K]) {
    setData((d) => ({ ...d, [key]: value }));
  }
  function toggle(key: "interests" | "interests_founder", value: string) {
    setData((d) => {
      const list = d[key];
      return {
        ...d,
        [key]: list.includes(value)
          ? list.filter((x) => x !== value)
          : [...list, value],
      };
    });
  }
  function setConsent(key: string, value: boolean) {
    setData((d) => ({ ...d, consents: { ...d.consents, [key]: value } }));
  }

  function advance() {
    startTransition(async () => {
      const res = await saveStep(step, data);
      if (!res.ok) {
        toast("error", messages[res.message] ?? messages.save_failed);
        return;
      }
      if (isLast) {
        toast("success", t.done);
        router.push("/programm");
        return;
      }
      setIndex((i) => i + 1);
    });
  }

  const opt = (list: Opt[]) => list.map((o) => ({ value: o.key, label: o.label }));

  return (
    <div className="flex flex-col gap-4">
      <Stepper
        current={index}
        srLabel={t.progress}
        steps={[
          { label: t.stepBasics },
          { label: t.stepWork },
          { label: t.stepInterests },
          { label: t.stepConsent },
        ]}
      />

      <Card>
        {step === "basics" && (
          <div className="flex flex-col gap-4">
            <h2 className="ct-h2 text-ink">{t.stepBasics}</h2>
            <p className="ct-help">{t.basicsHint}</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label={t.firstName}
                htmlFor="first_name"
                required
                requiredLabel={common.required}
              >
                <Input
                  id="first_name"
                  autoComplete="given-name"
                  value={data.first_name}
                  onChange={(e) => set("first_name", e.target.value)}
                />
              </Field>
              <Field
                label={t.lastName}
                htmlFor="last_name"
                required
                requiredLabel={common.required}
              >
                <Input
                  id="last_name"
                  autoComplete="family-name"
                  value={data.last_name}
                  onChange={(e) => set("last_name", e.target.value)}
                />
              </Field>
              <Field label={t.city} htmlFor="city">
                <Input
                  id="city"
                  autoComplete="address-level2"
                  value={data.city}
                  onChange={(e) => set("city", e.target.value)}
                />
              </Field>
              <Field label={t.country} htmlFor="country" hint={t.countryHint}>
                <Input
                  id="country"
                  autoComplete="country-name"
                  value={data.country}
                  onChange={(e) => set("country", e.target.value)}
                />
              </Field>
              <Field label={t.language} htmlFor="preferred_language">
                <Select
                  id="preferred_language"
                  value={data.preferred_language}
                  options={opt(languages)}
                  onChange={(e) => set("preferred_language", e.target.value)}
                />
              </Field>
            </div>
          </div>
        )}

        {step === "work" && (
          <div className="flex flex-col gap-4">
            <h2 className="ct-h2 text-ink">{t.stepWork}</h2>
            <p className="ct-help">{t.optionalHint}</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t.occupationStatus} htmlFor="occupation_status">
                <Select
                  id="occupation_status"
                  value={data.occupation_status}
                  placeholder={common.choose}
                  options={opt(vocab.occupation_status)}
                  onChange={(e) => set("occupation_status", e.target.value)}
                />
              </Field>
              <Field label={t.careerLevel} htmlFor="career_level">
                <Select
                  id="career_level"
                  value={data.career_level}
                  placeholder={common.choose}
                  options={opt(vocab.career_level)}
                  onChange={(e) => set("career_level", e.target.value)}
                />
              </Field>
              <Field label={t.employer} htmlFor="employer_name">
                <Input
                  id="employer_name"
                  autoComplete="organization"
                  value={data.employer_name}
                  onChange={(e) => set("employer_name", e.target.value)}
                />
              </Field>
              <Field label={t.studyField} htmlFor="study_field">
                <Select
                  id="study_field"
                  value={data.study_field}
                  placeholder={common.choose}
                  options={opt(vocab.study_field)}
                  onChange={(e) => set("study_field", e.target.value)}
                />
              </Field>
              <Field label={t.university} htmlFor="university">
                <Input
                  id="university"
                  value={data.university}
                  onChange={(e) => set("university", e.target.value)}
                />
              </Field>
            </div>
          </div>
        )}

        {step === "interests" && (
          <div className="flex flex-col gap-4">
            <h2 className="ct-h2 text-ink">{t.stepInterests}</h2>
            <p className="ct-help">{t.interestsHint}</p>
            <ChipGroup
              label={t.topics}
              options={vocab.interests}
              selected={data.interests}
              onToggle={(k) => toggle("interests", k)}
            />
            <ChipGroup
              label={t.founderTopics}
              options={vocab.interests_founder}
              selected={data.interests_founder}
              onToggle={(k) => toggle("interests_founder", k)}
            />
          </div>
        )}

        {step === "consent" && (
          <div className="flex flex-col gap-4">
            <h2 className="ct-h2 text-ink">{t.stepConsent}</h2>
            <p className="ct-help">{t.consentHint}</p>
            <ul className="flex flex-col gap-3">
              <ConsentRow
                id="c-terms"
                label={consentLabels.terms}
                required
                requiredLabel={common.required}
                checked={data.consents.terms}
                onChange={(v) => setConsent("terms", v)}
              />
              <ConsentRow
                id="c-privacy"
                label={consentLabels.privacy}
                required
                requiredLabel={common.required}
                checked={data.consents.privacy}
                onChange={(v) => setConsent("privacy", v)}
              />
              <ConsentRow
                id="c-photo"
                label={consentLabels.photo_video}
                hint={t.photoHint}
                checked={data.consents.photo_video}
                onChange={(v) => setConsent("photo_video", v)}
              />
              <ConsentRow
                id="c-news"
                label={consentLabels.newsletter}
                hint={t.newsletterHint}
                checked={data.consents.newsletter}
                onChange={(v) => setConsent("newsletter", v)}
              />
            </ul>
          </div>
        )}
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        {index > 0 && (
          <Button
            variant="secondary"
            disabled={pending}
            onClick={() => setIndex((i) => i - 1)}
          >
            {common.back}
          </Button>
        )}
        <Button onClick={advance} loading={pending} disabled={!valid}>
          {isLast ? t.finish : common.next}
        </Button>
        {!isLast && step !== "basics" && (
          <button
            type="button"
            disabled={pending}
            onClick={() => setIndex((i) => i + 1)}
            className="ct-link text-[14px]"
          >
            {t.skip}
          </button>
        )}
        <span className="ct-help ml-auto">
          {t.stepOf.replace("{n}", String(index + 1)).replace("{total}", String(STEPS.length))}
        </span>
      </div>
    </div>
  );
}

function ChipGroup({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: Opt[];
  selected: string[];
  onToggle: (key: string) => void;
}) {
  if (options.length === 0) return null;
  return (
    <div>
      <p className="ct-label mb-2">{label}</p>
      <div role="group" aria-label={label} className="flex flex-wrap gap-2">
        {options.map((o) => {
          const active = selected.includes(o.key);
          return (
            <button
              key={o.key}
              type="button"
              aria-pressed={active}
              onClick={() => onToggle(o.key)}
              className={cn(
                "min-h-11 rounded-ct-md border px-3 py-1.5 text-[14px] font-semibold transition-colors",
                active
                  ? "border-accent bg-accent-soft text-accent-deep"
                  : "border-border bg-surface text-ink hover:bg-surface-hover",
              )}
            >
              {active && <span aria-hidden>✓ </span>}
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ConsentRow({
  id,
  label,
  hint,
  required,
  requiredLabel,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  hint?: string;
  required?: boolean;
  requiredLabel?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <li className="rounded-ct-md border p-3">
      <label htmlFor={id} className="flex items-start gap-3">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-1 size-4"
        />
        <span>
          <span className="ct-label">
            {label}
            {required && (
              <>
                <span aria-hidden className="ml-0.5 text-error-ink">
                  *
                </span>
                <span className="ml-1 text-[12px] font-semibold text-muted">
                  ({requiredLabel})
                </span>
              </>
            )}
          </span>
          {hint && <span className="ct-help block">{hint}</span>}
        </span>
      </label>
    </li>
  );
}
