"use server";

import { revalidatePath } from "next/cache";
import { requireAdminSection } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { resolveLocale } from "@/lib/i18n";
import { sendTemplate, type MailStatus } from "@/lib/mail";
import { portalUrl } from "@/lib/mail/portal-url";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toRpcFailure } from "@/lib/rpc-error";

export type TestMailResult = {
  status: MailStatus;
  providerId: string | null;
  dryRun?: boolean;
  /** Schlüssel aus `messages` im Dictionary — den Text setzt die UI. */
  message?: "invalid_email" | "missing_site_url";
  /** Rohtext des Providers, nur zur Diagnose. */
  error?: string;
};

/** Testmail aus dem Dashboard. Rollenprüfung zuerst, dann erst der Versand. */
export async function sendTestMail(to: string): Promise<TestMailResult> {
  const { firstName } = await requireAdminSection("mail", "/admin/mail");

  const address = to.trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address)) {
    return { status: "failed", providerId: null, message: "invalid_email" };
  }

  const url = portalUrl();
  if (!url) {
    return { status: "failed", providerId: null, message: "missing_site_url" };
  }

  const locale = await resolveLocale();
  const res = await sendTemplate("test", locale, address, {
    first_name: firstName ?? "",
    portal_url: url,
    sent_at: new Date().toISOString(),
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
  });

  await logAudit({
    action: "mail.test",
    objectType: "mail",
    objectId: address,
    after: { status: res.status, provider_id: res.providerId },
  });

  revalidatePath("/admin/mail");
  return res;
}

export type LogResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; key: string; detail?: string };

function fail(error: unknown): { ok: false; key: string; detail?: string } {
  const f = toRpcFailure(error as never);
  if (f.key === "unknown" && f.raw) console.error("[admin/mail] RPC:", f.raw);
  return { ok: false, key: f.key, detail: f.detail };
}

/** Eine Zeile mit allem — die eingesetzten Variablen sind personenbezogen. */
export async function loadDetail(id: number): Promise<LogResult<Record<string, unknown>>> {
  await requireAdminSection("mail", "/admin/mail");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("mail_log_detail", { p_id: id });
  if (error) return fail(error);
  return { ok: true, data: (data ?? {}) as Record<string, unknown> };
}

/**
 * Erneut senden heisst **neu einreihen**.
 *
 * Es entsteht eine zweite Zeile mit `queued`; versendet wird sie vom selben
 * Cron wie jede andere Mail, der die Sperrliste unmittelbar davor noch einmal
 * prüft. Kein Sofortversand an der Warteschlange vorbei — sonst gäbe es zwei
 * Wege, auf denen Mails das Haus verlassen, und nur einer wäre geprüft.
 */
export async function requeue(id: number): Promise<LogResult<number>> {
  await requireAdminSection("mail", "/admin/mail");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("requeue_mail", { p_log_id: id });
  if (error) return fail(error);
  revalidatePath("/admin/mail");
  return { ok: true, data: (data ?? 0) as number };
}
