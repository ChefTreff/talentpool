import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { areaForPath, canEnterArea } from "@/lib/areas";

/**
 * Next 16: `middleware.ts` ist deprecated, der Nachfolger heißt `proxy.ts`.
 *
 * Aufgaben:
 *  1. Supabase-Session frisch halten (Cookie-Refresh vor dem Rendern).
 *  2. Login-Pflicht für alles außer den öffentlichen Pfaden.
 *  3. **Optimistischer** Rollen-Check: schickt offensichtlich Unberechtigte früh
 *     weg, damit sie kein leeres Layout sehen. Die verbindliche Prüfung macht
 *     `requireArea()`/`requireRole()` serverseitig — hier wird nichts erlaubt,
 *     was dort nicht nochmals geprüft wird.
 *
 * Ohne gesetzte Env-Variablen No-Op (lokaler Start vor `.env.local`).
 */

/** Öffentlich erreichbar, auch ohne Login (Arbeitsauftrag B6). */
const PUBLIC_PATHS = ["/", "/login", "/tickets/bestaetigung"];
const PUBLIC_PREFIXES = ["/auth/"];

function isPublic(pathname: string): boolean {
  return (
    PUBLIC_PATHS.includes(pathname) ||
    PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))
  );
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
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

  // getUser() validiert das Token gegen Supabase und erneuert dabei die Session.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  if (!user) {
    if (isPublic(pathname)) return response;
    const login = new URL("/login", request.url);
    login.searchParams.set("next", pathname + request.nextUrl.search);
    return NextResponse.redirect(login);
  }

  const area = areaForPath(pathname);
  if (!area) return response;

  const [{ data: roles }, { data: isStaff }] = await Promise.all([
    supabase.rpc("my_roles"),
    supabase.rpc("is_staff"),
  ]);
  const roleNames = ((roles ?? []) as { role: string }[]).map((r) => r.role);

  if (!canEnterArea(area, roleNames, Boolean(isStaff))) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    // Statische Assets, Bilder und Font-Dateien nicht durch den Proxy schicken.
    "/((?!_next/static|_next/image|favicon.ico|fonts/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2)$).*)",
  ],
};
