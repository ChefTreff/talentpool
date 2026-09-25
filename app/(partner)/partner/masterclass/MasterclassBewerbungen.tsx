import type { SupabaseClient } from "@supabase/supabase-js";
import type { Locale } from "@/lib/i18n/shared";
import { loadVocabMap, vgroup } from "@/lib/vocab";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ApplicantList } from "@/components/partner/ApplicantList";
import { antwortenMitText } from "@/components/partner/fragen";
import { decideApplication } from "../actions";
import type { PartnerFormatSession } from "../talk/types";
import type { PartnerApplication, PartnerSession } from "../types";
import { ladeFragen } from "./daten";

/** Status, mit denen jemand an der Masterclass teilnimmt. */
const DABEI = new Set(["accepted", "promoted", "confirmed"]);

/**
 * Bewerbungen einer Masterclass (PART-045): Liste mit Entscheidungen
 * (`partner_applications`, jeder Abruf im Audit) oder — im Reiter
 * Teilnehmende — nur, wer zugesagt ist, ohne Knöpfe. Antworten stehen unter
 * ihrem Fragetext. Ob die Entscheidungen schon verschickt sind, sagt
 * `partner_sessions.released`.
 */
export async function MasterclassBewerbungen({
  supabase,
  orgId,
  sessions,
  nurTeilnehmende,
  canEdit,
  locale,
  t,
}: {
  supabase: SupabaseClient;
  orgId: string;
  sessions: PartnerFormatSession[];
  nurTeilnehmende: boolean;
  canEdit: boolean;
  locale: Locale;
  t: {
    masterclass: Record<string, string>;
    applicants: Record<string, string>;
    rpc: Record<string, string>;
    dateLocale: string;
  };
}) {
  const s = t.masterclass;
  const [vocab, { data: freigabeZeilen }] = await Promise.all([
    loadVocabMap(supabase, locale),
    supabase.rpc("partner_sessions", { p_org_id: orgId }),
  ]);
  const freigegeben = new Map(((freigabeZeilen ?? []) as PartnerSession[]).map((x) => [x.id, x.released]));
  const statusLabels = vgroup(vocab, "application_status");
  const ergebnisse = await Promise.all(
    sessions.map(async (x) => ({
      bewerbungen: await supabase.rpc("partner_applications", { p_session_id: x.id }),
      fragen: await ladeFragen(supabase, x.id),
    })),
  );

  return (
    <div className="flex flex-col gap-6">
      <p className="ct-help max-w-text">
        {nurTeilnehmende ? s.participantsLead : s.applicationsLead} {t.applicants.auditNotice}
      </p>
      {sessions.map((x, i) => {
        const { bewerbungen, fragen } = ergebnisse[i];
        const titel = (locale === "en" ? x.title_en : x.title_de) ?? x.title_de ?? s.untitled;
        if (bewerbungen.error) {
          return (
            <Card key={x.id}>
              <CardHeader title={titel} />
              <EmptyState title={t.applicants.noRightsTitle} description={t.applicants.noRightsBody} />
            </Card>
          );
        }
        const zeilen: PartnerApplication[] = ((bewerbungen.data ?? []) as PartnerApplication[])
          .filter((a) => !nurTeilnehmende || DABEI.has(a.status))
          .map((a) => ({ ...a, answers: antwortenMitText(a.answers, fragen, locale) }));
        return (
          <Card key={x.id}>
            <CardHeader
              title={titel}
              description={`${nurTeilnehmende ? s.tabParticipants : s.tabApplications} · ${zeilen.length}`}
            />
            {!nurTeilnehmende && (
              <p className="ct-help mb-4">
                {freigegeben.get(x.id) ? t.applicants.released : t.applicants.notReleasedLong}
              </p>
            )}
            {zeilen.length === 0 ? (
              <EmptyState
                title={nurTeilnehmende ? s.emptyParticipantsTitle : t.applicants.noApplicantsTitle}
                description={nurTeilnehmende ? s.emptyParticipantsBody : t.applicants.noApplicantsBody}
              />
            ) : (
              <ApplicantList
                applications={zeilen}
                statusLabels={statusLabels}
                decide={!nurTeilnehmende && canEdit ? decideApplication : undefined}
                dateLocale={t.dateLocale}
                t={t.applicants}
                rpcMessages={t.rpc}
              />
            )}
          </Card>
        );
      })}
    </div>
  );
}
