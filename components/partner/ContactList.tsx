"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { ConfirmDialog } from "@/components/ui/Modal";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/Table";
import { useToast } from "@/components/ui/Toast";
import {
  CONTACT_ROLES,
  toggleContactRole,
  type ContactActionResult,
  type ContactActions,
  type ContactRow,
} from "./contacts";

type Strings = Record<string, string>;

type Draft = { firstName: string; lastName: string; email: string; position: string; roles: string[] };
type Fehler = Partial<Record<keyof Draft, string>>;

const LEER: Draft = { firstName: "", lastName: "", email: "", position: "", roles: ["additional"] };
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * Kontakte einer Partner-Organisation — **eine** Komponente für Partnerportal
 * und Admin (Regel vom 22.09.: jede Verwaltungsfunktion eines Unterportals
 * auch vollständig im Admin, ohne zweite Logik). Die Actions kommen von
 * aussen, weil Gate und Neuladen je Bereich verschieden sind; die RPCs
 * dahinter sind dieselben.
 *
 * PART-062: Rollen stehen erklärt unter der Liste; Bearbeiten und Löschen
 * stehen an jeder Zeile; beim Einladen ist jedes Feld Pflicht. Name und
 * Adresse lassen sich nur bei Personen ändern, die die Organisation selbst
 * angelegt hat und die sich noch nie angemeldet haben (`editable`) — die
 * Person gibt es plattformweit nur einmal, und nach dem Login pflegt sie ihre
 * Daten selbst. PART-063: die Rolle „CC-Kontakt".
 *
 * Fehler aus dem Speichern stehen im Panel neben dem Knopf (Drawer `error`),
 * nicht als Toast hinter dem Dialog (ADM-041).
 */
