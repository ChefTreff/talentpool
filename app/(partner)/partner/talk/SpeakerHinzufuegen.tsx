"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import { addTalkSpeaker } from "../actions";

type Strings = Record<string, string>;
type Weg = "eigen" | "verwaltet";

/**
 * Speaker eines gebuchten Slots eintragen (PART-091, Konrad 25.09.).
 *
 * Die Frage steht vor dem Absenden, nicht danach: „Soll der Speaker einen
 * eigenen Zugang erhalten, oder verwaltet ihr alles rund um den Slot?“
 *
 * - **Eigener Zugang:** die Person bekommt vom Speaker-Team eine Einladung ins
 *   Speaker-Portal und pflegt ihre Angaben selbst.
 * - **Wir verwalten alles:** kein eigener Zugang. Der Operations-Kontakt der
 *   Organisation pflegt alles im Speaker-Portal, und die gesamte Kommunikation
 *   läuft über ihn — das steht hier, bevor jemand absendet.
 *
 * Ohne Operations-Kontakt gibt es nur den eigenen Zugang; die Datenbank lehnt
 * den anderen Weg dann ohnehin ab (`no_ops_contact`).
 */
export function SpeakerHinzufuegen({
  sessionId,
  opsName,
  t,
  rpcMessages,
}: {
  sessionId: string;
  /** Name des Operations-Kontakts der Organisation, `null` ohne einen. */
  opsName: string | null;
  t: Strings;
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [saving, startSaving] = useTransition();
  const [offen, setOffen] = useState(false);
  const [weg, setWeg] = useState<Weg>("eigen");
  const [draft, setDraft] = useState({ email: "", firstName: "", lastName: "" });
  const [fehler, setFehler] = useState<string | null>(null);

  const kontakt = (text: string) => text.replaceAll("{kontakt}", opsName ?? "");
  const verwaltet = weg === "verwaltet" && opsName !== null;

  function schliessen() {
    setDraft({ email: "", firstName: "", lastName: "" });
    setWeg("eigen");
    setFehler(null);
    setOffen(false);
  }

  function eintragen() {
    setFehler(null);
    startSaving(async () => {
      const res = await addTalkSpeaker({
        sessionId,
        email: draft.email.trim(),
        firstName: draft.firstName.trim(),
        lastName: draft.lastName.trim(),
        verwaltet,
      });
      if (!res.ok) {
        setFehler(rpcMessages[res.key] ?? rpcMessages.unknown ?? res.key);
        return;
      }
      toast("success", verwaltet ? kontakt(t.speakerAddedManaged) : t.speakerAdded);
      schliessen();
      router.refresh();
    });
  }

  if (!offen) {
    return (
      <div>
        <Button variant="secondary" size="sm" onClick={() => setOffen(true)}>
          {t.addSpeaker}
        </Button>
      </div>
    );
  }

  const optionen = [{ value: "eigen", label: t.modeOwn }];
  if (opsName !== null) optionen.push({ value: "verwaltet", label: kontakt(t.modeManaged) });

  return (
    <form
      className="flex max-w-detail flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        eintragen();
      }}
    >
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
        <Field
          label={t.email}
          htmlFor={`nem-${sessionId}`}
          hint={verwaltet ? kontakt(t.emailHintManaged) : t.emailHint}
        >
          <Input
            id={`nem-${sessionId}`}
            type="email"
            value={draft.email}
            onChange={(e) => setDraft({ ...draft, email: e.target.value })}
          />
        </Field>
      </div>
      <Field
        label={t.modeQuestion}
        htmlFor={`nweg-${sessionId}`}
        hint={opsName === null ? t.modeNoOps : verwaltet ? kontakt(t.modeManagedHint) : t.modeOwnHint}
        className="max-w-form"
      >
        <Select
          id={`nweg-${sessionId}`}
          value={verwaltet ? "verwaltet" : "eigen"}
          options={optionen}
          onChange={(e) => setWeg(e.target.value as Weg)}
        />
      </Field>
      {fehler && (
        <p role="alert" className="ct-small text-error-ink">
          {fehler}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={saving} disabled={draft.email.trim() === ""}>
          {t.addSpeaker}
        </Button>
        <Button type="button" variant="ghost" onClick={schliessen} disabled={saving}>
          {t.cancel}
        </Button>
      </div>
    </form>
  );
}
