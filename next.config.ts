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
  // Worktrees haben eine eigene package-lock.json; ohne diese Angabe rät Turbopack
  // die Workspace-Wurzel und wählt den Haupt-Checkout.
  turbopack: { root: path.resolve(process.cwd()) },
  async headers() {
    return [{ source: "/(.*)", headers: SECURITY_HEADERS }];
  },
  async redirects() {
    const onPortalHost = [{ type: "host" as const, value: "portal.chef-treff.de" }];
    return TEAM_PORTAL_PATHS.flatMap((p) => [
      { source: `/${p}`, has: onPortalHost, destination: `https://team.chef-treff.de/${p}`, permanent: false },
      { source: `/${p}/:path*`, has: onPortalHost, destination: `https://team.chef-treff.de/${p}/:path*`, permanent: false },
    ]);
  },
};

export default nextConfig;
