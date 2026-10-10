"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import { Drawer } from "@/components/ui/Drawer";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { MehrfachAuswahl } from "@/components/ui/MehrfachAuswahl";
import { ConfirmDialog } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import {
  HIRING_MAX,
  ROLLE_MAX,
  eintragTitel,
  eintragUnterzeile,
  entwurfAus,
  entwurfFehlt,
  leererEntwurf,
  type HiringEintrag,
  type HiringEntwurf,
  type HiringErgebnis,
  type HiringSpeichern,
} from "./hiring";

type Strings = Record<string, string>;
type Option = { value: string; label: string };

/**
 * „Wen sucht ihr?“ (K-94 Stufe 2a, PART-107, Konrad & Leopold 05.10.): die Einträge einer Organisation — was sie anbietet, in welchem Bereich, für wen. Dieselbe Maske im
 * Partner-Portal (Eure Daten) und im Admin unter der Organisation (Admin-Vollständigkeit); sie nimmt die Server-Aktionen als Eigenschaften, wie `TourStopp`.
 *
 * **Skill-Regel 13:** „Eintrag hinzufügen“ steht in der Kopfzeile des Blocks, sobald es eine Liste gibt; solange sie leer ist, trägt der Leerzustand die eine Aktion. „Bearbeiten“ steht in
 * der Zeile, rechts. Das Formular öffnet im Schubfach, ein Fehler steht dort (`Drawer error`), nicht dahinter. Entfernen steht im Fuß des Schubfachs des Eintrags — nie als zweiter Knopf
 * neben „Bearbeiten“ — und fragt nach.
 *
 * **Jeder Eintrag speichert für sich, sofort** — nicht mit der Leiste der Seite „Eure Daten“ (die sammelt den Entwurf der vier Abschnitte). Deshalb steht der Block unter den Abschnitten und
 * nicht in ihrem Entwurf. Die Regeln (Pflicht, Vokabular, höchstens zehn, wer darf) prüft die Datenbank; die Maske meldet nur vorher, was offensichtlich fehlt.
 */
