"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { AbschnittsNavigation } from "@/components/ui/Abschnitte";
import { Field } from "@/components/ui/Field";
import { Input, Textarea } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import {
  removeSpeakerContact,
  saveSpeakerConsents,
  saveSpeakerContact,
  saveSpeakerProfile,
  type SpeakerResult,
} from "../actions";
import { SPEAKER_CONSENTS, type SpeakerProfile } from "../types";
import { KontakteCard } from "@/components/speaker/KontakteCard";

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
  const [consents, setConsents] = useState<Record<string, boolean>>(
    Object.fromEntries(SPEAKER_CONSENTS.map((c) => [c, profile.consents?.[c] === true])),
  );

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

  return (
    <div className="flex flex-col gap-6">
      {/* Das laengste Formular im Speaker-Portal (QS-026). */}
      <AbschnittsNavigation
        label={t.sectionsLabel}
        items={[
          { id: "person", label: t.sectionPerson },
          { id: "auftritt", label: t.sectionAppearance },
          { id: "bio", label: t.sectionBio },
          { id: "socials", label: t.sectionSocials },
          { id: "kontakte", label: t.sectionContacts },
          { id: "consent", label: t.sectionConsent },
        ]}
      />

      <Card id="person" className="p-6">
        <h2 className="ct-h2 mb-4 text-ink">{t.sectionPerson}</h2>
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

      <Card id="auftritt" className="p-6">
        <h2 className="ct-h2 mb-4 text-ink">{t.sectionAppearance}</h2>
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

      <Card id="bio" className="p-6">
        <h2 className="ct-h2 mb-4 text-ink">{t.sectionBio}</h2>
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

      <Card id="socials" className="p-6">
        <h2 className="ct-h2 mb-4 text-ink">{t.sectionSocials}</h2>
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

      {/* Die Technik steht nicht mehr im Profil (SPK-040, SPK-067): was auf der
          Bühne gebraucht wird, hängt am Auftritt, nicht am Menschen — unter
          „Deine Session → Technik". Das Profil schickt den Rider auch nicht
          mehr mit, sonst überschriebe jedes Speichern ihn mit leeren Werten. */}
      {/* Der Speichern-Knopf stand bisher unten in der Technik-Karte, gilt aber
          für das ganze Profil darüber — er bleibt, die Karte geht. */}
      <div>
        <Button onClick={onSave} loading={pending} disabled={bioMissing}>
          {common.save}
        </Button>
      </div>

      <Card id="consent" className="p-6">
        <h2 className="ct-h2 mb-1 text-ink">{t.sectionConsent}</h2>
        {readOnlyConsent && <p className="ct-help mb-3">{t.consentReadOnly}</p>}
        <div className="mt-3 flex flex-col gap-3">
          {SPEAKER_CONSENTS.map((key) => (
            <label key={key} className="flex items-start gap-2 ct-small">
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

      {/* Ein Abschnitt für Assistenz, Agentur und Office (SPK-040, 0148).
          Vorher waren es zwei Karten für dieselbe Sache — die Art sagt, wer es
          ist, das Häkchen, ob die Person sich anmelden darf. */}
      <KontakteCard
        id="kontakte"
        kontakte={profile.contacts ?? []}
        readOnly={profile.is_assistant}
        aktionen={{ save: saveSpeakerContact, remove: removeSpeakerContact }}
        t={t}
        common={common}
        message={message}
      />

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
