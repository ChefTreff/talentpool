import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * Löschfrist der Award-Ansprechperson (K-51): täglich (vercel.json) leert
 * `award_purge_contacts` Vor-, Nachname und E-Mail aller Bewerbungen, deren
 * Edition mehr als 14 Monate vorbei ist. Bewerbung und Stimmen bleiben. Nur mit
 * `CRON_SECRET`, Service-Rolle erst nach der Prüfung; Audit schreibt die Funktion.
 */
export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data, error } = await createSupabaseAdminClient().rpc("award_purge_contacts");
  if (error) {
    console.error("[cron/award-kontakte]", error.code, error.message);
    return NextResponse.json({ error: "purge_failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, purged: Number(data ?? 0) });
}
