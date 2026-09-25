import type { SupabaseClient } from "@supabase/supabase-js";
import type { Locale } from "@/lib/i18n/shared";
import { loadVocabMap, vgroup } from "@/lib/vocab";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ApplicantList } from "@/components/partner/ApplicantList";
import type { TourStopp } from "@/components/partner/tour";
import type { PartnerApplication } from "../types";

/** Status, mit denen jemand mit der Tour kommt. */
const DABEI = new Set(["accepted", "promoted", "confirmed"]);

/** Zeile aus `partner_tour_applications`: Antworten mit Fragetext statt Schlüssel. */
type TourBewerbung = Omit<PartnerApplication, "answers"> & {
  answers: { key: string; label_de: string; label_en: string; value: unknown }[] | null;
};

/**
 * Bewerbungen auf die Tour je Stopp (PART-046) — nur zum Lesen: entschieden
 * wird für die ganze Tour vom Team, nicht je Stopp. `partner_tour_applications`
 * liefert Personenbezug nur mit Einwilligung und schreibt jeden Abruf ins Audit;
 * das steht auch so über der Liste.
 */
export async function TourBewerbungen({
  supabase,
  stopps,
  nurTeilnehmende,
  locale,
  t,
}: {
  supabase: SupabaseClient;
  stopps: TourStopp[];
  nurTeilnehmende: boolean;
  locale: Locale;
  t: {
    tour: Record<string, string>;
    applicants: Record<string, string>;
    rpc: Record<string, string>;
    dateLocale: string;
  };
}) {
  const s = t.tour;
  const vocab = await loadVocabMap(supabase, locale);
  const statusLabels = vgroup(vocab, "application_status");
  const ergebnisse = await Promise.all(
    stopps.map((x) => supabase.rpc("partner_tour_applications", { p_stop_id: x.stop_id })),
  );

  return (
    <div className="flex flex-col gap-6">
      <p className="ct-help max-w-text">
        {nurTeilnehmende ? s.participantsLead : s.applicationsLead} {t.applicants.auditNotice}
      </p>
      {stopps.map((x, i) => {
        const { data, error } = ergebnisse[i];
        const titel = s.stopTitle.replace("{n}", String(x.sort_order)).replace("{tour}", x.tour_name);
        if (error) {
          // 42501: die Rolle reicht nicht (etwa nur Event-App). Kein Fehlerdialog, sondern die Auskunft.
          return (
            <Card key={x.stop_id}>
              <CardHeader title={titel} />
              <EmptyState title={t.applicants.noRightsTitle} description={t.applicants.noRightsBody} />
            </Card>
          );
        }
        const zeilen: PartnerApplication[] = ((data ?? []) as TourBewerbung[])
          .filter((a) => !nurTeilnehmende || DABEI.has(a.status))
          .map((a) => ({
            ...a,
            answers: a.answers
              ? Object.fromEntries(a.answers.map((z) => [locale === "en" ? z.label_en : z.label_de, z.value]))
              : null,
          }));
        return (
          <Card key={x.stop_id}>
            <CardHeader title={titel} description={`${nurTeilnehmende ? s.tabParticipants : s.tabApplications} · ${zeilen.length}`} />
            {zeilen.length === 0 ? (
              <EmptyState
                title={nurTeilnehmende ? s.emptyParticipantsTitle : s.emptyApplicationsTitle}
                description={nurTeilnehmende ? s.emptyParticipantsBody : s.emptyApplicationsBody}
              />
            ) : (
              <ApplicantList
                applications={zeilen}
                statusLabels={statusLabels}
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
