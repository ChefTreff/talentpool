import Link from "next/link";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/Table";
import { partnerAdminShell } from "./shell";
import type { AdminPartnerRow } from "./types";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, BadgeTone> = {
  none: "neutral",
  invited: "warning",
  filled: "accent",
  call_done: "success",
};

/** Wer ist an Bord, wie weit sind sie, wo hakt es. */
export default async function AdminPartnerListPage() {
  const shell = await partnerAdminShell("/admin/partner");
  if (!shell.ok) return shell.view;
  const { supabase, t, frame } = shell;

  const { data: rows } = await supabase.rpc("partner_admin_overview");
  const partners = (rows ?? []) as AdminPartnerRow[];
  const dateOnly = new Intl.DateTimeFormat(t.meta.dateLocale, { dateStyle: "medium" });

  const open = partners.reduce((n, p) => n + p.deliverables_submitted, 0);
  const overdue = partners.reduce((n, p) => n + p.deliverables_overdue, 0);

  return frame(
    t.adminPartner.title,
    `${t.adminPartner.lead} · ${partners.length} ${t.adminPartner.countPartners}` +
      (open > 0 ? ` · ${open} ${t.adminPartner.countToReview}` : "") +
      (overdue > 0 ? ` · ${overdue} ${t.adminPartner.countOverdue}` : ""),
    partners.length === 0 ? (
      <EmptyState title={t.adminPartner.emptyTitle} description={t.adminPartner.emptyBody} />
    ) : (
      <Table>
        <Thead>
          <Th>{t.adminPartner.colOrg}</Th>
          <Th>{t.adminPartner.colStatus}</Th>
          <Th>{t.adminPartner.colChecklist}</Th>
          <Th>{t.adminPartner.colContacts}</Th>
          <Th>{t.adminPartner.colBooth}</Th>
          <Th>{t.adminPartner.colUpdated}</Th>
        </Thead>
        <Tbody>
          {partners.map((p) => (
            <Tr key={`${p.org_id}-${p.edition_id}`}>
              <Td>
                <Link href={`/admin/partner/${p.org_id}`} className="ct-link">
                  {p.communication_name || p.legal_name || "—"}
                </Link>
                <div className="ct-help">
                  {p.primary_email ?? t.common.none}
                  {p.hubspot_deal_id && ` · Deal ${p.hubspot_deal_id}`}
                </div>
              </Td>
              <Td>
                <Badge tone={STATUS_TONE[p.onboarding_status] ?? "neutral"}>
                  {t.adminPartner[`status_${p.onboarding_status}` as keyof typeof t.adminPartner] ??
                    p.onboarding_status}
                </Badge>
              </Td>
              <Td className="tabular-nums">
                {p.deliverables_submitted > 0 && (
                  <Badge tone="accent">
                    {p.deliverables_submitted} {t.adminPartner.shortSubmitted}
                  </Badge>
                )}{" "}
                {p.deliverables_overdue > 0 && (
                  <Badge tone="warning">
                    {p.deliverables_overdue} {t.adminPartner.shortOverdue}
                  </Badge>
                )}{" "}
                <span className="ct-help">
                  {p.deliverables_open} {t.adminPartner.shortOpen}
                </span>
              </Td>
              <Td className="tabular-nums text-muted">{p.contacts}</Td>
              <Td className="text-muted">{p.booth_number ?? "—"}</Td>
              <Td className="text-muted tabular-nums">
                {p.updated_at ? dateOnly.format(new Date(p.updated_at)) : "—"}
              </Td>
            </Tr>
          ))}
        </Tbody>
      </Table>
    ),
  );
}
