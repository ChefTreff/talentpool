"use client";

import { useState, useTransition, type ReactNode } from "react";
import { saveProfile, type ProfileInput } from "./actions";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/components/ui/cn";

type Opt = { key: string; label: string };
type Vocab = {
  occupation_status: Opt[];
  work_experience: Opt[];
  career_level: Opt[];
  employer_type: Opt[];
  study_field: Opt[];
  self_assessment: Opt[];
  gender: Opt[];
  startup_phase: Opt[];
  interests: Opt[];
  interests_founder: Opt[];
  acquisition_channel: Opt[];
  programsByField: Record<string, Opt[]>;
};

export type ProfileLabels = {
  sections: Record<"personal" | "work" | "study" | "interests" | "channels", string>;
  fields: Record<string, string>;
  hints: Record<string, string>;
  choose: string;
  save: string;
  saving: string;
  saved: string;
  messages: Record<string, string>;
  languages: Opt[];
};

function CheckGroup({
  options,
  selected,
  onToggle,
  label,
}: {
  options: Opt[];
  selected: string[];
  onToggle: (key: string) => void;
  label: string;
}) {
  return (
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
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <h2 className="ct-h2 mb-4 text-ink">{title}</h2>
      {children}
    </Card>
  );
}

export function ProfileForm({
  vocab,
  initial,
  t,
}: {
  vocab: Vocab;
  initial: ProfileInput;
  t: ProfileLabels;
}) {
  const [form, setForm] = useState<ProfileInput>(initial);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  function set<K extends keyof ProfileInput>(k: K, v: ProfileInput[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }
  function toggle(k: "interests" | "interests_founder" | "channels", val: string) {
    setForm((f) => {
      const arr = f[k];
      return {
        ...f,
        [k]: arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val],
      };
    });
  }
  // Studiengang hängt vom Studienhintergrund ab.
  function setStudyField(v: string) {
    setForm((f) => ({ ...f, study_field: v, study_program: "" }));
  }

  const programs = form.study_field
    ? (vocab.programsByField[form.study_field] ?? [])
    : [];
  const opts = (list: Opt[]) => list.map((o) => ({ value: o.key, label: o.label }));

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await saveProfile(form);
      if (res.ok) {
        toast("success", t.saved);
      } else {
        const text = t.messages[res.message] ?? t.messages.save_failed;
        setError(text);
        toast("error", text);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <Section title={t.sections.personal}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t.fields.firstName} htmlFor="first_name">
            <Input
              id="first_name"
              value={form.first_name}
              onChange={(e) => set("first_name", e.target.value)}
            />
          </Field>
          <Field label={t.fields.lastName} htmlFor="last_name">
            <Input
              id="last_name"
              value={form.last_name}
              onChange={(e) => set("last_name", e.target.value)}
            />
          </Field>
          <Field label={t.fields.birthdate} htmlFor="birthdate">
            <Input
              id="birthdate"
              type="date"
              value={form.birthdate}
              onChange={(e) => set("birthdate", e.target.value)}
            />
          </Field>
          <Field label={t.fields.gender} htmlFor="gender">
            <Select
              id="gender"
              value={form.gender}
              placeholder={t.choose}
              options={opts(vocab.gender)}
              onChange={(e) => set("gender", e.target.value)}
            />
          </Field>
          <Field
            label={t.fields.nationality}
            htmlFor="nationality"
            hint={t.hints.nationality}
          >
            <Input
              id="nationality"
              value={form.nationality}
              onChange={(e) => set("nationality", e.target.value)}
            />
          </Field>
          <Field label={t.fields.country} htmlFor="country" hint={t.hints.country}>
            <Input
              id="country"
              value={form.country}
              onChange={(e) => set("country", e.target.value)}
            />
          </Field>
          <Field label={t.fields.phone} htmlFor="phone">
            <Input
              id="phone"
              type="tel"
              autoComplete="tel"
              value={form.phone}
              onChange={(e) => set("phone", e.target.value)}
            />
          </Field>
          <Field label={t.fields.linkedin} htmlFor="linkedin_url">
            <Input
              id="linkedin_url"
              type="url"
              placeholder={t.hints.linkedin}
              value={form.linkedin_url}
              onChange={(e) => set("linkedin_url", e.target.value)}
            />
          </Field>
          <Field label={t.fields.language} htmlFor="preferred_language">
            <Select
              id="preferred_language"
              value={form.preferred_language}
              options={opts(t.languages)}
              onChange={(e) => set("preferred_language", e.target.value)}
            />
          </Field>
        </div>
      </Section>

      <Section title={t.sections.work}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t.fields.occupationStatus} htmlFor="occupation_status">
            <Select
              id="occupation_status"
              value={form.occupation_status}
              placeholder={t.choose}
              options={opts(vocab.occupation_status)}
              onChange={(e) => set("occupation_status", e.target.value)}
            />
          </Field>
          <Field label={t.fields.workExperience} htmlFor="work_experience">
            <Select
              id="work_experience"
              value={form.work_experience}
              placeholder={t.choose}
              options={opts(vocab.work_experience)}
              onChange={(e) => set("work_experience", e.target.value)}
            />
          </Field>
          <Field label={t.fields.careerLevel} htmlFor="career_level">
            <Select
              id="career_level"
              value={form.career_level}
              placeholder={t.choose}
              options={opts(vocab.career_level)}
              onChange={(e) => set("career_level", e.target.value)}
            />
          </Field>
          <Field label={t.fields.employerType} htmlFor="employer_type">
            <Select
              id="employer_type"
              value={form.employer_type}
              placeholder={t.choose}
              options={opts(vocab.employer_type)}
              onChange={(e) => set("employer_type", e.target.value)}
            />
          </Field>
          <Field label={t.fields.employerName} htmlFor="employer_name">
            <Input
              id="employer_name"
              value={form.employer_name}
              onChange={(e) => set("employer_name", e.target.value)}
            />
          </Field>
          <Field label={t.fields.startupPhase} htmlFor="startup_phase">
            <Select
              id="startup_phase"
              value={form.startup_phase}
              placeholder={t.choose}
              options={opts(vocab.startup_phase)}
              onChange={(e) => set("startup_phase", e.target.value)}
            />
          </Field>
        </div>
      </Section>

      <Section title={t.sections.study}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t.fields.studyField} htmlFor="study_field">
            <Select
              id="study_field"
              value={form.study_field}
              placeholder={t.choose}
              options={opts(vocab.study_field)}
              onChange={(e) => setStudyField(e.target.value)}
            />
          </Field>
          <Field label={t.fields.studyProgram} htmlFor="study_program">
            <Select
              id="study_program"
              value={form.study_program}
              placeholder={t.choose}
              options={opts(programs)}
              disabled={programs.length === 0}
              onChange={(e) => set("study_program", e.target.value)}
            />
          </Field>
          <Field label={t.fields.university} htmlFor="university">
            <Input
              id="university"
              value={form.university}
              onChange={(e) => set("university", e.target.value)}
            />
          </Field>
          <Field label={t.fields.selfAssessment} htmlFor="self_assessment">
            <Select
              id="self_assessment"
              value={form.self_assessment}
              placeholder={t.choose}
              options={opts(vocab.self_assessment)}
              onChange={(e) => set("self_assessment", e.target.value)}
            />
          </Field>
        </div>
      </Section>

      <Section title={t.sections.interests}>
        <p className="ct-label mb-2">{t.fields.topics}</p>
        <CheckGroup
          label={t.fields.topics}
          options={vocab.interests}
          selected={form.interests}
          onToggle={(k) => toggle("interests", k)}
        />
        <p className="ct-label mb-2 mt-5">{t.fields.founderTopics}</p>
        <CheckGroup
          label={t.fields.founderTopics}
          options={vocab.interests_founder}
          selected={form.interests_founder}
          onToggle={(k) => toggle("interests_founder", k)}
        />
      </Section>

      <Section title={t.sections.channels}>
        <CheckGroup
          label={t.sections.channels}
          options={vocab.acquisition_channel}
          selected={form.channels}
          onToggle={(k) => toggle("channels", k)}
        />
      </Section>

      <div className="flex items-center gap-4">
        <Button type="submit" loading={pending}>
          {pending ? t.saving : t.save}
        </Button>
        {error && (
          <p role="alert" className="text-[14px] text-error-ink">
            {error}
          </p>
        )}
      </div>
    </form>
  );
}
