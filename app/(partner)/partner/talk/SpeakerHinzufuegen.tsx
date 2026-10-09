"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
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
 *
 * **Der Knopf steht dort, wo er wirkt** (PART-149, Konrad 09.10.2026, Skill-Regel 13): in der Kopfzeile des Blocks „Wer spricht“
 * (`CardHeader action`) — oder, solange noch niemand eingetragen ist, im Leerzustand. Das Formular öffnet im Schubfach, nicht
 * aufgeklappt unter dem Knopf: sonst springt die Kopfzeile, und die Liste rutscht weg. Ein Fehler steht im Schubfach (`Drawer error`),
 * nicht dahinter. Wohin der Knopf kommt, entscheidet die Seite; diese Datei zeichnet Knopf und Schubfach.
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
  const bereit = draft.email.trim() !== "";
  const formId = `speaker-eintragen-${sessionId}`;

  function schliessen() {
    setDraft({ email: "", firstName: "", lastName: "" });
    setWeg("eigen");
    setFehler(null);
    setOffen(false);
  }

  function eintragen() {
    if (!bereit) return;
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

  const optionen = [{ value: "eigen", label: t.modeOwn }];
  if (opsName !== null) optionen.push({ value: "verwaltet", label: kontakt(t.modeManaged) });

  return (
    <>
      <Button variant="secondary" size="sm" className="whitespace-nowrap" onClick={() => setOffen(true)}>
        {t.addSpeaker}
      </Button>
      {offen && (
        <Drawer
          open
          onClose={schliessen}
          title={t.addSpeaker}
          error={fehler}
          footer={
            <div className="flex flex-wrap gap-2">
              {/* Im Fuß des Schubfachs, aber Teil des Formulars: so löst auch die Eingabetaste in einem Feld es aus. */}
              <Button type="submit" form={formId} loading={saving} disabled={!bereit}>
                {t.addSpeaker}
              </Button>
              <Button variant="ghost" onClick={schliessen} disabled={saving}>
                {t.cancel}
              </Button>
            </div>
          }
        >
          <form
            id={formId}
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              eintragen();
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
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
            </div>
            <Field label={t.email} htmlFor={`nem-${sessionId}`} hint={verwaltet ? kontakt(t.emailHintManaged) : t.emailHint}>
              <Input
                id={`nem-${sessionId}`}
                type="email"
                value={draft.email}
                onChange={(e) => setDraft({ ...draft, email: e.target.value })}
              />
            </Field>
            <Field
              label={t.modeQuestion}
              htmlFor={`nweg-${sessionId}`}
              hint={opsName === null ? t.modeNoOps : verwaltet ? kontakt(t.modeManagedHint) : t.modeOwnHint}
            >
              <Select
                id={`nweg-${sessionId}`}
                value={verwaltet ? "verwaltet" : "eigen"}
                options={optionen}
                onChange={(e) => setWeg(e.target.value as Weg)}
              />
            </Field>
          </form>
        </Drawer>
      )}
    </>
  );
}
