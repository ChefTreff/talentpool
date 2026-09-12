import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * vivenu-Webhook-Signatur.
 *
 * vivenu hasht den **Raw-Body**, nicht den wieder zusammengesetzten
 * JSON-String (Antwort vivenu 11.09., `docs/vivenu-support-anfrage.md`) —
 * `JSON.stringify(JSON.parse(body))` ordnet Felder um und ändert
 * Zahlenformate, die Signatur stimmt dann nie.
 *
 * Header `x-vivenu-signature`, HMAC-SHA256 über den Raw-Body, **hexadezimal**,
 * ohne Präfix. Am 12.09. an sechs echten Webhooks der Sandbox gemessen
 * (`ticket.created`, `ticket.updated`, `transaction.complete`,
 * `checkout.completed`, `checkout.detailsSubmitted`, `customer.created`) —
 * alle hex. Das Geheimnis ist der `hmacKey` der Webhook-Konfiguration
 * (`GET /api/webhooks`); er steht als `VIVENU_WEBHOOK_SECRET` in der Umgebung.
 *
 * Die vorherige Fassung liess zusätzlich Base64 und ein `sha256=`-Präfix zu,
 * solange das Format offen war. Beides ist jetzt raus: eine zweite akzeptierte
 * Form ist eine zweite Tür, durch die eine falsch berechnete Signatur passen
 * kann. Ohne gesetztes Secret wird abgelehnt, nicht durchgewunken.
 */
export type VivenuSignatureVerdict =
  | { ok: true; encoding: "hex" }
  | { ok: false; reason: "missing_secret" | "missing_header" | "mismatch" };

/** Erwarteter Digest über den Raw-Body. */
export function expectedDigest(secret: string, rawBody: string): string {
  return createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
}

function sameString(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function verifyVivenuSignature(input: {
  rawBody: string;
  signature: string | null;
  secret: string | undefined;
}): VivenuSignatureVerdict {
  if (!input.secret?.trim()) return { ok: false, reason: "missing_secret" };
  const given = input.signature?.trim();
  if (!given) return { ok: false, reason: "missing_header" };
  if (!sameString(expectedDigest(input.secret, input.rawBody), given)) return { ok: false, reason: "mismatch" };
  return { ok: true, encoding: "hex" };
}
