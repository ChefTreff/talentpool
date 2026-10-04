import Link from "next/link";
import { requireAdminSection } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadVocabMap, vgroup } from "@/lib/vocab";
import { listeFilter, SEITE_GROESSE, seitenAdresse, seitenZahl, filterAktiv } from "@/lib/bewerbungen/liste";
import { SectionTabs } from "@/components/layout/SectionTabs";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { BewerbungsFilter } from "./BewerbungsFilter";
import { BewerbungsListe, type ListenZeile } from "./BewerbungsListe";
import type { ListRow, OverviewRow } from "./types";

export const dynamic = "force-dynamic";

const PFAD = "/admin/bewerbungen";

/**
 * Bewerbungen über alle Sessions (ADM-003, Konrad 25.09.: „bis zu 50
 * Masterclasses mit je 500 und mehr Bewerbungen“).
 *
 * Gefiltert und geblättert wird in der Datenbank (`applications_admin_list`,
 * nur fürs Team, Rechte je Session); die Adresse trägt den Ausschnitt
 * (`q`, `format`, `session`, `status`, `einwilligung`, `seite`), damit ein Link
 * dieselbe Liste zeigt. Entschieden wird einzeln in der aufgeklappten Zeile
 * oder gesammelt über die Häkchen (`decide_applications`, Audit je Bewerbung).
 * Freigeben, Nachrücken und Ränge bleiben in der Session-Ansicht; der Reiter
 * „Sessions“ zeigt den Stand je Session.
 */
export default async function BewerbungenPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdminSection("applications", PFAD);
  const { locale, t } = await getI18n();
  const a = t.admin.applications;
  const roh = await searchParams;
  const suche = new URLSearchParams(
    Object.entries(roh).flatMap(([k, v]) =>
      v === undefined ? [] : (Array.isArray(v) ? v : [v]).map((x) => [k, x] as [string, string]),
    ),
  );

  const supabase = await createSupabaseServerClient();
  const [{ data: overviewRows }, vocab] = await Promise.all([
    supabase.rpc("applications_overview"),
    loadVocabMap(supabase, locale),
  ]);
  const sessions = (overviewRows ?? []) as OverviewRow[];
  const statusLabels = vgroup(vocab, "application_status");
  const formatLabels = vgroup(vocab, "session_format");
  const formate = [...new Set(sessions.map((s) => s.format).filter((f): f is string => !!f))];
  const { werte, filter } = listeFilter(suche, { formate, status: Object.keys(statusLabels) });

  const { data: zeilenRoh, error: listenFehler } = await supabase.rpc("applications_admin_list", {
    p_format: filter.format,
    p_session_id: filter.session,
    p_status: filter.status,
    p_consent: filter.consent,
    p_query: filter.q,
    p_limit: SEITE_GROESSE,
    p_offset: (filter.seite - 1) * SEITE_GROESSE,
  });
  // Ein Fehler ist keine leere Liste: „Noch keine Bewerbungen“ wäre hier falsch. Die Fehlergrenze
  // des Admin-Bereichs zeigt in Produktion nur die Fehler-ID.
  if (listenFehler) throw new Error(`applications_admin_list: ${listenFehler.message}`);
  const zeilen = (zeilenRoh ?? []) as ListRow[];
  const total = Number(zeilen[0]?.total_count ?? 0);
  const seiten = seitenZahl(total);

  const titel = (de: string | null, en: string | null) => (locale === "en" ? en : de) ?? de ?? en ?? "—";
  const profilVokabel: Record<string, Record<string, string>> = {
    occupation_status: vgroup(vocab, "occupation_status"),
    career_level: vgroup(vocab, "career_level"),
    study_field: vgroup(vocab, "study_field"),
  };
  const anzeige: ListenZeile[] = zeilen.map((z) => ({
    id: z.id,
    session_id: z.session_id,
    session_titel: titel(z.session_title_de, z.session_title_en),
    format_label: z.format ? (formatLabels[z.format] ?? z.format) : null,
    released: z.released,
    display_name: z.display_name,
    email: z.email,
    status: z.status,
    rank: z.rank,
    consent_share: z.consent_share,
    created_at: z.created_at,
    decided_at: z.decided_at,
    profile: z.profile
      ? Object.fromEntries(Object.entries(z.profile).map(([k, v]) => [k, profilVokabel[k]?.[v] ?? v]))
      : null,
    answers: z.answers
      ? Object.fromEntries(z.answers.map((x) => [locale === "en" ? x.label_en : x.label_de, x.value]))
      : null,
  }));

  return (
    <>
      <PageHeader word={t.admin.words.applications} title={a.title} description={a.listLead} />
      <SectionTabs
        label={a.title}
        items={[
          { href: PFAD, label: a.tabList, exact: true },
          { href: `${PFAD}/sessions`, label: a.tabSessions },
        ]}
      />

      <div className="flex flex-col gap-6">
        <BewerbungsFilter
          key={JSON.stringify(werte)}
          werte={werte}
          formate={formate.map((f) => ({ value: f, label: formatLabels[f] ?? f }))}
          sessions={sessions.map((s) => ({
            value: s.session_id,
            label: [s.format ? (formatLabels[s.format] ?? s.format) : null, titel(s.title_de, s.title_en)]
              .filter(Boolean)
              .join(" · "),
            format: s.format,
          }))}
          status={Object.entries(statusLabels).map(([value, label]) => ({ value, label }))}
          t={a}
        />

        <section aria-labelledby="h-bewerbungen" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline gap-2 border-b pb-2">
            <h2 id="h-bewerbungen" className="ct-h2 text-ink">
              {a.listTitle}
            </h2>
            <span className="ct-help ml-auto tabular-nums">
              {a.listCount.replace("{n}", new Intl.NumberFormat(t.meta.dateLocale).format(total))}
            </span>
          </div>

          {anzeige.length === 0 ? (
            <EmptyState
              title={filterAktiv(werte) || filter.seite > 1 ? a.listEmptyFilteredTitle : a.listEmptyTitle}
              description={filterAktiv(werte) || filter.seite > 1 ? a.listEmptyFilteredBody : a.listEmptyBody}
              action={
                filterAktiv(werte) || filter.seite > 1 ? (
                  <Link href={PFAD} className="ct-link">
                    {a.filterReset}
                  </Link>
                ) : undefined
              }
            />
          ) : (
            <>
              <BewerbungsListe
                key={suche.toString()}
                zeilen={anzeige}
                statusLabels={statusLabels}
                dateLocale={t.meta.dateLocale}
                t={{ ...a, cancel: t.common.cancel }}
                tBewerbung={t.partnerApplicants}
                rpcMessages={t.rpc}
              />
              {seiten > 1 && (
                <nav aria-label={a.pagination} className="flex flex-wrap items-center justify-between gap-3">
                  {filter.seite > 1 ? (
                    <ButtonLink prefetch={false} variant="secondary" size="sm" href={seitenAdresse(PFAD, suche.toString(), filter.seite - 1)}>
                      ← {a.pagePrev}
                    </ButtonLink>
                  ) : (
                    <span />
                  )}
                  <span className="ct-help tabular-nums">
                    {a.pageOf.replace("{n}", String(filter.seite)).replace("{total}", String(seiten))}
                  </span>
                  {filter.seite < seiten ? (
                    <ButtonLink prefetch={false} variant="secondary" size="sm" href={seitenAdresse(PFAD, suche.toString(), filter.seite + 1)}>
                      {a.pageNext} →
                    </ButtonLink>
                  ) : (
                    <span />
                  )}
                </nav>
              )}
            </>
          )}
        </section>
      </div>
    </>
  );
}
