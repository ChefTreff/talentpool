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

/** Öffentlich erreichbar, auch ohne Login (Arbeitsauftrag B6). */
const PUBLIC_PATHS = ["/", "/login", "/tickets/bestaetigung"];
// `/api/cron/` prüft das Vercel-Cron-Secret selbst; ohne Ausnahme würde der Proxy den Cron zum Login umleiten.
const PUBLIC_PREFIXES = ["/auth/", "/api/cron/"];

function isPublic(pathname: string): boolean {
  return (
    PUBLIC_PATHS.includes(pathname) ||
    PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))
  );
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

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
        response = NextResponse.next({ request });
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
