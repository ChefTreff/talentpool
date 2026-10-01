import Link from "next/link";
import { requireAdminSection } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { Table, Tbody, Td, Th, Thead, Tr } from "@/components/ui/Table";
import { DuplicateActions } from "./DuplicateActions";
import { PaarFormular, Rueckweg, SuchKnopf } from "./DublettenFormulare";

export const dynamic = "force-dynamic";

type Kandidat = {
  id: string;
  score: number;
  signals: Record<string, unknown> | null;
  status: string;
  person_a: string; name_a: string | null; email_a: string | null; has_account_a: boolean; created_a: string;
  person_b: string; name_b: string | null; email_b: string | null; has_account_b: boolean; created_b: string;
};
type Zusammenfuehrung = {
  id: string; merged_at: string; survivor_id: string; survivor_name: string | null;
  merged_person_id: string; merged_name: string | null; merged_email: string | null; actor_name: string | null;
  moved_rows: number; undone_at: string | null; can_undo: boolean;
};

const STATUS = ["open", "confirmed_dupe", "not_dupe"] as const;

/**
 * Dubletten (ADM-036): Kandidaten aus der Suche oder dem Import, Gegenüberstellung
 * zweier Personen von Hand, und das Protokoll der Zusammenführungen mit Rückweg.
 * Zusammengeführt wird erst auf der Vorschau — sie fährt den echten Ablauf und
 * nimmt ihn zurück, zeigt also genau, was passieren wird.
 */
export default async function DublettenPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireAdminSection("duplicates", "/admin/dubletten");
  const { t } = await getI18n();
  const d = t.duplicatesAdmin as Record<string, string>;
  const { status: roh } = await searchParams;
  const status = (STATUS as readonly string[]).includes(roh ?? "") ? (roh as string) : "open";

  const supabase = await createSupabaseServerClient();
  const [kand, merges] = await Promise.all([
    supabase.rpc("duplicate_candidates_admin", { p_status: status }),
    supabase.rpc("person_merges_admin", { p_limit: 100 }),
  ]);
  const zeilen = (kand.data ?? []) as Kandidat[];
  const protokoll = (merges.data ?? []) as Zusammenfuehrung[];
  const datum = new Intl.DateTimeFormat(t.meta.dateLocale, { dateStyle: "medium" });
  const zeit = new Intl.DateTimeFormat(t.meta.dateLocale, { dateStyle: "medium", timeStyle: "short" });

  // Vorschlag, wer bleibt: wer ein Konto hat, sonst wer länger da ist.
  const bleibtA = (k: Kandidat) =>
    k.has_account_a !== k.has_account_b ? k.has_account_a : k.created_a <= k.created_b;

  const person = (id: string, name: string | null, email: string | null, konto: boolean, seit: string) => (
    <div className="min-w-0 flex-1">
      <Link href={`/admin/personen/${id}`} className="ct-link">
        {name ?? d.noName}
      </Link>
      <div className="ct-small text-muted truncate">{email ?? "—"}</div>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        {konto && <Badge tone="accent">{d.account}</Badge>}
        <span className="ct-help text-muted">{d.since.replace("{datum}", datum.format(new Date(seit)))}</span>
      </div>
    </div>
  );

  return (
    <>
      <PageHeader
        word={t.admin.words.duplicates}
        title={d.title}
        description={d.lead}
        actions={<SuchKnopf t={d} rpcMessages={t.rpc} />}
      />

      <nav aria-label={d.filterLabel} className="mb-4 flex flex-wrap gap-2">
        {STATUS.map((s) => (
          <ButtonLink
            key={s}
            href={s === "open" ? "/admin/dubletten" : `/admin/dubletten?status=${s}`}
            size="sm"
            variant={s === status ? "secondary" : "ghost"}
            aria-current={s === status ? "page" : undefined}
          >
            {d[`status_${s}`]}
          </ButtonLink>
        ))}
      </nav>

      {kand.error ? (
        <EmptyState title={d.errorTitle} description={d.errorBody} />
      ) : zeilen.length === 0 ? (
        <EmptyState title={d.emptyTitle} description={d.emptyBody} />
      ) : (
        <ul className="flex flex-col gap-3">
          {zeilen.map((k) => {
            const [bleibt, geht] = bleibtA(k) ? [k.person_a, k.person_b] : [k.person_b, k.person_a];
            return (
              <Card as="li" key={k.id} className="flex flex-col gap-4 p-4">
                <div className="flex flex-col gap-4 sm:flex-row">
                  {person(k.person_a, k.name_a, k.email_a, k.has_account_a, k.created_a)}
                  {person(k.person_b, k.name_b, k.email_b, k.has_account_b, k.created_b)}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="ct-small">
                      {d.score} <span className="tabular-nums">{Math.round(Number(k.score) * 100)} %</span>
                    </span>
                    {Object.keys(k.signals ?? {}).map((s) => (
                      <Badge key={s}>{d[`signal_${s}`] ?? s}</Badge>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <ButtonLink size="sm" variant="secondary" href={`/admin/dubletten/zusammenfuehren?bleibt=${bleibt}&geht=${geht}`}>
                      {d.review}
                    </ButtonLink>
                    <DuplicateActions
                      id={k.id}
                      status={k.status}
                      labels={{ isDupe: d.status_confirmed_dupe, notDupe: d.status_not_dupe, open: d.status_open }}
                    />
                  </div>
                </div>
              </Card>
            );
          })}
        </ul>
      )}

      <PaarFormular t={d} rpcMessages={t.rpc} />

      <Card className="mt-6">
        <CardHeader ebene="h2" title={d.logTitle} description={d.logLead} />
        {merges.error ? (
          <p className="ct-small text-muted">{d.errorBody}</p>
        ) : protokoll.length === 0 ? (
          <p className="ct-small text-muted">{d.logEmpty}</p>
        ) : (
          <Table>
            <Thead>
              <Th>{d.colWhen}</Th>
              <Th>{d.colSurvivor}</Th>
              <Th>{d.colMerged}</Th>
              <Th>{d.colRows}</Th>
              <Th>{d.colBy}</Th>
              <Th>{d.colState}</Th>
            </Thead>
            <Tbody>
              {protokoll.map((m) => (
                <Tr key={m.id}>
                  <Td className="text-muted tabular-nums">{zeit.format(new Date(m.merged_at))}</Td>
                  <Td>
                    <Link href={`/admin/personen/${m.survivor_id}`} className="ct-link">{m.survivor_name ?? d.noName}</Link>
                  </Td>
                  <Td>
                    <div>{m.merged_name ?? d.noName}</div>
                    {m.merged_email && <div className="ct-help text-muted">{m.merged_email}</div>}
                  </Td>
                  <Td className="tabular-nums">{m.moved_rows}</Td>
                  <Td className="text-muted">{m.actor_name ?? "—"}</Td>
                  <Td>
                    {m.undone_at ? (
                      <Badge>{d.undone.replace("{datum}", datum.format(new Date(m.undone_at)))}</Badge>
                    ) : m.can_undo ? (
                      <Rueckweg logId={m.id} name={m.merged_name ?? d.noName} t={d} common={{ cancel: t.common.cancel }} rpcMessages={t.rpc} />
                    ) : (
                      <span className="ct-help text-muted">{d.noUndo}</span>
                    )}
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
