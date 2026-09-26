import type { SupabaseClient } from "@supabase/supabase-js";
import type { Locale } from "@/lib/i18n/shared";
import { loadVocabMap, vgroup } from "@/lib/vocab";
import { ButtonDownload } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ApplicantList } from "@/components/partner/ApplicantList";
import type { TourStopp } from "@/components/partner/tour";
import { setTourWish } from "../actions";
import type { PartnerApplication } from "../types";

/** Status, mit denen jemand mit der Tour kommt. */
const DABEI = new Set(["accepted", "promoted", "confirmed"]);

/** Höchstens so viele Wünsche je Stopp (PART-092, K-41) — dieselbe Zahl wie in `partner_set_tour_wish`. */
export const MAX_WUENSCHE = 5;

/** Zeile aus `partner_tour_applications`: Antworten mit Fragetext statt Schlüssel. */
type TourBewerbung = Omit<PartnerApplication, "answers"> & {
  answers: { key: string; label_de: string; label_en: string; value: unknown }[] | null;
  /** PART-092: vom Partner dieses Stopps gewünscht. */
  wished: boolean;
};

/**
 * Bewerbungen auf die Tour je Stopp (PART-046) — nur zum Lesen: entschieden
 * wird für die ganze Tour vom Team, nicht je Stopp. `partner_tour_applications`
 * liefert Personenbezug nur mit Einwilligung und schreibt jeden Abruf ins Audit;
 * das steht auch so über der Liste.
 *
 * Im Reiter Bewerbungen markiert der Partner bis zu fünf Wünsche (PART-092);
 * die Auswahl trifft weiter das Team, das die Wünsche in seiner
 * Entscheidungssicht sieht. Im selben Reiter lädt er die Bewerbungen je Stopp
 * als CSV (PART-051, `/partner/export/tour/<Stopp>`): nur mit Einwilligung,
 * mit seinen Wünschen und dem Datenschutzhinweis, jeder Export im Audit.
 */
export async function TourBewerbungen({
  supabase,
  stopps,
  nurTeilnehmende,
  canEdit,
  locale,
  t,
}: {
  supabase: SupabaseClient;
  stopps: TourStopp[];
  nurTeilnehmende: boolean;
  /** Darf die Person Wünsche setzen (Hauptkontakt, weitere Kontakte, Zeichnungsberechtigte)? */
  canEdit: boolean;
  locale: Locale;
  t: {
    tour: Record<string, string>;
    bewerbung: Record<string, string>;
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
        {!nurTeilnehmende && canEdit && ` ${t.bewerbung.exportHint}`}
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
        const roh = (data ?? []) as TourBewerbung[];
        const gewuenscht = roh.filter((a) => a.wished).map((a) => a.id);
        const zeilen: PartnerApplication[] = roh
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
            {!nurTeilnehmende && (
              <p className="ct-help mb-4">
                <span className="font-semibold text-ink">
                  {s.wishCount.replace("{n}", String(gewuenscht.length)).replace("{max}", String(MAX_WUENSCHE))}
                </span>{" "}
                {s.wishLead.replace("{max}", String(MAX_WUENSCHE))}
              </p>
            )}
            {/* Eigene Zeile statt im Kartenkopf: auf 375 px bliebe dem Titel sonst nur eine schmale Spalte. */}
            {!nurTeilnehmende && canEdit && roh.some((a) => a.consent_share) && (
              <div className="mb-4">
                <ButtonDownload href={`/partner/export/tour/${x.stop_id}`}>
                  {t.bewerbung.exportCsv}
                </ButtonDownload>
              </div>
            )}
            {zeilen.length === 0 ? (
              <EmptyState
                title={nurTeilnehmende ? s.emptyParticipantsTitle : s.emptyApplicationsTitle}
                description={nurTeilnehmende ? s.emptyParticipantsBody : s.emptyApplicationsBody}
              />
            ) : (
              <ApplicantList
                applications={zeilen}
                statusLabels={statusLabels}
                wunsch={
                  !nurTeilnehmende && canEdit
                    ? { gewuenscht, max: MAX_WUENSCHE, setzen: setTourWish.bind(null, x.stop_id) }
                    : undefined
                }
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
