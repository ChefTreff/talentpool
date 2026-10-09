import { EmptyState } from "@/components/ui/EmptyState";
import { FristenVerwaltung } from "@/components/fristen/FristenVerwaltung";
import { NEUE_ZIELGRUPPE, bereichDerFrist, type Frist } from "@/lib/fristen/anzeige";
import { volunteerAdminShell } from "../shell";

export const dynamic = "force-dynamic";

/**
 * Fristen der Volunteers (ADM-099): derselbe Baustein wie unter /admin/fristen, mit der Zielgruppe `volunteer`.
 * Lesen dürfen alle internen Rollen; ändern nur, wer `deadlinesVolunteers` hat — die Knöpfe fehlen sonst, die Datenbank
 * prüft es trotzdem (`can_edit_deadline`). Gezeigt wird die Beschriftung, nie der Schlüssel; die Erinnerung steht in Tagen.
 */
export default async function AdminVolunteerDeadlinesPage() {
  const shell = await volunteerAdminShell("/admin/volunteers/fristen");
  if (!shell.ok) return shell.view;
  const { supabase, t, locale, frame } = shell;
  const d = t.admin.deadlines as Record<string, string>;

  const [uebersicht, { data: events }, { data: darf }] = await Promise.all([
    supabase.rpc("deadlines_overview"),
    supabase.from("event").select("id, name, slug").eq("is_edition", true).order("start_date", { ascending: false }),
    supabase.rpc("can_edit_deadline", { p_audience: NEUE_ZIELGRUPPE.volunteers }),
  ]);
  const fristen = ((uebersicht.data ?? []) as Frist[]).filter((f) => bereichDerFrist(f.audience) === "volunteers");
  const editionen = ((events ?? []) as { id: string; name: string | null; slug: string }[]).map((e) => ({ id: e.id, name: e.name ?? e.slug }));

  return frame(
    t.adminVolunteers.deadlinesTitle,
    t.adminVolunteers.deadlinesLead,
    editionen.length === 0 ? (
      <EmptyState title={d.emptyTitle} description={d.emptyBody} />
    ) : uebersicht.error ? (
      <EmptyState title={d.loadFailed} description={d.loadFailedBody} />
    ) : (
      <FristenVerwaltung
        fristen={fristen}
        editionen={editionen}
        neueZielgruppe={NEUE_ZIELGRUPPE.volunteers}
        darfAnlegen={darf === true}
        locale={locale}
        dateLocale={t.meta.dateLocale}
        t={d}
        common={{ cancel: t.common.cancel, save: t.common.save, none: t.common.none }}
        rpcMessages={t.rpc}
      />
    ),
  );
}
