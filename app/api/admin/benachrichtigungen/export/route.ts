import { requireAdminSection } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { csvCell } from "@/lib/csv";

export const dynamic = "force-dynamic";

/**
 * Export je Thema (TAL-009) — nur anschreibbare Personen (Newsletter erteilt,
 * Adresse nicht gesperrt). Wer darf und was hinausgeht, entscheidet
 * `notification_topic_export` (Abschnitt `notifications`, Audit mit Anzahl).
 * Bis zum ActiveCampaign-Sync der Weg in die Newsletter-Listen.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const topic = url.searchParams.get("topic") ?? "";
  await requireAdminSection("notifications", `/api/admin/benachrichtigungen/export${url.search}`);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("notification_topic_export", { p_topic: topic });
  if (error) {
    return new Response(error.code === "42501" ? "not allowed" : "error", { status: error.code === "42501" ? 403 : 400 });
  }
  const rows = (data ?? []) as { first_name: string | null; last_name: string | null; email: string; preferred_language: string | null }[];
  const kopf = ["Vorname", "Nachname", "E-Mail", "Sprache"].map(csvCell).join(";");
  const zeilen = rows.map((r) => [r.first_name, r.last_name, r.email, r.preferred_language].map(csvCell).join(";"));
  const datum = new Date().toISOString().slice(0, 10);
  const sauber = topic.replace(/[^a-z0-9_]/gi, "");
  return new Response(`﻿${[kopf, ...zeilen].join("\r\n")}\r\n`, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="thema-${sauber}-${datum}.csv"`,
      "cache-control": "no-store",
    },
  });
}
