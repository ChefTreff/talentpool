import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/lib/i18n/shared";
import { sendViaResend } from "./client";
import { findBuiltin, type MailTemplate } from "./templates";
import {
  fillVars,
  markdownToHtml,
  markdownToText,
  wrapHtml,
  type MailVars,
} from "./render";

export type MailStatus =
  | "queued"
  | "sent"
  | "delivered"
  | "bounced"
  | "complained"
  | "failed"
  | "suppressed";

export type SendResult = {
  status: MailStatus;
  providerId: string | null;
  error?: string;
  /** true, wenn ohne RESEND_API_KEY nur geloggt wurde. */
  dryRun?: boolean;
};

const DEFAULT_FROM = "noreply@chef-treff.de";

/** `RESEND_FROM` steht als blanke Adresse in der Env — Anzeigename hier ergänzen. */
function senderAddress(): string {
  const raw = (process.env.RESEND_FROM ?? DEFAULT_FROM).trim();
  return raw.includes("<") ? raw : `ChefTreff <${raw}>`;
}

/** Muss zu `public.email_hash()` passen: sha256 über lower(trim(email)), hex. */
export function emailHash(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}

/** PostgREST meldet fehlende Tabellen so — bis A4 live ist, ist das erwartbar. */
function isMissingRelation(code?: string): boolean {
  return code === "42P01" || code === "PGRST205" || code === "PGRST106";
}

/**
 * Eine Vorlage versenden.
 *
 * Ablauf: Suppression prüfen → Vorlage (DB vor eingebautem Fallback) → rendern
 * → senden bzw. im Dev ohne Key nur loggen → `mail_log` schreiben.
 *
 * Die Suppression-Liste ist nicht verhandelbar: gelöschte Adressen werden nie
 * wieder angeschrieben (Entscheidungslog 08.09.2026).
 */
export async function sendTemplate(
  key: string,
  locale: Locale | string,
  to: string,
  vars: MailVars = {},
  options: { personId?: string; idempotencyKey?: string } = {},
): Promise<SendResult> {
  const loc: Locale = isLocale(locale) ? locale : DEFAULT_LOCALE;
  const admin = createSupabaseAdminClient();

  // 1 · Suppression
  if (await isSuppressed(admin, to)) {
    await writeMailLog(admin, {
      template_key: key,
      locale: loc,
      to_email: to,
      person_id: options.personId ?? null,
      subject: null,
      status: "suppressed",
      provider_id: null,
      error: null,
    });
    return { status: "suppressed", providerId: null };
  }

  // 2 · Vorlage
  const template = await loadTemplate(admin, key, loc);
  if (!template) {
    const error = `Mail-Vorlage "${key}" (${loc}) nicht gefunden`;
    await writeMailLog(admin, {
      template_key: key,
      locale: loc,
      to_email: to,
      person_id: options.personId ?? null,
      subject: null,
      status: "failed",
      provider_id: null,
      error,
    });
    return { status: "failed", providerId: null, error };
  }

  // 3 · Rendern
  const subject = fillVars(template.subject, vars);
  const bodyMd = fillVars(template.body_md, vars);
  const html = wrapHtml(subject, markdownToHtml(bodyMd), loc);
  const text = markdownToText(bodyMd);

  // 4 · Senden — ohne Key nur loggen (lokale Entwicklung)
  const from = senderAddress();

  if (!process.env.RESEND_API_KEY) {
    const providerId = `dev-${randomUUID()}`;
    console.info(
      `[mail:dev] ${key}/${loc} → ${to}\n  Betreff: ${subject}\n${text.replace(/^/gm, "  ")}`,
    );
    await writeMailLog(admin, {
      template_key: key,
      locale: loc,
      to_email: to,
      person_id: options.personId ?? null,
      subject,
      status: "sent",
      provider_id: providerId,
      error: null,
    });
    return { status: "sent", providerId, dryRun: true };
  }

  const res = await sendViaResend({
    from,
    to,
    subject,
    html,
    text,
    idempotencyKey: options.idempotencyKey,
  });

  const status: MailStatus = res.ok ? "sent" : "failed";
  await writeMailLog(admin, {
    template_key: key,
    locale: loc,
    to_email: to,
    person_id: options.personId ?? null,
    subject,
    status,
    provider_id: res.ok ? res.providerId : null,
    error: res.ok ? null : res.error,
  });

  return res.ok
    ? { status, providerId: res.providerId }
    : { status, providerId: null, error: res.error };
}

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

async function isSuppressed(admin: AdminClient, email: string): Promise<boolean> {
  const { data, error } = await admin
    .from("suppression")
    .select("email_hash")
    .eq("email_hash", emailHash(email))
    .maybeSingle();
  if (error && !isMissingRelation(error.code)) {
    console.warn("[mail] Suppression-Prüfung fehlgeschlagen:", error.message);
  }
  return Boolean(data);
}

/** Aktive DB-Vorlage gewinnt; sonst die eingebaute (PK ist (key, locale)). */
async function loadTemplate(
  admin: AdminClient,
  key: string,
  locale: Locale,
): Promise<MailTemplate | null> {
  const { data, error } = await admin
    .from("mail_template")
    .select("key,locale,subject,body_md,version")
    .eq("key", key)
    .eq("locale", locale)
    .eq("active", true)
    .maybeSingle();

  if (error && !isMissingRelation(error.code)) {
    console.warn("[mail] mail_template nicht lesbar:", error.message);
  }
  if (data) return data as MailTemplate;
  return findBuiltin(key, locale);
}

async function writeMailLog(
  admin: AdminClient,
  row: {
    template_key: string;
    locale: Locale;
    to_email: string;
    person_id: string | null;
    subject: string | null;
    status: MailStatus;
    provider_id: string | null;
    error: string | null;
  },
): Promise<void> {
  const sentStates: MailStatus[] = ["sent", "delivered"];
  const { error } = await admin.from("mail_log").insert({
    ...row,
    provider: "resend",
    sent_at: sentStates.includes(row.status) ? new Date().toISOString() : null,
  });
  if (!error) return;
  if (isMissingRelation(error.code)) {
    // Schema v2 A4 (`mail_log`) ist noch nicht live — Versand trotzdem nachvollziehbar.
    console.info(
      `[mail:log] ${row.template_key}/${row.locale} → ${row.to_email}: ${row.status}` +
        (row.provider_id ? ` (${row.provider_id})` : "") +
        (row.error ? ` — ${row.error}` : ""),
    );
    return;
  }
  console.warn("[mail] mail_log konnte nicht geschrieben werden:", error.message);
}
