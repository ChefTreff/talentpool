import path from "node:path";
import type { NextConfig } from "next";

/** Alte Team-Portal-Pfade, die in verschickten internen Mails stehen (Übergabe portal. → Plattform, 11.09.2026): freundlich nach team. weiterleiten. */
const TEAM_PORTAL_PATHS = ["belege", "abwesenheiten", "signatur"];

/**
 * Sicherheits-Header für jede Antwort (Fund Team-Portal-Chat 11.09.: auf portal. stand nur HSTS). Die vollständige CSP mit Nonce setzt
 * `proxy.ts` je Anfrage; hier steht die nonce-freie Untermenge, die Clickjacking und Einbettung auch dann unterbindet, wenn der Proxy
 * eine Antwort nicht anfasst. Kamera bleibt für den eigenen Ursprung erlaubt (Check-in-Scanner, Welle 4).
 */
const SECURITY_HEADERS = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'" },
];

const nextConfig: NextConfig = {
  // F4: Next schickt sonst `X-Powered-By: Next.js` mit jeder Antwort und sagt
  // damit Fremden, womit sie es zu tun haben. Kostenlos abzustellen.
  poweredByHeader: false,
  // Worktrees haben eine eigene package-lock.json; ohne diese Angabe rät Turbopack
  // die Workspace-Wurzel und wählt den Haupt-Checkout.
  turbopack: { root: path.resolve(process.cwd()) },
  async headers() {
    return [{ source: "/(.*)", headers: SECURITY_HEADERS }];
  },
  async redirects() {
    const onPortalHost = [{ type: "host" as const, value: "portal.chef-treff.de" }];
    return [
      ...TEAM_PORTAL_PATHS.flatMap((p) => [
        { source: `/${p}`, has: onPortalHost, destination: `https://team.chef-treff.de/${p}`, permanent: false },
        { source: `/${p}/:path*`, has: onPortalHost, destination: `https://team.chef-treff.de/${p}/:path*`, permanent: false },
      ]),
      // PORT2 (Konrad, 22.09.2026): das Produktionsportal ist ein Abschnitt des
      // Admin-Bereichs geworden. Die alten Adressen stehen in verschickten Mails,
      // in Lesezeichen und in Notizen — sie führen weiter ans Ziel.
      //
      // Hier und nicht in einer Seite, die `redirect()` ruft: die Umleitung
      // greift **vor** jeder Rollenprüfung. Wer nicht angemeldet ist, landet
      // damit auf dem Login mit dem **neuen** Ziel und nach der Anmeldung dort,
      // statt auf einer 404 zu stranden, weil der alte Bereich nicht mehr
      // existiert. `permanent: false`, solange die Umstellung frisch ist.
      { source: "/produktion", destination: "/admin/produktion", permanent: false },
      { source: "/produktion/:path*", destination: "/admin/produktion/:path*", permanent: false },
      // ADM-054: Catering hatte zwei Seiten mit derselben Ansicht und zwei
      // Rollenlisten. Geblieben ist der eigene Abschnitt `/admin/catering`.
      // Auch diese Umleitung steht hier und nicht in einer Seite: eine Seite,
      // die nur weiterleitet, bräuchte ein eigenes Gate, und das wäre eine
      // dritte Rollenliste für dieselbe Ansicht. Niemand verliert Zugang —
      // der Abschnitt `catering` schliesst Produktion ein.
      { source: "/admin/produktion/catering", destination: "/admin/catering", permanent: false },
    ];
  },
};

export default nextConfig;
