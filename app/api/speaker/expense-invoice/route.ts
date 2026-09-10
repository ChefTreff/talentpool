import { type NextRequest, NextResponse } from "next/server";
import { requireArea } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getI18n } from "@/lib/i18n";
import { buildInvoicePdf, type InvoiceClaim } from "@/lib/expenses/invoice-pdf";

/**
 * Auslagenrechnung als Vorschau und Download.
 *
 * Die Berechtigung kommt nicht aus einem Parameter, sondern aus den Daten:
 * `my_expense_claims()` liefert mit dem **Nutzer-Client** nur die Anträge des
 * Aufrufers. Steht die angefragte ID nicht darin, gibt es sie für diesen
 * Menschen nicht — 404, ohne zu verraten, ob sie anderswo existiert.
 *
 * Gebaut wird das Dokument in `lib/expenses/invoice-pdf.ts`; dieselbe Funktion
 * benutzt später die Freigabe (B8) für das endgültige Dokument. Die IBAN steht
 * hier wie dort nur maskiert.
 */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  await requireArea("speaker", "/speaker/reisekosten");
  const claimId = request.nextUrl.searchParams.get("claim");
  if (!claimId) return new NextResponse("claim missing", { status: 400 });

  const supabase = await createSupabaseServerClient();
  const { t } = await getI18n("en");

  const [{ data: claims, error }, { data: profileJson }] = await Promise.all([
    supabase.rpc("my_expense_claims"),
    supabase.rpc("my_speaker_profile"),
  ]);
  if (error) return new NextResponse("not available", { status: 500 });

  const claim = ((claims ?? []) as (InvoiceClaim & { id: string })[]).find(
    (c) => c.id === claimId,
  );
  if (!claim) return new NextResponse("not found", { status: 404 });

  const profile = (profileJson ?? null) as {
    person?: { first_name?: string | null; last_name?: string | null; email?: string | null };
    organization_name?: string | null;
  } | null;

  const bytes = await buildInvoicePdf({
    claim,
    speaker: {
      name:
        [profile?.person?.first_name, profile?.person?.last_name]
          .filter(Boolean)
          .join(" ") || "—",
      organization: profile?.organization_name,
      email: profile?.person?.email,
    },
    strings: t.speaker as unknown as Record<string, string>,
    dateLocale: t.meta.dateLocale,
  });

  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${claim.invoice_no ?? "auslagen"}.pdf"`,
      "cache-control": "no-store",
    },
  });
}
