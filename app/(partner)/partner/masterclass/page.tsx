import { requireArea } from "@/lib/auth";
import { loadVocabMap, vgroup } from "@/lib/vocab";
import { Card, CardHeader } from "@/components/ui/Card";
import { GoodiesFrage } from "@/components/partner/GoodiesFrage";
import { updateFormatDetails } from "../actions";
import { RueckgabeHinweis, SessionStatusBadge, rueckgabeOffen, type RueckgabeTexte } from "../Rueckgabe";
import { SpeakerHinzufuegen } from "../talk/SpeakerHinzufuegen";
import { SpeakerKarte } from "../talk/SpeakerKarte";
import type { PartnerSpeaker } from "../talk/types";
import { zeitraum } from "../company-tour/daten";
import { ladeMasterclass } from "./daten";
import { MasterclassInhalt } from "./MasterclassInhalt";
import { MasterclassKopf } from "./MasterclassKopf";

export const dynamic = "force-dynamic";

/** Versandadresse und Fristen für vorab geschickte Pakete (Wiki-Artikel `anlieferung-aufbau`). */
const WIKI_ANLIEFERUNG = "/partner/wiki#anlieferung-aufbau";

/**
 * Masterclass (PART-045). Die Seite erscheint bei gebuchtem Produkt
 * `format_key = 'masterclass'`.
 *
 * Das Team vergibt Session und Slot; den Inhalt legt der Partner selbst an —
 * Titel, Beschreibung, Sprache und wer spricht, wie beim Talk (Konrad 17.09.).
 * Speaker kommen über denselben Weg wie dort (`partner_add_speaker`, eigener
 * Zugang oder verwaltet, PART-091). Bewerbungen, Teilnehmende und die
 * Bewerbungsfragen stehen in den weiteren Reitern.
 *
 * Unter jedem Inhalt die Frage nach Goodies (PART-054): die Antwort sieht das
 * Team im Admin beim Partner und hält nach.
 */
export default async function PartnerMasterclassPage() {
  await requireArea("partner", "/partner/masterclass");
  const { supabase, locale, t, current, sessions, gebucht, canEdit } = await ladeMasterclass();
  const s = t.partnerMasterclass;
  const args = { p_org_id: current.org_id, p_edition_id: current.edition_id };
  const [vocab, { data: speakerZeilen }, { data: kontaktZeilen }] = await Promise.all([
    loadVocabMap(supabase, locale),
    supabase.rpc("partner_speakers", args),
    supabase.rpc("partner_contacts", { p_org_id: current.org_id }),
  ]);
  const speakers = (speakerZeilen ?? []) as PartnerSpeaker[];
  const ops = ((kontaktZeilen ?? []) as { first_name: string | null; last_name: string | null; roles: string[] | null }[])
    .find((k) => (k.roles ?? []).includes("primary_ops"));
  const opsName = ops ? [ops.first_name, ops.last_name].filter(Boolean).join(" ") || null : null;
  const statusLabel = vgroup(vocab, "publish_status");
  const sprachen = Object.entries(vgroup(vocab, "language"))
    .filter(([key]) => key === "de" || key === "en")
    .map(([value, label]) => ({ value, label }));
  const rueckgabe: RueckgabeTexte = { badge: t.partner.returnedBadge, title: t.partner.returnedTitle, next: t.partner.returnedNext };
  const talk = t.partnerTalk as unknown as Record<string, string>;

  return (
    <>
      <MasterclassKopf gebucht={gebucht} sessions={sessions.length} word={t.partner.wordInvitation} t={s} b={t.partnerBewerbung} />
      <div className="flex flex-col gap-8">
        {sessions.map((x) => {
          const titel = (locale === "en" ? x.title_en : x.title_de) ?? x.title_de ?? s.untitled;
          const dazu = speakers.filter((sp) => sp.session_id === x.id);
          return (
            <section key={x.id} aria-label={titel} className="flex flex-col gap-4">
              <Card>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="ct-h3 text-ink">{titel}</h2>
                  <SessionStatusBadge publishStatus={x.publish_status} returnNote={x.return_note} statusLabel={statusLabel} t={rueckgabe} />
                </div>
                <dl className="ct-small mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
                  <div>
                    <dt className="ct-label text-muted">{s.slotLabel}</dt>
                    <dd className="tabular-nums text-ink">{zeitraum(x.starts_at, x.ends_at, t.meta.dateLocale) ?? s.slotPending}</dd>
                  </div>
                  <div>
                    <dt className="ct-label text-muted">{s.roomLabel}</dt>
                    <dd className="text-ink">{x.stage_name ?? s.roomPending}</dd>
                  </div>
                </dl>
                {rueckgabeOffen(x) && (
                  <RueckgabeHinweis className="mt-4" note={x.return_note} returnedAt={x.returned_at} dateLocale={t.meta.dateLocale} t={rueckgabe} />
                )}
              </Card>

              <Card>
                <CardHeader title={s.contentTitle} description={s.contentLead} />
                <MasterclassInhalt session={x} sprachen={sprachen} canEdit={canEdit} t={s} rpcMessages={t.rpc} />
              </Card>

              <Card>
                <CardHeader title={s.goodiesTitle} description={s.goodiesLead} />
                <GoodiesFrage
                  sessionId={x.id}
                  details={x.format_details}
                  canEdit={canEdit}
                  save={updateFormatDetails.bind(null, x.id)}
                  wikiHref={WIKI_ANLIEFERUNG}
                  t={{
                    question: s.goodiesQuestion,
                    yes: s.goodiesYes,
                    no: s.goodiesNo,
                    none: s.goodiesNone,
                    hintYes: s.goodiesHintYes,
                    wiki: s.goodiesWiki,
                    saved: s.goodiesSaved,
                  }}
                  rpcMessages={t.rpc}
                />
              </Card>

              <Card>
                <CardHeader title={talk.speakersLabel} description={s.speakersLead} />
                <div className="flex flex-col gap-4">
                  {dazu.length > 0 ? (
                    dazu.map((sp) => <SpeakerKarte key={sp.profile_id} speaker={sp} canEdit={canEdit} t={talk} rpcMessages={t.rpc} />)
                  ) : (
                    <p className="ct-help">{talk.noSpeakerYet}</p>
                  )}
                  {canEdit && <SpeakerHinzufuegen sessionId={x.id} opsName={opsName} t={talk} rpcMessages={t.rpc} />}
                </div>
              </Card>
            </section>
          );
        })}
      </div>
    </>
  );
}
