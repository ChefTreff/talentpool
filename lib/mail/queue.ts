import "server-only";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/lib/i18n/shared";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { sendViaResend } from "./client";
import { portalUrl } from "./portal-url";
import { fillVars, markdownToHtml, markdownToText, wrapHtml, type MailVars } from "./render";
import { loadTemplate, senderAddress, type AdminClient } from "./send";

export type QueueRunResult = {
  processed: number;
  sent: number;
  failed: number;
  suppressed: number;
  /** Warteschlange wurde nicht angefasst — Grund im Text (Env unvollständig). */
  skipped?: string;
};

type QueuedRow = {
  id: number;
  to_email: string;
  template_key: string | null;
  locale: string | null;
  meta: { vars?: Record<string, unknown>; attempts?: number } | null;
};

const BATCH = 50;
const MAX_ATTEMPTS = 3;

/**
 * Mail-Warteschlange abarbeiten (Zeilen in `mail_log` mit Status `queued`, älteste zuerst).
 *
 * Wer eine Mail bekommt und mit welchen Variablen, hat die Datenbank schon entschieden
 * (Trigger auf application/decision_release/registration, Migration 0020). Hier passiert
 * nur Rendern und Versand. Regeln:
 * - Suppression wird unmittelbar vor dem Versand erneut geprüft — fail-closed.
 * - Resend bekommt je Zeile einen Idempotenz-Schlüssel; ein doppelter Lauf erzeugt keine doppelte Mail.
 * - Ohne `RESEND_API_KEY` (außer lokal) oder ohne Portal-URL bleibt die Warteschlange stehen:
 *   nichts geht verloren, nichts wird fälschlich als gesendet markiert.
 * - Vorübergehende Fehler werden bis zu dreimal versucht, dann `failed` mit Fehlertext.
 */
export async function processMailQueue(): Promise<QueueRunResult> {
  const result: QueueRunResult = { processed: 0, sent: 0, failed: 0, suppressed: 0 };
  const dev = process.env.NODE_ENV === "development";
  if (!process.env.RESEND_API_KEY && !dev) {
    return { ...result, skipped: "RESEND_API_KEY fehlt – Warteschlange bleibt stehen" };
  }
  const base = portalUrl();
  if (!base) return { ...result, skipped: "NEXT_PUBLIC_SITE_URL fehlt – Warteschlange bleibt stehen" };

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("mail_log")
    .select("id,to_email,template_key,locale,meta")
    .eq("status", "queued")
    .order("queued_at")
    .limit(BATCH);
  if (error) throw new Error(`mail_log nicht lesbar: ${error.message}`);

  for (const row of (data ?? []) as QueuedRow[]) {
    result.processed += 1;
    const outcome = await deliver(admin, row, base);
    if (outcome !== "retry") result[outcome] += 1;
  }
  return result;
}

type Outcome = "sent" | "failed" | "suppressed" | "retry";

async function deliver(
  admin: AdminClient,
  row: QueuedRow,
  base: string,
): Promise<Outcome> {
  const locale: Locale = isLocale(row.locale) ? row.locale : DEFAULT_LOCALE;
  // Nur die noch wartende Zeile ändern — ein parallel laufender Cron darf nichts überschreiben.
  const finish = async (patch: Record<string, unknown>) => {
    const { error } = await admin.from("mail_log").update(patch).eq("id", row.id).eq("status", "queued");
    if (error) console.error(`[mail] mail_log ${row.id} nicht aktualisiert:`, error.message);
  };
  const fail = async (message: string): Promise<Outcome> => {
    const attempts = (row.meta?.attempts ?? 0) + 1;
    if (attempts < MAX_ATTEMPTS) {
      await finish({ error: message, meta: { ...(row.meta ?? {}), attempts } });
      return "retry";
    }
    await finish({ status: "failed", error: message, meta: { ...(row.meta ?? {}), attempts } });
    return "failed";
  };

  if (!row.template_key) return fail("template_key fehlt");

  const { data: suppressed, error: supErr } = await admin.rpc("is_suppressed", { p_email: row.to_email });
  if (supErr) return fail("Suppression-Prüfung fehlgeschlagen — nicht gesendet");
  if (suppressed) {
    const { data: hash } = await admin.rpc("email_hash", { p_email: row.to_email });
    await finish({ status: "suppressed", to_email: `suppressed:${hash ?? "unknown"}` });
    return "suppressed";
  }

  const template = await loadTemplate(admin, row.template_key, locale);
  if (!template) return fail(`Mail-Vorlage "${row.template_key}" (${locale}) nicht gefunden`);

  const vars: MailVars = {
    ...((row.meta?.vars ?? {}) as MailVars),
    portal_url: base,
    programme_url: `${base}/programm`,
  };
  const subject = fillVars(template.subject, vars);
  const bodyMd = fillVars(template.body_md, vars);
  const html = wrapHtml(subject, markdownToHtml(bodyMd), locale);
  const text = markdownToText(bodyMd);

  if (!process.env.RESEND_API_KEY) {
    // Nur lokal möglich (siehe oben): loggen statt senden, als Dry-Run markiert.
    console.info(`[mail:dev] ${row.template_key}/${locale} → ${row.to_email}\n  Betreff: ${subject}`);
    await finish({
      status: "sent",
      subject,
      provider: "dev",
      provider_id: `dev-${row.id}`,
      sent_at: new Date().toISOString(),
      meta: { ...(row.meta ?? {}), dryRun: true },
    });
    return "sent";
  }

  const res = await sendViaResend({
    from: senderAddress(),
    to: row.to_email,
    subject,
    html,
    text,
    idempotencyKey: `mail_log-${row.id}`,
  });
  if (!res.ok) return fail(res.error);
  await finish({ status: "sent", subject, provider_id: res.providerId, sent_at: new Date().toISOString() });
  return "sent";
}
