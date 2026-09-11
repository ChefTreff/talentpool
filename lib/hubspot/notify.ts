import "server-only";

/**
 * Slack `#fls27-onboarding` (Entscheidung 10, Welle 3). Zwei Transporte, beide ohne Logik:
 * - `SLACK_ONBOARDING_WEBHOOK_URL`: Slack Incoming Webhook des Kanals (bevorzugt, ein Hop weniger). Slack akzeptiert nur `text`/`blocks`.
 * - `MAKE_ONBOARDING_WEBHOOK_URL`: make.com als Zwischenstation, bekommt das volle JSON; optional Header `x-webhook-secret`.
 * Ohne beides wird nur geloggt — die Mail an den Deal-Owner legt die Datenbank ohnehin an.
 */
export async function notifyOnboardingChannel(
  text: string,
  extra: Record<string, unknown> = {},
): Promise<"sent" | "skipped" | "failed"> {
  const slack = process.env.SLACK_ONBOARDING_WEBHOOK_URL?.trim();
  const make = process.env.MAKE_ONBOARDING_WEBHOOK_URL?.trim();
  const url = slack || make;
  if (!url) {
    console.info(`[hubspot] Slack-Benachrichtigung übersprungen (kein SLACK_/MAKE_ONBOARDING_WEBHOOK_URL): ${text}`);
    return "skipped";
  }
  const headers: Record<string, string> = { "content-type": "application/json" };
  const secret = process.env.MAKE_WEBHOOK_SECRET?.trim();
  if (!slack && secret) headers["x-webhook-secret"] = secret;
  const body = slack ? { text } : { channel: "#fls27-onboarding", text, ...extra };
  try {
    const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
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
