"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input, Textarea } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import { EIGENE_FRAGE_TYPEN, optionenAusText, type EigeneFrageTyp } from "@/components/partner/fragen";
import { requestSessionQuestion } from "../actions";

const LEER = { labelDe: "", labelEn: "", type: "textarea" as EigeneFrageTyp, optionen: "", purpose: "" };

/**
 * Eine eigene Bewerbungsfrage beantragen (PART-045, höchstens zwei je
 * Session). Sichtbar wird sie im Bewerbungsformular erst nach der Freigabe
 * durch das Programm-Team; der Zweck ist Pflicht — daran entscheidet das Team,
 * ob eine Frage gestellt werden darf (keine Art.-9-Fragen ohne ausgewiesenen
 * Zweck).
 */
export function EigeneFrageAntrag({
  sessionId,
  t,
  rpcMessages,
}: {
  sessionId: string;
  t: Record<string, string>;
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [saving, startSaving] = useTransition();
  const [offen, setOffen] = useState(false);
  const [entwurf, setEntwurf] = useState(LEER);
  const [fehler, setFehler] = useState<string | null>(null);
  const id = (feld: string) => `frage-${sessionId}-${feld}`;
  const optionen = entwurf.type === "select" ? optionenAusText(entwurf.optionen) : null;
  const bereit =
    entwurf.labelDe.trim() !== "" && entwurf.purpose.trim() !== "" && (entwurf.type !== "select" || (optionen?.length ?? 0) >= 2);

  function schliessen() {
    setEntwurf(LEER);
    setFehler(null);
    setOffen(false);
  }

  function beantragen() {
    setFehler(null);
    startSaving(async () => {
      const res = await requestSessionQuestion({
        sessionId,
        labelDe: entwurf.labelDe.trim(),
        labelEn: entwurf.labelEn.trim(),
        type: entwurf.type,
        purpose: entwurf.purpose.trim(),
        options: optionen,
      });
      if (!res.ok) {
        setFehler(rpcMessages[res.key] ?? rpcMessages.unknown ?? res.key);
        return;
      }
      toast("success", t.ownRequested);
      schliessen();
      router.refresh();
    });
  }

  if (!offen) {
    return (
      <div>
        <Button variant="secondary" size="sm" onClick={() => setOffen(true)}>
          {t.ownRequest}
        </Button>
      </div>
    );
  }

  return (
    <form
      className="flex max-w-form flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        beantragen();
      }}
    >
      <Field label={t.ownLabelDe} htmlFor={id("de")}>
        <Input id={id("de")} value={entwurf.labelDe} onChange={(e) => setEntwurf({ ...entwurf, labelDe: e.target.value })} />
      </Field>
      <Field label={t.ownLabelEn} htmlFor={id("en")} hint={t.ownLabelEnHint}>
        <Input id={id("en")} value={entwurf.labelEn} onChange={(e) => setEntwurf({ ...entwurf, labelEn: e.target.value })} />
      </Field>
      <Field label={t.ownType} htmlFor={id("typ")}>
        <Select
          id={id("typ")}
          value={entwurf.type}
          options={EIGENE_FRAGE_TYPEN.map((typ) => ({ value: typ, label: t[`type_${typ}`] ?? typ }))}
          onChange={(e) => setEntwurf({ ...entwurf, type: e.target.value as EigeneFrageTyp })}
        />
      </Field>
      {entwurf.type === "select" && (
        <Field label={t.ownOptions} htmlFor={id("optionen")} hint={t.ownOptionsHint}>
          <Textarea id={id("optionen")} rows={4} value={entwurf.optionen} onChange={(e) => setEntwurf({ ...entwurf, optionen: e.target.value })} />
        </Field>
      )}
      <Field label={t.ownPurpose} htmlFor={id("zweck")} hint={t.ownPurposeHint}>
        <Textarea id={id("zweck")} rows={3} value={entwurf.purpose} onChange={(e) => setEntwurf({ ...entwurf, purpose: e.target.value })} />
      </Field>
      {fehler && (
        <p role="alert" className="ct-small text-error-ink">
          {fehler}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={saving} disabled={!bereit}>
          {t.ownSubmit}
        </Button>
        <Button type="button" variant="ghost" onClick={schliessen} disabled={saving}>
          {t.cancel}
        </Button>
      </div>
    </form>
  );
}
