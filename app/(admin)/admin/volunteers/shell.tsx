import "server-only";
import type { ReactNode } from "react";
import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionTabs } from "@/components/layout/SectionTabs";

/**
 * Rahmen des Volunteer-Admins: Gate, Reiter und die Frage davor — gehört
 * diese Person zum Volunteer-Team?
 *
 * `requireArea("admin")` lässt jedes Team-Mitglied herein; die RPCs verlangen
 * `is_volunteer_team()`. Ohne diese Prüfung stünden hier nur leere Tabellen
 * statt einer Auskunft.
 */
export async function volunteerAdminShell(pathname: string): Promise<
  | {
      ok: true;
      supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
      t: Awaited<ReturnType<typeof getI18n>>["t"];
      locale: Awaited<ReturnType<typeof getI18n>>["locale"];
      frame: (title: string, description: string, children: ReactNode) => ReactNode;
    }
  | { ok: false; view: ReactNode }
> {
  await requireArea("admin", pathname);
  const { locale, t } = await getI18n();
  const supabase = await createSupabaseServerClient();
  const { data: team } = await supabase.rpc("is_volunteer_team");

  const items = [
    { href: "/admin/volunteers", label: t.adminVolunteers.tabApplications, exact: true },
    { href: "/admin/volunteers/schichten", label: t.adminVolunteers.tabShifts },
  ];

  const frame = (title: string, description: string, children: ReactNode) => (
    <>
      <PageHeader title={title} description={description} />
      <SectionTabs items={items} label={t.adminVolunteers.title} />
      {children}
    </>
  );

  if (!team) {
    return {
      ok: false,
      view: (
        <>
          <PageHeader title={t.adminVolunteers.title} description={t.adminVolunteers.lead} />
          <EmptyState
            title={t.adminVolunteers.noAccessTitle}
            description={t.adminVolunteers.noAccessBody}
          />
        </>
      ),
    };
  }

  return { ok: true, supabase, t, locale, frame };
}
