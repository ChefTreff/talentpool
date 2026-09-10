"use server";

import { revalidatePath } from "next/cache";
import { requireArea } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { resolveLocale } from "@/lib/i18n";
import { sendTemplate, type MailStatus } from "@/lib/mail";
import { portalUrl } from "@/lib/mail/portal-url";

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
  const { firstName } = await requireArea("admin", "/admin/mail");

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
