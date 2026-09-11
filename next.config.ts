import path from "node:path";
import type { NextConfig } from "next";

/** Alte Team-Portal-Pfade, die in verschickten internen Mails stehen (Übergabe portal. → Plattform, 11.09.2026): freundlich nach team. weiterleiten. */
const TEAM_PORTAL_PATHS = ["belege", "abwesenheiten", "signatur"];

const nextConfig: NextConfig = {
  // Worktrees haben eine eigene package-lock.json; ohne diese Angabe rät Turbopack
  // die Workspace-Wurzel und wählt den Haupt-Checkout.
  turbopack: { root: path.resolve(process.cwd()) },
  async redirects() {
    const onPortalHost = [{ type: "host" as const, value: "portal.chef-treff.de" }];
    return TEAM_PORTAL_PATHS.flatMap((p) => [
      { source: `/${p}`, has: onPortalHost, destination: `https://team.chef-treff.de/${p}`, permanent: false },
      { source: `/${p}/:path*`, has: onPortalHost, destination: `https://team.chef-treff.de/${p}/:path*`, permanent: false },
    ]);
  },
};

export default nextConfig;
