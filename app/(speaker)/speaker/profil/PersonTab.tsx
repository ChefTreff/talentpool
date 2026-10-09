"use client";

import { useState } from "react";
import { useUngesichert, type UngesichertTexte } from "@/components/ui/useUngesichert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { saveSpeakerProfile } from "../actions";
import type { SpeakerProfile } from "../types";
import { useProfilSpeichern } from "./useProfilSpeichern";

type Strings = Record<string, string>;

/**
 * Was dieser Reiter schickt (SPK-088). Die RPC nimmt nur die Schlüssel an, die da sind, und lässt alle anderen, wie sie sind —
 * der Reiter „Auftritt & Bio“ schickt die übrigen Profilfelder.
 */
type Draft = {
  first_name: string;
  last_name: string;
  title: string;
  phone: string;
  preferred_language: string;
};

/**
 * Reiter „Person“: Name, Titel, Telefon, Sprache. Das Foto steht über dem Reiter-Inhalt (die Seite baut es, es speichert sofort). Die Kontakte
 * (Assistenz, Agentur, Office) stehen seit SPK-089 auf ihrer eigenen Seite `/speaker/kontakte`.
 *
 * Der Entwurf gehört diesem Reiter: wer mit Ungespeichertem zu einem anderen Reiter klickt, wird gefragt (`useUngesichert`);
 * bleibt er, geht nichts verloren, geht er, beginnt der andere Reiter mit dem gespeicherten Stand.
 */
export function PersonTab({
  profile,
  t,
  common,
  rpcMessages,
}: {
  profile: SpeakerProfile;
  t: Strings;
  common: {
    save: string;
    /** Rückfrage vor dem Verlassen mit ungesicherten Änderungen (QS-051). */
    unsaved: UngesichertTexte;
  };
  rpcMessages: Record<string, string>;
}) {
  const { pending, startTransition, report } = useProfilSpeichern(rpcMessages);

  const p = profile.person;
  const [draft, setDraft] = useState<Draft>({
    first_name: p.first_name ?? "",
    last_name: p.last_name ?? "",
    title: p.title ?? "",
    phone: p.phone ?? "",
    preferred_language: p.preferred_language ?? "en",
  });

  // Der zuletzt gespeicherte Stand — „geändert“ heisst: anders als hier (QS-051). Nicht gegen `profile` verglichen: der
  // Server normalisiert, und eine eben gespeicherte Eingabe sähe sonst geändert aus.
  const [basis, setBasis] = useState(() => JSON.stringify(draft));
  const geaendert = JSON.stringify(draft) !== basis;
  const warnung = useUngesichert(geaendert, common.unsaved);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  function onSave() {
    const gespeichert = JSON.stringify(draft);
    startTransition(async () => {
      if (report(await saveSpeakerProfile({ id: profile.id, ...draft }), t.saved)) setBasis(gespeichert);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {warnung}
      <Card id="person" className="p-6">
        <h2 className="ct-h2 mb-4 text-ink">{t.sectionPerson}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t.fieldFirstName} htmlFor="first_name">
            <Input id="first_name" value={draft.first_name} onChange={(e) => set("first_name", e.target.value)} />
          </Field>
          <Field label={t.fieldLastName} htmlFor="last_name">
            <Input id="last_name" value={draft.last_name} onChange={(e) => set("last_name", e.target.value)} />
          </Field>
          <Field label={t.fieldTitle} htmlFor="title" hint={t.fieldTitleHint}>
            <Input id="title" value={draft.title} onChange={(e) => set("title", e.target.value)} />
          </Field>
          <Field label={t.fieldPhone} htmlFor="phone" hint={t.fieldPhoneHint}>
            <Input id="phone" type="tel" value={draft.phone} onChange={(e) => set("phone", e.target.value)} />
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
        <div className="mt-6">
          <Button onClick={onSave} loading={pending}>
            {common.save}
          </Button>
        </div>
      </Card>
    </div>
  );
}
