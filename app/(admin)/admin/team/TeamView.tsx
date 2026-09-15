"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/Table";
import { useToast } from "@/components/ui/Toast";
import {
  findPeople,
  grantTeamRole,
  revokeTeamRole,
  type FoundPerson,
  type TeamResult,
} from "./actions";

type Strings = Record<string, string>;

export type TeamRole = {
  id: string;
  role: string;
  scope_type: string;
  scope_id: string | null;
  edition_id: string | null;
  portal: string | null;
  valid_to: string | null;
  /** Der Scope als Name — `null` bedeutet global. */
  scope_label: string | null;
};

export type TeamMember = {
  person_id: string;
  display_name: string | null;
  email: string | null;
  has_account: boolean;
  is_admin: boolean;
  roles: TeamRole[];
  since: string;
  admins: number;
};

/**
 * Das Team an einer Stelle.
 *
 * `/admin/rollen` beantwortet „welche Rollen hat diese Person" — man sucht
 * jemanden und vergibt. Diese Seite beantwortet die Frage davor: **wer gehört
 * überhaupt dazu.** Deshalb steht hier die Liste und nicht die Suche im
 * Mittelpunkt; die Suche kommt darunter, wenn jemand dazukommt.
 *
 * Zwei Spalten, die man sonst einzeln nachschlagen müsste: der Scope als Name
 * (eine Rolle „für FLS27" ist etwas anderes als eine globale) und der
 * Portalzugang. Eine Rolle ohne Konto ist die häufigste stille Panne — die
 * Rolle ist vergeben, die Person kommt trotzdem nicht rein.
 */
