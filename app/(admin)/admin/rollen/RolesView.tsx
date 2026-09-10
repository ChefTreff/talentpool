"use client";

import { useEffect, useState, useTransition } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { ConfirmDialog } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/Table";
import { useToast } from "@/components/ui/Toast";
import {
  assignRole,
  findPeople,
  revokeRole,
  rolesOfPerson,
  type FoundPerson,
  type RoleRow,
} from "./actions";

type Strings = Record<string, string>;
type Option = { value: string; label: string };

/**
 * Welche Zusatzangabe ein Scope braucht — die Regel steht als CHECK in
 * `role_assignment`; hier steht sie nur, damit das Formular passend aussieht.
 */
const SCOPE_FIELD: Record<string, "none" | "edition" | "portal" | "scope"> = {
  global: "none",
  edition: "edition",
  portal: "portal",
  stage: "scope",
  stage_day: "scope",
  slot: "scope",
};
const SCOPE_TYPES = Object.keys(SCOPE_FIELD);

export function RolesView({
  roles,
  scopes,
  dateLocale,
  t,
  common,
  rpcMessages,
}: {
  roles: Record<string, string>;
  scopes: Record<string, Option[]>;
  dateLocale: string;
  t: Strings;
  common: { cancel: string; choose: string; none: string; save: string };
  rpcMessages: Record<string, string>;
}) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<FoundPerson[]>([]);
  const [person, setPerson] = useState<FoundPerson | null>(null);
  const [assignments, setAssignments] = useState<RoleRow[]>([]);
  const [askRevoke, setAskRevoke] = useState<RoleRow | null>(null);

  const [role, setRole] = useState("");
  const [scopeType, setScopeType] = useState("global");
  const [scopeValue, setScopeValue] = useState("");
  const [validTo, setValidTo] = useState("");
  const [note, setNote] = useState("");

  const message = (key: string) => rpcMessages[key] ?? rpcMessages.unknown ?? key;

  /**
   * `roles_of_person` gibt beim Portal-Scope den Schlüssel zurück; in der
   * Auswahlliste steht der Name. In der Tabelle soll dasselbe stehen.
   */
  const scopeLabel = (a: RoleRow) => {
    if (a.scope_type === "portal" && a.portal) {
      return scopes.portal?.find((o) => o.value === a.portal)?.label ?? a.portal;
    }
    return a.scope_label;
  };
  const dateTime = new Intl.DateTimeFormat(dateLocale, { dateStyle: "medium" });
  const needs = SCOPE_FIELD[scopeType] ?? "none";

  // Suche mit kleiner Verzögerung, damit nicht jeder Tastendruck geht.
  useEffect(() => {
    const handle = setTimeout(() => {
      const term = query.trim();
      if (term.length < 2) {
        setHits([]);
        return;
      }
      findPeople(term).then(setHits);
    }, 250);
    return () => clearTimeout(handle);
  }, [query]);

  function load(p: FoundPerson) {
    setPerson(p);
    setHits([]);
    setQuery("");
    startTransition(async () => {
      const res = await rolesOfPerson(p.id);
      if (!res.ok) {
        toast("error", message(res.key));
        return;
      }
      setAssignments(res.data);
    });
  }

  function reload() {
    if (!person) return;
    startTransition(async () => {
      const res = await rolesOfPerson(person.id);
      if (res.ok) setAssignments(res.data);
    });
  }

  function onAssign() {
    if (!person || !role) return;
    startTransition(async () => {
      const res = await assignRole({
        personId: person.id,
        role,
        scopeType,
        scopeId: needs === "scope" ? scopeValue : null,
        editionId: needs === "edition" ? scopeValue : null,
        portal: needs === "portal" ? scopeValue : null,
        validTo: validTo ? new Date(validTo).toISOString() : null,
        note,
      });
      if (!res.ok) {
        toast("error", message(res.key) + (res.detail ? ` (${res.detail})` : ""));
        return;
      }
      toast("success", t.assigned);
      setRole("");
      setScopeValue("");
      setValidTo("");
      setNote("");
      reload();
    });
  }

  function onRevoke(assignment: RoleRow) {
    startTransition(async () => {
      const res = await revokeRole(assignment.id);
      setAskRevoke(null);
      if (!res.ok) {
        toast("error", message(res.key));
        return;
      }
      toast("success", t.revoked);
      reload();
    });
  }

  const scopeOptions = needs === "none" ? [] : (scopes[scopeType] ?? []);
  const canAssign = Boolean(role) && (needs === "none" || Boolean(scopeValue));

  return (
    <div className="flex flex-col gap-6">
      <Card className="p-4">
        <Field label={t.search} htmlFor="person-search" hint={t.searchHint}>
          <Input
            id="person-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
          />
        </Field>
        {hits.length > 0 && (
          <ul className="mt-2 flex flex-col gap-1">
            {hits.map((h) => (
              <li key={h.id}>
                <button
                  type="button"
                  onClick={() => load(h)}
                  className="w-full rounded-ct-sm px-2 py-1 text-left text-[14px] hover:bg-surface-hover"
                >
                  <span className="font-semibold">{h.display_name ?? t.noName}</span>
                  {h.email && <span className="ct-help"> · {h.email}</span>}
                  {h.city && <span className="ct-help"> · {h.city}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {!person ? (
        <EmptyState title={t.pickTitle} description={t.pickBody} />
      ) : (
        <>
          <Card className="p-4">
            <h2 className="ct-h3 text-ink">{person.display_name ?? t.noName}</h2>
            {person.email && <p className="ct-help">{person.email}</p>}

            {assignments.length === 0 ? (
              <p className="ct-help mt-3">{t.noRoles}</p>
            ) : (
              <div className="mt-3">
                <Table>
                  <Thead>
                    <Th>{t.colRole}</Th>
                    <Th>{t.colScope}</Th>
                    <Th>{t.colValid}</Th>
                    <Th>{t.colState}</Th>
                    <Th aria-label={t.colAction} />
                  </Thead>
                  <Tbody>
                    {assignments.map((a) => (
                      <Tr key={a.id}>
                        <Td>{roles[a.role] ?? a.role}</Td>
                        <Td className="text-muted">
                          {t[`scope_${a.scope_type}`] ?? a.scope_type}
                          {scopeLabel(a) && ` · ${scopeLabel(a)}`}
                        </Td>
                        <Td className="text-muted tabular-nums">
                          {dateTime.format(new Date(a.valid_from))}
                          {a.valid_to ? ` – ${dateTime.format(new Date(a.valid_to))}` : ""}
                        </Td>
                        <Td>
                          {a.active ? (
                            <Badge tone="success">{t.stateActive}</Badge>
                          ) : (
                            <Badge>{t.stateEnded}</Badge>
                          )}
                        </Td>
                        <Td>
                          {a.active && (
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={pending}
                              onClick={() => setAskRevoke(a)}
                            >
                              {t.revoke}
                            </Button>
                          )}
                        </Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              </div>
            )}
          </Card>

          <Card className="p-4">
            <h2 className="ct-h3 mb-1 text-ink">{t.assignTitle}</h2>
            <p className="ct-help mb-4">{t.assignHint}</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t.role} htmlFor="role">
                <Select
                  id="role"
                  value={role}
                  placeholder={common.choose}
                  options={Object.entries(roles).map(([value, label]) => ({ value, label }))}
                  onChange={(e) => setRole(e.target.value)}
                />
              </Field>
              <Field label={t.scope} htmlFor="scope-type">
                <Select
                  id="scope-type"
                  value={scopeType}
                  options={SCOPE_TYPES.map((s) => ({
                    value: s,
                    label: t[`scope_${s}`] ?? s,
                  }))}
                  onChange={(e) => {
                    setScopeType(e.target.value);
                    setScopeValue("");
                  }}
                />
              </Field>
              {needs !== "none" && (
                <Field
                  label={t[`scope_${scopeType}`] ?? t.scope}
                  htmlFor="scope-value"
                  hint={scopeOptions.length === 0 ? t.scopeEmpty : undefined}
                >
                  <Select
                    id="scope-value"
                    value={scopeValue}
                    placeholder={common.choose}
                    options={scopeOptions}
                    onChange={(e) => setScopeValue(e.target.value)}
                  />
                </Field>
              )}
              <Field label={t.validTo} htmlFor="valid-to" hint={t.validToHint}>
                <Input
                  id="valid-to"
                  type="date"
                  value={validTo}
                  onChange={(e) => setValidTo(e.target.value)}
                />
              </Field>
              <Field label={t.note} htmlFor="note">
                <Input id="note" value={note} onChange={(e) => setNote(e.target.value)} />
              </Field>
            </div>
            <div className="mt-4">
              <Button disabled={pending || !canAssign} onClick={onAssign}>
                {t.assign}
              </Button>
            </div>
          </Card>
        </>
      )}

      {askRevoke && (
        <ConfirmDialog
          title={t.revokeTitle}
          body={t.revokeBody}
          detail={
            <p className="ct-label">
              {roles[askRevoke.role] ?? askRevoke.role}
              {scopeLabel(askRevoke) ? ` · ${scopeLabel(askRevoke)}` : ""}
            </p>
          }
          confirmLabel={t.revoke}
          cancelLabel={common.cancel}
          pending={pending}
          onCancel={() => setAskRevoke(null)}
          onConfirm={() => onRevoke(askRevoke)}
        />
      )}
    </div>
  );
}
