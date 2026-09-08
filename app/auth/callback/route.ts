import { type NextRequest, NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/areas";

/**
 * Auth-Rückkehr vom Magic-Link. Unterstützt beide Varianten:
 *  - PKCE:        ?code=...
 *  - Token-Hash:  ?token_hash=...&type=...
 * Nach erfolgreicher Session: Person anlegen bzw. migrierte Person claimen.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  // `next` kommt aus der URL und darf nur auf einen Pfad dieses Hosts zeigen.
  const next = safeNextPath(searchParams.get("next"));

  const supabase = await createSupabaseServerClient();
  let authed = false;

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    authed = !error;
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    authed = !error;
  }

  if (authed) {
    await supabase.rpc("claim_or_create_person");
    return NextResponse.redirect(`${origin}${next}`);
  }
  return NextResponse.redirect(`${origin}/login?error=auth`);
}
