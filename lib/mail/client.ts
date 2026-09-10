import "server-only";

export type ResendResult =
  | { ok: true; providerId: string }
  | { ok: false; error: string };

/**
 * Resend über die HTTP-API — kein SDK, damit die Abhängigkeitsliste kurz bleibt.
 * Der Key steht ausschließlich in der Vercel-Env (`RESEND_API_KEY`).
 */
export async function sendViaResend(input: {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  /** Verhindert Doppelversand bei Retries desselben Vorgangs. */
  idempotencyKey?: string;
  /** Anhänge als base64 — für Belege, die mit der Mail gehen müssen. */
  attachments?: { filename: string; content: string }[];
}): Promise<ResendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, error: "RESEND_API_KEY fehlt" };

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
  if (input.idempotencyKey) headers["Idempotency-Key"] = input.idempotencyKey;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers,
      body: JSON.stringify({
        from: input.from,
        to: [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text,
        ...(input.replyTo ? { reply_to: input.replyTo } : {}),
        ...(input.attachments?.length ? { attachments: input.attachments } : {}),
      }),
    });

    const payload = (await res.json().catch(() => ({}))) as {
      id?: string;
      message?: string;
      name?: string;
    };

    if (!res.ok) {
      return {
        ok: false,
        error: payload.message ?? payload.name ?? `HTTP ${res.status}`,
      };
    }
    if (!payload.id) return { ok: false, error: "Resend lieferte keine id" };
    return { ok: true, providerId: payload.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
