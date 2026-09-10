import Link from "next/link";
import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadVocabMap, vgroup } from "@/lib/vocab";
import { formatRange } from "@/lib/tz";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/Table";
import type { OverviewRow } from "./types";

export const dynamic = "force-dynamic";

/**
 * Einstieg in die Bewerbungen: eine Zeile je Session, die der Aufrufer
 * entscheiden darf (`applications_overview()` filtert das selbst über
 * `can_decide_session`). Kein service_role, kein Tabellenzugriff.
 */
export default async function BewerbungenPage() {
  await requireArea("admin", "/admin/bewerbungen");
  const { locale, t } = await getI18n();
  const supabase = await createSupabaseServerClient();

  const [{ data: rows }, { data: events }, vocab] = await Promise.all([
    supabase.rpc("applications_overview"),
    supabase.from("event").select("id, timezone"),
    loadVocabMap(supabase, locale),
  ]);

  const sessions = (rows ?? []) as OverviewRow[];
  const tz = new Map(
    ((events ?? []) as { id: string; timezone: string }[]).map((e) => [e.id, e.timezone]),
  );
  const statusLabels = vgroup(vocab, "application_status");
  const title = (s: OverviewRow) =>
    (locale === "en" ? s.title_en : s.title_de) ?? s.title_de ?? s.title_en ?? "—";

  // Nur Stände zeigen, die tatsächlich vorkommen — sonst steht überall eine Null.
  const total = (s: OverviewRow) =>
    Object.values(s.counts ?? {}).reduce((sum, n) => sum + n, 0);
  const open = (s: OverviewRow) =>
    (s.counts?.applied ?? 0) + (s.counts?.shortlisted ?? 0);

  return (
    <>
      <PageHeader
        title={t.admin.applications.title}
        description={t.admin.applications.lead}
      />

      {sessions.length === 0 ? (
        <EmptyState
          title={t.admin.applications.emptyTitle}
          description={t.admin.applications.emptyBody}
        />
      ) : (
        <Table>
          <Thead>
            <Th>{t.admin.applications.colSession}</Th>
            <Th>{t.admin.applications.colWhen}</Th>
            <Th>{t.admin.applications.colCounts}</Th>
            <Th>{t.admin.applications.colOpen}</Th>
            <Th>{t.admin.applications.colReleased}</Th>
          </Thead>
          <Tbody>
            {sessions.map((s) => (
              <Tr key={s.session_id}>
                <Td>
                  <Link href={`/admin/bewerbungen/${s.session_id}`} className="ct-link">
                    {title(s)}
                  </Link>
                  <div className="ct-help">
                    {s.stage_name}
                    {s.capacity != null && ` · ${t.admin.applications.capacity} ${s.capacity}`}
                  </div>
                </Td>
                <Td className="text-muted tabular-nums">
                  {s.start_at && s.end_at
                    ? formatRange(s.start_at, s.end_at, tz.get(s.event_id) ?? "Europe/Berlin")
                    : t.common.none}
                </Td>
                <Td>
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(s.counts ?? {})
                      .sort(([a], [b]) => a.localeCompare(b))
                      .map(([status, n]) => (
                        <Badge key={status}>
                          {statusLabels[status] ?? status} {n}
                        </Badge>
                      ))}
                    {total(s) === 0 && <span className="ct-help">{t.common.none}</span>}
                  </div>
                </Td>
                <Td className="tabular-nums">{open(s)}</Td>
                <Td>
                  {s.released ? (
                    <Badge tone="success">{t.admin.applications.released}</Badge>
                  ) : (
                    <Badge tone="warning">{t.admin.applications.notReleased}</Badge>
                  )}
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}
    </>
  );
}
