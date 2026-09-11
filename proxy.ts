import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { loginUrl } from "@/lib/areas";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";

/**
 * Next 16: `middleware.ts` ist deprecated, der Nachfolger heißt `proxy.ts`.
 *
 * Der Proxy ist **reines Login-Gate**: Session frisch halten, Nicht-Eingeloggte
 * zum Login schicken. Keine Rollenprüfung, keine RPCs — das kostet auf jeder
 * Anfrage eine Datenbankrunde und wäre trotzdem nicht verbindlich. Über Rollen
 * entscheidet ausschließlich `requireArea()`/`requireRole()` in Seite und Action.
 *
 * Ohne gesetzte Env-Variablen No-Op (lokaler Start vor `.env.local`).
 */

/** Öffentlich erreichbar, auch ohne Login (Arbeitsauftrag B6). `/api/csp-report` nimmt Browser-Meldungen zur CSP an. */
const PUBLIC_PATHS = ["/", "/login", "/tickets/bestaetigung", "/api/csp-report"];
// `/api/cron/` prüft das Vercel-Cron-Secret selbst, `/api/webhooks/` die Signatur des Absenders;
// ohne Ausnahme würde der Proxy beide zum Login umleiten.
const PUBLIC_PREFIXES = ["/auth/", "/api/cron/", "/api/webhooks/"];

function isPublic(pathname: string): boolean {
  return (
    PUBLIC_PATHS.includes(pathname) ||
    PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))
  );
}

/**
 * Content-Security-Policy mit Nonce je Anfrage. Next liest den Nonce aus dem CSP-Header der **Anfrage** und setzt ihn an seine
 * Inline-Skripte; `'strict-dynamic'` erlaubt die von dort nachgeladenen Chunks. Bis `CSP_ENFORCE=true` läuft die Richtlinie als
 * Report-Only — Verstöße landen über `report-uri` in `/api/csp-report` (Vercel-Logs), ohne die Seite zu blockieren.
 * Nonce-freie Grundregeln (frame-ancestors, base-uri, object-src, form-action) stehen zusätzlich in `next.config.ts`.
 */
function buildCsp(nonce: string): string {
  const sb = supabaseUrl();
  const sbHttps = sb ? new URL(sb).origin : "";
  const sbWss = sbHttps.replace(/^https:/, "wss:");
  const dev = process.env.NODE_ENV !== "production";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${sbHttps}`.trim(),
    "font-src 'self' data:",
    `connect-src 'self' ${sbHttps} ${sbWss}${dev ? " ws://localhost:* http://localhost:*" : ""}`.replace(/\s+/g, " ").trim(),
    "media-src 'self' blob:",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "report-uri /api/csp-report",
  ].join("; ");
}

const CSP_HEADER = process.env.CSP_ENFORCE === "true" ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only";

export async function proxy(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const csp = buildCsp(nonce);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set(CSP_HEADER, csp);
  const withCsp = (res: NextResponse) => {
    res.headers.set(CSP_HEADER, csp);
    return res;
  };
  let response = withCsp(NextResponse.next({ request: { headers: requestHeaders } }));

  const url = supabaseUrl();
  const key = supabaseAnonKey();
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = withCsp(NextResponse.next({ request: { headers: requestHeaders } }));
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  // getUser() validiert das Token gegen Supabase und rotiert dabei die Session-Cookies.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  if (user || isPublic(pathname)) return response;

  return redirectKeepingCookies(
    request,
    response,
    loginUrl(pathname + request.nextUrl.search),
  );
}

/**
 * Eine neue Response verliert die in `setAll` gesetzten Cookies — nach einem
 * Token-Refresh wäre die rotierte Session weg und der Nutzer ausgeloggt.
 * Deshalb wandern sie mit.
 */
function redirectKeepingCookies(
  request: NextRequest,
  carrier: NextResponse,
  target: string,
): NextResponse {
  const redirectResponse = NextResponse.redirect(new URL(target, request.url));
  carrier.cookies.getAll().forEach((cookie) => redirectResponse.cookies.set(cookie));
  return redirectResponse;
}

export const config = {
  matcher: [
    // Statische Assets, Bilder und Font-Dateien nicht durch den Proxy schicken.
    "/((?!_next/static|_next/image|favicon.ico|fonts/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2)$).*)",
  ],
};
