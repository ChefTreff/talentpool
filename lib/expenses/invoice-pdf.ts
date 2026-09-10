import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

/**
 * Aufbau der Auslagenrechnung an einer Stelle.
 *
 * B6 zeigt sie als Vorschau, B8 legt bei der Freigabe dasselbe Dokument ab —
 * beide rufen diese Funktion. Sie kennt weder Datenbank noch Anfrage: rein
 * gehen Antrag, Person und Texte, raus kommen Bytes. Wer sie aufrufen darf,
 * entscheidet der Aufrufer.
 */

export type InvoicePosition = {
  date: string;
  category: string;
  description?: string | null;
  amount_cents: number;
};

export type InvoiceClaim = {
  positions: InvoicePosition[] | null;
  amount_cents: number;
  currency: string;
  invoice_no: string | null;
  /** Maskiert. Die vollständige IBAN gehört nie in dieses Dokument. */
  bank_masked: string | null;
  bank_holder: string | null;
  submitted_at: string | null;
  created_at: string;
};

export type InvoiceSpeaker = {
  name: string;
  organization?: string | null;
  email?: string | null;
};

export type InvoiceInput = {
  claim: InvoiceClaim;
  speaker: InvoiceSpeaker;
  /** Texte aus dem Wörterbuch (`t.speaker`), inklusive `category_*`. */
  strings: Record<string, string>;
  /** Für Datum und Betrag, z. B. „de-DE". */
  dateLocale: string;
  /** Empfänger der Rechnung. */
  recipient?: string[];
};

const DEFAULT_RECIPIENT = ["ChefTreff GmbH", "Hamburg"];

function amount(cents: number, dateLocale: string): string {
  return (cents / 100).toLocaleString(dateLocale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export async function buildInvoicePdf(input: InvoiceInput): Promise<Uint8Array> {
  const { claim, speaker, strings: s, dateLocale } = input;
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]); // A4
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.05, 0.07, 0.15);
  const muted = rgb(0.42, 0.45, 0.52);
  let y = 790;

  const line = (
    text: string,
    opts?: { size?: number; bold?: boolean; color?: typeof ink; gap?: number },
  ) => {
    page.drawText(text, {
      x: 56,
      y,
      size: opts?.size ?? 10,
      font: opts?.bold ? bold : font,
      color: opts?.color ?? ink,
    });
    y -= opts?.gap ?? 16;
  };

  const dayFormat = new Intl.DateTimeFormat(dateLocale, { dateStyle: "medium" });
  // Reine Kalendertage: in UTC formatieren, sonst rutscht der 15. westlich
  // von Greenwich auf den 14.
  const bareDay = new Intl.DateTimeFormat(dateLocale, {
    dateStyle: "medium",
    timeZone: "UTC",
  });

  line(s.invoiceHeading ?? "", { size: 18, bold: true, gap: 28 });
  line(`${s.invoiceNumber}: ${claim.invoice_no ?? "—"}`, { color: muted });
  line(
    `${s.invoiceDate}: ${dayFormat.format(new Date(claim.submitted_at ?? claim.created_at))}`,
    { color: muted, gap: 28 },
  );

  line(s.invoiceFrom ?? "", { bold: true });
  line(speaker.name);
  if (speaker.organization) line(speaker.organization);
  if (speaker.email) line(speaker.email, { color: muted, gap: 28 });
  else y -= 12;

  line(s.invoiceTo ?? "", { bold: true });
  for (const row of input.recipient ?? DEFAULT_RECIPIENT) line(row);
  y -= 12;

  line(s.invoicePositions ?? "", { bold: true, gap: 20 });
  for (const p of claim.positions ?? []) {
    const label = s[`category_${p.category}`] ?? p.category;
    const day = bareDay.format(new Date(`${p.date}T00:00:00Z`));
    page.drawText(
      `${day}   ${label}${p.description ? ` — ${p.description}` : ""}`.slice(0, 78),
      { x: 56, y, size: 10, font, color: ink },
    );
    page.drawText(`${amount(p.amount_cents, dateLocale)} ${claim.currency}`, {
      x: 440,
      y,
      size: 10,
      font,
      color: ink,
    });
    y -= 16;
  }

  y -= 8;
  page.drawLine({
    start: { x: 56, y: y + 10 },
    end: { x: 539, y: y + 10 },
    thickness: 0.7,
    color: muted,
  });
  y -= 6;
  page.drawText(s.invoiceTotal ?? "", { x: 56, y, size: 11, font: bold, color: ink });
  page.drawText(`${amount(claim.amount_cents, dateLocale)} ${claim.currency}`, {
    x: 440,
    y,
    size: 11,
    font: bold,
    color: ink,
  });
  y -= 40;

  line(s.invoiceBank ?? "", { bold: true });
  line(claim.bank_holder ?? "—");
  line(claim.bank_masked ?? "—", { gap: 28 });
  line(s.invoiceFooter ?? "", { size: 9, color: muted });

  return pdf.save();
}
