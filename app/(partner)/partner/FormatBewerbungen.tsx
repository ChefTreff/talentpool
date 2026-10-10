import type { SupabaseClient } from "@supabase/supabase-js";
import type { Locale } from "@/lib/i18n/shared";
import { loadVocabMap, vgroup } from "@/lib/vocab";
import { ButtonDownload } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ApplicantList } from "@/components/partner/ApplicantList";
import { PROFIL_VOKABULARE } from "@/components/partner/bewerbung";
import { antwortenMitText } from "@/components/partner/fragen";
import { mitEntscheidungFrist, zeigtEntscheidungHinweis } from "@/lib/mail/entscheidung-frist";
import { exportAdresse, nimmtTeil } from "@/lib/partner/teilnehmende";
import { decideApplication } from "./actions";
import { ladeFragen } from "./bewerbungen";
import type { PartnerFormatSession } from "./talk/types";
import type { PartnerApplication, PartnerSession } from "./types";

/**
 * Bewerbungen eigener Formate — Masterclass, Side-Event, Interview Tables
 * (PART-045, PART-082: die Sammelseite unter /partner/bewerber ist in den
 * Formatseiten aufgegangen). Je Session eine Liste: mit Entscheidungen
 * (`partner_applications`, jeder Abruf im Audit) oder — im Reiter Teilnehmende
 * — nur, wer zugesagt ist, ohne Knöpfe. Antworten stehen unter ihrem
 * Fragetext; ob die Entscheidungen schon verschickt sind, sagt
 * `partner_sessions.released` — erst dann geht mit einer Entscheidung eine Mail raus (nach zehn
 * Minuten, PART-124/146), und nur dann steht der Hinweis darüber (`zeigtEntscheidungHinweis`).
 *
 * Die Company Tour hat ihre eigene, nur lesende Liste (`TourBewerbungen`):
 * dort entscheidet das Team für die ganze Tour.
 *
 * Wer entscheiden darf, lädt die Bewerbungen je Session auch als CSV
 * (PART-051, `/partner/export/format/<Session>`): nur mit Einwilligung, mit
 * Datenschutzhinweis, jeder Export im Audit. Im Reiter Teilnehmende lädt er
 * dieselbe Datei nur mit denen, die teilnehmen (PART-130, `?nur=teilnehmende`).
 */
export async function FormatBewerbungen({
  supabase,
  orgId,
  sessions,
  nurTeilnehmende,
  canEdit,
  locale,
  titel,
  t,
}: {
  supabase: SupabaseClient;
  orgId: string;
  sessions: PartnerFormatSession[];
  nurTeilnehmende: boolean;
  canEdit: boolean;
  locale: Locale;
  /** Überschrift je Session — etwa Titel und Zeit bei Interview Tables. */
  titel: (x: PartnerFormatSession) => string;
  t: {
    bewerbung: Record<string, string>;
    applicants: Record<string, string>;
    rpc: Record<string, string>;
    dateLocale: string;
  };
}) {
  const s = t.bewerbung;
  const [vocab, { data: freigabeZeilen }] = await Promise.all([
    loadVocabMap(supabase, locale),
    supabase.rpc("partner_sessions", { p_org_id: orgId }),
  ]);
  const freigegeben = new Map(((freigabeZeilen ?? []) as PartnerSession[]).map((x) => [x.id, x.released]));
  const statusLabels = vgroup(vocab, "application_status");
  const profilWerte = Object.fromEntries(PROFIL_VOKABULARE.map((v) => [v, vgroup(vocab, v)]));
  const ergebnisse = await Promise.all(
    sessions.map(async (x) => ({
      bewerbungen: await supabase.rpc("partner_applications", { p_session_id: x.id }),
      fragen: await ladeFragen(supabase, x.id),
    })),
  );

  return (
    <div className="flex flex-col gap-6">
      <p className="ct-help max-w-text">
        {nurTeilnehmende ? s.participantsLead : s.applicationsLead} {t.applicants.consentNote} {t.applicants.auditNotice}
        {canEdit && ` ${nurTeilnehmende ? s.exportParticipantsHint : s.exportHint}`}
      </p>
      {sessions.map((x, i) => {
        const { bewerbungen, fragen } = ergebnisse[i];
        if (bewerbungen.error) {
          // 42501: die Rolle reicht nicht (etwa nur Event-App). Kein Fehlerdialog, sondern die Auskunft.
          return (
            <Card key={x.id}>
              <CardHeader ebene="h2" title={titel(x)} />
              <EmptyState title={t.applicants.noRightsTitle} description={t.applicants.noRightsBody} />
            </Card>
          );
        }
        const zeilen: PartnerApplication[] = ((bewerbungen.data ?? []) as PartnerApplication[])
          .filter((a) => !nurTeilnehmende || nimmtTeil(a.status))
          .map((a) => ({ ...a, answers: antwortenMitText(a.answers, fragen, locale) }));
        return (
          <Card key={x.id}>
            <CardHeader
              ebene="h2"
              title={titel(x)}
              description={`${nurTeilnehmende ? s.tabParticipants : s.tabApplications} · ${zeilen.length}`}
            />
            {!nurTeilnehmende && (
              <p className="ct-help mb-4">
                {freigegeben.get(x.id) ? t.applicants.released : t.applicants.notReleasedLong}
              </p>
            )}
            {/* PART-124/146 (Konrad & Leopold 05.10.): „Achtung: Mit Zusage bekommt die Person eine Zusage-Mail.“ Der Hinweis steht oben,
                bevor jemand auf „Zusagen“ klickt — und nur, wo die Entscheidungen schon verschickt werden (freigegeben): vorher geht
                aus dieser Oberfläche keine Mail raus, die Zeile darüber sagt das. Jede der drei Mails (Zusage, Warteliste, Absage)
                wartet zehn Minuten; jede andere Entscheidung bis dahin stoppt sie (`application_mail_trigger`). Eine Hinweisfläche in der Akzentfarbe wie auf der
                Ticketseite (PART-112): Information, keine Aktion. Keine `Card` mit `bg-accent-soft` — `bg-surface` gewinnt. */}
            {zeigtEntscheidungHinweis({ freigegeben: freigegeben.get(x.id) === true, canEdit, nurTeilnehmende }) && (
              <div role="note" className="mb-4 rounded-ct-md border border-accent-soft bg-accent-soft px-4 py-3">
                <p className="ct-small text-accent-deep">{mitEntscheidungFrist(t.applicants.decisionMailNote)}</p>
              </div>
            )}
            {/* Eigene Zeile statt im Kartenkopf: auf 375 px bliebe dem Titel sonst nur eine schmale Spalte. */}
            {canEdit && zeilen.some((a) => a.consent_share) && (
              <div className="mb-4">
                <ButtonDownload href={exportAdresse(`/partner/export/format/${x.id}`, nurTeilnehmende)}>
                  {nurTeilnehmende ? s.exportParticipantsCsv : s.exportCsv}
                </ButtonDownload>
              </div>
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
                profilWerte={profilWerte}
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
