import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * vivenu-Webhook-Signatur.
 *
 * vivenu hasht den **Raw-Body**, nicht den wieder zusammengesetzten
 * JSON-String (Antwort vivenu 11.09., `docs/vivenu-support-anfrage.md`) —
 * `JSON.stringify(JSON.parse(body))` ordnet Felder um und ändert
 * Zahlenformate, die Signatur stimmt dann nie.
 *
 * Der genaue Aufbau des Headers ist von vivenu nur als „laut Doku" bestätigt.
 * Deshalb zwei Dinge: die Prüfung akzeptiert Hex **und** Base64 und ein
 * vorangestelltes `sha256=`, und ohne gesetztes Secret wird **abgelehnt**,
 * nicht durchgewunken. Was wirklich ankommt, klärt der erste Sandbox-Lauf;
 * bis dahin steht die Frage in der PR-Beschreibung.
 */
export type VivenuSignatureVerdict =
  | { ok: true; encoding: "hex" | "base64" }
  | { ok: false; reason: "missing_secret" | "missing_header" | "mismatch" };

/** Erwarteter Digest über den Raw-Body. */
export function expectedDigest(secret: string, rawBody: string, encoding: "hex" | "base64"): string {
  return createHmac("sha256", secret).update(rawBody, "utf8").digest(encoding);
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

  // `sha256=<digest>` kommt bei mehreren Anbietern vor; beides zulassen.
  const value = given.startsWith("sha256=") ? given.slice("sha256=".length) : given;
  for (const encoding of ["hex", "base64"] as const) {
    if (sameString(expectedDigest(input.secret, input.rawBody, encoding), value)) {
      return { ok: true, encoding };
    }
  }
  return { ok: false, reason: "mismatch" };
}
