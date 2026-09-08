import "server-only";
import { randomUUID } from "node:crypto";
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
  /** true, wenn lokal ohne `RESEND_API_KEY` nur geloggt statt gesendet wurde. */
  dryRun?: boolean;
};

const DEFAULT_FROM = "noreply@chef-treff.de";

/** `RESEND_FROM` steht als blanke Adresse in der Env — Anzeigename hier ergänzen. */
function senderAddress(): string {
  const raw = (process.env.RESEND_FROM ?? DEFAULT_FROM).trim();
  return raw.includes("<") ? raw : `ChefTreff <${raw}>`;
}

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

type MailLogRow = {
  template_key: string;
  locale: Locale;
  to_email: string;
  person_id: string | null;
  subject: string | null;
  provider: string;
  provider_id: string | null;
  status: MailStatus;
  error: string | null;
  meta: Record<string, unknown> | null;
};

/**
 * Eine Vorlage versenden.
 *
 * Ablauf: Suppression prüfen → Vorlage (Datenbank ist kanonisch) → rendern
 * → senden → `mail_log` schreiben.
 *
 * Die Suppression-Liste ist nicht verhandelbar: gelöschte Adressen werden nie
 * wieder angeschrieben (Entscheidungslog 08.09.2026). Deshalb ist die Prüfung
 * fail-closed — kann sie nicht beantwortet werden, wird nicht gesendet.
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
  const personId = options.personId ?? null;

  const base = {
    template_key: key,
    locale: loc,
    to_email: to,
    person_id: personId,
    subject: null,
    provider: "resend",
    provider_id: null,
    status: "queued" as MailStatus,
    error: null,
    meta: null,
  } satisfies MailLogRow;

  // 1 · Suppression — fail-closed
  const suppressed = await isSuppressed(admin, to);
  if (suppressed === "error") {
    const error = "Suppression-Prüfung fehlgeschlagen — nicht gesendet";
    await writeMailLog(admin, { ...base, status: "failed", error });
    return { status: "failed", providerId: null, error };
  }
  if (suppressed) {
    // Die Adresse wurde gelöscht — sie darf nicht erneut im Klartext auftauchen.
    // Der Hash reicht, um den Vorgang später zuzuordnen.
    const hash = await hashEmail(admin, to);
    await writeMailLog(admin, {
      ...base,
      to_email: `suppressed:${hash ?? "unknown"}`,
      status: "suppressed",
    });
    return { status: "suppressed", providerId: null };
  }

  // 2 · Vorlage
  const template = await loadTemplate(admin, key, loc);
  if (!template) {
    const error = `Mail-Vorlage "${key}" (${loc}) nicht gefunden`;
    await writeMailLog(admin, { ...base, status: "failed", error });
    return { status: "failed", providerId: null, error };
  }

  // 3 · Rendern
  const subject = fillVars(template.subject, vars);
  const bodyMd = fillVars(template.body_md, vars);
  const html = wrapHtml(subject, markdownToHtml(bodyMd), loc);
  const text = markdownToText(bodyMd);

  // 4 · Ohne Key: lokal loggen, in jeder anderen Umgebung ein Fehler.
  //     Ein „gesendet", das nichts gesendet hat, wäre die schlimmere Antwort.
  if (!process.env.RESEND_API_KEY) {
    if (process.env.NODE_ENV !== "development") {
      const error = "RESEND_API_KEY fehlt";
      await writeMailLog(admin, { ...base, subject, status: "failed", error });
      return { status: "failed", providerId: null, error };
    }

    const providerId = `dev-${randomUUID()}`;
    console.info(
      `[mail:dev] ${key}/${loc} → ${to}\n  Betreff: ${subject}\n${text.replace(/^/gm, "  ")}`,
    );
    await writeMailLog(
      admin,
      {
        ...base,
        subject,
        provider: "dev",
        provider_id: providerId,
        status: "sent",
        meta: { dryRun: true },
      },
      { markSent: false },
    );
    return { status: "sent", providerId, dryRun: true };
  }

  // 5 · Senden
  const res = await sendViaResend({
    from: senderAddress(),
    to,
    subject,
    html,
    text,
    idempotencyKey: options.idempotencyKey,
  });

  const status: MailStatus = res.ok ? "sent" : "failed";
  await writeMailLog(admin, {
    ...base,
    subject,
    status,
    provider_id: res.ok ? res.providerId : null,
    error: res.ok ? null : res.error,
  });

  return res.ok
    ? { status, providerId: res.providerId }
    : { status, providerId: null, error: res.error };
}

/**
 * `true` gesperrt, `false` frei, `"error"` unbeantwortbar.
 *
 * Über die SQL-Funktion, nicht über einen eigenen Hash in JS: zwei
 * Implementierungen desselben Hashes driften irgendwann auseinander, und dann
 * geht Post an eine gelöschte Adresse.
 */
async function isSuppressed(
  admin: AdminClient,
  email: string,
): Promise<boolean | "error"> {
  const { data, error } = await admin.rpc("is_suppressed", { p_email: email });
  if (error) {
    console.error("[mail] is_suppressed fehlgeschlagen:", error.message);
    return "error";
  }
  return Boolean(data);
}

/** sha256(lower(trim(email))) aus der Datenbank — dieselbe Quelle wie oben. */
async function hashEmail(admin: AdminClient, email: string): Promise<string | null> {
  const { data, error } = await admin.rpc("email_hash", { p_email: email });
  if (error) {
    console.error("[mail] email_hash fehlgeschlagen:", error.message);
    return null;
  }
  return (data as string | null) ?? null;
}

/**
 * Vorlage aus der Datenbank; `mail_template` ist kanonisch (Migration 0013).
 * `BUILTIN_TEMPLATES` fängt nur den Fall ab, dass ein Key dort (noch) fehlt.
 */
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

  if (error) console.warn("[mail] mail_template nicht lesbar:", error.message);
  if (data) return data as MailTemplate;
  return findBuiltin(key, locale);
}

async function writeMailLog(
  admin: AdminClient,
  row: MailLogRow,
  options: { markSent?: boolean } = {},
): Promise<void> {
  const markSent =
    options.markSent ?? (row.status === "sent" || row.status === "delivered");

  const { error } = await admin.from("mail_log").insert({
    ...row,
    sent_at: markSent ? new Date().toISOString() : null,
  });

  if (error) {
    console.error("[mail] mail_log konnte nicht geschrieben werden:", error.message);
  }
}
