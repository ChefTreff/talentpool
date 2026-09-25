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
import { FormatReiter } from "../FormatReiter";
import { SideEventView } from "./SideEventView";

export const dynamic = "force-dynamic";

/**
 * Side-Event (PART-047). Die Seite erscheint bei gebuchtem Produkt
 * `format_key = 'side_event'` (heute I-81745).
 *
 * Anders als beim Talk legt der Partner hier **selbst** an. Zwei Dinge müssen
 * dafür stimmen, und beide können unabhängig voneinander fehlen:
 *
 * * **ein Anspruch** aus den gebuchten Produkten — wie viele Side-Events er
 *   noch anlegen darf, rechnet `partner_entitlement` in der Datenbank;
 * * **eine Fläche**, die das Team ihm zugeordnet hat (`stage` vom Typ
 *   `side_event_venue`). Ohne sie gäbe es keinen Slot, an dem die Zeit hängt.
 *
 * Die Seite unterscheidet die beiden Fälle, statt einen gemeinsamen
 * Leerzustand zu zeigen: „noch nichts gebucht" und „wir ordnen euch noch einen
 * Ort zu" sind für den Partner zwei verschiedene Nachrichten, und nur bei
 * einer davon kann er selbst etwas tun.
 */
export default async function PartnerSideEventPage() {
  await requireArea("partner", "/partner/side-event");
  const { locale, t } = await getI18n("de");
  const { current } = await getPartnerScope();
  if (!current) notFound();

  const supabase = await createSupabaseServerClient();
  const args = { p_org_id: current.org_id, p_edition_id: current.edition_id };
  const [{ data: overviewJson }, { data: sessionRows }, vocab, flaechen] = await Promise.all([
    supabase.rpc("partner_overview", args),
    supabase.rpc("partner_format_sessions", { ...args, p_format: "side_event" }),
    loadVocabMap(supabase, locale),
    ladeFlaechen(supabase, current.org_id, "side_event_venue"),
  ]);

  const overview = (overviewJson ?? null) as PartnerOverview | null;
  const sessions = (sessionRows ?? []) as PartnerFormatSession[];
  const s = t.partnerSideEvent;
  const canEdit = overview ? canEditOnboarding(overview.roles, overview.team) : false;

  const gebucht = (overview?.products ?? [])
    .filter((p) => p.format_key === "side_event")
    .reduce((n, p) => n + (p.qty ?? 0), 0);
  // Dieselbe Rechnung wie `partner_entitlement`, nur zur Anzeige. **Die
  // verbindliche Prüfung sitzt in der Datenbank** — hier geht es nur darum,
  // ob wir den Knopf zeigen.
  const frei = Math.max(gebucht - sessions.length, 0);

  return (
    <>
      <PageHeader word={t.partner.wordInvitation} title={s.title} description={s.lead} />
      {/* PART-082: Bewerbungen, Teilnehmende und Fragen als Reiter, sobald es ein Side-Event gibt. */}
      {sessions.length > 0 && (
        <FormatReiter
          basis="/partner/side-event"
          erster={s.tabMain}
          t={{ label: s.title, tabApplications: t.partnerBewerbung.tabApplications, tabParticipants: t.partnerBewerbung.tabParticipants, tabQuestions: t.partnerBewerbung.tabQuestions }}
        />
      )}

      {gebucht === 0 ? (
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
        <EmptyState title={s.noVenueTitle} description={s.noVenueBody} />
      ) : (
        <SideEventView
          orgId={current.org_id}
          editionId={current.edition_id}
          sessions={sessions}
          stages={flaechen.stages}
          days={flaechen.days}
          canEdit={canEdit}
          frei={frei}
          statusLabel={vgroup(vocab, "publish_status")}
          rueckgabe={{
            badge: t.partner.returnedBadge,
            title: t.partner.returnedTitle,
            next: t.partner.returnedNext,
          }}
          locale={locale}
          t={s as unknown as Record<string, string>}
          rpcMessages={t.rpc}
        />
      )}
    </>
  );
}
