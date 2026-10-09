import Link from "next/link";
import { requireAdminSection } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadVocabMap, vgroup } from "@/lib/vocab";
import { formatRange } from "@/lib/tz";
import { SectionTabs } from "@/components/layout/SectionTabs";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/Table";
import type { OverviewRow } from "../types";

export const dynamic = "force-dynamic";

const PFAD = "/admin/bewerbungen";

/**
 * Stand je Session, gruppiert nach Format (ADM-003) — die frühere
 * Einstiegsseite. Eine Zeile je Session, die der Aufrufer entscheiden darf
 * (`applications_overview()` filtert selbst über `can_decide_session`). Der
 * Titel führt in die Session-Ansicht (Freigabe, Nachrücken, Ränge), „In der
 * Liste“ in die Bewerbungsliste mit dieser Session als Filter.
 */
export default async function BewerbungenSessionsPage() {
  await requireAdminSection("applications", `${PFAD}/sessions`);
  const { locale, t } = await getI18n();
  const a = t.admin.applications;
  const supabase = await createSupabaseServerClient();

  const [{ data: rows }, { data: events }, vocab] = await Promise.all([
    supabase.rpc("applications_overview"),
    supabase.from("event").select("id, timezone"),
    loadVocabMap(supabase, locale),
  ]);

  const sessions = (rows ?? []) as OverviewRow[];
  const tz = new Map(((events ?? []) as { id: string; timezone: string }[]).map((e) => [e.id, e.timezone]));
  const statusLabels = vgroup(vocab, "application_status");
  const formatLabels = vgroup(vocab, "session_format");
  const title = (s: OverviewRow) => (locale === "en" ? s.title_en : s.title_de) ?? s.title_de ?? s.title_en ?? "—";
  // Nur Stände zeigen, die tatsächlich vorkommen — sonst steht überall eine Null.
  const total = (s: OverviewRow) => Object.values(s.counts ?? {}).reduce((sum, n) => sum + n, 0);
  const open = (s: OverviewRow) => (s.counts?.applied ?? 0) + (s.counts?.shortlisted ?? 0);

  const gruppen = new Map<string, OverviewRow[]>();
  for (const s of sessions) {
    const key = s.format ?? "";
    gruppen.set(key, [...(gruppen.get(key) ?? []), s]);
  }

  return (
    <>
      <PageHeader word={t.admin.words.applications} title={a.title} description={a.lead} />
      <SectionTabs
        label={a.title}
        items={[
          { href: PFAD, label: a.tabList, exact: true },
          { href: `${PFAD}/sessions`, label: a.tabSessions },
          { href: `${PFAD}/tickets`, label: a.tabTickets },
        ]}
      />

      {sessions.length === 0 ? (
        <EmptyState title={a.emptyTitle} description={a.emptyBody} />
      ) : (
        <div className="flex flex-col gap-8">
          {[...gruppen.entries()].map(([format, liste]) => (
            <section key={format || "ohne"} aria-labelledby={`h-format-${format || "ohne"}`}>
              <div className="mb-2 flex flex-wrap items-baseline gap-2 border-b pb-2">
                <h2 id={`h-format-${format || "ohne"}`} className="ct-h2 text-ink">
                  {format ? (formatLabels[format] ?? format) : a.formatNone}
                </h2>
                <span className="ct-help ml-auto tabular-nums">{liste.length}</span>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <Thead>
                    <Th>{a.colSession}</Th>
                    <Th>{a.colWhen}</Th>
                    <Th>{a.colCounts}</Th>
                    <Th numeric>{a.colOpen}</Th>
                    <Th>{a.colReleased}</Th>
                  </Thead>
                  <Tbody>
                    {liste.map((s) => (
                      <Tr key={s.session_id}>
                        <Td>
                          <Link href={`${PFAD}/${s.session_id}`} className="ct-link">
                            {title(s)}
                          </Link>
                          <div className="ct-help">
                            {s.stage_name}
                            {s.capacity != null && ` · ${a.capacity} ${s.capacity}`}
                            {total(s) > 0 && (
                              <>
                                {" · "}
                                <Link href={`${PFAD}?session=${s.session_id}`} className="ct-link">
                                  {a.showInList}
                                </Link>
                              </>
                            )}
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
                              .sort(([x], [y]) => x.localeCompare(y))
                              .map(([status, n]) => (
                                <Badge key={status}>
                                  {statusLabels[status] ?? status} {n}
                                </Badge>
                              ))}
                            {total(s) === 0 && <span className="ct-help">{t.common.none}</span>}
                          </div>
                        </Td>
                        <Td numeric>{open(s)}</Td>
                        <Td>
                          {s.released ? (
                            <Badge tone="success">{a.released}</Badge>
                          ) : (
                            <Badge tone="warning">{a.notReleased}</Badge>
                          )}
                        </Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
