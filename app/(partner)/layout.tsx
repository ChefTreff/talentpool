import type { ReactNode } from "react";
import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SidebarShell, type SidebarGroup } from "@/components/layout/SidebarShell";
import { getPartnerScope } from "./partner/org";
import { visibleNavKeys, type PartnerNavKey } from "./partner/nav";
import { OrgSwitcher } from "./partner/OrgSwitcher";
import { orgLabel, type PartnerOverview } from "./partner/types";

export const dynamic = "force-dynamic";

/** Rollen-Postfach statt Personen (Antwort 71). */
const PARTNER_MAILBOX = "partner@chef-treff.de";

/**
 * Partner-Bereich: Rollen `partner_contact` und `standbuehne_editor`, Scope
 * Organisation. **Deutsch zuerst** (Arbeitsauftrag C) — `getI18n("de")` greift
 * nur, wenn die Person keine Sprache gewählt hat.
 *
 * Die Menüpunkte folgen den gebuchten Leistungen, nicht den Rollen
 * (`visibleNavKeys`). Gefiltert wird zusätzlich gegen das, was es schon gibt:
 * Tickets, Bewerber, Bühne und Shop kommen in späteren Bausteinen.
 */
export default async function PartnerLayout({ children }: { children: ReactNode }) {
  await requireArea("partner");
  const { t } = await getI18n("de");
  const { orgs, current } = await getPartnerScope();

  // Ohne Organisation gibt es nichts zu navigieren; die Seite erklärt es.
  if (!current) {
    return (
      <SidebarShell area="partner" label={t.areas.partner.name} groups={[]} rootHref="/partner">
        {children}
      </SidebarShell>
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data: overviewJson } = await supabase.rpc("partner_overview", {
    p_org_id: current.org_id,
    p_edition_id: current.edition_id,
  });
  const overview = (overviewJson ?? null) as PartnerOverview | null;
  const allowed = new Set<PartnerNavKey>(visibleNavKeys(overview?.products ?? []));

  // Was in diesem Baustein schon existiert. Der Rest steht in `visibleNavKeys`
  // bereit und wird hier freigeschaltet, sobald die Seite dazukommt.
  const PAGES: Partial<Record<PartnerNavKey, { href: string; label: string }>> = {
    dashboard: { href: "/partner", label: t.partner.navDashboard },
    onboarding: { href: "/partner/onboarding", label: t.partner.navCompany },
    contacts: { href: "/partner/kontakte", label: t.partner.navContacts },
  };

  const pick = (keys: PartnerNavKey[]) =>
    keys.filter((k) => allowed.has(k) && PAGES[k]).map((k) => PAGES[k]!);

  const groups: SidebarGroup[] = [
    { label: t.partner.groupOverview, items: pick(["dashboard"]) },
    { label: t.partner.groupCompany, items: pick(["onboarding", "contacts"]) },
    { label: t.partner.groupSummit, items: pick(["checklist", "files", "tickets", "shop"]) },
    { label: t.partner.groupFormats, items: pick(["applicants", "stage"]) },
  ];

  return (
    <SidebarShell
      area="partner"
      label={t.areas.partner.name}
      groups={groups}
      rootHref="/partner"
      header={
        <OrgSwitcher
          orgs={orgs.map((o) => ({ id: o.org_id, label: orgLabel(o) }))}
          currentId={current.org_id}
          label={t.partner.orgSwitch}
        />
      }
      footer={
        <div className="px-2.5">
          <h2 className="ct-eyebrow mb-1 text-on-navy-muted">{t.partner.groupSupport}</h2>
          {/* Rollen-Postfach, keine privaten Kontaktdaten (Arbeitsauftrag C). */}
          <a
            href={`mailto:${PARTNER_MAILBOX}`}
            className="text-[14px] font-semibold text-on-navy underline"
          >
            {PARTNER_MAILBOX}
          </a>
        </div>
      }
    >
      {children}
    </SidebarShell>
  );
}
