import { createPrivateKey, createSign } from "node:crypto";

/**
 * Das Google-Dienstkonto der Folien-Spiegelung (SPK-023, Runbook
 * `docs/runbooks/drive-service-konto.md`).
 *
 * Ohne `server-only`, damit `npm test` die Prüfung lädt. Den Wert aus der
 * Umgebung liest nur `lib/drive/server.ts`; hier kommt er als Text herein und
 * verlässt die Funktion nie in einer Meldung.
 */
export const DIENSTKONTO_VARIABLE = "GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON";

/**
 * Fest, nicht aus der Datei: `token_uri` im JSON würde bestimmen, wohin der
 * Server die signierte Anmeldung schickt.
 */
export const TOKEN_ADRESSE = "https://oauth2.googleapis.com/token";

/**
 * Voller Drive-Bereich: der Technik-Ordner ist dem Konto freigegeben, aber
 * nicht von ihm angelegt — `drive.file` sähe ihn nicht. Was das Konto
 * erreicht, bestimmt allein die Freigabe des Ordners.
 */
export const DRIVE_BEREICH = "https://www.googleapis.com/auth/drive";

export type Dienstkonto = { clientEmail: string; privateKey: string };

export type KontoStand =
  | { ok: true; konto: Dienstkonto }
  | { ok: false; grund: "fehlt" | "ungueltig" };

/** `vercel env pull` liefert sensible Variablen nur als Platzhalter. */
const PLATZHALTER = /^\[?sensitive\]?$/i;
const KONTO_ADRESSE = /^[a-z0-9][a-z0-9-]*@[a-z0-9-]+\.iam\.gserviceaccount\.com$/;

/**
 * Die Schlüsseldatei prüfen: Typ, Adresse des Dienstkontos und ein lesbarer
 * privater Schlüssel. Leer oder Platzhalter heisst „fehlt“ — dann spiegelt der
 * Server nichts und der Admin zeigt „Dienstkonto fehlt“; nichts bricht.
 */
export function dienstkontoAus(roh: string | null | undefined): KontoStand {
  const wert = roh?.trim();
  if (!wert || PLATZHALTER.test(wert)) return { ok: false, grund: "fehlt" };
  let json: unknown;
  try {
    json = JSON.parse(wert);
  } catch {
    return { ok: false, grund: "ungueltig" };
  }
  if (!json || typeof json !== "object") return { ok: false, grund: "ungueltig" };
  const o = json as Record<string, unknown>;
  const clientEmail = typeof o.client_email === "string" ? o.client_email.trim().toLowerCase() : "";
  // Beim Einfügen als eine Zeile kommen die Zeilenumbrüche manchmal als „\n“.
  const privateKey = typeof o.private_key === "string" ? o.private_key.replace(/\\n/g, "\n") : "";
  if (o.type !== "service_account" || !KONTO_ADRESSE.test(clientEmail)) return { ok: false, grund: "ungueltig" };
  try {
    createPrivateKey(privateKey);
  } catch {
    return { ok: false, grund: "ungueltig" };
  }
  return { ok: true, konto: { clientEmail, privateKey } };
}

function b64url(text: string | Buffer): string {
  return Buffer.from(text).toString("base64url");
}

/**
 * Die signierte Anmeldung (JWT-Bearer, RFC 7523) für den Token-Tausch, eine
 * Stunde gültig — so lange gilt auch der Zugriffsschlüssel, den Google dafür
 * ausgibt.
 */
export function anmeldung(konto: Dienstkonto, jetztSekunden: number): string {
  const kopf = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const inhalt = b64url(
    JSON.stringify({
      iss: konto.clientEmail,
      scope: DRIVE_BEREICH,
      aud: TOKEN_ADRESSE,
      iat: jetztSekunden,
      exp: jetztSekunden + 3600,
    }),
  );
  const signierer = createSign("RSA-SHA256");
  signierer.update(`${kopf}.${inhalt}`);
  signierer.end();
  return `${kopf}.${inhalt}.${signierer.sign(konto.privateKey).toString("base64url")}`;
}
