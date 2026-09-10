/** Antwort aus `expense_eligibility()`. */
export type ExpenseEligibility = {
  eligible: boolean;
  /** Warum nicht: der Lead hat es nicht vorgesehen oder die Freigabe fehlt. */
  reason: "not_covered" | "not_approved" | null;
  covered: boolean;
  approved: boolean;
  is_assistant: boolean;
  open_claim: string | null;
};

/** Eine Belegzeile. `receipt_asset_id` ist Pflicht fürs Einreichen. */
export type ExpensePosition = {
  date: string;
  category: string;
  description?: string;
  amount_cents: number;
  receipt_asset_id?: string | null;
};

/** Zeile aus `my_expense_claims()`. Die IBAN kommt nie mit — nur maskiert. */
export type ExpenseClaim = {
  id: string;
  status: "draft" | "submitted" | "approved" | "rejected" | "paid";
  currency: string;
  positions: ExpensePosition[] | null;
  amount_cents: number;
  amount_label: string;
  bank_masked: string | null;
  bank_holder: string | null;
  has_bank: boolean;
  invoice_no: string | null;
  invoice_asset_id: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
};

/** Stände, in denen der Antrag noch bearbeitet werden darf. */
export const EDITABLE = ["draft", "rejected"];

export const MAX_POSITIONS = 50;
/** 1 Cent bis 5.000 € je Position — dieselbe Grenze wie in der RPC. */
export const MAX_AMOUNT_CENTS = 500000;

/** Belege: derselbe Bucket wie die Präsentationen, eigener Unterordner. */
export const RECEIPT_MIME = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
export const MAX_RECEIPT_BYTES = 100 * 1024 * 1024;

/**
 * Betragseingabe zu Cent. Nachsichtig, weil Menschen Beträge unterschiedlich
 * schreiben: „1.200,50", „1,200.50", „1200.5", „1200,50".
 *
 * Regel: Trennzeichen einsammeln; steht Punkt **und** Komma drin, ist das
 * zuletzt auftretende der Dezimaltrenner und alle anderen sind Gruppierung.
 * Steht nur eines drin, ist es der Dezimaltrenner. Leer oder unlesbar → null.
 */
export function toCents(input: string): number | null {
  const raw = input.replace(/\s/g, "");
  if (raw === "") return null;

  const lastDot = raw.lastIndexOf(".");
  const lastComma = raw.lastIndexOf(",");
  const decimalAt = Math.max(lastDot, lastComma);

  const normalised =
    decimalAt === -1
      ? raw
      : `${raw.slice(0, decimalAt).replace(/[.,]/g, "")}.${raw.slice(decimalAt + 1)}`;

  if (!/^-?\d*\.?\d*$/.test(normalised)) return null;
  const value = Number(normalised);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 100);
}

/**
 * Für die Anzeige. **Ohne Gruppierung**, weil derselbe Text wieder im
 * Eingabefeld landet: „1.200,00" käme sonst als Tausenderpunkt zurück und
 * wäre nicht mehr von einem Dezimalpunkt zu unterscheiden.
 */
export function fromCents(cents: number, locale: string): string {
  return (cents / 100).toLocaleString(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: false,
  });
}
