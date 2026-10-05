import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { quellHash } from "@/lib/award/quelle";
import { istToken, leseLinkAntwort } from "@/lib/side-event/link";

export const dynamic = "force-dynamic";

/**
 * Zu- oder Absage über den Link aus der Einladungsmail, ohne Login (ADM-077, SPK-091).
 *
 * **Nur POST.** Mail-Scanner und Vorschau-Dienste rufen Links vorab ab; die Seite unter `/side-event/<token>` zeigt deshalb nur an, und erst
 * ein Klick auf den Knopf kommt hierher. Ein GET gibt es nicht (Next antwortet 405).
 *
 * Kein anon-RPC: `side_event_respond_by_token` ist eine Server-Funktion (EXECUTE nur service_role, mit Sitzung 42501). Sie prüft Token,
 * Eventbeginn, Veröffentlichung, Antwortfrist und Kapazität, ist idempotent und begrenzt die Anfragen je Quelle. Hier kommen nur die Form des
 * Tokens und die vorgehashte Quelle dazu (`quellHash`: die Adresse erreicht die Datenbank nie im Klartext). Zurück geht der **Zustand** — keine
 * Event-Daten, keine Person.
 */
export async function POST(request: Request) {
  let body: { token?: unknown; status?: unknown };
  try {
    body = (await request.json()) as { token?: unknown; status?: unknown };
  } catch {
    return NextResponse.json({ state: "invalid" }, { status: 400 });
  }
  const status = body?.status;
  if (!istToken(body?.token) || (status !== "yes" && status !== "no")) {
    return NextResponse.json({ state: "invalid" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("side_event_respond_by_token", {
    p_token: body.token,
    p_status: status,
    p_ip_hash: quellHash(request.headers),
  });
  if (error) {
    // Nie den Token loggen — nur Code und Meldung.
    console.error("[side-event] side_event_respond_by_token:", error.code, error.message);
    return NextResponse.json({ state: "error" }, { status: 500 });
  }
  const antwort = leseLinkAntwort(data);
  const http = antwort.state === "ok" ? 200 : antwort.state === "rate_limited" ? 429 : 409;
  return NextResponse.json({ state: antwort.state, status: antwort.status }, { status: http, headers: { "cache-control": "no-store" } });
}
