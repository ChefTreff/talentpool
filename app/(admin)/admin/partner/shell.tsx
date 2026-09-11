import "server-only";
import type { ReactNode } from "react";
import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionTabs } from "@/components/layout/SectionTabs";

/**
 * Gemeinsamer Rahmen aller Partner-Admin-Seiten: Gate, Reiter und die eine
 * Frage, die vor allem steht — gehört diese Person zum Partner-Team?
 *
 * `requireArea("admin")` lässt jedes Team-Mitglied herein; die RPCs verlangen
 * aber `is_partner_team()` (Admin oder `area_lead_partner`). Wer das nicht
 * ist, bekäme sonst auf jeder Seite leere Tabellen statt einer Auskunft.
 */
export async function partnerAdminShell(pathname: string): Promise<
  | {
      ok: true;
      supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
      t: Awaited<ReturnType<typeof getI18n>>["t"];
      locale: Awaited<ReturnType<typeof getI18n>>["locale"];
      /** Rollen vergeben darf nur `admin`, nicht schon `area_lead_partner`. */
      isAdmin: boolean;
      frame: (title: string, description: string, children: ReactNode) => ReactNode;
    }
  | { ok: false; view: ReactNode }
> {
  const { roleNames } = await requireArea("admin", pathname);
  const { locale, t } = await getI18n();
  const supabase = await createSupabaseServerClient();
  const { data: team } = await supabase.rpc("is_partner_team");

  const items = [
    {
      href: "/admin/partner",
      label: t.adminPartner.tabList,
      exact: true,
      // Die Detailseite einer Organisation gehört zur Liste.
      detailPattern: "^/admin/partner/[0-9a-f-]{36}$",
    },
    { href: "/admin/partner/review", label: t.adminPartner.tabReview },
    { href: "/admin/partner/kontingente", label: t.adminPartner.tabAllocations },
    { href: "/admin/partner/bestellungen", label: t.adminPartner.tabOrders },
    { href: "/admin/partner/vorlagen", label: t.adminPartner.tabTemplates },
    { href: "/admin/partner/produkte", label: t.adminPartner.tabProducts },
    { href: "/admin/partner/integrationen", label: t.adminPartner.tabIntegrations },
  ];

  const frame = (title: string, description: string, children: ReactNode) => (
    <>
      <PageHeader title={title} description={description} />
      <SectionTabs items={items} label={t.adminPartner.title} />
      {children}
    </>
  );

  if (!team) {
    return {
      ok: false,
      view: (
        <>
          <PageHeader title={t.adminPartner.title} description={t.adminPartner.lead} />
          <EmptyState
            title={t.adminPartner.noAccessTitle}
            description={t.adminPartner.noAccessBody}
          />
        </>
      ),
    };
  }

  return { ok: true, supabase, t, locale, isAdmin: roleNames.includes("admin"), frame };
}
