"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Input, Textarea } from "@/components/ui/Input";
import { ConfirmDialog } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import {
  inviteAssistant,
  removeAssistant,
  saveSpeakerConsents,
  saveSpeakerProfile,
  type SpeakerResult,
} from "../actions";
import { SPEAKER_CONSENTS, type SpeakerProfile } from "../types";

type Strings = Record<string, string>;

/** Was das Formular schickt — die RPC nimmt genau diese Schlüssel an. */
type Draft = {
  first_name: string;
  last_name: string;
  title: string;
  pronouns: string;
  linkedin_url: string;
  phone_e164: string;
  preferred_language: string;
  job_title: string;
  organization_name: string;
  bio_short_en: string;
  bio_short_de: string;
  bio_long_en: string;
  bio_long_de: string;
};

const MIC_OPTIONS = ["headset", "handheld", "lavalier"] as const;

export function SpeakerProfileForm({
  profile,
  t,
  common,
  rpcMessages,
}: {
  profile: SpeakerProfile;
  t: Strings;
  common: {
    cancel: string;
    choose: string;
    none: string;
    required: string;
    save: string;
    saving: string;
  };
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const p = profile.person;
  const [draft, setDraft] = useState<Draft>({
    first_name: p.first_name ?? "",
    last_name: p.last_name ?? "",
    title: p.title ?? "",
    pronouns: p.pronouns ?? "",
    linkedin_url: p.linkedin_url ?? "",
    phone_e164: p.phone_e164 ?? "",
    preferred_language: p.preferred_language ?? "en",
    job_title: profile.job_title ?? "",
    organization_name: profile.organization_name ?? "",
    bio_short_en: profile.bio_short_en ?? "",
    bio_short_de: profile.bio_short_de ?? "",
    bio_long_en: profile.bio_long_en ?? "",
    bio_long_de: profile.bio_long_de ?? "",
  });
  const socials = profile.socials ?? {};
  const [links, setLinks] = useState({
    website: socials.website ?? "",
    x: socials.x ?? "",
    instagram: socials.instagram ?? "",
  });
  const rider = (profile.tech_rider ?? {}) as Record<string, unknown>;
  const [tech, setTech] = useState({
    mic: typeof rider.mic === "string" ? rider.mic : "",
    own_laptop: rider.own_laptop === true,
    video: rider.video === true,
    notes: typeof rider.notes === "string" ? rider.notes : "",
  });
  const [consents, setConsents] = useState<Record<string, boolean>>(
    Object.fromEntries(SPEAKER_CONSENTS.map((c) => [c, profile.consents?.[c] === true])),
  );

  const [assistantEmail, setAssistantEmail] = useState("");
  const [assistantFirst, setAssistantFirst] = useState("");
  const [assistantLast, setAssistantLast] = useState("");
  const [askRemove, setAskRemove] = useState(false);

  const message = (key: string) => rpcMessages[key] ?? rpcMessages.unknown ?? key;
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  // Die Assistenz darf Profil und Inhalte pflegen, aber keine Einwilligung
  // geben und keine Assistenz einladen (Antwort 58, Abschnitt C).
  const readOnlyConsent = profile.is_assistant;
  const bioMissing = draft.bio_short_en.trim() === "";

  function report(res: SpeakerResult, okText: string) {
    if (res.ok) {
      toast("success", okText);
      router.refresh();
      return true;
    }
    toast("error", message(res.key) + (res.detail ? ` (${res.detail})` : ""));
    return false;
  }

  function onSave() {
    startTransition(async () => {
      report(
        await saveSpeakerProfile({
          id: profile.id,
          ...draft,
          socials: Object.fromEntries(
            Object.entries(links).filter(([, v]) => v.trim() !== ""),
          ),
          tech_rider: {
            mic: tech.mic || null,
            own_laptop: tech.own_laptop,
            video: tech.video,
            notes: tech.notes.trim() || null,
          },
        }),
        t.saved,
      );
    });
  }

  function onSaveConsents() {
    startTransition(async () => {
      report(await saveSpeakerConsents(consents), t.consentSaved);
    });
  }

  function onInvite() {
    startTransition(async () => {
      if (
        report(
          await inviteAssistant(profile.id, assistantEmail, assistantFirst, assistantLast),
          t.assistantInvited,
        )
      ) {
        setAssistantEmail("");
        setAssistantFirst("");
        setAssistantLast("");
      }
    });
  }

  function onRemove() {
    startTransition(async () => {
      setAskRemove(false);
      report(await removeAssistant(profile.id), t.assistantRemoved);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className="p-6">
        <h2 className="ct-h3 mb-4 text-ink">{t.sectionPerson}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t.fieldTitle} htmlFor="title" hint={t.fieldTitleHint}>
            <Input id="title" value={draft.title} onChange={(e) => set("title", e.target.value)} />
          </Field>
          <Field label={t.fieldPronouns} htmlFor="pronouns" hint={t.fieldPronounsHint}>
            <Input
              id="pronouns"
              value={draft.pronouns}
              onChange={(e) => set("pronouns", e.target.value)}
            />
          </Field>
          <Field label={t.fieldFirstName} htmlFor="first_name">
            <Input
              id="first_name"
              value={draft.first_name}
              onChange={(e) => set("first_name", e.target.value)}
            />
          </Field>
          <Field label={t.fieldLastName} htmlFor="last_name">
            <Input
              id="last_name"
              value={draft.last_name}
              onChange={(e) => set("last_name", e.target.value)}
            />
          </Field>
          <Field label={t.fieldPhone} htmlFor="phone" hint={t.fieldPhoneHint}>
            <Input
              id="phone"
              type="tel"
              value={draft.phone_e164}
              onChange={(e) => set("phone_e164", e.target.value)}
            />
          </Field>
          <Field label={t.fieldLanguage} htmlFor="language">
            <Select
              id="language"
              value={draft.preferred_language}
              options={[
                { value: "en", label: "English" },
                { value: "de", label: "Deutsch" },
              ]}
              onChange={(e) => set("preferred_language", e.target.value)}
            />
          </Field>
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="ct-h3 mb-4 text-ink">{t.sectionAppearance}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t.fieldJobTitle} htmlFor="job_title">
            <Input
              id="job_title"
              value={draft.job_title}
              onChange={(e) => set("job_title", e.target.value)}
            />
          </Field>
          <Field label={t.fieldOrganization} htmlFor="organization">
            <Input
              id="organization"
              value={draft.organization_name}
              onChange={(e) => set("organization_name", e.target.value)}
            />
          </Field>
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="ct-h3 mb-4 text-ink">{t.sectionBio}</h2>
        <div className="flex flex-col gap-4">
          <Field
            label={t.fieldBioShortEn}
            htmlFor="bio_short_en"
            hint={t.fieldBioShortEnHint}
            required
            requiredLabel={common.required}
          >
            <Textarea
              id="bio_short_en"
              rows={3}
              value={draft.bio_short_en}
              onChange={(e) => set("bio_short_en", e.target.value)}
            />
          </Field>
          <Field label={t.fieldBioShortDe} htmlFor="bio_short_de">
            <Textarea
              id="bio_short_de"
              rows={3}
              value={draft.bio_short_de}
              onChange={(e) => set("bio_short_de", e.target.value)}
            />
          </Field>
          <Field label={t.fieldBioLongEn} htmlFor="bio_long_en">
            <Textarea
              id="bio_long_en"
              rows={5}
              value={draft.bio_long_en}
              onChange={(e) => set("bio_long_en", e.target.value)}
            />
          </Field>
          <Field label={t.fieldBioLongDe} htmlFor="bio_long_de">
            <Textarea
              id="bio_long_de"
              rows={5}
              value={draft.bio_long_de}
              onChange={(e) => set("bio_long_de", e.target.value)}
            />
          </Field>
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="ct-h3 mb-4 text-ink">{t.sectionSocials}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t.fieldLinkedin} htmlFor="linkedin">
            <Input
              id="linkedin"
              type="url"
              value={draft.linkedin_url}
              onChange={(e) => set("linkedin_url", e.target.value)}
            />
          </Field>
          <Field label={t.fieldWebsite} htmlFor="website">
            <Input
              id="website"
              type="url"
              value={links.website}
              onChange={(e) => setLinks((l) => ({ ...l, website: e.target.value }))}
            />
          </Field>
          <Field label={t.fieldX} htmlFor="x">
            <Input
              id="x"
              value={links.x}
              onChange={(e) => setLinks((l) => ({ ...l, x: e.target.value }))}
            />
          </Field>
          <Field label={t.fieldInstagram} htmlFor="instagram">
            <Input
              id="instagram"
              value={links.instagram}
              onChange={(e) => setLinks((l) => ({ ...l, instagram: e.target.value }))}
            />
          </Field>
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="ct-h3 mb-4 text-ink">{t.sectionTech}</h2>
        <div className="flex flex-col gap-4">
          <Field label={t.techMic} htmlFor="mic">
            <Select
              id="mic"
              value={tech.mic}
              placeholder={common.choose}
              options={MIC_OPTIONS.map((m) => ({
                value: m,
                label: t[`techMic${m[0].toUpperCase()}${m.slice(1)}`] ?? m,
              }))}
              onChange={(e) => setTech((v) => ({ ...v, mic: e.target.value }))}
            />
          </Field>
          <label className="flex items-center gap-2 text-[14px] font-semibold">
            <input
              type="checkbox"
              className="size-4"
              checked={tech.own_laptop}
              onChange={(e) => setTech((v) => ({ ...v, own_laptop: e.target.checked }))}
            />
            {t.techOwnLaptop}
          </label>
          <label className="flex items-center gap-2 text-[14px] font-semibold">
            <input
              type="checkbox"
              className="size-4"
              checked={tech.video}
              onChange={(e) => setTech((v) => ({ ...v, video: e.target.checked }))}
            />
            {t.techVideo}
          </label>
          <Field label={t.techNotes} htmlFor="tech_notes">
            <Textarea
              id="tech_notes"
              rows={3}
              value={tech.notes}
              onChange={(e) => setTech((v) => ({ ...v, notes: e.target.value }))}
            />
          </Field>
        </div>
        <div className="mt-6">
          <Button onClick={onSave} loading={pending} disabled={bioMissing}>
            {common.save}
          </Button>
        </div>
      </Card>

      <Card className="p-6" id="consent">
        <h2 className="ct-h3 mb-1 text-ink">{t.sectionConsent}</h2>
        {readOnlyConsent && <p className="ct-help mb-3">{t.consentReadOnly}</p>}
        <div className="mt-3 flex flex-col gap-3">
          {SPEAKER_CONSENTS.map((key) => (
            <label key={key} className="flex items-start gap-2 text-[14px]">
              <input
                type="checkbox"
                className="mt-1 size-4"
                checked={consents[key] === true}
                disabled={readOnlyConsent}
                onChange={(e) =>
                  setConsents((c) => ({ ...c, [key]: e.target.checked }))
                }
              />
              <span>{t[consentLabelKey(key)]}</span>
            </label>
          ))}
        </div>
        {!readOnlyConsent && (
          <div className="mt-6">
            <Button variant="secondary" onClick={onSaveConsents} loading={pending}>
              {common.save}
            </Button>
          </div>
        )}
      </Card>

      <Card className="p-6">
        <h2 className="ct-h3 mb-1 text-ink">{t.sectionAssistant}</h2>
        <p className="ct-help mb-4">{t.assistantLead}</p>

        {profile.assistant ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="ct-label text-ink">
                {[profile.assistant.first_name, profile.assistant.last_name]
                  .filter(Boolean)
                  .join(" ") || common.none}
              </p>
              {profile.assistant.email && (
                <p className="ct-help">{profile.assistant.email}</p>
              )}
            </div>
            {!profile.is_assistant && (
              <Button
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() => setAskRemove(true)}
              >
                {t.assistantRemove}
              </Button>
            )}
          </div>
        ) : (
          <p className="ct-help">{t.assistantNone}</p>
        )}

        {profile.is_assistant ? (
          <p className="ct-help mt-4">{t.assistantOnlySpeaker}</p>
        ) : (
          <div className="mt-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={t.assistantEmail} htmlFor="a_email">
                <Input
                  id="a_email"
                  type="email"
                  value={assistantEmail}
                  onChange={(e) => setAssistantEmail(e.target.value)}
                />
              </Field>
              <Field label={t.assistantFirstName} htmlFor="a_first">
                <Input
                  id="a_first"
                  value={assistantFirst}
                  onChange={(e) => setAssistantFirst(e.target.value)}
                />
              </Field>
              <Field label={t.assistantLastName} htmlFor="a_last">
                <Input
                  id="a_last"
                  value={assistantLast}
                  onChange={(e) => setAssistantLast(e.target.value)}
                />
              </Field>
            </div>
            <div className="mt-4">
              <Button
                variant="secondary"
                disabled={pending || assistantEmail.trim() === ""}
                onClick={onInvite}
              >
                {t.assistantInvite}
              </Button>
            </div>
          </div>
        )}
      </Card>

      {askRemove && (
        <ConfirmDialog
          title={t.assistantRemoveTitle}
          body={t.assistantRemoveBody}
          confirmLabel={t.assistantRemove}
          cancelLabel={common.cancel}
          pending={pending}
          onCancel={() => setAskRemove(false)}
          onConfirm={onRemove}
        />
      )}
    </div>
  );
}

/** Einwilligungsschlüssel → Textschlüssel im Wörterbuch. */
function consentLabelKey(key: string): string {
  return {
    photo_video: "consentPhotoVideo",
    speaker_release: "consentSpeakerRelease",
    slides_publication: "consentSlides",
    hospitality_data: "consentHospitality",
  }[key] ?? key;
}