export function TeamView({
  members,
  roleKeys,
  editionId,
  editionName,
  labels,
  dateLocale,
  t,
  common,
  rpcMessages,
}: {
  members: TeamMember[];
  roleKeys: string[];
  editionId: string | null;
  editionName: string | null;
  labels: Record<string, string>;
  dateLocale: string;
  t: Strings;
  common: { cancel: string; choose: string; none: string };
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const [suche, setSuche] = useState("");
  const [treffer, setTreffer] = useState<FoundPerson[]>([]);
  const [gesucht, setGesucht] = useState(false);
  const [neueRolle, setNeueRolle] = useState("");
  const [scope, setScope] = useState("global");
  /** Offene Rückfrage beim Entziehen. */
  const [weg, setWeg] = useState<{ id: string; person: string; role: string; letzter: boolean } | null>(null);
  /** Je Person die Rolle, die gerade hinzugefügt wird. */
  const [zusatz, setZusatz] = useState<Record<string, string>>({});

  const datum = new Intl.DateTimeFormat(dateLocale, { dateStyle: "medium" });
  const message = (key: string) => rpcMessages[key] ?? rpcMessages.unknown ?? key;
  const admins = members[0]?.admins ?? 0;

  function report(res: TeamResult, okText: string) {
    if (res.ok) {
      toast("success", okText);
      router.refresh();
      return;
    }
    toast("error", message(res.key) + (res.detail ? ` (${res.detail})` : ""));
  }

  const roleOptions = useMemo(
    () => roleKeys.map((r) => ({ value: r, label: labels[r] ?? r })),
    [roleKeys, labels],
  );

  /** Ohne Konto kommt niemand rein, egal welche Rolle. */
  const ohneKonto = members.filter((m) => !m.has_account).length;

  return (
    <div className="flex flex-col gap-6">
      {ohneKonto > 0 && (
        <Card>
          <p className="ct-small">
            <Badge tone="warning">{ohneKonto}</Badge> {t.noAccountWarning}
          </p>
        </Card>
      )}

      {members.length === 0 ? (
        <EmptyState title={t.emptyTitle} description={t.emptyBody} />
      ) : (
        <Table>
          <Thead>
            <Th>{t.colPerson}</Th>
            <Th>{t.colRoles}</Th>
            <Th>{t.colAccount}</Th>
            <Th>{t.colSince}</Th>
            <Th>{t.colAdd}</Th>
          </Thead>
          <Tbody>
            {members.map((m) => (
              <Tr key={m.person_id}>
                <Td>
                  <Link href={`/admin/personen/${m.person_id}`} className="ct-link font-medium">
                    {m.display_name ?? common.none}
                  </Link>
                  {m.email && <span className="ct-help block text-muted">{m.email}</span>}
                </Td>
                <Td>
                  <div className="flex flex-wrap gap-1">
                    {m.roles.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        title={t.revoke}
                        disabled={pending}
                        onClick={() =>
                          setWeg({
                            id: r.id,
                            person: m.display_name ?? common.none,
                            role: labels[r.role] ?? r.role,
                            letzter: r.role === "admin" && admins <= 1,
                          })
                        }
                        className="rounded-ct-sm focus-visible:outline-2"
                      >
                        <Badge tone={r.role === "admin" ? "accent" : "neutral"}>
                          {labels[r.role] ?? r.role}
                          {r.scope_label ? ` · ${r.scope_label}` : ""}
                          <span aria-hidden>×</span>
                        </Badge>
                      </button>
                    ))}
                  </div>
                </Td>
                <Td>
                  {m.has_account ? (
                    <span className="ct-help text-muted">{t.accountYes}</span>
                  ) : (
                    <Badge tone="warning">{t.accountNo}</Badge>
                  )}
                </Td>
                <Td>{datum.format(new Date(m.since))}</Td>
                <Td>
                  <div className="flex items-end gap-2">
                    <Select
                      aria-label={t.colAdd}
                      className="w-44"
                      value={zusatz[m.person_id] ?? ""}
                      placeholder={common.choose}
                      onChange={(e) => setZusatz((z) => ({ ...z, [m.person_id]: e.target.value }))}
                      options={roleOptions.filter(
                        (o) => !m.roles.some((r) => r.role === o.value && r.scope_type === "global"),
                      )}
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending || !zusatz[m.person_id]}
                      onClick={() =>
                        startTransition(async () =>
                          report(
                            await grantTeamRole(m.person_id, zusatz[m.person_id], null),
                            t.granted,
                          ),
                        )
                      }
                    >
                      {t.add}
                    </Button>
                  </div>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}

      <Card>
        <CardHeader title={t.addTitle} description={t.addHint} />
        <div className="flex flex-wrap items-end gap-3">
          <Field label={t.searchPerson} htmlFor="q" className="min-w-64 grow">
            <Input
              id="q"
              value={suche}
              onChange={(e) => setSuche(e.target.value)}
              placeholder={t.searchHint}
            />
          </Field>
          <Field label={t.role} htmlFor="rolle">
            <Select
              id="rolle"
              className="w-56"
              value={neueRolle}
              placeholder={common.choose}
              onChange={(e) => setNeueRolle(e.target.value)}
              options={roleOptions}
            />
          </Field>
          {/* Der Admin ist bewusst nie auf eine Edition begrenzt: ein Admin,
              der nur für FLS27 gilt, wäre im Jahr darauf lautlos keiner mehr. */}
          <Field label={t.scope} htmlFor="scope">
            <Select
              id="scope"
              className="w-56"
              value={neueRolle === "admin" ? "global" : scope}
              disabled={neueRolle === "admin" || !editionId}
              onChange={(e) => setScope(e.target.value)}
              options={[
                { value: "global", label: t.scopeGlobal },
                ...(editionId
                  ? [{ value: "edition", label: editionName ?? t.scopeEdition }]
                  : []),
              ]}
            />
          </Field>
          <Button
            variant="secondary"
            disabled={pending || suche.trim().length < 2}
            onClick={() =>
              startTransition(async () => {
                setTreffer(await findPeople(suche.trim()));
                setGesucht(true);
              })
            }
          >
            {t.search}
          </Button>
        </div>

        {gesucht && treffer.length === 0 && <p className="ct-help mt-3 text-muted">{t.noMatch}</p>}
        {treffer.length > 0 && (
          <ul className="mt-4 flex flex-col gap-2">
            {treffer.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 border-b pb-2 last:border-0">
                <span className="ct-small">
                  {p.display_name ?? common.none}
                  {p.email && <span className="ct-help block text-muted">{p.email}</span>}
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={pending || neueRolle === ""}
                  onClick={() =>
                    startTransition(async () =>
                      report(
                        await grantTeamRole(
                          p.id,
                          neueRolle,
                          scope === "edition" ? editionId : null,
                        ),
                        t.granted,
                      ),
                    )
                  }
                >
                  {t.add}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {weg && (
        <ConfirmDialog
          title={`${t.revokeTitle}: ${weg.role}`}
          body={`${weg.person} — ${t.revokeBody}`}
          // Den letzten Admin lässt die Datenbank nicht entziehen. Das hier
          // vorher zu sagen ist freundlicher, als jemanden in den Fehler laufen
          // zu lassen; verhindert wird es trotzdem dort.
          detail={
            weg.letzter ? <p className="ct-small text-error-ink">{t.lastAdmin}</p> : undefined
          }
          confirmLabel={t.revoke}
          cancelLabel={common.cancel}
          pending={pending}
          onCancel={() => setWeg(null)}
          onConfirm={() => {
            const id = weg.id;
            setWeg(null);
            startTransition(async () => report(await revokeTeamRole(id), t.revoked));
          }}
        />
      )}
    </div>
  );
}
