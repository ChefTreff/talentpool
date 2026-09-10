import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * HubSpot-Signatur v3: Base64(HMAC-SHA256(Client-Secret, METHOD + URL + Body + Timestamp)).
 * Header `X-HubSpot-Signature-v3` und `X-HubSpot-Request-Timestamp` (Millisekunden);
 * älter als fünf Minuten wird abgelehnt (Arbeitsauftrag Welle 3, A2). Keine Netz- oder
 * Framework-Abhängigkeit, damit die Regel im Test steht.
 */
export const MAX_SKEW_MS = 5 * 60 * 1000;

export type SignatureInput = {
  method: string;
  /** Die URL genau so, wie HubSpot sie aufgerufen hat (inkl. Query). */
  url: string;
  body: string;
  timestamp: string | null;
  signature: string | null;
  secret: string | undefined;
  /** Nur für Tests: „jetzt“ in Millisekunden. */
  now?: number;
};

export type SignatureVerdict =
  | { ok: true }
  | { ok: false; reason: "missing_secret" | "missing_headers" | "stale" | "mismatch" };

export function expectedSignature(
  secret: string,
  method: string,
  url: string,
  body: string,
  timestamp: string,
): string {
  return createHmac("sha256", secret)
    .update(`${method.toUpperCase()}${url}${body}${timestamp}`)
    .digest("base64");
}

export function verifyHubspotSignature(input: SignatureInput): SignatureVerdict {
  if (!input.secret) return { ok: false, reason: "missing_secret" };
  if (!input.timestamp || !input.signature) return { ok: false, reason: "missing_headers" };
  const ts = Number(input.timestamp);
  const now = input.now ?? Date.now();
  if (!Number.isFinite(ts) || Math.abs(now - ts) > MAX_SKEW_MS) return { ok: false, reason: "stale" };
  const expected = Buffer.from(
    expectedSignature(input.secret, input.method, input.url, input.body, input.timestamp),
  );
  const given = Buffer.from(input.signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    return { ok: false, reason: "mismatch" };
  }
  return { ok: true };
}
