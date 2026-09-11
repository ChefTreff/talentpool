import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Empfänger für CSP-Verstöße (`report-uri` aus proxy.ts). Es wird nur protokolliert (Vercel-Logs, gekürzt), nichts gespeichert und
 * nichts zurückgegeben — die Meldungen kommen vom Browser ohne Login und sind reine Diagnose für das Scharfschalten (`CSP_ENFORCE`).
 */
export async function POST(request: Request) {
  const text = (await request.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 2000);
  if (text) console.warn("[csp]", text);
  return new NextResponse(null, { status: 204 });
}

export function GET() {
  return new NextResponse(null, { status: 405 });
}
