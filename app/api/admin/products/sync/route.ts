import { NextResponse } from "next/server";
import { requireArea } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { syncProducts, type SyncSystem } from "@/lib/products/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const SYSTEME: SyncSystem[] = ["hubspot", "sevdesk"];

/**
 * Den Produktstamm nach HubSpot und SevDesk schreiben.
 *
 * **Nur von Hand.** Kein nächtlicher Lauf: ein Abgleich, der ungefragt
 * Preise in zwei Fremdsysteme schreibt, ist genau dann gefährlich, wenn
 * niemand hinsieht. Wer den Knopf drückt, steht im Protokoll.
 *
 * Die Rolle prüft `requireArea("admin")` **vor** dem Admin-Client, und die
 * RPCs prüfen `is_partner_team()` noch einmal in der Datenbank. Der
 * `service_role`-Client fasst nur Protokoll und Fremdschlüssel an.
 */
export async function POST(request: Request) {
  const ctx = await requireArea("admin", "/admin/partner/integrationen");

  const body = (await request.json().catch(() => ({}))) as { system?: string };
  const gewuenscht = body.system;
  if (gewuenscht !== undefined && !SYSTEME.includes(gewuenscht as SyncSystem)) {
    return NextResponse.json({ error: "invalid_system" }, { status: 400 });
  }
  const systeme = gewuenscht ? [gewuenscht as SyncSystem] : SYSTEME;

  const supabase = await createSupabaseServerClient();
  const admin = createSupabaseAdminClient();
  const wer = ctx.user?.email ?? "admin";

  const ergebnisse = [];
  for (const system of systeme) {
    try {
      ergebnisse.push(await syncProducts(supabase, admin, system, wer));
    } catch (fehler) {
      const text = fehler instanceof Error ? fehler.message : String(fehler);
      console.error(`[products/sync] ${system}:`, text);
      ergebnisse.push({ system, jobId: null, created: 0, updated: 0, skipped: 0, failed: 0, error: text });
    }
  }

  // Ein Eintrag je Lauf, mit den Zählern — nicht je Artikel. Wer wissen will,
  // welcher Artikel gescheitert ist, findet ihn in `integration.sync_error`.
  await logAudit({
    action: "product.sync",
    objectType: "product",
    objectId: systeme.join(","),
    after: { runs: ergebnisse },
  });

  return NextResponse.json({ ok: true, runs: ergebnisse });
}
