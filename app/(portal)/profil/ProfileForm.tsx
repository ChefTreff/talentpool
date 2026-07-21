"use client";

import { useState, useTransition, type ReactNode } from "react";
import { saveProfile, type ProfileInput } from "./actions";

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

const inputCls =
  "w-full rounded-lg border border-black/15 px-3 py-2 text-sm dark:border-white/20 dark:bg-zinc-900";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}

function TextInput(props: {
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <input
      type={props.type ?? "text"}
      value={props.value}
      placeholder={props.placeholder}
      onChange={(e) => props.onChange(e.target.value)}
      className={inputCls}
    />
  );
}

function SelectInput(props: {
  value: string;
  onChange: (v: string) => void;
  options: Opt[];
}) {
  return (
    <select
      value={props.value}
      onChange={(e) => props.onChange(e.target.value)}
      className={inputCls}
    >
      <option value="">— bitte wählen —</option>
      {props.options.map((o) => (
        <option key={o.key} value={o.key}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function CheckGroup(props: {
  options: Opt[];
  selected: string[];
  onToggle: (key: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {props.options.map((o) => {
        const active = props.selected.includes(o.key);
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => props.onToggle(o.key)}
            className={
              "rounded-full border px-3 py-1.5 text-sm transition-colors " +
              (active
                ? "border-transparent bg-foreground text-background"
                : "border-black/15 hover:bg-black/[.04] dark:border-white/20 dark:hover:bg-white/[.06]")
            }
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-black/10 pt-6 dark:border-white/10">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-widest text-zinc-500">
        {title}
      </h2>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

export function ProfileForm({
  vocab,
  initial,
}: {
  vocab: Vocab;
  initial: ProfileInput;
}) {
  const [form, setForm] = useState<ProfileInput>(initial);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

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
    ? vocab.programsByField[form.study_field] ?? []
    : [];

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    startTransition(async () => {
      const res = await saveProfile(form);
      setMsg(
        res.ok
          ? { ok: true, text: "Gespeichert ✓" }
          : { ok: false, text: res.error ?? "Speichern fehlgeschlagen" },
      );
    });
  }

  return (
    <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-8">
      <Section title="Persönliches">
        <Field label="Vorname">
          <TextInput value={form.first_name} onChange={(v) => set("first_name", v)} />
        </Field>
        <Field label="Nachname">
          <TextInput value={form.last_name} onChange={(v) => set("last_name", v)} />
        </Field>
        <Field label="Geburtsdatum">
          <TextInput type="date" value={form.birthdate} onChange={(v) => set("birthdate", v)} />
        </Field>
        <Field label="Geschlecht">
          <SelectInput value={form.gender} onChange={(v) => set("gender", v)} options={vocab.gender} />
        </Field>
        <Field label="Nationalität">
          <TextInput value={form.nationality} onChange={(v) => set("nationality", v)} placeholder="z. B. deutsch" />
        </Field>
        <Field label="Land (Wohnsitz)">
          <TextInput value={form.country} onChange={(v) => set("country", v)} placeholder="z. B. DE" />
        </Field>
        <Field label="Telefon">
          <TextInput type="tel" value={form.phone} onChange={(v) => set("phone", v)} />
        </Field>
        <Field label="LinkedIn-Profil">
          <TextInput type="url" value={form.linkedin_url} onChange={(v) => set("linkedin_url", v)} placeholder="https://linkedin.com/in/…" />
        </Field>
        <Field label="Bevorzugte Sprache">
          <SelectInput
            value={form.preferred_language}
            onChange={(v) => set("preferred_language", v)}
            options={[
              { key: "de", label: "Deutsch" },
              { key: "en", label: "English" },
            ]}
          />
        </Field>
      </Section>

      <Section title="Status & Beruf">
        <Field label="Aktueller Status">
          <SelectInput value={form.occupation_status} onChange={(v) => set("occupation_status", v)} options={vocab.occupation_status} />
        </Field>
        <Field label="Berufserfahrung">
          <SelectInput value={form.work_experience} onChange={(v) => set("work_experience", v)} options={vocab.work_experience} />
        </Field>
        <Field label="Karrierelevel">
          <SelectInput value={form.career_level} onChange={(v) => set("career_level", v)} options={vocab.career_level} />
        </Field>
        <Field label="Arbeitgeber (Art)">
          <SelectInput value={form.employer_type} onChange={(v) => set("employer_type", v)} options={vocab.employer_type} />
        </Field>
        <Field label="Arbeitgeber / Institution">
          <TextInput value={form.employer_name} onChange={(v) => set("employer_name", v)} />
        </Field>
        <Field label="Startup-Phase (falls Founder)">
          <SelectInput value={form.startup_phase} onChange={(v) => set("startup_phase", v)} options={vocab.startup_phase} />
        </Field>
      </Section>

      <Section title="Studium">
        <Field label="Studienhintergrund">
          <SelectInput value={form.study_field} onChange={setStudyField} options={vocab.study_field} />
        </Field>
        <Field label="Studiengang">
          <SelectInput
            value={form.study_program}
            onChange={(v) => set("study_program", v)}
            options={programs}
          />
        </Field>
        <Field label="Universität / Hochschule">
          <TextInput value={form.university} onChange={(v) => set("university", v)} />
        </Field>
        <Field label="Akademische Selbsteinschätzung">
          <SelectInput value={form.self_assessment} onChange={(v) => set("self_assessment", v)} options={vocab.self_assessment} />
        </Field>
      </Section>

      <section className="border-t border-black/10 pt-6 dark:border-white/10">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-widest text-zinc-500">
          Interessen
        </h2>
        <p className="mb-2 text-sm font-medium">Themen</p>
        <CheckGroup options={vocab.interests} selected={form.interests} onToggle={(k) => toggle("interests", k)} />
        <p className="mb-2 mt-5 text-sm font-medium">Founder-Themen</p>
        <CheckGroup
          options={vocab.interests_founder}
          selected={form.interests_founder}
          onToggle={(k) => toggle("interests_founder", k)}
        />
      </section>

      <section className="border-t border-black/10 pt-6 dark:border-white/10">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-widest text-zinc-500">
          Wie bist du auf ChefTreff aufmerksam geworden?
        </h2>
        <CheckGroup options={vocab.acquisition_channel} selected={form.channels} onToggle={(k) => toggle("channels", k)} />
      </section>

      <div className="flex items-center gap-4 border-t border-black/10 pt-6 dark:border-white/10">
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-foreground px-6 py-3 text-sm font-medium text-background disabled:opacity-50"
        >
          {pending ? "Speichere…" : "Speichern"}
        </button>
        {msg && (
          <span className={msg.ok ? "text-sm text-green-600" : "text-sm text-red-600"}>
            {msg.text}
          </span>
        )}
      </div>
    </form>
  );
}
