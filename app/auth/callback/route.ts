import { type NextRequest, NextResponse } from "next/server";
import type { AuthError, EmailOtpType } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { areasFor, DEFAULT_AFTER_LOGIN, landingPathFor, safeNextPath } from "@/lib/areas";

/**
 * Auth-Rückkehr vom Magic-Link. Unterstützt beide Varianten:
 *  - PKCE:        ?code=...
 *  - Token-Hash:  ?token_hash=...&type=...
 * Nach erfolgreicher Session: Person anlegen bzw. migrierte Person claimen.
 */

/**
 * Warum es nicht geklappt hat — die Login-Seite macht daraus einen Satz.
 * Vorher hieß jeder Fehler „abgelaufen", was bei einer falschen Konfiguration
 * in die Irre führt.
 */
type Reason = "expired" | "invalid" | "missing" | "auth";

/** Die Typen, die Supabase für `token_hash` kennt. */
const OTP_TYPES = new Set<EmailOtpType>([
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
]);

/**
 * Aus einer Query kommt nicht immer Sauberes: beim Kopieren aus dem Terminal
 * hängt schnell die Prompt-Zeile hinten dran, Mail-Clients brechen lange Links
 * um. Deshalb nur das erste Wort nehmen und gegen die bekannten Werte prüfen —
 * sonst antwortet Supabase mit „Invalid email verification type", und man sucht
 * den Fehler beim Token.
 */
function firstToken(value: string | null): string | null {
  if (!value) return null;
  const token = value.trim().split(/[\s]+/)[0];
  return token === "" ? null : token;
}

/**
 * GoTrue meldet auch einen bereits benutzten Link als `otp_expired` — beides
 * ist von außen nicht zu unterscheiden. Deshalb ein Grund für beide Fälle, und
 * der Text auf der Login-Seite nennt sie zusammen.
 */
function classify(error: AuthError): Reason {
  const text = `${error.code ?? ""} ${error.message}`.toLowerCase();
  if (text.includes("expired")) return "expired";
  if (text.includes("invalid") || text.includes("not found")) return "invalid";
  return "auth";
}

/**
 * Der Einstieg nach dem Login: direkt in den eigenen Bereich (Feedback-Runde 1,
 * Punkt 2). Gelesen wird mit derselben, gerade erzeugten Sitzung — `getMyAreas()`
 * käme zu früh, weil das Cookie erst mit dieser Antwort beim Browser landet.
 */
async function landingPath(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
): Promise<string> {
  const { data } = await supabase.rpc("session_context");
  const ctx = (data ?? null) as { roles?: { role: string }[] } | null;
  if (!ctx) return DEFAULT_AFTER_LOGIN;
  const roles = (ctx.roles ?? []).map((r) => r.role);
  return landingPathFor(areasFor(roles));
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = firstToken(searchParams.get("code"));
  const tokenHash = firstToken(searchParams.get("token_hash"));
  const rawType = firstToken(searchParams.get("type"));
  const type =
    rawType && OTP_TYPES.has(rawType as EmailOtpType) ? (rawType as EmailOtpType) : null;
  // `next` kommt aus der URL und darf nur auf einen Pfad dieses Hosts zeigen.
  // Der leere Rückfall ist Absicht: fehlt ein Ziel, entscheidet unten der
  // Bereich der Person, nicht ein fester Pfad.
  const next = safeNextPath(searchParams.get("next"), "");

  const supabase = await createSupabaseServerClient();
  let failure: AuthError | null = null;
  let reason: Reason = "missing";

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    failure = error;
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    failure = error;
  } else if (tokenHash && !type) {
    // Token da, aber der Typ ist unbrauchbar — fast immer ein verunglückter Link.
    console.warn(
      `[auth/callback] Unbekannter OTP-Typ: ${JSON.stringify(searchParams.get("type"))}`,
    );
    return NextResponse.redirect(`${origin}/login?error=invalid`);
  } else {
    // Weder code noch token_hash — der Link wurde unterwegs beschnitten.
    console.warn("[auth/callback] Aufruf ohne code und ohne token_hash");
    return NextResponse.redirect(`${origin}/login?error=missing`);
  }

  if (!failure) {
    await supabase.rpc("claim_or_create_person");
    return NextResponse.redirect(`${origin}${next || (await landingPath(supabase))}`);
  }

  reason = classify(failure);
  // Im Server-Log steht der Originaltext; der Nutzer bekommt nur den Grund.
  console.warn(
    `[auth/callback] Anmeldung fehlgeschlagen (${reason}): ` +
      `${failure.status ?? "?"} ${failure.code ?? ""} ${failure.message}`,
  );
  return NextResponse.redirect(`${origin}/login?error=${reason}`);
}
