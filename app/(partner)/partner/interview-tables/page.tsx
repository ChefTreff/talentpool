import { notFound } from "next/navigation";
import Link from "next/link";
import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadVocabMap, vgroup } from "@/lib/vocab";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { InstanzWahl } from "@/components/layout/InstanzWahl";
import { profilFelderAus } from "@/components/partner/profil";
import { instanzKennung, instanzSuffix, tischWahl } from "@/lib/partner/instanz";
import { getPartnerScope } from "../org";
import { ladeFlaechen } from "../formate";
import { canEditOnboarding, type PartnerOverview } from "../types";
import type { PartnerFormatSession } from "../talk/types";
import { FormatReiter } from "../FormatReiter";
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
 *
 * **Mehrere Tische (QS-079, Konrad 09.10.2026: „bitte global immer so handhaben“):** vorher stand der Block
 * je Tisch untereinander, jedes Formular doppelt (die Felder trugen sogar dieselben Kennungen). Ab zwei Tischen
 * wählt ein Umschalter über den Reitern den Tisch (`?instanz=<Fläche>`, der Reiter trägt den Namen), und darunter
 * steht **genau ein** Block. Die Sichten (Bewerbungen, Teilnehmende, Fragen) nehmen die Wahl mit und zeigen nur die
 * Gespräche dieses Tisches. Bei einem Tisch gibt es keinen Umschalter, die Seite ist wie vorher.
 */
export default async function PartnerInterviewTablesPage({ searchParams }: { searchParams: Promise<{ instanz?: string | string[] }> }) {
  await requireArea("partner", "/partner/interview-tables");
  const { instanz } = await searchParams;
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
  // Welcher Tisch? Der gewünschte, sonst der mit einem zurückgegebenen Gespräch, sonst einer ohne Gespräche, sonst der erste.
  const { gewaehlt, instanzen } = tischWahl(flaechen.stages, sessions, instanzKennung(instanz), (n) => s.instanceNumber.replace("{n}", String(n)));

  // Dieselben Auswahlfelder wie im Teilnehmerprofil (Konrad, D1): der Partner
  // soll nach denselben Merkmalen suchen, nach denen sich Talente beschreiben —
  // seit K-94 Status, Studienfeld, Skills, Fachbereich und Kategorie.
  const profilFelder = profilFelderAus((name) => vgroup(vocab, name));

  return (
    <>
      <PageHeader word={t.partner.wordConversations} title={s.title} description={s.lead} />
      {/* QS-079: der Tisch zuerst, dann die Sicht — der Umschalter steht über den Reitern und gibt seine Wahl an sie weiter. */}
      <InstanzWahl leiste={instanzen} label={s.instanceLabel} />
      {/* PART-082: Bewerbungen, Teilnehmende und Fragen als Reiter, sobald es Slots gibt. */}
      {sessions.length > 0 && (
        <FormatReiter
          basis="/partner/interview-tables"
          erster={s.tabMain}
          suffix={instanzSuffix(instanzen)}
          t={{ label: s.title, tabApplications: t.partnerBewerbung.tabApplications, tabParticipants: t.partnerBewerbung.tabParticipants, tabQuestions: t.partnerBewerbung.tabQuestions }}
        />
      )}

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
      ) : !gewaehlt ? (
        <EmptyState title={s.noTableTitle} description={s.noTableBody} />
      ) : (
        <div>
          {instanzen && <h2 className="ct-h2 mb-3 text-ink">{gewaehlt.name}</h2>}
          <TischeView
            key={gewaehlt.id}
            orgId={current.org_id}
            editionId={current.edition_id}
            tisch={gewaehlt}
            // Ueber `stage_id`, nicht ueber den Namen (0140): zwei Tische duerfen
            // gleich heissen, und dann landeten die Gespraeche beim falschen.
            sessions={sessions.filter((x) => x.stage_id === gewaehlt.id)}
            days={flaechen.days.filter((d) => d.event_id === gewaehlt.event_id)}
            canEdit={canEdit}
            profilFelder={profilFelder}
            statusLabel={vgroup(vocab, "publish_status")}
            rueckgabe={{
              badge: t.partner.returnedBadge,
              title: t.partner.returnedTitle,
              next: t.partner.returnedNext,
            }}
            bewerbungenHref={`/partner/interview-tables/bewerbungen${instanzSuffix(instanzen)}`}
            unsaved={t.common.unsaved}
            locale={locale}
            t={s as unknown as Record<string, string>}
            rpcMessages={t.rpc}
          />
        </div>
      )}
    </>
  );
}
