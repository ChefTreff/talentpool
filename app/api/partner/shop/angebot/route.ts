import { NextResponse } from "next/server";
import { requireArea } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { erstelleAngebot } from "@/lib/sevdesk/angebot";
import { angebotAbhaengigkeiten } from "@/lib/sevdesk/angebot-server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * „Angebot erstellen“ im Warenkorb (PART-116, K-81). Body: `{ orderId }`.
 *
 * Die Organisation und das Recht kommen aus der Sitzung und aus der Bestellung, nie aus dem Request: `shop_quote_begin` läuft mit dem Sitzungs-Client der
 * Partnerin und prüft `partner_can_edit`. Der Service-Client (`service_role`) trägt danach nur den Beleg ein (`record_shop_quote`) oder gibt die Bestellung wieder frei
 * (`shop_quote_abort`) — beides Funktionen, die die Datenbank keinem Partner erlaubt. Das Token für SevDesk steht nur hier auf dem Server.
 *
 * Antworten ohne Stacktrace: `{ ok: true, number, validUntil, probe }` oder `{ ok: false, error: <Schlüssel aus messages.rpc> }`. Wie das Angebot entsteht, steht
 * in `lib/sevdesk/angebot.ts`; ob überhaupt in SevDesk geschrieben wird, entscheidet `SHOP_ANGEBOT_SEVDESK` (Standard: nein).
 */
export async function POST(request: Request) {
  await requireArea("partner", "/partner/shop/warenkorb");
  let body: { orderId?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_argument" }, { status: 400 });
  }
  const orderId = typeof body.orderId === "string" && UUID.test(body.orderId) ? body.orderId : null;
  if (!orderId) return NextResponse.json({ ok: false, error: "invalid_argument" }, { status: 400 });

  const supabase = await createSupabaseServerClient();
  const admin = createSupabaseAdminClient();
  const ergebnis = await erstelleAngebot(angebotAbhaengigkeiten({ supabase, admin }), orderId);
  if (!ergebnis.ok) {
    return NextResponse.json({ ok: false, error: ergebnis.key, ...(ergebnis.detail ? { detail: ergebnis.detail } : {}) }, { status: ergebnis.status });
  }
  return NextResponse.json({ ok: true, number: ergebnis.nummer, validUntil: ergebnis.gueltigBis, probe: ergebnis.probe });
}
