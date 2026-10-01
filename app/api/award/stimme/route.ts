import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { alsZustand, quellHash } from "@/lib/award/quelle";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Öffentliche Stimme zum Initiativen-Award (ADM-024), ohne Login.
 *
 * Kein anon-RPC: `award_vote_cast` ist eine Server-Funktion (EXECUTE nur
 * service_role, mit Sitzung 42501) und prüft Status, Frist, eine Stimme je
 * Quelle und Bewerbung sowie die Ratenbegrenzung. Hier kommt nur die
 * vorgehashte Quelle dazu — die Adresse selbst verlässt diese Route nicht.
 * Erwartete Zustände kommen als Wert zurück (`ok`, `duplicate`, `closed` …).
 */
export async function POST(request: Request) {
  let id: unknown;
  try {
    id = ((await request.json()) as { id?: unknown })?.id;
  } catch {
    return NextResponse.json({ status: "invalid" }, { status: 400 });
  }
  if (typeof id !== "string" || !UUID.test(id)) return NextResponse.json({ status: "invalid" }, { status: 400 });

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("award_vote_cast", { p_application_id: id, p_ip_hash: quellHash(request.headers) });
  if (error) {
    console.error("[award] award_vote_cast:", error.code, error.message);
    return NextResponse.json({ status: "error" }, { status: 500 });
  }
  const status = alsZustand(data);
  return NextResponse.json({ status }, { status: status === "ok" || status === "duplicate" ? 200 : 409 });
}
