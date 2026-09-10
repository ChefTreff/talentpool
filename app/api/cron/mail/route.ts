import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { processMailQueue } from "@/lib/mail/queue";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Nur mit `CRON_SECRET` (Vercel schickt ihn als `Authorization: Bearer …`).
 * Zeitkonstanter Vergleich, damit die Antwortzeit nichts über den Wert verrät.
 */
function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * Vercel Cron (vercel.json, alle 10 Minuten), Welle 1 A5:
 * 1. `run_application_housekeeping()` — abgelaufene Zusagen verfallen, frei gewordene
 *    Plätze gehen an die Warteliste (die Datenbank legt dabei die Mails an).
 * 2. Mail-Warteschlange verschicken (`lib/mail/queue.ts`).
 * Kein Nutzerkontext: service_role nach Prüfung des Secrets, die Route ist im Proxy
 * als öffentlich eingetragen und schützt sich selbst.
 */
export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const { data: housekeeping, error } = await admin.rpc("run_application_housekeeping");
  if (error) console.error("[cron/mail] housekeeping fehlgeschlagen:", error.message);

  const queue = await processMailQueue();
  if (queue.skipped) console.warn("[cron/mail]", queue.skipped);

  return NextResponse.json({
    ok: !error,
    housekeeping: housekeeping ?? null,
    housekeepingError: error?.message ?? null,
    queue,
  });
}
