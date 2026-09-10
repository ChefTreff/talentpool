import "server-only";

/**
 * Basis-URL für Links in Mails. Der `Host`-Header ist vom Client manipulierbar
 * und taugt nicht als Quelle für eine Adresse, die in fremden Postfächern landet
 * — außerhalb der lokalen Entwicklung ist `NEXT_PUBLIC_SITE_URL` deshalb Pflicht.
 */
export function portalUrl(): string | null {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  // Vercel-Preview: jede Deployment-URL ist anders, deshalb aus den System-Variablen
  // (VERCEL_BRANCH_URL bleibt je Branch stabil). Production braucht den festen Wert.
  if (process.env.VERCEL_ENV === "preview") {
    const host = process.env.VERCEL_BRANCH_URL ?? process.env.VERCEL_URL;
    if (host) return `https://${host}`;
  }
  if (process.env.NODE_ENV === "development") return "http://localhost:3000";
  return null;
}
