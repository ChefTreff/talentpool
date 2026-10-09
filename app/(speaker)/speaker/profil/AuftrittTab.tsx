"use client";

import { useState } from "react";
import { useUngesichert, type UngesichertTexte } from "@/components/ui/useUngesichert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Input, Textarea } from "@/components/ui/Input";
import { saveSpeakerProfile } from "../actions";
import type { SpeakerProfile } from "../types";
import { useProfilSpeichern } from "./useProfilSpeichern";

type Strings = Record<string, string>;

/**
 * Was dieser Reiter schickt (SPK-088): Auftritt, Bio und der LinkedIn-Link. Die übrigen Links gehen als `socials` mit. Die RPC lässt
 * alles, was nicht dabei ist, wie es ist — der Reiter „Person“ schickt Name, Titel, Telefon und Sprache.
 */
type Draft = {
  job_title: string;
  organization_name: string;
  bio_short_en: string;
  bio_short_de: string;
  bio_long_en: string;
  bio_long_de: string;
  linkedin_url: string;
};

/**
 * Reiter „Auftritt & Bio“: was über die Person auf der Website und im Programm steht — Position, Organisation, die vier Texte und die
 * Links. **Ein** „Speichern“ für alle drei Karten; ohne die kurze englische Bio bleibt es gesperrt (sie ist die Pflichtangabe des Profils).
 */
export function AuftrittTab({
  profile,
  t,
  common,
  rpcMessages,
}: {
  profile: SpeakerProfile;
  t: Strings;
  common: {
    required: string;
    save: string;
    /** Rückfrage vor dem Verlassen mit ungesicherten Änderungen (QS-051). */
    unsaved: UngesichertTexte;
  };
  rpcMessages: Record<string, string>;
}) {
  const { pending, startTransition, report } = useProfilSpeichern(rpcMessages);

  const [draft, setDraft] = useState<Draft>({
    job_title: profile.job_title ?? "",
    organization_name: profile.organization_name ?? "",
    bio_short_en: profile.bio_short_en ?? "",
    bio_short_de: profile.bio_short_de ?? "",
    bio_long_en: profile.bio_long_en ?? "",
    bio_long_de: profile.bio_long_de ?? "",
    linkedin_url: profile.person.linkedin_url ?? "",
  });
  const socials = profile.socials ?? {};
  const [links, setLinks] = useState({
    website: socials.website ?? "",
    x: socials.x ?? "",
    instagram: socials.instagram ?? "",
  });

  // Der zuletzt gespeicherte Stand — „geändert“ heisst: anders als hier (QS-051). Nicht gegen `profile` verglichen: der
  // Server normalisiert (Links), und eine eben gespeicherte Eingabe sähe sonst geändert aus.
  const [basis, setBasis] = useState(() => ({ draft: JSON.stringify(draft), links: JSON.stringify(links) }));
  const geaendert = JSON.stringify(draft) !== basis.draft || JSON.stringify(links) !== basis.links;
  const warnung = useUngesichert(geaendert, common.unsaved);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const bioMissing = draft.bio_short_en.trim() === "";

  function onSave() {
    const gespeichert = { draft: JSON.stringify(draft), links: JSON.stringify(links) };
    startTransition(async () => {
      const ok = report(
        await saveSpeakerProfile({
          id: profile.id,
          ...draft,
          socials: Object.fromEntries(Object.entries(links).filter(([, v]) => v.trim() !== "")),
        }),
        t.saved,
      );
      if (ok) setBasis(gespeichert);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {warnung}
      <Card id="auftritt" className="p-6">
        <h2 className="ct-h2 mb-4 text-ink">{t.sectionAppearance}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t.fieldJobTitle} htmlFor="job_title">
            <Input id="job_title" value={draft.job_title} onChange={(e) => set("job_title", e.target.value)} />
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
            <Input id="x" value={links.x} onChange={(e) => setLinks((l) => ({ ...l, x: e.target.value }))} />
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

      {/* Die Technik steht nicht mehr im Profil (SPK-040, SPK-067): was auf der Bühne gebraucht wird, hängt am Auftritt, nicht am
          Menschen — unter „Deine Session → Technik“. Das Profil schickt den Rider auch nicht mehr mit, sonst überschriebe jedes
          Speichern ihn mit leeren Werten. */}
      <div>
        <Button onClick={onSave} loading={pending} disabled={bioMissing}>
          {common.save}
        </Button>
      </div>
    </div>
  );
}
