import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Worktrees haben eine eigene package-lock.json; ohne diese Angabe rät Turbopack
  // die Workspace-Wurzel und wählt den Haupt-Checkout.
  turbopack: { root: path.resolve(process.cwd()) },
};

export default nextConfig;
