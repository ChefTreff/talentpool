import { notFound } from "next/navigation";
import Link from "next/link";
import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadVocabMap, vgroup } from "@/lib/vocab";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { getPartnerScope } from "../org";
import { canEditOnboarding, type PartnerOverview } from "../types";
import { SpeakerHinzufuegen } from "./SpeakerHinzufuegen";
import { SpeakerKarte } from "./SpeakerKarte";
import type { PartnerFormatSession, PartnerSpeaker } from "./types";

export const dynamic = "force-dynamic";

/** Formate, die auf einer Bühne des Programms stattfinden (PART-044). */
const TALK_FORMATE = new Set(["keynote", "panel", "talk", "impulse", "fireside_chat"]);

/**
 * Talk (PART-044). Die Seite erscheint, sobald ein Produkt mit
 * `format_key = 'talk'` gebucht ist.
 *
 * Zwei Dinge, die ein Partner heute an zwei Orten sucht:
 *
 * 1. **Der Slot, gespiegelt aus dem Speaker-Portal.** Termin, Bühne und Tag,
 *    dazu der Freigabestand. Der Partner soll nicht seine Speakerin fragen
 *    müssen, wann er auftritt — und wir wollen nicht, dass er beim Team
 *    nachfragt, was ohnehin in der Datenbank steht.
 * 2. **Wer spricht.** Er trägt die Person selbst ein, wie ein Stage Lead. Sie
 *    bekommt das normale Speaker-Onboarding mit eigenem Zugang; bis sie sich
 *    anmeldet, darf der Partner ihre Programmangaben pflegen (0139).
 *
 * **Die Bühne gehört uns.** Deshalb steht hier kein Formular für Titel oder
 * Beschreibung: Was auf einer Programmbühne läuft, entscheidet das
 * Programm-Team mit der Speakerin. Der Partner stellt die Person, nicht das
 * Programm. Side-Event und Interview Table sind der andere Fall — dort legt
 * er selbst an (B7).
 */
export default async function PartnerTalkPage() {
  await requireArea("partner", "/partner/talk");
  const { locale, t } = await getI18n("de");
  const { current } = await getPartnerScope();
  if (!current) notFound();

  const supabase = await createSupabaseServerClient();
  const args = { p_org_id: current.org_id, p_edition_id: current.edition_id };
  const [{ data: overviewJson }, { data: sessionRows }, { data: speakerRows }, vocab] = await Promise.all([
    supabase.rpc("partner_overview", args),
    supabase.rpc("partner_format_sessions", args),
    supabase.rpc("partner_speakers", args),
    // Formate und Freigabestand kommen aus dem Vokabular, nicht aus dem Code:
    // dasselbe Wort wie im Speaker-Portal und im Programmboard.
    loadVocabMap(supabase, locale),
  ]);
  const formatLabel = vgroup(vocab, "session_format");
  const statusLabel = vgroup(vocab, "publish_status");

  const overview = (overviewJson ?? null) as PartnerOverview | null;
  const alleSessions = (sessionRows ?? []) as PartnerFormatSession[];
  const speakers = (speakerRows ?? []) as PartnerSpeaker[];
  const s = t.partnerTalk;
  const canEdit = overview ? canEditOnboarding(overview.roles, overview.team) : false;

  const sessions = alleSessions.filter((x) => TALK_FORMATE.has(x.format));
  const gebucht = (overview?.products ?? []).filter((p) => p.format_key === "talk");

  const zeit = new Intl.DateTimeFormat(t.meta.dateLocale, {
    weekday: "long",
    day: "2-digit",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Berlin",
  });
  const nurZeit = new Intl.DateTimeFormat(t.meta.dateLocale, {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Berlin",
  });

  const titel = (x: PartnerFormatSession) =>
    (locale === "en" ? x.title_en : x.title_de) ?? x.title_de ?? s.untitled;

  return (
    <>
      <PageHeader title={s.title} description={s.lead} />

      {sessions.length === 0 ? (
        // Gebucht, aber noch kein Slot: das ist der Normalfall am Anfang und
        // kein Fehler. Deshalb sagt die Seite, worauf gewartet wird.
        <EmptyState
          title={gebucht.length > 0 ? s.pendingTitle : s.emptyTitle}
          description={gebucht.length > 0 ? s.pendingBody : s.emptyBody}
          action={
            <Link href="/partner/checkliste" className="ct-link">
              {s.toChecklist}
            </Link>
          }
        />
      ) : (
        <div className="flex flex-col gap-4">
          {sessions.map((x) => {
            const dazu = speakers.filter((sp) => sp.session_id === x.id);
            return (
              <Card key={x.id}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="ct-h3 text-ink">{titel(x)}</h2>
                  <div className="flex flex-wrap gap-2">
                    <Badge>{formatLabel[x.format] ?? x.format}</Badge>
                    <Badge tone={x.publish_status === "published" ? "success" : "neutral"}>
                      {statusLabel[x.publish_status] ?? x.publish_status}
                    </Badge>
                  </div>
                </div>

                {/* Der Slot, wie im Speaker-Portal: Termin, Bühne, Tag. */}
                <dl className="ct-small mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
                  <div>
                    <dt className="ct-label text-muted">{s.slotLabel}</dt>
                    <dd className="tabular-nums text-ink">
                      {x.starts_at
                        ? `${zeit.format(new Date(x.starts_at))}${x.ends_at ? `–${nurZeit.format(new Date(x.ends_at))}` : ""}`
                        : s.slotPending}
                    </dd>
                  </div>
                  <div>
                    <dt className="ct-label text-muted">{s.stageLabel}</dt>
                    <dd className="text-ink">{x.stage_name ?? s.stagePending}</dd>
                  </div>
                </dl>

                <div className="mt-5 border-t border-border pt-4">
                  <h3 className="ct-label text-muted">{s.speakersLabel}</h3>
                  {dazu.length === 0 ? (
                    <p className="ct-help mt-2">{s.noSpeakerYet}</p>
                  ) : (
                    <div className="mt-3 flex flex-col gap-4">
                      {dazu.map((sp) => (
                        <SpeakerKarte
                          key={sp.profile_id}
                          speaker={sp}
                          canEdit={canEdit}
                          t={s as unknown as Record<string, string>}
                          rpcMessages={t.rpc}
                        />
                      ))}
                    </div>
                  )}
                  {canEdit && (
                    <div className="mt-4">
                      <SpeakerHinzufuegen
                        sessionId={x.id}
                        t={s as unknown as Record<string, string>}
                        rpcMessages={t.rpc}
                      />
                    </div>
                  )}
                </div>
              </Card>
            );
          })}

          <p className="ct-help">{s.programmeHint}</p>
        </div>
      )}
    </>
  );
}
