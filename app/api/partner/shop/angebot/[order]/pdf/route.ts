import { NextResponse } from "next/server";
import { requireArea } from "@/lib/auth";
import { toRpcFailure } from "@/lib/rpc-error";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { hasSevdeskToken } from "@/lib/sevdesk/client";
import { downloadPdf } from "@/lib/sevdesk/documents";
import { statusZuSchluessel } from "@/lib/sevdesk/angebot";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Das PDF eines Angebots (PART-116) — die Partnerin lädt es nach „Angebot erstellen“ und später erneut.
 *
 * Das Recht prüft `shop_quote_info` mit dem Sitzungs-Client (Mitglied der Organisation oder Team); erst danach liest der Service-Client die SevDesk-Id aus
 * `external_ref` — die Id sehen Partner sonst nie. Das PDF wird bei SevDesk geholt und durchgereicht, **nicht bei uns abgelegt**. Ein Angebot, das zurückgezogen
 * wurde oder verfallen ist, gibt es nicht mehr heraus; im Probebetrieb gibt es kein PDF.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ order: string }> }) {
  const { order } = await params;
  await requireArea("partner", "/partner/shop/warenkorb");
  if (!UUID.test(order)) return NextResponse.json({ ok: false, error: "invalid_argument" }, { status: 400 });

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("shop_quote_info", { p_order_id: order });
  if (error) {
    const f = toRpcFailure(error);
    return NextResponse.json({ ok: false, error: f.key }, { status: statusZuSchluessel(f.key) });
  }
  const info = data as { quote_number?: string | null; active?: boolean; valid_until?: string | null; probe?: boolean; closed?: string | null } | null;
  if (!info) return NextResponse.json({ ok: false, error: "not_quoted" }, { status: 404 });
  if (info.probe) return NextResponse.json({ ok: false, error: "quote_unavailable" }, { status: 404 });
  if (info.active && !info.valid_until) return NextResponse.json({ ok: false, error: "quote_in_progress" }, { status: 409 });
  if (!info.active && info.closed !== "ordered") return NextResponse.json({ ok: false, error: "not_quoted" }, { status: 404 });
  if (!hasSevdeskToken()) return NextResponse.json({ ok: false, error: "quote_unavailable" }, { status: 503 });

  const admin = createSupabaseAdminClient();
  const { data: ref } = await admin
    .from("external_ref")
    .select("external_id")
    .eq("system", "sevdesk")
    .eq("object_type", "shop_quote")
    .eq("object_id", order)
    .maybeSingle();
  if (!ref?.external_id) return NextResponse.json({ ok: false, error: "not_quoted" }, { status: 404 });

  try {
    const bytes = await downloadPdf({ kind: "offer", id: String(ref.external_id), nummer: info.quote_number ?? null, datum: null });
    const name = `Angebot-${(info.quote_number ?? order).replace(/[^A-Za-z0-9._-]/g, "_")}.pdf`;
    return new Response(Buffer.from(bytes), {
      headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="${name}"`, "cache-control": "no-store" },
    });
  } catch {
    return NextResponse.json({ ok: false, error: "quote_failed" }, { status: 502 });
  }
}
