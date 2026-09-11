import { notFound } from "next/navigation";
import { EmptyState } from "@/components/ui/EmptyState";
import { partnerAdminShell } from "../shell";
import { OrgDetail } from "./OrgDetail";
import type {
  AdminContact,
  AdminDeal,
  AdminDeliverable,
  OverviewPayload,
  RoleAssignment,
} from "./types";

export const dynamic = "force-dynamic";

/** Eine Organisation im Detail: Status, Stand, Kontakte, Checkliste, Deals. */
export default async function AdminPartnerOrgPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  const shell = await partnerAdminShell(`/admin/partner/${org}`);
  if (!shell.ok) return shell.view;
  const { supabase, t, locale, isAdmin, frame } = shell;

  const { data: overviewData, error } = await supabase.rpc("partner_overview", {
    p_org_id: org,
  });
  // P0002 `org_not_found` heisst hier schlicht: die Adresse stimmt nicht.
  if (error?.code === "P0002") notFound();
  const overview = overviewData as OverviewPayload | null;
  if (!overview) {
    return frame(
      t.adminPartner.title,
      t.adminPartner.lead,
      <EmptyState title={t.adminPartner.emptyTitle} description={t.adminPartner.emptyBody} />,
    );
  }

  const [{ data: contacts }, { data: deliverables }, { data: deals }] = await Promise.all([
    supabase.rpc("partner_contacts", { p_org_id: org }),
    supabase.rpc("my_deliverables", { p_org_id: org }),
    supabase.rpc("partner_deals", { p_org_id: org }),
  ]);

  const contactRows = (contacts ?? []) as AdminContact[];

  /**
   * Bühnen-Editoren nachschlagen. `roles_of_person` verlangt `admin` — für
   * eine Bereichsleitung Partner bleibt die Spalte deshalb leer, und die
   * Oberfläche sagt das auch.
   */
  const stageRoles: Record<string, RoleAssignment> = {};
  if (isAdmin) {
    const lists = await Promise.all(
      contactRows.map((c) => supabase.rpc("roles_of_person", { p_person_id: c.person_id })),
    );
    lists.forEach(({ data }, i) => {
      const hit = ((data ?? []) as RoleAssignment[]).find(
        (r) => r.role === "standbuehne_editor" && r.scope_id === org && r.active,
      );
      if (hit) stageRoles[contactRows[i].person_id] = hit;
    });
  }

  const name = overview.org.communication_name || overview.org.legal_name || org;

  return frame(
    name,
    `${t.adminPartner.detailLead}${overview.org.website ? ` · ${overview.org.website}` : ""}`,
    <OrgDetail
      overview={overview}
      contacts={contactRows}
      deliverables={(deliverables ?? []) as AdminDeliverable[]}
      deals={(deals ?? []) as AdminDeal[]}
      stageRoles={stageRoles}
      isAdmin={isAdmin}
      locale={locale}
      dateLocale={t.meta.dateLocale}
      t={t.adminPartner}
      common={{ cancel: t.common.cancel, none: t.common.none, save: t.common.save }}
      rpcMessages={t.rpc}
    />,
  );
}
