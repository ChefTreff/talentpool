"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { addTalkSpeaker } from "../actions";

type Strings = Record<string, string>;

/**
 * Speaker zu einer gebuchten Keynote oder einem Panel eintragen (PART-044).
 *
 * Der Hinweis unter dem Formular ist kein Kleingedrucktes, sondern der Kern
 * der Sache: **wer schon ein Konto im Portal hat, bleibt Herr seiner Daten.**
 * Der Partner ordnet dann nur zu. Das steht hier, bevor er tippt — nicht als
 * Fehlermeldung hinterher.
 */
export function SpeakerHinzufuegen({
  sessionId,
  t,
  rpcMessages,
}: {
  sessionId: string;
  t: Strings;
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [saving, startSaving] = useTransition();
  const [offen, setOffen] = useState(false);
  const [draft, setDraft] = useState({ email: "", firstName: "", lastName: "" });

  function eintragen() {
    startSaving(async () => {
      const res = await addTalkSpeaker({
        sessionId,
        email: draft.email.trim(),
        firstName: draft.firstName.trim(),
        lastName: draft.lastName.trim(),
      });
      if (!res.ok) {
        toast("error", rpcMessages[res.key] ?? rpcMessages.unknown);
        return;
      }
      toast("success", t.speakerAdded);
      setDraft({ email: "", firstName: "", lastName: "" });
      setOffen(false);
      router.refresh();
    });
  }

  if (!offen) {
    return (
      <Button variant="secondary" size="sm" onClick={() => setOffen(true)}>
        {t.addSpeaker}
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={t.firstName} htmlFor={`nfn-${sessionId}`}>
          <Input
            id={`nfn-${sessionId}`}
            value={draft.firstName}
            onChange={(e) => setDraft({ ...draft, firstName: e.target.value })}
          />
        </Field>
        <Field label={t.lastName} htmlFor={`nln-${sessionId}`}>
          <Input
            id={`nln-${sessionId}`}
            value={draft.lastName}
            onChange={(e) => setDraft({ ...draft, lastName: e.target.value })}
          />
        </Field>
        <Field label={t.email} htmlFor={`nem-${sessionId}`} hint={t.emailHint}>
          <Input
            id={`nem-${sessionId}`}
            type="email"
            value={draft.email}
            onChange={(e) => setDraft({ ...draft, email: e.target.value })}
          />
        </Field>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={eintragen} disabled={saving || draft.email.trim() === ""}>
          {saving ? t.saving : t.addSpeaker}
        </Button>
        <Button variant="ghost" onClick={() => setOffen(false)} disabled={saving}>
          {t.cancel}
        </Button>
      </div>
      <p className="ct-help">{t.addSpeakerNote}</p>
    </div>
  );
}
