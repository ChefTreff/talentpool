import { notFound } from "next/navigation";
import Link from "next/link";
import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { speakerNotiz } from "@/lib/partner/speaker-notiz";
import { loadVocabMap, vgroup } from "@/lib/vocab";
import { Badge } from "@/components/ui/Badge";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { getPartnerScope } from "../org";
import { RueckgabeHinweis, SessionStatusBadge, rueckgabeOffen, type RueckgabeTexte } from "../Rueckgabe";
import { canEditOnboarding, type PartnerOverview } from "../types";
import { SpeakerHinzufuegen } from "./SpeakerHinzufuegen";
import { SpeakerTabelle } from "./SpeakerTabelle";
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
 * 2. **Wer spricht.** Speaker eines gebuchten Slots sind reguläre Speaker
 *    (PART-091, Konrad 25.09., Korrektur zu PART-088 — Gäste ohne Profil gibt
 *    es nur auf der Standbühne). Beim Eintragen fragt die Seite, ob die Person
 *    einen eigenen Zugang bekommt oder ob der Partner alles rund um den Slot
 *    verwaltet; dann läuft die Kommunikation über seinen Operations-Kontakt.
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
  const [{ data: overviewJson }, { data: sessionRows }, { data: speakerRows }, { data: kontaktZeilen }, vocab] = await Promise.all([
    supabase.rpc("partner_overview", args),
    supabase.rpc("partner_format_sessions", args),
    supabase.rpc("partner_speakers", args),
    // PART-091: der Operations-Kontakt, über den im Verwaltet-Fall alles läuft.
    supabase.rpc("partner_contacts", { p_org_id: current.org_id }),
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

  // PART-091: Operations-Kontakt (`primary_ops`, je Organisation höchstens einer).
  const ops = ((kontaktZeilen ?? []) as { first_name: string | null; last_name: string | null; roles: string[] | null }[])
    .find((k) => (k.roles ?? []).includes("primary_ops"));
  const opsName = ops ? [ops.first_name, ops.last_name].filter(Boolean).join(" ") || null : null;
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
            // PART-136: was für alle Speaker gilt, steht einmal unter der Tabelle statt bei jedem Namen (dieselbe Regel wie auf der Masterclass-Seite).
            const notiz = speakerNotiz(dazu, s);
            return (
              <Card key={x.id}>
                {/* PART-136: der Session-Titel ist die Überschrift der Karte (`h2`, `ct-h2`); „Wer spricht“ ist die
                    Überschrift darunter (`h3`), die Namen sind Zeilen — jede Stufe kleiner als die über ihr. */}
                <CardHeader
                  ebene="h2"
                  title={titel(x)}
                  action={
                    <div className="flex flex-wrap justify-end gap-2">
                      <Badge>{formatLabel[x.format] ?? x.format}</Badge>
                      <SessionStatusBadge
                        publishStatus={x.publish_status}
                        returnNote={x.return_note}
                        statusLabel={statusLabel}
                        t={rueckgabe}
                      />
                    </div>
                  }
                />

                {/* Der Slot, wie im Speaker-Portal: Termin und Bühne in **einer** Zeile. */}
                <dl className="ct-small flex flex-wrap gap-x-8 gap-y-1">
                  <div className="flex gap-2">
                    <dt className="ct-label text-muted">{s.slotLabel}</dt>
                    <dd className="tabular-nums text-ink">
                      {x.starts_at
                        ? `${zeit.format(new Date(x.starts_at))}${x.ends_at ? `–${nurZeit.format(new Date(x.ends_at))}` : ""}`
                        : s.slotPending}
                    </dd>
                  </div>
                  <div className="flex gap-2">
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

                {/* PART-149 (Konrad 09.10.2026, Skill-Regel 13): „Speaker eintragen“ steht in der Kopfzeile des Blocks, rechts neben „Wer spricht“,
                    sobald es eine Liste gibt; vorher trägt der Leerzustand die eine Aktion. Nie unter der Tabelle. Das Formular öffnet im Schubfach. */}
                <div className="mt-5 flex flex-col gap-4 border-t border-border pt-4">
                  <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                    <h3 className="ct-h3 text-ink">
                      {dazu.length > 0 ? `${s.speakersLabel} (${dazu.length})` : s.speakersLabel}
                    </h3>
                    {canEdit && dazu.length > 0 && (
                      <SpeakerHinzufuegen
                        sessionId={x.id}
                        opsName={opsName}
                        t={s as unknown as Record<string, string>}
                        rpcMessages={t.rpc}
                      />
                    )}
                  </div>
                  {dazu.length > 0 ? (
                    <>
                      <SpeakerTabelle
                        speakers={dazu}
                        canEdit={canEdit}
                        t={s as unknown as Record<string, string>}
                        rpcMessages={t.rpc}
                      />
                      {notiz && <p className="ct-help">{notiz}</p>}
                    </>
                  ) : (
                    <div className="flex flex-col items-start gap-3">
                      <p className="ct-help">{s.noSpeakerYet}</p>
                      {canEdit && (
                        <SpeakerHinzufuegen
                          sessionId={x.id}
                          opsName={opsName}
                          t={s as unknown as Record<string, string>}
                          rpcMessages={t.rpc}
                        />
                      )}
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
