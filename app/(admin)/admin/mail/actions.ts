"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { requireStaff, getSessionContext } from "@/lib/auth";
import { resolveLocale } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { sendTemplate, type MailStatus } from "@/lib/mail";

export type TestMailResult = {
  status: MailStatus;
  providerId: string | null;
  dryRun?: boolean;
  /** Schlüssel aus `messages` im Dictionary — den Text setzt die UI. */
  message?: "invalid_email";
  /** Rohtext des Providers, nur zur Diagnose. */
  error?: string;
};

/** Testmail aus dem Dashboard. Rollenprüfung zuerst, dann erst der Versand. */
export async function sendTestMail(to: string): Promise<TestMailResult> {
  await requireStaff();

  const address = to.trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address)) {
    return { status: "failed", providerId: null, message: "invalid_email" };
  }

  const { preferredLanguage } = await getSessionContext();
  const locale = await resolveLocale(preferredLanguage);

  const supabase = await createSupabaseServerClient();
  const { data: person } = await supabase
    .from("person")
    .select("first_name")
    .maybeSingle();

  const host = (await headers()).get("host");
  const portalUrl =
    process.env.NEXT_PUBLIC_SITE_URL ??
    (host ? `https://${host}` : "https://portal.chef-treff.de");

  const res = await sendTemplate("test", locale, address, {
    first_name: person?.first_name ?? "",
    portal_url: portalUrl,
    sent_at: new Date().toISOString(),
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
  });

  revalidatePath("/admin/mail");
  return res;
}
