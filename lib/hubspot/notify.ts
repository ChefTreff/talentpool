import "server-only";

/**
 * Slack `#fls27-onboarding` über make.com als reinen Transport (Entscheidung 10, Welle 3):
 * make bekommt ein JSON und postet es. Ohne `MAKE_ONBOARDING_WEBHOOK_URL` wird nur geloggt —
 * die Mail an den Deal-Owner legt die Datenbank ohnehin an.
 */
export async function notifyOnboardingChannel(
  text: string,
  extra: Record<string, unknown> = {},
): Promise<"sent" | "skipped" | "failed"> {
  const url = process.env.MAKE_ONBOARDING_WEBHOOK_URL?.trim();
  if (!url) {
    console.info(`[hubspot] Slack-Benachrichtigung übersprungen (kein MAKE_ONBOARDING_WEBHOOK_URL): ${text}`);
    return "skipped";
  }
  const headers: Record<string, string> = { "content-type": "application/json" };
  const secret = process.env.MAKE_WEBHOOK_SECRET?.trim();
  if (secret) headers["x-webhook-secret"] = secret;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ channel: "#fls27-onboarding", text, ...extra }),
    });
    if (!res.ok) {
      console.error(`[hubspot] Slack-Webhook ${res.status}`);
      return "failed";
    }
    return "sent";
  } catch (e) {
    console.error("[hubspot] Slack-Webhook fehlgeschlagen:", e instanceof Error ? e.message : e);
    return "failed";
  }
}
