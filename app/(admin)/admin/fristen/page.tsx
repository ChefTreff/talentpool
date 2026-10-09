import { requireAnyAdminSection } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionTabs } from "@/components/layout/SectionTabs";
import { FristenVerwaltung } from "@/components/fristen/FristenVerwaltung";
import {
  FRIST_BEREICHE,
  NEUE_ZIELGRUPPE,
  bereichDerFrist,
  leseBereich,
  zaehleJeBereich,
  type Frist,
} from "@/lib/fristen/anzeige";

export const dynamic = "force-dynamic";

/**
 * Die Fristen-Übersicht unter System (ADM-099): **ein Reiter je Bereich** — Speaker, Partner, Volunteers und System
 * (Award und alles, was keinem Bereich gehört). Alle internen Rollen lesen; ändern darf jede Person nur die Fristen ihres
 * Bereichs (`can_edit_deadline` in der Datenbank), die Knöpfe fehlen sonst. Derselbe Baustein steht in den Bereichsseiten
 * (Partner, Speaker, Volunteers), wo die Bereichsleitung ihre Fristen selbst pflegt.
 *
 * Angezeigt wird nur die **Beschriftung**: der Schlüssel (`award_vote_from`) ist eine Code-Schnittstelle und kommt aus der
 * Datenbank gar nicht erst mit (`deadlines_overview`). Die Erinnerung steht in Tagen.
 */
export default async function AdminDeadlinesPage({ searchParams }: { searchParams: Promise<{ bereich?: string }> }) {
  await requireAnyAdminSection(
    ["deadlines", "deadlinesSpeaker", "deadlinesPartner", "deadlinesVolunteers", "deadlinesSystem"],
    "/admin/fristen",
  );
  const { locale, t } = await getI18n();
  const { bereich } = await searchParams;
  const aktiv = leseBereich(bereich);
  const d = t.admin.deadlines as Record<string, string>;
  const supabase = await createSupabaseServerClient();

  const [uebersicht, { data: events }, { data: darf }] = await Promise.all([
    supabase.rpc("deadlines_overview"),
    supabase.from("event").select("id, name, slug").eq("is_edition", true).order("start_date", { ascending: false }),
    supabase.rpc("can_edit_deadline", { p_audience: NEUE_ZIELGRUPPE[aktiv] }),
  ]);
  const alle = (uebersicht.data ?? []) as Frist[];
  const editionen = ((events ?? []) as { id: string; name: string | null; slug: string }[]).map((e) => ({ id: e.id, name: e.name ?? e.slug }));
  const zahlen = zaehleJeBereich(alle);

  return (
    <>
      <PageHeader word={t.admin.words.deadlines} title={d.title} description={d.lead} />
      {editionen.length === 0 ? (
        <EmptyState title={d.emptyTitle} description={d.emptyBody} />
      ) : (
        <>
          <SectionTabs
            label={d.areasLabel}
            items={FRIST_BEREICHE.map((b) => ({
              href: b === "speaker" ? "/admin/fristen" : `/admin/fristen?bereich=${b}`,
              label: `${d[`area_${b}`]} (${zahlen[b]})`,
              aktiv: b === aktiv,
            }))}
          />
          {uebersicht.error ? (
            <EmptyState title={d.loadFailed} description={d.loadFailedBody} />
          ) : (
            <FristenVerwaltung
              fristen={alle.filter((f) => bereichDerFrist(f.audience) === aktiv)}
              editionen={editionen}
              neueZielgruppe={NEUE_ZIELGRUPPE[aktiv]}
              darfAnlegen={darf === true}
              locale={locale}
              dateLocale={t.meta.dateLocale}
              t={d}
              common={{ cancel: t.common.cancel, save: t.common.save, none: t.common.none }}
              rpcMessages={t.rpc}
            />
          )}
        </>
      )}
    </>
  );
}
