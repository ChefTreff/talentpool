import type { ReactNode } from "react";
import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SidebarShell, type SidebarGroup } from "@/components/layout/SidebarShell";
import { getPartnerScope } from "./partner/org";
import { NAV_GROUPS, visibleNavKeys, type PartnerNavKey } from "./partner/nav";
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
      <SidebarShell area="partner" label={t.areas.partner.portal} groups={[]} rootHref="/partner" locale="de">
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
  const allowed = new Set<PartnerNavKey>(
    visibleNavKeys({
      products: overview?.products ?? [],
      sessions_count: overview?.sessions_count ?? 0,
      has_stage: overview?.has_stage ?? false,
      has_booth: overview?.booth != null,
      has_allocations: (overview?.ticket_allocations.length ?? 0) > 0,
    }),
  );

  // Was in diesem Baustein schon existiert. Der Rest steht in `visibleNavKeys`
  // bereit und wird hier freigeschaltet, sobald die Seite dazukommt — deshalb
  // fehlen Masterclass, Company Tour, Side-Event, Interview Table, Hackathon,
  // Talk und Media Kit hier noch (PART-041/044–048, Bausteine B4, B6, B7, B10).
  const PAGES: Partial<Record<PartnerNavKey, { href: string; label: string }>> = {
    dashboard: { href: "/partner", label: t.partner.navDashboard },
    onboarding: { href: "/partner/onboarding", label: t.partner.navCompany },
    contacts: { href: "/partner/kontakte", label: t.partner.navContacts },
    checklist: { href: "/partner/checkliste", label: t.partner.navChecklist },
    files: { href: "/partner/dateien", label: t.partner.navFiles },
    tickets: { href: "/partner/tickets", label: t.partner.navTickets },
    eventapp: { href: "/partner/event-app", label: t.partner.navEventApp },
    booth: { href: "/partner/messestand", label: t.partner.navBooth },
    applicants: { href: "/partner/bewerber", label: t.partner.navApplicants },
    branding: { href: "/partner/branding", label: t.partner.navBranding },
    stage: { href: "/partner/buehne", label: t.partner.navStage },
    shop: { href: "/partner/shop", label: t.partner.navShop },
    wiki: { href: "/partner/wiki", label: t.partner.navWiki },
  };

  const pick = (keys: readonly PartnerNavKey[]) =>
    keys.filter((k) => allowed.has(k) && PAGES[k]).map((k) => PAGES[k]!);

  // Zwei Gruppen für die Arbeit am Summit und an den eigenen Formaten
  // (PART-042, Konrad 17.09.). Eine Gruppe ohne Einträge wird nicht gezeigt:
  // „Eure Formate" erscheint nur bei einem Partner, der welche gebucht hat.
  const groups: SidebarGroup[] = [
    { label: t.partner.groupOverview, items: pick(NAV_GROUPS.overview) },
    { label: t.partner.groupCompany, items: pick(NAV_GROUPS.company) },
    { label: t.partner.groupSummit, items: pick(NAV_GROUPS.summit) },
    { label: t.partner.groupFormats, items: pick(NAV_GROUPS.formats) },
  ].filter((g) => g.items.length > 0);

  return (
    <SidebarShell
      area="partner"
      label={t.areas.partner.portal}
      groups={groups}
      rootHref="/partner"
      locale="de"
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
            className="ct-label text-on-navy underline"
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
