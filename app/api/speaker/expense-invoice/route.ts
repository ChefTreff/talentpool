import { type NextRequest, NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { requireArea } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getI18n } from "@/lib/i18n";

/**
 * Auslagenrechnung als PDF.
 *
 * Die Berechtigung kommt nicht aus einem Parameter, sondern aus den Daten:
 * `my_expense_claims()` liefert mit dem **Nutzer-Client** nur die Anträge des
 * Aufrufers. Steht die angefragte ID nicht darin, gibt es sie für diesen
 * Menschen nicht — 404, ohne zu verraten, ob sie anderswo existiert.
 *
 * Die IBAN steht hier bewusst nur maskiert: `bank_masked` ist alles, was das
 * Portal je zu sehen bekommt. Die vollständige Nummer liegt im Vault und wird
 * erst bei der Freigabe (B8) gebraucht.
 */
export const dynamic = "force-dynamic";

type Claim = {
  id: string;
  status: string;
  currency: string;
  positions: { date: string; category: string; description?: string; amount_cents: number }[] | null;
  amount_cents: number;
  bank_masked: string | null;
  bank_holder: string | null;
  invoice_no: string | null;
  submitted_at: string | null;
  created_at: string;
};

const EURO = (cents: number, locale: string) =>
  (cents / 100).toLocaleString(locale === "de" ? "de-DE" : "en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export async function GET(request: NextRequest) {
  await requireArea("speaker", "/speaker/reisekosten");
  const claimId = request.nextUrl.searchParams.get("claim");
  if (!claimId) return new NextResponse("claim missing", { status: 400 });

  const supabase = await createSupabaseServerClient();
  const { locale, t } = await getI18n("en");

  const [{ data: claims, error }, { data: profileJson }] = await Promise.all([
    supabase.rpc("my_expense_claims"),
    supabase.rpc("my_speaker_profile"),
  ]);
  if (error) return new NextResponse("not available", { status: 500 });

  const claim = ((claims ?? []) as Claim[]).find((c) => c.id === claimId);
  if (!claim) return new NextResponse("not found", { status: 404 });

  const profile = (profileJson ?? null) as {
    is_assistant?: boolean;
    person?: { first_name?: string | null; last_name?: string | null; email?: string | null };
    organization_name?: string | null;
  } | null;
  // Die Assistenz darf den Antrag sehen, aber nicht die Bankzeile — dieselbe
  // Grenze wie in `my_expense_claims()`, die ihr `bank_masked` gar nicht gibt.
  const speakerName =
    [profile?.person?.first_name, profile?.person?.last_name].filter(Boolean).join(" ") || "—";

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]); // A4
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.05, 0.07, 0.15);
  const muted = rgb(0.42, 0.45, 0.52);
  let y = 790;

  const line = (text: string, opts?: { size?: number; bold?: boolean; color?: typeof ink; gap?: number }) => {
    page.drawText(text, {
      x: 56,
      y,
      size: opts?.size ?? 10,
      font: opts?.bold ? bold : font,
      color: opts?.color ?? ink,
    });
    y -= opts?.gap ?? 16;
  };
  const right = (text: string, x: number, size = 10, useBold = false) =>
    page.drawText(text, { x, y: y + 16, size, font: useBold ? bold : font, color: ink });

  // Die Kategorie steht erst zur Laufzeit fest; das Wörterbuch ist ein
  // literaler Typ, deshalb hier als Nachschlagewerk lesen.
  const e = t.speaker as unknown as Record<string, string>;
  line(e.invoiceHeading, { size: 18, bold: true, gap: 28 });
  line(`${e.invoiceNumber}: ${claim.invoice_no ?? "—"}`, { color: muted });
  line(
    `${e.invoiceDate}: ${new Date(claim.submitted_at ?? claim.created_at).toLocaleDateString(
      t.meta.dateLocale,
    )}`,
    { color: muted, gap: 28 },
  );

  line(e.invoiceFrom, { bold: true });
  line(speakerName);
  if (profile?.organization_name) line(profile.organization_name);
  if (profile?.person?.email) line(profile.person.email, { color: muted, gap: 28 });
  else y -= 12;

  line(e.invoiceTo, { bold: true });
  line("ChefTreff GmbH");
  line("Hamburg", { gap: 28 });

  line(e.invoicePositions, { bold: true, gap: 20 });
  for (const p of claim.positions ?? []) {
    const label = e[`category_${p.category}`] ?? p.category;
    const date = new Date(`${p.date}T00:00:00Z`).toLocaleDateString(t.meta.dateLocale, {
      timeZone: "UTC",
    });
    page.drawText(`${date}   ${label}${p.description ? ` — ${p.description}` : ""}`.slice(0, 78), {
      x: 56,
      y,
      size: 10,
      font,
      color: ink,
    });
    right(`${EURO(p.amount_cents, locale)} ${claim.currency}`, 440);
    y -= 16;
  }
  y -= 8;
  page.drawLine({ start: { x: 56, y: y + 10 }, end: { x: 539, y: y + 10 }, thickness: 0.7, color: muted });
  y -= 6;
  page.drawText(e.invoiceTotal, { x: 56, y, size: 11, font: bold, color: ink });
  page.drawText(`${EURO(claim.amount_cents, locale)} ${claim.currency}`, {
    x: 440,
    y,
    size: 11,
    font: bold,
    color: ink,
  });
  y -= 40;

  line(e.invoiceBank, { bold: true });
  line(claim.bank_holder ?? "—");
  line(claim.bank_masked ?? "—", { gap: 28 });
  line(e.invoiceFooter, { size: 9, color: muted });

  const bytes = await pdf.save();
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${claim.invoice_no ?? "auslagen"}.pdf"`,
      "cache-control": "no-store",
    },
  });
}
