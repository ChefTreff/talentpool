"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input, Textarea } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import { ProfilAuswahl, profilUmschalten, type ProfilFeld, type ProfilOption } from "./ProfilAuswahl";
import {
  HINWEISE_MAX,
  tourAenderungen,
  tourEntwurf,
  type TourStopp as TourStoppZeile,
  type TourStoppErgebnis,
  type TourStoppFelder,
} from "./tour";

type Strings = Record<string, string>;

/**
 * Die Angaben des Partners zu seinem Stopp der Company Tour (PART-046, Fragen
 * aus 2026): Ansprechperson vor Ort, Adresse, Zeitslot, Snacks, Hinweise,
 * gesuchte Profile, Fotografieren. Dieselbe Maske im Partner-Portal und im
 * Admin unter der Organisation — geschrieben wird beide Male über
 * `partner_update_tour_stop`, die Server-Aktion kommt als Prop herein.
 *
 * Gespeichert wird nur, was sich geändert hat (`tourAenderungen`); eine
 * Ja/Nein-Frage ohne Antwort bleibt offen, statt als „Nein“ zu landen.
 */
export function TourStopp({
  stopp,
  felder,
  canEdit,
  save,
  dateLocale,
  t,
  rpcMessages,
}: {
  stopp: TourStoppZeile;
  felder: Record<ProfilFeld, ProfilOption[]>;
  canEdit: boolean;
  save: (stopId: string, fields: Record<string, unknown>) => Promise<TourStoppErgebnis>;
  dateLocale: string;
  t: Strings;
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [saving, startSaving] = useTransition();
  const [basis, setBasis] = useState<TourStoppFelder>(() => tourEntwurf(stopp));
  const [entwurf, setEntwurf] = useState<TourStoppFelder>(() => tourEntwurf(stopp));
  const [fehler, setFehler] = useState<string | null>(null);

  const id = (feld: string) => `tour-${stopp.stop_id}-${feld}`;
  const set = <K extends keyof TourStoppFelder>(k: K, v: TourStoppFelder[K]) => setEntwurf((e) => ({ ...e, [k]: v }));
  const jaNein = [
    { value: "ja", label: t.yes },
    { value: "nein", label: t.no },
  ];
  const alsWahl = (v: boolean | null) => (v === null ? "" : v ? "ja" : "nein");
  const ausWahl = (v: string) => (v === "" ? null : v === "ja");
  const geaendert = Object.keys(tourAenderungen(basis, entwurf)).length > 0;
  const zuLang = entwurf.notes_public.length > HINWEISE_MAX;

  function speichern() {
    const felder = tourAenderungen(basis, entwurf);
    if (Object.keys(felder).length === 0) return;
    setFehler(null);
    startSaving(async () => {
      const res = await save(stopp.stop_id, felder);
      if (!res.ok) {
        const text = rpcMessages[res.key] ?? rpcMessages.unknown ?? res.key;
        setFehler(res.detail ? `${text} (${res.detail})` : text);
        return;
      }
      setBasis(entwurf);
      toast("success", t.saved);
      router.refresh();
    });
  }

  const zuletzt = stopp.filled_at
    ? t.filledAt.replace("{date}", new Intl.DateTimeFormat(dateLocale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(stopp.filled_at)))
    : t.notFilled;

  return (
    <form
      className="flex max-w-detail flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        speichern();
      }}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={t.contactName} htmlFor={id("name")} hint={t.contactHint}>
          <Input id={id("name")} value={entwurf.contact_name} disabled={!canEdit} onChange={(e) => set("contact_name", e.target.value)} />
        </Field>
        <Field label={t.contactEmail} htmlFor={id("email")}>
          <Input id={id("email")} type="email" value={entwurf.contact_email} disabled={!canEdit} onChange={(e) => set("contact_email", e.target.value)} />
        </Field>
        <Field label={t.contactPhone} htmlFor={id("phone")}>
          <Input id={id("phone")} type="tel" value={entwurf.contact_phone} disabled={!canEdit} onChange={(e) => set("contact_phone", e.target.value)} />
        </Field>
      </div>
      <Field label={t.address} htmlFor={id("address")} hint={t.addressHint} className="max-w-form">
        <Input id={id("address")} value={entwurf.address} disabled={!canEdit} onChange={(e) => set("address", e.target.value)} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={t.timeNote} htmlFor={id("zeit")} hint={t.timeNoteHint}>
          <Input id={id("zeit")} value={entwurf.time_note} disabled={!canEdit} onChange={(e) => set("time_note", e.target.value)} />
        </Field>
        <Field label={t.snacks} htmlFor={id("snacks")}>
          <Select
            id={id("snacks")}
            value={alsWahl(entwurf.snacks)}
            placeholder={t.choose}
            options={jaNein}
            disabled={!canEdit}
            onChange={(e) => set("snacks", ausWahl(e.target.value))}
          />
        </Field>
        <Field label={t.photos} htmlFor={id("fotos")}>
          <Select
            id={id("fotos")}
            value={alsWahl(entwurf.photos_allowed)}
            placeholder={t.choose}
            options={jaNein}
            disabled={!canEdit}
            onChange={(e) => set("photos_allowed", ausWahl(e.target.value))}
          />
        </Field>
      </div>
      <Field
        label={t.notes}
        htmlFor={id("hinweise")}
        hint={t.notesHint.replace("{max}", String(HINWEISE_MAX))}
        error={zuLang ? t.notesTooLong.replace("{max}", String(HINWEISE_MAX)) : undefined}
        className="max-w-form"
      >
        <Textarea
          id={id("hinweise")}
          rows={4}
          value={entwurf.notes_public}
          invalid={zuLang}
          disabled={!canEdit}
          onChange={(e) => set("notes_public", e.target.value)}
        />
      </Field>
      <ProfilAuswahl
        felder={felder}
        value={entwurf.target_profile}
        onToggle={(feld, key) => set("target_profile", profilUmschalten(entwurf.target_profile, feld, key))}
        disabled={!canEdit}
        t={t}
      />
      {fehler && (
        <p role="alert" className="ct-small text-error-ink">
          {fehler}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        {canEdit && (
          <Button type="submit" loading={saving} disabled={!geaendert || zuLang}>
            {t.save}
          </Button>
        )}
        <span className="ct-help">{canEdit ? zuletzt : t.noRights}</span>
      </div>
    </form>
  );
}
