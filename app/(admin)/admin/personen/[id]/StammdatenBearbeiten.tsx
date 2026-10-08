"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Modal, ModalFuss } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { saveMasterData, type MasterDataPatch } from "./actions";

type Strings = Record<string, string>;
type Option = { value: string; label: string };

export type Stammdaten = {
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  birthdate: string | null;
  gender: string | null;
  nationality: string | null;
  country: string | null;
  city: string | null;
  phone: string | null;
  linkedin_url: string | null;
  preferred_language: string | null;
};

const FELDER = [
  "first_name", "last_name", "title", "birthdate", "gender", "nationality", "country", "city",
  "phone", "linkedin_url", "preferred_language",
] as const;

/**
 * Stammdaten einer Person ändern (ADM-092, Konrad 08.10.2026: „für
 * Änderungsanfragen — Name, Adressen, Kontaktdaten, mit Audit“). Ein Knopf in
 * der Karte öffnet das Fenster; gespeichert wird über `update_person_master`,
 * das den Abschnitt `persons` prüft und jede Änderung ins Protokoll schreibt.
 *
 * Geschickt wird nur, was sich gegenüber dem Stand beim Öffnen geändert hat:
 * die Funktion würde Unverändertes ohnehin übergehen, aber so zeigt die
 * Rückmeldung „Nichts geändert“ ehrlich, was passiert ist.
 */
export function StammdatenBearbeiten({
  personId,
  start,
  geschlechter,
  t,
  common,
  rpcMessages,
}: {
  personId: string;
  start: Stammdaten;
  geschlechter: Option[];
  t: Strings;
  common: { save: string; cancel: string };
  rpcMessages: Strings;
}) {
  const router = useRouter();
  const toast = useToast();
  const [offen, setOffen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [fehler, setFehler] = useState<string | null>(null);
  const aus = (s: Stammdaten) => Object.fromEntries(FELDER.map((k) => [k, s[k] ?? ""])) as Record<(typeof FELDER)[number], string>;
  const [form, setForm] = useState(() => aus(start));

  const setze = (feld: (typeof FELDER)[number], wert: string) => setForm((f) => ({ ...f, [feld]: wert }));
  const oeffnen = () => {
    // Immer der aktuelle Stand der Seite, nicht der von vorhin: nach einem Speichern lädt die Seite neu.
    setForm(aus(start));
    setFehler(null);
    setOffen(true);
  };

  const meldung = (key: string, detail?: string) => {
    const basis = rpcMessages[key] ?? rpcMessages.unknown ?? key;
    // Bei einem ungültigen Feld nennt die Funktion das Feld im Detail — als Beschriftung, nicht als Spaltenname.
    const feld = key === "invalid_person_field" && detail ? t[`field_${detail}`] : undefined;
    return feld ? `${basis} (${feld})` : basis;
  };

  function speichern() {
    const patch: MasterDataPatch = {};
    const alt = aus(start);
    for (const k of FELDER) if (form[k].trim() !== alt[k].trim()) patch[k] = form[k];
    if (Object.keys(patch).length === 0) {
      setOffen(false);
      toast("info", t.editNothing);
      return;
    }
    startTransition(async () => {
      const res = await saveMasterData(personId, patch);
      if (!res.ok) {
        setFehler(meldung(res.key, res.detail));
        return;
      }
      setOffen(false);
      toast("success", res.changed.length === 0 ? t.editNothing : t.editSaved);
      router.refresh();
    });
  }

  return (
    <>
      <Button size="sm" variant="secondary" onClick={oeffnen}>
        {t.editMasterData}
      </Button>
      {offen && (
        <Modal label={t.editMasterDataTitle} onCancel={() => setOffen(false)} size="wide" error={fehler}>
          <h2 className="ct-h3">{t.editMasterDataTitle}</h2>
          <p className="ct-small mt-1 text-muted">{t.editMasterDataBody}</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label={t.field_first_name} htmlFor="sd-first">
              <Input id="sd-first" value={form.first_name} onChange={(e) => setze("first_name", e.target.value)} autoComplete="off" />
            </Field>
            <Field label={t.field_last_name} htmlFor="sd-last">
              <Input id="sd-last" value={form.last_name} onChange={(e) => setze("last_name", e.target.value)} autoComplete="off" />
            </Field>
            <Field label={t.field_title} htmlFor="sd-title">
              <Input id="sd-title" value={form.title} onChange={(e) => setze("title", e.target.value)} autoComplete="off" />
            </Field>
            <Field label={t.field_birthdate} htmlFor="sd-birth">
              <Input id="sd-birth" type="date" value={form.birthdate} onChange={(e) => setze("birthdate", e.target.value)} />
            </Field>
            <Field label={t.field_gender} htmlFor="sd-gender">
              <Select id="sd-gender" value={form.gender} placeholder="—" options={geschlechter} onChange={(e) => setze("gender", e.target.value)} />
            </Field>
            <Field label={t.field_preferred_language} htmlFor="sd-lang">
              <Select
                id="sd-lang"
                value={form.preferred_language}
                placeholder="—"
                options={[{ value: "de", label: t.languageDe }, { value: "en", label: t.languageEn }]}
                onChange={(e) => setze("preferred_language", e.target.value)}
              />
            </Field>
            <Field label={t.field_nationality} htmlFor="sd-nat">
              <Input id="sd-nat" value={form.nationality} onChange={(e) => setze("nationality", e.target.value)} autoComplete="off" />
            </Field>
            <Field label={t.field_country} htmlFor="sd-country">
              <Input id="sd-country" value={form.country} onChange={(e) => setze("country", e.target.value)} autoComplete="off" />
            </Field>
            <Field label={t.field_city} htmlFor="sd-city">
              <Input id="sd-city" value={form.city} onChange={(e) => setze("city", e.target.value)} autoComplete="off" />
            </Field>
            <Field label={t.field_phone} htmlFor="sd-phone">
              <Input id="sd-phone" type="tel" value={form.phone} onChange={(e) => setze("phone", e.target.value)} autoComplete="off" />
            </Field>
            <div className="sm:col-span-2">
              <Field label={t.field_linkedin_url} htmlFor="sd-linkedin" hint={t.linkedinHint}>
                <Input id="sd-linkedin" type="url" value={form.linkedin_url} onChange={(e) => setze("linkedin_url", e.target.value)} autoComplete="off" />
              </Field>
            </div>
          </div>
          <ModalFuss className="justify-end">
            <Button variant="ghost" disabled={pending} onClick={() => setOffen(false)}>
              {common.cancel}
            </Button>
            <Button disabled={pending} onClick={speichern}>
              {common.save}
            </Button>
          </ModalFuss>
        </Modal>
      )}
    </>
  );
}