export function WenSuchtIhr({
  id,
  orgId,
  editionId,
  eintraege,
  canEdit,
  optionen,
  save,
  remove,
  t,
  rpcMessages,
}: {
  /** Anker des Abschnitts (`#hiring` im Admin, „Auf dieser Seite“). */
  id?: string;
  orgId: string;
  editionId: string;
  eintraege: HiringEintrag[];
  /** `partner_can_edit` — wer nur lesen darf, sieht die Liste ohne Knöpfe. */
  canEdit: boolean;
  /** Die Auswahllisten aus dem Vokabular, in der Sprache der Seite; die Kategorie ohne die Einträge, die ein Partner nicht anbietet (`kategorieOptionen`). */
  optionen: { career: Option[]; area: Option[]; skill: Option[]; study: Option[] };
  save: (input: HiringSpeichern) => Promise<HiringErgebnis<{ id: string }>>;
  remove: (id: string) => Promise<HiringErgebnis>;
  t: Strings;
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const basis = useId();
  const [pending, startTransition] = useTransition();
  const [entwurf, setEntwurf] = useState<HiringEntwurf | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [entfernen, setEntfernen] = useState<HiringEintrag | null>(null);
  const [entfernenFehler, setEntfernenFehler] = useState<string | null>(null);

  const message = (key: string) => rpcMessages[key] ?? rpcMessages.unknown ?? key;
  const label = (liste: Option[]) => Object.fromEntries(liste.map((o) => [o.value, o.label]));
  const beschriftung = { career: label(optionen.career), area: label(optionen.area) };
  const voll = eintraege.length >= HIRING_MAX;
  const fehlt = entwurf ? entwurfFehlt(entwurf) : [];

  function oeffnen(e: HiringEintrag | null) {
    setFehler(null);
    setEntwurf(e ? entwurfAus(e) : leererEntwurf());
  }
  function schliessen() {
    setEntwurf(null);
    setFehler(null);
  }

  function speichern() {
    if (!entwurf || fehlt.length > 0) return;
    setFehler(null);
    startTransition(async () => {
      const res = await save({
        orgId,
        editionId,
        id: entwurf.id,
        careerOpportunity: entwurf.career_opportunity,
        functionArea: entwurf.function_area,
        roleText: entwurf.role_text.trim(),
        skills: entwurf.skills,
        studyFields: entwurf.study_fields,
        published: entwurf.published,
      });
      if (!res.ok) {
        setFehler(message(res.key));
        return;
      }
      toast("success", t.saved);
      schliessen();
      router.refresh();
    });
  }

  function entfernenBestaetigt() {
    if (!entfernen) return;
    setEntfernenFehler(null);
    startTransition(async () => {
      const res = await remove(entfernen.id);
      if (!res.ok) {
        setEntfernenFehler(message(res.key));
        return;
      }
      toast("success", t.removed);
      setEntfernen(null);
      schliessen();
      router.refresh();
    });
  }

  const hinzufuegen =
    canEdit && !voll && eintraege.length > 0 ? (
      <Button size="sm" variant="secondary" className="whitespace-nowrap" onClick={() => oeffnen(null)}>
        {t.add}
      </Button>
    ) : undefined;

  const formId = `${basis}-hiring`;

  return (
    <section id={id} aria-label={t.title} className="scroll-mt-20">
      <Card>
        <CardHeader ebene="h2" title={t.title} description={t.lead} action={hinzufuegen} />
        {eintraege.length === 0 ? (
          // Der Leerzustand trägt die eine Aktion (Regel 9); die Kopfzeile zeigt sie dann nicht zusätzlich (Regel 13).
          <div className="flex flex-col items-start gap-3">
            <p className="ct-help">{t.emptyBody}</p>
            {canEdit && (
              <Button variant="secondary" size="sm" onClick={() => oeffnen(null)}>
                {t.add}
              </Button>
            )}
          </div>
        ) : (
          <>
            <ul className="flex flex-col divide-y divide-border">
              {eintraege.map((e) => {
                const titel = eintragTitel(e, beschriftung);
                const unter = eintragUnterzeile(e, beschriftung, t as { skillOne: string; skillMany: string; fieldOne: string; fieldMany: string });
                return (
                  <li key={e.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="ct-label text-ink">{titel}</p>
                      {unter !== "" && <p className="ct-small text-muted">{unter}</p>}
                      <div className="mt-1">
                        <Badge tone={e.published ? "success" : "neutral"}>{e.published ? t.publishedOn : t.publishedOff}</Badge>
                      </div>
                    </div>
                    {canEdit && (
                      <Button size="sm" variant="secondary" aria-label={`${t.edit}: ${titel}`} onClick={() => oeffnen(e)}>
                        {t.edit}
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
            {voll && <p className="ct-help mt-4">{t.limit.replace("{max}", String(HIRING_MAX))}</p>}
          </>
        )}
      </Card>

      {entwurf && (
        <Drawer
          open
          onClose={schliessen}
          title={entwurf.id ? t.editTitle : t.addTitle}
          error={fehler}
          footer={
            <div className="flex flex-wrap items-center gap-2">
              {/* Im Fuß des Schubfachs, aber Teil des Formulars: so löst auch die Eingabetaste in einem Feld es aus. */}
              <Button type="submit" form={formId} loading={pending} disabled={fehlt.length > 0}>
                {t.save}
              </Button>
              <Button variant="ghost" onClick={schliessen} disabled={pending}>
                {t.cancel}
              </Button>
              {entwurf.id && (
                <Button
                  variant="ghost"
                  className="ml-auto"
                  disabled={pending}
                  onClick={() => {
                    const e = eintraege.find((x) => x.id === entwurf.id);
                    if (e) {
                      setEntfernenFehler(null);
                      setEntfernen(e);
                    }
                  }}
                >
                  {t.remove}
                </Button>
              )}
            </div>
          }
        >
          <form
            id={formId}
            className="flex flex-col gap-4"
            onSubmit={(ev) => {
              ev.preventDefault();
              speichern();
            }}
          >
            <Field label={t.fieldCareer} htmlFor={`${basis}-career`}>
              <Select
                id={`${basis}-career`}
                value={entwurf.career_opportunity}
                placeholder={t.choose}
                options={optionen.career}
                onChange={(ev) => setEntwurf({ ...entwurf, career_opportunity: ev.target.value })}
              />
            </Field>
            <Field label={t.fieldArea} htmlFor={`${basis}-area`}>
              <Select
                id={`${basis}-area`}
                value={entwurf.function_area}
                placeholder={t.choose}
                options={optionen.area}
                onChange={(ev) => setEntwurf({ ...entwurf, function_area: ev.target.value })}
              />
            </Field>
            <Field
              label={t.fieldRole}
              htmlFor={`${basis}-role`}
              hint={t.fieldRoleHint.replace("{max}", String(ROLLE_MAX))}
              error={fehlt.includes("role_text") ? t.roleTooLong.replace("{max}", String(ROLLE_MAX)) : undefined}
            >
              <Input
                id={`${basis}-role`}
                value={entwurf.role_text}
                invalid={fehlt.includes("role_text")}
                onChange={(ev) => setEntwurf({ ...entwurf, role_text: ev.target.value })}
              />
            </Field>
            <Field label={t.fieldSkills} htmlFor={`${basis}-skills`}>
              <MehrfachAuswahl
                aufklappbar
                id={`${basis}-skills`}
                options={optionen.skill}
                value={entwurf.skills}
                onChange={(neu) => setEntwurf({ ...entwurf, skills: neu })}
                leer={t.openForAll}
              />
            </Field>
            <Field label={t.fieldStudy} htmlFor={`${basis}-study`}>
              <MehrfachAuswahl
                aufklappbar
                id={`${basis}-study`}
                options={optionen.study}
                value={entwurf.study_fields}
                onChange={(neu) => setEntwurf({ ...entwurf, study_fields: neu })}
                leer={t.openForAll}
              />
            </Field>
            <Checkbox
              label={t.publishLabel}
              hint={t.publishHint}
              checked={entwurf.published}
              onChange={(ev) => setEntwurf({ ...entwurf, published: ev.target.checked })}
            />
          </form>
        </Drawer>
      )}

      {entfernen && (
        <ConfirmDialog
          title={t.removeTitle}
          body={t.removeBody.replace("{name}", eintragTitel(entfernen, beschriftung))}
          confirmLabel={t.removeConfirm}
          cancelLabel={t.cancel}
          pending={pending}
          error={entfernenFehler}
          onConfirm={entfernenBestaetigt}
          onCancel={() => setEntfernen(null)}
        />
      )}
    </section>
  );
}
