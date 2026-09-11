"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { ConfirmDialog } from "@/components/ui/Modal";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/Table";
import { useToast } from "@/components/ui/Toast";
import {
  removeContact,
  setContactRoles,
  transferPrimary,
  upsertContact,
} from "../actions";
import { CONTACT_ROLES, type PartnerContact } from "../types";

type Strings = Record<string, string>;

const EMPTY = { email: "", firstName: "", lastName: "", position: "", roles: ["additional"] };

/**
 * Kontakte der Organisation.
 *
 * Jede Person bekommt einen eigenen Login (P8/P14) — es gibt keine geteilten
 * Zugänge und keine zweite Liste für Event-App-Mitglieder; das ist eine Rolle.
 * Verwalten darf nur der Hauptkontakt oder das Team; für alle anderen ist die
 * Liste lesbar, aber ohne Knöpfe.
 */
export function ContactList({
  orgId,
  contacts,
  canManage,
  dateLocale,
  t,
  common,
  rpcMessages,
}: {
  orgId: string;
  contacts: PartnerContact[];
  canManage: boolean;
  dateLocale: string;
  t: Strings;
  common: { save: string; cancel: string; none: string; back: string; next: string };
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState(EMPTY);
  const [adding, setAdding] = useState(false);
  const [askRemove, setAskRemove] = useState<PartnerContact | null>(null);
  const [askPrimary, setAskPrimary] = useState<PartnerContact | null>(null);

  const message = (key: string) => rpcMessages[key] ?? rpcMessages.unknown ?? key;
  const dateOnly = new Intl.DateTimeFormat(dateLocale, { dateStyle: "medium" });
  const name = (c: PartnerContact) =>
    [c.title, c.first_name, c.last_name].filter(Boolean).join(" ") || c.email || common.none;

  function run(action: Promise<{ ok: boolean; key?: string; detail?: string }>, okText: string) {
    startTransition(async () => {
      const res = await action;
      if (!res.ok) {
        toast("error", message(res.key ?? "unknown") + (res.detail ? ` (${res.detail})` : ""));
        return;
      }
      toast("success", okText);
      router.refresh();
    });
  }

  function onInvite() {
    run(
      upsertContact({
        orgId,
        email: draft.email.trim(),
        firstName: draft.firstName.trim(),
        lastName: draft.lastName.trim(),
        roles: draft.roles,
        position: draft.position,
      }),
      t.invited,
    );
    setDraft(EMPTY);
    setAdding(false);
  }

  function toggleRole(c: PartnerContact, role: string) {
    const next = c.roles.includes(role)
      ? c.roles.filter((r) => r !== role)
      : [...c.roles, role];
    if (next.length === 0) {
      toast("error", message("roles_required"));
      return;
    }
    run(setContactRoles(orgId, c.person_id, next), t.rolesSaved);
  }

  const toggleDraftRole = (role: string) =>
    setDraft((d) => ({
      ...d,
      roles: d.roles.includes(role)
        ? d.roles.filter((r) => r !== role)
        : [...d.roles, role],
    }));

  return (
    <div className="flex flex-col gap-4">
      <p className="ct-help">{t.ownLoginHint}</p>

      <Table>
        <Thead>
          <Th>{t.colName}</Th>
          <Th>{t.colEmail}</Th>
          <Th>{t.colRoles}</Th>
          <Th>{t.colLogin}</Th>
          {canManage && <Th aria-label={t.colAction} />}
        </Thead>
        <Tbody>
          {contacts.map((c) => {
            const isPrimary = c.roles.includes("primary_ops");
            return (
              <Tr key={c.person_id}>
                <Td>
                  <span className="ct-label text-ink">{name(c)}</span>
                  {c.contact_position && <div className="ct-help">{c.contact_position}</div>}
                </Td>
                <Td className="text-muted">{c.email ?? common.none}</Td>
                <Td>
                  <div className="flex flex-wrap gap-1">
                    {CONTACT_ROLES.map((role) => {
                      const on = c.roles.includes(role);
                      if (!canManage) {
                        return on ? (
                          <Badge key={role} tone={role === "primary_ops" ? "accent" : "neutral"}>
                            {t[`role_${role}`] ?? role}
                          </Badge>
                        ) : null;
                      }
                      return (
                        <button
                          key={role}
                          type="button"
                          // Der Hauptkontakt wird übertragen, nicht angeklickt —
                          // sonst stünde die Org kurz ohne einen da.
                          disabled={pending || role === "primary_ops"}
                          aria-pressed={on}
                          title={role === "primary_ops" ? t.primaryViaTransfer : undefined}
                          onClick={() => toggleRole(c, role)}
                          className={
                            "rounded-ct-sm border px-2 py-0.5 text-[13px] font-semibold transition-colors " +
                            (on
                              ? "border-accent bg-accent-soft text-accent-deep"
                              : "border-border bg-surface text-muted hover:bg-surface-hover") +
                            (role === "primary_ops" ? " cursor-default" : "")
                          }
                        >
                          {t[`role_${role}`] ?? role}
                        </button>
                      );
                    })}
                  </div>
                </Td>
                <Td className="text-muted">
                  {c.has_login ? t.loginYes : t.loginNo}
                  {c.invited_at && (
                    <div className="ct-help">
                      {t.invitedOn} {dateOnly.format(new Date(c.invited_at))}
                    </div>
                  )}
                </Td>
                {canManage && (
                  <Td>
                    <div className="flex flex-wrap gap-2">
                      {!isPrimary && (
                        <>
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={pending}
                            onClick={() => setAskPrimary(c)}
                          >
                            {t.makePrimary}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={pending}
                            onClick={() => setAskRemove(c)}
                          >
                            {t.remove}
                          </Button>
                        </>
                      )}
                    </div>
                  </Td>
                )}
              </Tr>
            );
          })}
        </Tbody>
      </Table>

      {canManage &&
        (adding ? (
          <Card>
            <h3 className="ct-h3 mb-1 text-ink">{t.newTitle}</h3>
            <p className="ct-help mb-4">{t.newHint}</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t.fieldFirstName} htmlFor="c-first">
                <Input
                  id="c-first"
                  value={draft.firstName}
                  onChange={(e) => setDraft((d) => ({ ...d, firstName: e.target.value }))}
                />
              </Field>
              <Field label={t.fieldLastName} htmlFor="c-last">
                <Input
                  id="c-last"
                  value={draft.lastName}
                  onChange={(e) => setDraft((d) => ({ ...d, lastName: e.target.value }))}
                />
              </Field>
              <Field label={t.fieldEmail} htmlFor="c-email" hint={t.fieldEmailHint}>
                <Input
                  id="c-email"
                  type="email"
                  inputMode="email"
                  value={draft.email}
                  onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))}
                />
              </Field>
              <Field label={t.fieldPosition} htmlFor="c-position">
                <Input
                  id="c-position"
                  value={draft.position}
                  onChange={(e) => setDraft((d) => ({ ...d, position: e.target.value }))}
                />
              </Field>
            </div>
            <fieldset className="mt-4">
              <legend className="ct-label text-ink">{t.colRoles}</legend>
              <p className="ct-help mb-2">{t.rolesHint}</p>
              <div className="flex flex-wrap gap-1">
                {CONTACT_ROLES.filter((r) => r !== "primary_ops").map((role) => (
                  <button
                    key={role}
                    type="button"
                    aria-pressed={draft.roles.includes(role)}
                    onClick={() => toggleDraftRole(role)}
                    className={
                      "rounded-ct-sm border px-2 py-0.5 text-[13px] font-semibold transition-colors " +
                      (draft.roles.includes(role)
                        ? "border-accent bg-accent-soft text-accent-deep"
                        : "border-border bg-surface text-muted hover:bg-surface-hover")
                    }
                  >
                    {t[`role_${role}`] ?? role}
                  </button>
                ))}
              </div>
            </fieldset>
            <div className="mt-6 flex flex-wrap gap-2">
              <Button
                disabled={
                  pending ||
                  draft.email.trim() === "" ||
                  draft.firstName.trim() === "" ||
                  draft.lastName.trim() === "" ||
                  draft.roles.length === 0
                }
                onClick={onInvite}
              >
                {t.invite}
              </Button>
              <Button
                variant="ghost"
                disabled={pending}
                onClick={() => {
                  setDraft(EMPTY);
                  setAdding(false);
                }}
              >
                {common.cancel}
              </Button>
            </div>
          </Card>
        ) : (
          <div>
            <Button onClick={() => setAdding(true)}>{t.newTitle}</Button>
          </div>
        ))}

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
            run(transferPrimary(orgId, c.person_id), t.primaryDone);
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
            run(removeContact(orgId, c.person_id), t.removed);
          }}
        />
      )}
    </div>
  );
}
