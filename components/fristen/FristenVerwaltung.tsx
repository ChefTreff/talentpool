"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import { Input, Textarea } from "@/components/ui/Input";
import { Modal, ModalFuss, ConfirmDialog } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/Table";
import { useToast } from "@/components/ui/Toast";
import { beschriftung, erinnerungText, inLokaleZeit, leseTage, type Frist } from "@/lib/fristen/anzeige";
import { loescheFrist, speichereFrist } from "./actions";

type Strings = Record<string, string>;

type Entwurf = {
  id: string | null;
  edition_id: string;
  label_de: string;
  label_en: string;
  description_de: string;
  description_en: string;
  due: string;
  tage: string;
  custom: boolean;
};

/**
 * Fristen eines Bereichs verwalten (ADM-099, Konrad 08.10.2026): „Partner-Manager legen Partner-Fristen selbst an.“
 * **Ein Baustein, mehrere Orte:** die Übersicht unter System (`/admin/fristen`, ein Reiter je Bereich) und die Bereichsseiten
 * der Partner, Speaker und Volunteers setzen ihn mit denselben Eigenschaften ein.
 *
 * * **Nur die Beschriftung**, nie der Schlüssel — der ist eine Code-Schnittstelle (`award_vote_from`) und steht nirgends.
 * * **Erinnerung in Tagen** (0 = zur Fälligkeit); gespeichert bleibt die Zahl in Stunden, die die Erinnerungsjobs lesen.
 * * **Systemfristen** (Code und Vorlagen hängen daran) lassen sich ändern, nicht löschen; **eigene Fristen** legt der Bereich
 *   selbst an und löscht sie, solange nichts auf sie zeigt — die Datenbank sagt sonst, wie oft sie in Gebrauch ist.
 * * Wer nicht ändern darf, sieht die Liste und keine Knöpfe; die Datenbank prüft es trotzdem (`can_edit_deadline`).
 */
