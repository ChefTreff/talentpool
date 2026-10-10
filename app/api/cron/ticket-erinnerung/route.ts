import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { versendeTicketMail } from "@/lib/vivenu/transaktion";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * Ticketmail und Erinnerung (TAL-019 Teil 3, K-93). Zwei kleine Schritte, beide idempotent:
 * 1. Tickets, die im Portal vollständig personalisiert und bei vivenu angekommen sind, deren Versand aber noch offen ist (Fehler oder Schalter
 *    `VIVENU_WRITE_ENABLED` aus), lässt vivenu jetzt per Mail an die Inhaber-Adresse schicken (`tickets_mail_pending`, `versendeTicketMail`).
 * 2. Wer die Angaben nach sieben Tagen noch nicht ergänzt hat, bekommt **eine** Erinnerung über die Mail-Warteschlange (`remind_ticket_personalization`,
 *    Vorlage `ticket_personalization_reminder`, im Admin editierbar).
 * Die Erinnerung hängt nicht an vivenu und läuft auch ohne Schlüssel. Ein Fehler in Schritt 1 hält Schritt 2 nicht auf.
 */
export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const admin = createSupabaseAdminClient();
  const stats = { mail_ok: 0, mail_open: 0, mail_error: 0, reminded: 0 };

  const { data: zuSenden, error: offenFehler } = await admin.rpc("tickets_mail_pending", { p_limit: 50 });
  if (offenFehler) console.error("[cron/ticket-erinnerung] Versand offen:", offenFehler.message);
  for (const row of (zuSenden ?? []) as { ticket_id: string }[]) {
    const r = await versendeTicketMail(admin, row.ticket_id);
    if (r === "ok") stats.mail_ok += 1;
    else if (r === "fehler") stats.mail_error += 1;
    else stats.mail_open += 1;
  }

  const { data: erinnert, error: erinnerFehler } = await admin.rpc("remind_ticket_personalization");
  if (erinnerFehler) console.error("[cron/ticket-erinnerung] Erinnerung:", erinnerFehler.message);
  stats.reminded = Number(erinnert ?? 0);

  return NextResponse.json({ ok: !offenFehler && !erinnerFehler, ...stats });
}
