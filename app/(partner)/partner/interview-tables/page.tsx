import { notFound } from "next/navigation";
import Link from "next/link";
import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadVocabMap, vgroup } from "@/lib/vocab";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { getPartnerScope } from "../org";
import { ladeFlaechen } from "../formate";
import { canEditOnboarding, type PartnerOverview } from "../types";
import type { PartnerFormatSession } from "../talk/types";
import { TischeView } from "./TischeView";

export const dynamic = "force-dynamic";

/**
 * Interview Tables (PART-048). Die Seite erscheint bei gebuchtem Produkt
 * `format_key = 'interview_table'` (I-66084, seit 0132).
 *
 * **Gebucht wird der Tisch, nicht das Gespräch.** Deshalb gibt es hier keinen
 * Anspruchszähler wie beim Side-Event: wie viele Gespräche auf einen Tisch
 * passen, entscheidet der Kalender, nicht der Vertrag (so auch
 * `partner_entitlement`). Was fehlen kann, ist der Tisch selbst — den ordnet
 * das Team als Fläche zu.
 *
 * Je Tisch ein eigener Block: ein Partner mit zwei Tischen kann an jedem eine
 * andere Stelle besetzen, und die Ausschreibung hängt am Gespräch, nicht an
 * der Organisation.
 */
export default async function PartnerInterviewTablesPage() {
  await requireArea("partner", "/partner/interview-tables");
  const { locale, t } = await getI18n("de");
  const { current } = await getPartnerScope();
  if (!current) notFound();

  const supabase = await createSupabaseServerClient();
  const args = { p_org_id: current.org_id, p_edition_id: current.edition_id };
  const [{ data: overviewJson }, { data: sessionRows }, vocab, flaechen] = await Promise.all([
    supabase.rpc("partner_overview", args),
    supabase.rpc("partner_format_sessions", { ...args, p_format: "interview_table" }),
    loadVocabMap(supabase, locale),
    ladeFlaechen(supabase, current.org_id, "interview_table"),
  ]);

  const overview = (overviewJson ?? null) as PartnerOverview | null;
  const sessions = (sessionRows ?? []) as PartnerFormatSession[];
  const s = t.partnerInterviewTables;
  const canEdit = overview ? canEditOnboarding(overview.roles, overview.team) : false;
  const gebucht = (overview?.products ?? []).some((p) => p.format_key === "interview_table");

  // Dieselben Auswahlfelder wie im Teilnehmerprofil (Konrad, D1): der Partner
  // soll nach denselben Merkmalen suchen, nach denen sich Talente beschreiben.
  const profilFelder = {
    occupation_status: vgroup(vocab, "occupation_status"),
    career_level: vgroup(vocab, "career_level"),
    study_field: vgroup(vocab, "study_field"),
  };
  const alsListe = (m: Record<string, string>) =>
    Object.entries(m).map(([key, label]) => ({ key, label }));

  return (
    <>
      <PageHeader word={t.partner.wordConversations} title={s.title} description={s.lead} />

      {!gebucht ? (
        <EmptyState
          title={s.emptyTitle}
          description={s.emptyBody}
          action={
            <Link href="/partner/checkliste" className="ct-link">
              {s.toChecklist}
            </Link>
          }
        />
      ) : flaechen.stages.length === 0 ? (
        <EmptyState title={s.noTableTitle} description={s.noTableBody} />
      ) : (
        <div className="flex flex-col gap-8">
          {flaechen.stages.map((tisch) => (
            <div key={tisch.id}>
              {flaechen.stages.length > 1 && (
                <h2 className="ct-h2 mb-3 text-ink">{tisch.name}</h2>
              )}
              <TischeView
                orgId={current.org_id}
                editionId={current.edition_id}
                tisch={tisch}
                // Ueber `stage_id`, nicht ueber den Namen (0140): zwei Tische duerfen
                // gleich heissen, und dann landeten die Gespraeche beim falschen.
                sessions={sessions.filter((x) => x.stage_id === tisch.id)}
                days={flaechen.days.filter((d) => d.event_id === tisch.event_id)}
                canEdit={canEdit}
                profilFelder={{
                  occupation_status: alsListe(profilFelder.occupation_status),
                  career_level: alsListe(profilFelder.career_level),
                  study_field: alsListe(profilFelder.study_field),
                }}
                statusLabel={vgroup(vocab, "publish_status")}
                locale={locale}
                t={s as unknown as Record<string, string>}
                rpcMessages={t.rpc}
              />
            </div>
          ))}
        </div>
      )}
    </>
  );
}