export function FristenVerwaltung({
  fristen,
  editionen,
  neueZielgruppe,
  darfAnlegen,
  locale,
  dateLocale,
  t,
  common,
  rpcMessages,
}: {
  fristen: Frist[];
  editionen: { id: string; name: string }[];
  /** Zielgruppe, mit der eine neue Frist dieses Bereichs entsteht. */
  neueZielgruppe: string;
  /** Darf die Person in diesem Bereich Fristen anlegen? (`can_edit_deadline(neueZielgruppe)`) */
  darfAnlegen: boolean;
  locale: string;
  dateLocale: string;
  t: Strings;
  common: { cancel: string; save: string; none: string };
  rpcMessages: Strings;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [offen, setOffen] = useState<Entwurf | null>(null);
  const [weg, setWeg] = useState<Frist | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);

  const zeit = new Intl.DateTimeFormat(dateLocale, { dateStyle: "medium", timeStyle: "short" });
  const meldung = (key: string, detail?: string) => {
    const basis = rpcMessages[key] ?? rpcMessages.unknown ?? key;
    // `deadline_in_use` nennt die Zahl der Verweise im Detail.
    return key === "deadline_in_use" && detail ? `${basis} (${detail})` : basis;
  };
  const editionName = (id: string) => editionen.find((e) => e.id === id)?.name ?? "";

  function neu() {
    setFehler(null);
    setOffen({
      id: null, edition_id: editionen[0]?.id ?? "", label_de: "", label_en: "", description_de: "", description_en: "",
      due: "", tage: "2", custom: true,
    });
  }

  function bearbeiten(f: Frist) {
    setFehler(null);
    setOffen({
      id: f.id, edition_id: f.edition_id, label_de: f.label_de ?? "", label_en: f.label_en ?? "",
      description_de: f.description_de ?? "", description_en: f.description_en ?? "",
      due: inLokaleZeit(f.due_at), tage: String(Math.round(f.reminder_hours / 24)), custom: f.custom,
    });
  }

  const tage = offen ? leseTage(offen.tage) : null;
  const vollstaendig = Boolean(offen && offen.label_de.trim() && offen.label_en.trim() && offen.due && offen.edition_id && tage !== null);

  function speichern() {
    if (!offen || tage === null) return;
    const e = offen;
    start(async () => {
      const res = await speichereFrist({
        ...(e.id ? { id: e.id } : {}),
        edition_id: e.edition_id,
        audience: neueZielgruppe,
        due_at: new Date(e.due).toISOString(),
        label_de: e.label_de.trim(),
        label_en: e.label_en.trim(),
        description_de: e.description_de.trim(),
        description_en: e.description_en.trim(),
        reminder_days: tage,
      });
      if (!res.ok) {
        setFehler(meldung(res.key, res.detail));
        return;
      }
      setOffen(null);
      toast("success", e.id ? t.saved : t.created);
      router.refresh();
    });
  }

  function loeschen() {
    if (!weg) return;
    const f = weg;
    start(async () => {
      const res = await loescheFrist(f.id);
      setWeg(null);
      if (!res.ok) {
        toast("error", meldung(res.key, res.detail));
        return;
      }
      toast("success", t.deleted);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {darfAnlegen && (
        <div>
          <Button onClick={neu} disabled={editionen.length === 0}>{t.newDeadline}</Button>
        </div>
      )}

      {fristen.length === 0 ? (
        <EmptyState title={t.emptyTitleArea} description={darfAnlegen ? t.emptyBodyArea : t.emptyBodyReadOnly} />
      ) : (
        <Table stapeln>
          <Thead>
            <Th>{t.colDeadline}</Th>
            <Th>{t.colDue}</Th>
            <Th>{t.colReminder}</Th>
            {editionen.length > 1 && <Th>{t.fieldEdition}</Th>}
            <Th aria-label={t.colAction} />
          </Thead>
          <Tbody>
            {fristen.map((f) => (
              <Tr key={f.id}>
                <Td>
                  <span className="ct-label">{beschriftung(f, locale)}</span>
                  {!f.custom && <Badge className="ml-2">{t.systemMark}</Badge>}
                </Td>
                <Td label={t.colDue} className="tabular-nums">{zeit.format(new Date(f.due_at))}</Td>
                <Td label={t.colReminder} className="text-muted">{erinnerungText(f, t)}</Td>
                {editionen.length > 1 && <Td label={t.fieldEdition} className="text-muted">{editionName(f.edition_id)}</Td>}
                <Td>
                  {f.can_edit ? (
                    <span className="flex flex-wrap gap-2">
                      <Button size="sm" variant="secondary" disabled={pending} onClick={() => bearbeiten(f)}>{t.edit}</Button>
                      {f.custom && (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={pending || f.usage_count > 0}
                          title={f.usage_count > 0 ? t.inUseHint.replace("{n}", String(f.usage_count)) : undefined}
                          onClick={() => setWeg(f)}
                        >
                          {t.delete}
                        </Button>
                      )}
                    </span>
                  ) : (
                    <span className="ct-help">{t.readOnly}</span>
                  )}
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}

      {offen && (
        <Modal label={offen.id ? t.editTitle : t.newTitle} onCancel={() => setOffen(null)} size="wide" error={fehler}>
          <h2 className="ct-h3">{offen.id ? t.editTitle : t.newTitle}</h2>
          <p className="ct-small mt-1 text-muted">{offen.custom ? t.formBodyCustom : t.formBodySystem}</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label={t.fieldLabelDe} htmlFor="fv-de" required requiredLabel={t.required}>
              <Input id="fv-de" value={offen.label_de} onChange={(e) => setOffen({ ...offen, label_de: e.target.value })} />
            </Field>
            <Field label={t.fieldLabelEn} htmlFor="fv-en" required requiredLabel={t.required}>
              <Input id="fv-en" value={offen.label_en} onChange={(e) => setOffen({ ...offen, label_en: e.target.value })} />
            </Field>
            <Field label={t.fieldDue} htmlFor="fv-due" required requiredLabel={t.required}>
              <Input id="fv-due" type="datetime-local" value={offen.due} onChange={(e) => setOffen({ ...offen, due: e.target.value })} />
            </Field>
            <Field
              label={t.fieldReminderDays}
              htmlFor="fv-tage"
              hint={t.reminderHint}
              error={tage === null ? t.reminderInvalid : undefined}
            >
              <Input id="fv-tage" type="number" inputMode="numeric" min={0} max={90} value={offen.tage} onChange={(e) => setOffen({ ...offen, tage: e.target.value })} />
            </Field>
            {editionen.length > 1 && !offen.id && (
              <Field label={t.fieldEdition} htmlFor="fv-edition">
                <Select id="fv-edition" value={offen.edition_id} options={editionen.map((e) => ({ value: e.id, label: e.name }))} onChange={(e) => setOffen({ ...offen, edition_id: e.target.value })} />
              </Field>
            )}
            <Field label={t.fieldDescriptionDe} htmlFor="fv-desc-de">
              <Textarea id="fv-desc-de" rows={3} value={offen.description_de} onChange={(e) => setOffen({ ...offen, description_de: e.target.value })} />
            </Field>
            <Field label={t.fieldDescriptionEn} htmlFor="fv-desc-en">
              <Textarea id="fv-desc-en" rows={3} value={offen.description_en} onChange={(e) => setOffen({ ...offen, description_en: e.target.value })} />
            </Field>
          </div>
          <ModalFuss className="justify-end">
            <Button variant="ghost" disabled={pending} onClick={() => setOffen(null)}>{common.cancel}</Button>
            <Button disabled={pending || !vollstaendig} onClick={speichern}>{common.save}</Button>
          </ModalFuss>
        </Modal>
      )}

      {weg && (
        <ConfirmDialog
          title={t.deleteTitle}
          body={t.deleteBody.replace("{name}", beschriftung(weg, locale))}
          confirmLabel={t.delete}
          cancelLabel={common.cancel}
          pending={pending}
          onCancel={() => setWeg(null)}
          onConfirm={loeschen}
        />
      )}
    </div>
  );
}
