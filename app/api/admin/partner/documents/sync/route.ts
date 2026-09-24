import { NextResponse } from "next/server";
import { requireAdminSection } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { syncPartnerDocuments } from "@/lib/partner/documents-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Angebote und Rechnungen aus SevDesk holen.
 *
 * Auslöser von Hand, für den Fall, dass ein Partner jetzt nach seiner Rechnung
 * fragt und nicht erst morgen. Der nächtliche Lauf hängt am Cron
 * (`/api/cron/mail`) und braucht diese Route nicht.
 *
 * Die Rolle prüft `requireAdminSection("partner")` **vor** dem Admin-Client, und die
 * Zielliste prüft `is_partner_team()` noch einmal in der Datenbank.
 */
export async function POST() {
  const ctx = await requireAdminSection("partner", "/admin/partner/integrationen");
  const supabase = await createSupabaseServerClient();
  const admin = createSupabaseAdminClient();

  try {
    const res = await syncPartnerDocuments(supabase, admin, ctx.user?.email ?? "admin");
    await logAudit({
      action: "partner.documents_sync",
      objectType: "sevdesk",
      objectId: "documents",
      after: { ...res },
    });
    return NextResponse.json({ ok: true, ...res });
  } catch (fehler) {
    const text = fehler instanceof Error ? fehler.message : String(fehler);
    console.error("[partner/documents/sync]", text);
    return NextResponse.json({ ok: false, error: text }, { status: 500 });
  }
}
