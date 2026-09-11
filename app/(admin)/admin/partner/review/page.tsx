import { EmptyState } from "@/components/ui/EmptyState";
import { partnerAdminShell } from "../shell";
import type { ReviewItem } from "../types";
import { ReviewQueue } from "./ReviewQueue";

export const dynamic = "force-dynamic";

/** Was die Partner eingereicht haben und auf eine Entscheidung wartet. */
export default async function AdminPartnerReviewPage() {
  const shell = await partnerAdminShell("/admin/partner/review");
  if (!shell.ok) return shell.view;
  const { supabase, t, locale, frame } = shell;

  const { data: rows } = await supabase.rpc("partner_review_queue");
  const items = (rows ?? []) as ReviewItem[];

  return frame(
    t.adminPartner.reviewTitle,
    `${t.adminPartner.reviewLead} · ${items.length} ${t.adminPartner.countToReview}`,
    items.length === 0 ? (
      <EmptyState
        title={t.adminPartner.reviewEmptyTitle}
        description={t.adminPartner.reviewEmptyBody}
      />
    ) : (
      <ReviewQueue
        items={items}
        locale={locale}
        dateLocale={t.meta.dateLocale}
        t={t.adminPartner}
        common={{ none: t.common.none }}
        rpcMessages={t.rpc}
      />
    ),
  );
}
