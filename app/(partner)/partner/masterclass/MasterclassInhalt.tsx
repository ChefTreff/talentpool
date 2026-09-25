"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input, Textarea } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import { updateFormatSession } from "../actions";
import type { PartnerFormatSession } from "../talk/types";

type Strings = Record<string, string>;
type Inhalt = { title_de: string; title_en: string; description_de: string; description_en: string; language: string };

/**
 * Inhalt der Masterclass (PART-045): Titel und Beschreibung in beiden
 * Sprachen und die Sprache der Session — wie beim Talk, nur legt der Partner
 * hier selbst an, auf dem Slot, den das Team vergeben hat.
 *
 * Geschrieben wird über `partner_update_session`. Ist die Masterclass schon
 * veröffentlicht, schickt jede echte Änderung an Titel, Beschreibung oder
 * Sprache sie zurück in die Freigabe der Programmleitung — das steht vor dem
 * Speichern da, nicht erst danach.
 */
export function MasterclassInhalt({
  session,
  sprachen,
  canEdit,
  t,
  rpcMessages,
}: {
  session: PartnerFormatSession;
  sprachen: { value: string; label: string }[];
  canEdit: boolean;
  t: Strings;
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [saving, startSaving] = useTransition();
  const start: Inhalt = {
    title_de: session.title_de ?? "",
    title_en: session.title_en ?? "",
    description_de: session.description_de ?? "",
    description_en: session.description_en ?? "",
    language: session.language ?? "",
  };
  const [basis, setBasis] = useState<Inhalt>(start);
  const [entwurf, setEntwurf] = useState<Inhalt>(start);
  const [fehler, setFehler] = useState<string | null>(null);
  const id = (feld: string) => `mc-${session.id}-${feld}`;
  const set = (k: keyof Inhalt, v: string) => setEntwurf((e) => ({ ...e, [k]: v }));

  const geaendert = (Object.keys(entwurf) as (keyof Inhalt)[]).filter((k) => entwurf[k].trim() !== basis[k].trim());

  function speichern() {
    if (geaendert.length === 0) return;
    const fields = Object.fromEntries(geaendert.map((k) => [k, entwurf[k].trim()]));
    setFehler(null);
    startSaving(async () => {
      const res = await updateFormatSession({ sessionId: session.id, fields });
      if (!res.ok) {
        const text = rpcMessages[res.key] ?? rpcMessages.unknown ?? res.key;
        setFehler(res.detail ? `${text} (${res.detail})` : text);
        return;
      }
      setBasis(entwurf);
      toast(res.data.back_to_review ? "info" : "success", res.data.back_to_review ? t.backToReview : t.saved);
      router.refresh();
    });
  }

  return (
    <form
      className="flex max-w-detail flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        speichern();
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t.titleDe} htmlFor={id("tde")}>
          <Input id={id("tde")} value={entwurf.title_de} disabled={!canEdit} onChange={(e) => set("title_de", e.target.value)} />
        </Field>
        <Field label={t.titleEn} htmlFor={id("ten")}>
          <Input id={id("ten")} value={entwurf.title_en} disabled={!canEdit} onChange={(e) => set("title_en", e.target.value)} />
        </Field>
        <Field label={t.descriptionDe} htmlFor={id("dde")}>
          <Textarea id={id("dde")} rows={5} value={entwurf.description_de} disabled={!canEdit} onChange={(e) => set("description_de", e.target.value)} />
        </Field>
        <Field label={t.descriptionEn} htmlFor={id("den")}>
          <Textarea id={id("den")} rows={5} value={entwurf.description_en} disabled={!canEdit} onChange={(e) => set("description_en", e.target.value)} />
        </Field>
      </div>
      <Field label={t.language} htmlFor={id("sprache")} hint={t.languageHint} className="max-w-form">
        <Select
          id={id("sprache")}
          value={entwurf.language}
          placeholder={entwurf.language === "" ? t.choose : undefined}
          options={sprachen}
          disabled={!canEdit}
          onChange={(e) => set("language", e.target.value)}
        />
      </Field>
      {fehler && (
        <p role="alert" className="ct-small text-error-ink">
          {fehler}
        </p>
      )}
      {canEdit ? (
        <div className="flex flex-col items-start gap-2">
          <Button type="submit" loading={saving} disabled={geaendert.length === 0}>
            {t.save}
          </Button>
          {session.publish_status === "published" && <p className="ct-help">{t.publishedHint}</p>}
        </div>
      ) : (
        <p className="ct-help">{t.noRights}</p>
      )}
    </form>
  );
}
