"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Textarea } from "@/components/ui/Input";
import { MehrfachAuswahl } from "@/components/ui/MehrfachAuswahl";
import { useToast } from "@/components/ui/Toast";
import { saveWunschprofil } from "@/lib/hackathon/wunschprofil-actions";
import type { Wunschprofil } from "@/lib/hackathon/wunschprofil";

type Strings = Record<string, string>;

/**
 * Wunschprofil einer Challenge pflegen (HACK-015): gesuchte Studienfelder und
 * Skills (dieselben Begriffe wie im Teilnehmer-Profil) und ein kurzer Satz
 * „Wen sucht ihr?“. Für Partner im Partner-Portal und das Hack-Team im Admin.
 */
export function WunschprofilForm({
  profil,
  studyFields,
  skills,
  t,
  rpcMessages,
}: {
  profil: Wunschprofil;
  studyFields: Record<string, string>;
  skills: Record<string, string>;
  t: Strings;
  rpcMessages: Strings;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [felder, setFelder] = useState<string[]>(profil.study_fields);
  const [gesucht, setGesucht] = useState<string[]>(profil.skills);
  const [text, setText] = useState(profil.profile ?? "");
  const id = `wunsch-${profil.challenge_id}`;
  const optionen = (m: Record<string, string>) => Object.entries(m).map(([value, label]) => ({ value, label }));

  return (
    <div className="flex flex-col gap-4">
      <Field label={t.wishFields} htmlFor={`${id}-fields`} hint={t.wishMax}>
        <MehrfachAuswahl
          id={`${id}-fields`}
          options={optionen(studyFields)}
          value={felder}
          onChange={(v) => setFelder(v.slice(0, 8))}
          placeholder={t.wishSearch}
          disabled={pending}
          t={{ remove: t.wishRemove, noHits: t.wishNoHits }}
        />
      </Field>
      <Field label={t.wishSkills} htmlFor={`${id}-skills`} hint={t.wishMax}>
        <MehrfachAuswahl
          id={`${id}-skills`}
          options={optionen(skills)}
          value={gesucht}
          onChange={(v) => setGesucht(v.slice(0, 8))}
          placeholder={t.wishSearch}
          disabled={pending}
          t={{ remove: t.wishRemove, noHits: t.wishNoHits }}
        />
      </Field>
      <Field label={t.wishText} htmlFor={`${id}-text`} hint={t.wishTextHint}>
        <Textarea id={`${id}-text`} rows={3} maxLength={500} value={text} disabled={pending} onChange={(e) => setText(e.target.value)} />
      </Field>
      <div>
        <Button
          variant="secondary"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await saveWunschprofil({ challengeId: profil.challenge_id, studyFields: felder, skills: gesucht, text });
              if (!res.ok) toast("error", rpcMessages[res.key] ?? rpcMessages.unknown ?? res.key);
              else {
                toast("success", t.wishSaved);
                router.refresh();
              }
            })
          }
        >
          {t.wishSave}
        </Button>
      </div>
    </div>
  );
}
