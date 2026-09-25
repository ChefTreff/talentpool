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
import { Gaesteliste } from "@/components/partner/Gaesteliste";
import type { GastRow, GastWahl } from "@/components/partner/gaeste";
import { gastFotoAdressen } from "@/lib/partner/gaeste";
import { getPartnerScope } from "../org";
import { RueckgabeHinweis, SessionStatusBadge, rueckgabeOffen, type RueckgabeTexte } from "../Rueckgabe";
import { canEditOnboarding, type PartnerOverview } from "../types";
import { addStageGuest, registerStageGuestPhoto, removeStageGuest, updateStageGuest } from "../actions";
import { SpeakerKarte } from "./SpeakerKarte";
import { TalkGaeste } from "./TalkGaeste";
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
 * 2. **Wer spricht.** Seit PART-088 (Konrad 25.09.) legt der Partner seine
 *    Speaker vollständig an — wie Kontakte, mit Porträt — und ordnet sie dem
 *    Talk zu. Es sind Gäste (`speaker_profile.stage_guest`, PART-081): Profil in
 *    der Event-App, aber kein Portalzugang, kein Onboarding und keine
 *    Kommunikation von uns. Dieselbe Gästeliste wie auf der Standbühne. Wer
 *    früher über `partner_add_speaker` eingetragen wurde, bleibt sichtbar.
 *
 * **Die Bühne gehört uns.** Deshalb steht hier kein Formular für Titel oder
 * Beschreibung: Was auf einer Programmbühne läuft, entscheidet das
 * Programm-Team mit dem Partner. Der Partner stellt die Person, nicht das
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
  const [{ data: overviewJson }, { data: sessionRows }, { data: speakerRows }, { data: gastZeilen }, vocab] = await Promise.all([
    supabase.rpc("partner_overview", args),
    supabase.rpc("partner_format_sessions", args),
    supabase.rpc("partner_speakers", args),
    supabase.rpc("partner_stage_guests", args),
    // Formate und Freigabestand kommen aus dem Vokabular, nicht aus dem Code:
    // dasselbe Wort wie im Speaker-Portal und im Programmboard.
    loadVocabMap(supabase, locale),
  ]);
  const formatLabel = vgroup(vocab, "session_format");
  const statusLabel = vgroup(vocab, "publish_status");
  const rueckgabe: RueckgabeTexte = {
    badge: t.partner.returnedBadge,
    title: t.partner.returnedTitle,
    next: t.partner.returnedNext,
  };

  const overview = (overviewJson ?? null) as PartnerOverview | null;
  const alleSessions = (sessionRows ?? []) as PartnerFormatSession[];
  const speakers = (speakerRows ?? []) as PartnerSpeaker[];
  const s = t.partnerTalk;
  const canEdit = overview ? canEditOnboarding(overview.roles, overview.team) : false;

  // PART-089: Programmpunkte auf der eigenen Standbühne gehören zur Standbühne, nicht hierher.
  const buehnenIds = [...new Set(alleSessions.map((x) => x.stage_id).filter((id): id is string => !!id))];
  const { data: buehnen } = buehnenIds.length
    ? await supabase.from("stage").select("id, type").in("id", buehnenIds)
    : { data: [] as { id: string; type: string | null }[] };
  const standbuehnen = new Set(((buehnen ?? []) as { id: string; type: string | null }[])
    .filter((b) => b.type === "partner_booth").map((b) => b.id));
  const sessions = alleSessions.filter(
    (x) => TALK_FORMATE.has(x.format) && !(x.stage_id && standbuehnen.has(x.stage_id)),
  );

  // PART-088: die Gäste der Organisation — angelegt unten, zugeordnet am Talk.
  const gastRoh = (gastZeilen ?? []) as Omit<GastRow, "photo_url">[];
  const adressen = await gastFotoAdressen(
    supabase,
    gastRoh.map((g) => g.photo_path).filter((pfad): pfad is string => !!pfad),
  );
  const gaeste: GastRow[] = gastRoh.map((g) => ({ ...g, photo_url: g.photo_path ? adressen.get(g.photo_path) ?? null : null }));
  const gastName = (g: GastRow) => [g.first_name, g.last_name].filter(Boolean).join(" ");
  const wahl: GastWahl[] = gaeste.map((g) => ({ profile_id: g.profile_id, person_id: g.person_id, name: gastName(g) }));
  const zuordnungTexte = {
    label: s.speakersLabel,
    none: s.noSpeakerYet,
    noGuests: s.assignNone,
    choose: s.assignChoose,
    add: s.assignAdd,
    remove: s.assignRemove,
    assigned: s.assigned,
    unassigned: s.unassigned,
  };
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
      <PageHeader word={t.partner.wordStage} title={s.title} description={s.lead} />

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
                    <SessionStatusBadge
                      publishStatus={x.publish_status}
                      returnNote={x.return_note}
                      statusLabel={statusLabel}
                      t={rueckgabe}
                    />
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

                {/* PART-083: was die Programmleitung geändert haben möchte. */}
                {rueckgabeOffen(x) && (
                  <RueckgabeHinweis
                    className="mt-4"
                    note={x.return_note}
                    returnedAt={x.returned_at}
                    dateLocale={t.meta.dateLocale}
                    t={rueckgabe}
                  />
                )}

                <div className="mt-5 flex flex-col gap-4 border-t border-border pt-4">
                  <TalkGaeste
                    sessionId={x.id}
                    speakers={gaeste
                      .filter((g) => g.sessions.some((z) => z.session_id === x.id))
                      .map((g) => ({ person_id: g.person_id, name: gastName(g) }))}
                    gaeste={wahl}
                    canEdit={canEdit}
                    t={zuordnungTexte}
                    rpcMessages={t.rpc}
                  />
                  {/* Früher über partner_add_speaker eingetragen (mit Portalzugang) — bleibt sichtbar und pflegbar. */}
                  {dazu.length > 0 && (
                    <div className="flex flex-col gap-4">
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
                </div>
              </Card>
            );
          })}

          <p className="ct-help">{s.programmeHint}</p>
        </div>
      )}

      {/* PART-088: eure Speaker — dieselbe Liste wie unter Standbühne → Gäste. Auch ohne Slot,
          damit der Partner seine Speaker schon anlegen kann. */}
      <section aria-label={s.guestsTitle} className="mt-10">
        <Gaesteliste
          orgId={current.org_id}
          gaeste={gaeste}
          canManage={canEdit}
          actions={{
            add: addStageGuest,
            update: updateStageGuest,
            remove: removeStageGuest,
            registerPhoto: registerStageGuestPhoto,
          }}
          dateLocale={t.meta.dateLocale}
          t={{
            ...t.partnerGuests,
            title: s.guestsTitle,
            lead: s.guestsLead,
            add: s.guestsAdd,
            addTitle: s.guestsAdd,
            emptyTitle: s.guestsEmptyTitle,
            emptyBody: s.guestsEmptyBody,
          }}
          rpcMessages={t.rpc}
        />
      </section>
    </>
  );
}