export function ContactList({
  orgId,
  contacts,
  canManage,
  roleLabels,
  actions,
  extraColumn,
  showLegend = true,
  dateLocale,
  t,
  common,
  rpcMessages,
}: {
  orgId: string;
  contacts: ContactRow[];
  /** Hauptkontakt oder Partner-Team; sonst ist die Liste lesbar, aber ohne Knöpfe. */
  canManage: boolean;
  /** Bezeichnungen aus dem Vokabular `contact_role`. */
  roleLabels: Record<string, string>;
  actions: ContactActions;
  /** Zusätzliche Spalte, die nur ein Bereich braucht (Admin: Bühnen-Editor). */
  extraColumn?: { header: string; cell: (c: ContactRow) => ReactNode };
  /**
   * Rollen-Legende unter der Liste. Im Admin steht die Liste in einer Karte mit
   * eigenem Kopf; dort genügen die Erklärungen an den Auswahlfeldern.
   */
  showLegend?: boolean;
  dateLocale: string;
  t: Strings;
  common: { save: string; cancel: string; none: string; close: string; required: string };
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  // null = Panel zu, "neu" = einladen, sonst die Zeile, die bearbeitet wird.
  const [offen, setOffen] = useState<"neu" | ContactRow | null>(null);
  const [draft, setDraft] = useState<Draft>(LEER);
  const [fehler, setFehler] = useState<Fehler>({});
  const [serverFehler, setServerFehler] = useState<string | null>(null);
  const [askRemove, setAskRemove] = useState<ContactRow | null>(null);
  const [askPrimary, setAskPrimary] = useState<ContactRow | null>(null);

  const message = (key: string, detail?: string) =>
    (rpcMessages[key] ?? rpcMessages.unknown ?? key) + (detail ? ` (${detail})` : "");
  const dateOnly = new Intl.DateTimeFormat(dateLocale, { dateStyle: "medium" });
  const rolle = (r: string) => roleLabels[r] ?? r;
  const name = (c: ContactRow) =>
    [c.title, c.first_name, c.last_name].filter(Boolean).join(" ") || c.email || common.none;

  const bearbeitet = offen !== null && offen !== "neu" ? offen : null;
  const personFrei = offen === "neu" || (bearbeitet?.editable ?? false);
  const istHauptkontakt = bearbeitet?.roles.includes("primary_ops") ?? false;
  // Ohne Hauptkontakt (eine neue Organisation im Admin) wird der erste beim
  // Einladen angekreuzt; sonst überträgt man ihn, statt ihn anzukreuzen.
  const ohneHauptkontakt = !contacts.some((c) => c.roles.includes("primary_ops"));
  const auswahl = CONTACT_ROLES.filter((r) => r !== "primary_ops" || (offen === "neu" && ohneHauptkontakt));

  function oeffnen(c: ContactRow | "neu") {
    setDraft(
      c === "neu"
        ? { ...LEER, roles: ohneHauptkontakt ? ["primary_ops"] : LEER.roles }
        : {
            firstName: c.first_name ?? "",
            lastName: c.last_name ?? "",
            email: c.email ?? "",
            position: c.contact_position ?? "",
            roles: c.roles,
          },
    );
    setFehler({});
    setServerFehler(null);
    setOffen(c);
  }

  function pruefen(d: Draft): Fehler {
    const f: Fehler = {};
    if (personFrei) {
      if (!d.firstName.trim()) f.firstName = t.errRequired;
      if (!d.lastName.trim()) f.lastName = t.errRequired;
      if (!EMAIL.test(d.email.trim())) f.email = t.errEmail;
    }
    if (!d.position.trim()) f.position = t.errRequired;
    if (d.roles.length === 0) f.roles = t.errRoles;
    return f;
  }

  function speichern() {
    const f = pruefen(draft);
    setFehler(f);
    if (Object.keys(f).length > 0) return;
    setServerFehler(null);
    const neu = offen === "neu";
    const personId = bearbeitet?.person_id ?? null;
    startTransition(async () => {
      const res: ContactActionResult =
        neu || !personId
          ? await actions.invite({
              orgId,
              email: draft.email.trim(),
              firstName: draft.firstName.trim(),
              lastName: draft.lastName.trim(),
              roles: draft.roles,
              position: draft.position.trim(),
            })
          : await actions.update({
              orgId,
              personId,
              position: draft.position.trim(),
              roles: draft.roles,
              // Nur mitschicken, was gepflegt werden darf — sonst NULL = unverändert.
              firstName: personFrei ? draft.firstName.trim() : null,
              lastName: personFrei ? draft.lastName.trim() : null,
              email: personFrei ? draft.email.trim() : null,
            });
      if (!res.ok) {
        setServerFehler(message(res.key, res.detail));
        return;
      }
      toast("success", neu ? t.invited : t.saved);
      setOffen(null);
      router.refresh();
    });
  }

  function run(action: Promise<ContactActionResult>, okText: string) {
    startTransition(async () => {
      const res = await action;
      if (!res.ok) {
        toast("error", message(res.key, res.detail));
        return;
      }
      toast("success", okText);
      setOffen(null);
      router.refresh();
    });
  }

  const feld = (key: keyof Draft) => (value: string) => setDraft((d) => ({ ...d, [key]: value }));

  return (
    <div className="flex flex-col gap-6">
      <p className="ct-help">{t.ownLoginHint}</p>

      <Table>
        <Thead>
          <Th>{t.colName}</Th>
          <Th>{t.colEmail}</Th>
          <Th>{t.colRoles}</Th>
          <Th>{t.colLogin}</Th>
          {extraColumn && <Th>{extraColumn.header}</Th>}
          {canManage && <Th aria-label={t.colAction} />}
        </Thead>
        <Tbody>
          {contacts.map((c) => {
            const primary = c.roles.includes("primary_ops");
            return (
              <Tr key={c.person_id} controls={canManage}>
                <Td>
                  <span className="ct-label text-ink">{name(c)}</span>
                  {c.contact_position && <div className="ct-help">{c.contact_position}</div>}
                </Td>
                <Td className="text-muted">{c.email ?? common.none}</Td>
                <Td>
                  <div className="flex flex-wrap gap-1">
                    {CONTACT_ROLES.filter((r) => c.roles.includes(r)).map((r) => (
                      <Badge key={r} tone={r === "primary_ops" ? "accent" : "neutral"}>
                        {rolle(r)}
                      </Badge>
                    ))}
                  </div>
                </Td>
                <Td className="text-muted">
                  {c.has_login ? t.loginYes : t.loginNo}
                  {!c.has_login && c.invited_at && (
                    <div className="ct-help">
                      {t.invitedOn} {dateOnly.format(new Date(c.invited_at))}
                    </div>
                  )}
                </Td>
                {extraColumn && <Td>{extraColumn.cell(c)}</Td>}
                {canManage && (
                  <Td>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="secondary" disabled={pending} onClick={() => oeffnen(c)}>
                        {t.edit}
                      </Button>
                      {/* Den Hauptkontakt löscht man nicht, man überträgt ihn — sonst
                          stünde die Organisation ohne einen da. */}
                      {!primary && (
                        <Button size="sm" variant="ghost" disabled={pending} onClick={() => setAskRemove(c)}>
                          {t.remove}
                        </Button>
                      )}
                    </div>
                  </Td>
                )}
              </Tr>
            );
          })}
        </Tbody>
      </Table>

      {canManage && (
        <div>
          <Button disabled={pending} onClick={() => oeffnen("neu")}>
            {t.newTitle}
          </Button>
        </div>
      )}

      {/* PART-062: was die Rollen bedeuten, für alle lesbar — auch für die, die
          nichts ändern dürfen und nur wissen wollen, warum sie etwas nicht sehen. */}
      {showLegend && (
        <section aria-labelledby="kontakte-rollen">
          <h2 id="kontakte-rollen" className="ct-h2 text-ink">
            {t.legendTitle}
          </h2>
          <p className="ct-help mt-1">{t.legendLead}</p>
          <dl className="mt-4 grid gap-x-8 gap-y-4 md:grid-cols-2">
            {CONTACT_ROLES.map((r) => (
              <div key={r}>
                <dt className="ct-label text-ink">{rolle(r)}</dt>
                <dd className="ct-small mt-1 leading-6">{t[`roleHelp_${r}`]}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <Drawer
        open={offen !== null}
        onClose={() => setOffen(null)}
        title={offen === "neu" ? t.newTitle : t.editTitle}
        error={serverFehler}
        closeLabel={common.close}
        footer={
          <div className="flex flex-wrap gap-2">
            <Button disabled={pending} onClick={speichern}>
              {offen === "neu" ? t.invite : common.save}
            </Button>
            <Button variant="ghost" disabled={pending} onClick={() => setOffen(null)}>
              {common.cancel}
            </Button>
          </div>
        }
      >
        {offen === "neu" && <p className="ct-help mb-4">{t.newHint}</p>}
        {bearbeitet && !bearbeitet.editable && (
          <p className="ct-help mb-4">{bearbeitet.has_login ? t.lockedLogin : t.lockedExisting}</p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={t.fieldFirstName}
            htmlFor="k-first"
            required
            requiredLabel={common.required}
            error={fehler.firstName}
          >
            <Input
              id="k-first"
              value={draft.firstName}
              disabled={!personFrei}
              autoComplete="off"
              onChange={(e) => feld("firstName")(e.target.value)}
            />
          </Field>
          <Field
            label={t.fieldLastName}
            htmlFor="k-last"
            required
            requiredLabel={common.required}
            error={fehler.lastName}
          >
            <Input
              id="k-last"
              value={draft.lastName}
              disabled={!personFrei}
              autoComplete="off"
              onChange={(e) => feld("lastName")(e.target.value)}
            />
          </Field>
          <Field
            label={t.fieldEmail}
            htmlFor="k-email"
            hint={offen === "neu" ? t.fieldEmailHint : personFrei ? t.emailChangeHint : undefined}
            required
            requiredLabel={common.required}
            error={fehler.email}
            className="sm:col-span-2"
          >
            <Input
              id="k-email"
              type="email"
              inputMode="email"
              autoComplete="off"
              value={draft.email}
              disabled={!personFrei}
              onChange={(e) => feld("email")(e.target.value)}
            />
          </Field>
          <Field
            label={t.fieldPosition}
            htmlFor="k-position"
            required
            requiredLabel={common.required}
            error={fehler.position}
            className="sm:col-span-2"
          >
            <Input
              id="k-position"
              value={draft.position}
              autoComplete="off"
              onChange={(e) => feld("position")(e.target.value)}
            />
          </Field>
        </div>

        <fieldset className="mt-6">
          <legend className="ct-label text-ink">{t.colRoles}</legend>
          <p className="ct-help mb-3">{istHauptkontakt ? t.rolesHintPrimary : t.rolesHint}</p>
          <div className="flex flex-col gap-3">
            {auswahl.map((r) => {
              const id = `k-rolle-${r}`;
              // Der Hauptkontakt bekommt jede Mail selbst; in Kopie stünde er doppelt.
              const gesperrt = r === "cc" && draft.roles.includes("primary_ops");
              return (
                <label key={r} htmlFor={id} className="flex items-start gap-3">
                  <input
                    id={id}
                    type="checkbox"
                    className="mt-1 size-4"
                    checked={draft.roles.includes(r)}
                    disabled={gesperrt || pending}
                    onChange={() => setDraft((d) => ({ ...d, roles: toggleContactRole(d.roles, r) }))}
                  />
                  <span>
                    <span className="ct-label text-ink">{rolle(r)}</span>
                    <span className="block ct-help">{t[`roleHelp_${r}`]}</span>
                  </span>
                </label>
              );
            })}
          </div>
          {fehler.roles && <p className="ct-help mt-2 text-error-ink">{fehler.roles}</p>}
        </fieldset>

        {bearbeitet && !istHauptkontakt && (
          <section className="mt-6 border-t pt-4">
            <h3 className="ct-h3 text-ink">{t.primarySectionTitle}</h3>
            <p className="ct-help mt-1">{t.primarySectionBody}</p>
            <Button
              className="mt-3"
              size="sm"
              variant="secondary"
              disabled={pending}
              onClick={() => setAskPrimary(bearbeitet)}
            >
              {t.makePrimary}
            </Button>
          </section>
        )}
      </Drawer>

      {askPrimary && (
        <ConfirmDialog
          title={t.primaryTitle}
          body={t.primaryBody}
          detail={<p className="ct-label">{name(askPrimary)}</p>}
          confirmLabel={t.makePrimary}
          cancelLabel={common.cancel}
          pending={pending}
          onCancel={() => setAskPrimary(null)}
          onConfirm={() => {
            const c = askPrimary;
            setAskPrimary(null);
            run(actions.transferPrimary(orgId, c.person_id), t.primaryDone);
          }}
        />
      )}
      {askRemove && (
        <ConfirmDialog
          title={t.removeTitle}
          body={t.removeBody}
          detail={<p className="ct-label">{name(askRemove)}</p>}
          confirmLabel={t.remove}
          cancelLabel={common.cancel}
          pending={pending}
          onCancel={() => setAskRemove(null)}
          onConfirm={() => {
            const c = askRemove;
            setAskRemove(null);
            run(actions.remove(orgId, c.person_id), t.removed);
          }}
        />
      )}
    </div>
  );
}
