"use server";

import { revalidatePath } from "next/cache";
import { requireArea } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toRpcFailure } from "@/lib/rpc-error";
import { buildInvoicePdf, type InvoiceClaim } from "@/lib/expenses/invoice-pdf";
import { getDictionary, resolveLocale } from "@/lib/i18n";
import { sendExpenseToIntegrations } from "@/lib/expenses/integrations";
import { canHaveInvoice } from "@/lib/expenses/state";

/**
 * Die Warteschlangen des Teams: Reisekosten, Begleittickets, Hotel/Shuttle,
 * Fristen, Technik-Check. Alles über die RPCs mit dem Session-Client — die
 * prüfen `is_expense_approver()` bzw. `is_staff()` selbst.
 *
 * Eine Ausnahme mit Ansage: die **Ablage** der Auslagenrechnung. Sie läuft
 * nach der Rollenprüfung über service_role, damit das Dokument aus den
 * eingefrorenen Daten des Antrags entsteht und nicht aus einem Upload, den
 * ein Client beeinflussen könnte (Entscheidung Konrad, 10.09.).
 */
const PATHS = {
  expenses: "/admin/reisekosten",
  tickets: "/admin/speaker-tickets",
  hospitality: "/admin/hospitality",
  deadlines: "/admin/fristen",
  tech: "/admin/technik",
} as const;

export type AdminOpResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; key: string; detail?: string };

function fail(error: unknown, where: string): { ok: false; key: string; detail?: string } {
  const f = toRpcFailure(error as never);
  if (f.key === "unknown" && f.raw) console.error(`[admin/${where}] RPC:`, f.raw);
  return { ok: false, key: f.key, detail: f.detail };
}

async function client(path: string) {
  await requireArea("admin", path);
  return createSupabaseServerClient();
}

// === Reisekosten ============================================================

/** Eine Zeile aus `expense_queue` — die Rechnung baut sich daraus zusammen. */
type QueueRow = {
  id: string;
  profile_id: string;
  speaker_name: string | null;
  email: string | null;
  status: string;
  amount_cents: number;
  /** Seit Migration 0039 letzte Spalte der RPC. */
  currency: string;
  positions: InvoiceClaim["positions"];
  bank_masked: string | null;
  bank_holder: string | null;
  invoice_no: string | null;
  invoice_asset_id: string | null;
  submitted_at: string | null;
};

/** Bankdaten entschlüsseln — nur auf Klick, die RPC schreibt das Audit selbst. */
export async function revealBankDetails(
  claimId: string,
): Promise<AdminOpResult<{ iban: string | null; bic: string | null; holder: string | null }>> {
  const supabase = await client(PATHS.expenses);
  const { data, error } = await supabase.rpc("expense_bank_details", {
    p_claim_id: claimId,
  });
  if (error) return fail(error, "reisekosten");
  const bank = (data ?? {}) as { iban?: string; bic?: string; holder?: string };
  return {
    ok: true,
    data: { iban: bank.iban ?? null, bic: bank.bic ?? null, holder: bank.holder ?? null },
  };
}

export type ApproveResult = {
  /** Rechnung im Bucket abgelegt? */
  stored: boolean;
  /** SevDesk und Qonto — ohne Zugangsdaten nur protokolliert. */
  integrations: { sevdesk: string; qonto: string };
};

/**
 * Freigeben, Rechnung erzeugen, ablegen, Integrationen anstoßen.
 *
 * Reihenfolge mit Absicht: erst die RPC (sie prüft die Rolle und friert den
 * Stand ein), dann das Dokument. Scheitert die Ablage, bleibt die Freigabe
 * bestehen — sie ist die fachliche Entscheidung, das PDF nur ihr Beleg.
 */
export async function approveExpense(
  claimId: string,
  note: string,
): Promise<AdminOpResult<ApproveResult>> {
  const supabase = await client(PATHS.expenses);

  const { error } = await supabase.rpc("approve_expense", {
    p_claim_id: claimId,
    p_note: note.trim() ? note.trim() : null,
  });
  if (error) return fail(error, "reisekosten");
  revalidatePath(PATHS.expenses);

  const stored = await storeInvoice(claimId);
  return { ok: true, data: stored };
}

/**
 * Rechnung aus den Daten des Antrags bauen, ablegen und verbuchen.
 * Getrennt von der Freigabe, damit ein Fehler hier die Entscheidung nicht
 * zurücknimmt — und damit man es wiederholen kann.
 */
export async function storeInvoice(claimId: string): Promise<ApproveResult> {
  const supabase = await client(PATHS.expenses);
  const locale = await resolveLocale();
  const t = getDictionary(locale);

  const { data: rows } = await supabase.rpc("expense_queue");
  const claim = ((rows ?? []) as QueueRow[]).find((c) => c.id === claimId);

  // Diese Funktion ist als Server-Action erreichbar; ein Freigeber könnte sie
  // sonst für einen noch offenen Antrag aufrufen und eine Rechnung erzeugen,
  // die niemand freigegeben hat. Dieselbe Regel kommt zusätzlich in
  // `set_expense_integration` — hier, weil das Dokument vorher entsteht.
  if (!claim || !claim.invoice_no || !canHaveInvoice(claim.status)) {
    return { stored: false, integrations: { sevdesk: "skipped", qonto: "skipped" } };
  }

  // Feld für Feld statt `as InvoiceClaim`: die RPC hat kein `created_at`
  // (anders als `my_expense_claims`), und ein Cast hätte daraus im Dokument
  // ein „undefined“ gemacht.
  const invoiceClaim: InvoiceClaim = {
    positions: claim.positions,
    amount_cents: claim.amount_cents,
    currency: claim.currency,
    invoice_no: claim.invoice_no,
    bank_masked: claim.bank_masked,
    bank_holder: claim.bank_holder,
    submitted_at: claim.submitted_at,
    created_at: claim.submitted_at ?? new Date().toISOString(),
  };

  const bytes = await buildInvoicePdf({
    claim: invoiceClaim,
    speaker: { name: claim.speaker_name ?? "—", email: claim.email },
    strings: t.speaker as unknown as Record<string, string>,
    dateLocale: t.meta.dateLocale,
  });

  // Ab hier service_role: der Bucket-Pfad `invoice` ist fuer Clients gesperrt,
  // und genau das ist der Sinn — das Dokument entsteht serverseitig.
  //
  // Kein Fehler darf hier nach außen fliegen: `approveExpense` ruft diese
  // Funktion nach der Freigabe auf. Eine Ausnahme würde die Server-Action mit
  // 500 beenden und die schon getroffene Entscheidung wie einen Fehlschlag
  // aussehen lassen. Stattdessen: protokollieren, `stored: false` melden,
  // Wiederholung anbieten.
  try {
    const { requireExpenseApprover, storeInvoiceAsset } = await import(
      "@/lib/expenses/store-invoice"
    );
    await requireExpenseApprover(supabase);
    const stored = await storeInvoiceAsset({
      claimId,
      profileId: claim.profile_id,
      invoiceNo: claim.invoice_no,
      bytes,
    });

    const integrations = await sendExpenseToIntegrations({
      invoiceNo: claim.invoice_no,
      speakerName: claim.speaker_name ?? "—",
      amountCents: claim.amount_cents,
      bytes,
    });

    await supabase.rpc("set_expense_integration", {
      p_claim_id: claimId,
      p_invoice_asset_id: stored.assetId,
      p_sevdesk_ref: integrations.sevdeskRef,
      p_qonto_sent: integrations.qonto === "sent",
    });

    revalidatePath(PATHS.expenses);
    return {
      stored: true,
      integrations: { sevdesk: integrations.sevdesk, qonto: integrations.qonto },
    };
  } catch (error) {
    console.error(`[admin/reisekosten] Ablage ${claim.invoice_no}:`, (error as Error).message);
    revalidatePath(PATHS.expenses);
    return { stored: false, integrations: { sevdesk: "skipped", qonto: "skipped" } };
  }
}

export async function rejectExpense(
  claimId: string,
  note: string,
): Promise<AdminOpResult> {
  const supabase = await client(PATHS.expenses);
  const { error } = await supabase.rpc("reject_expense", {
    p_claim_id: claimId,
    p_note: note,
  });
  if (error) return fail(error, "reisekosten");
  revalidatePath(PATHS.expenses);
  return { ok: true, data: undefined };
}

export async function markExpensePaid(
  claimId: string,
  paymentRef: string,
): Promise<AdminOpResult> {
  const supabase = await client(PATHS.expenses);
  const { error } = await supabase.rpc("mark_expense_paid", {
    p_claim_id: claimId,
    p_payment_ref: paymentRef.trim() ? paymentRef.trim() : null,
  });
  if (error) return fail(error, "reisekosten");
  revalidatePath(PATHS.expenses);
  return { ok: true, data: undefined };
}

// === Begleittickets =========================================================

export async function confirmCompanion(
  ticketId: string,
  note: string,
): Promise<AdminOpResult> {
  const supabase = await client(PATHS.tickets);
  const { error } = await supabase.rpc("confirm_companion_ticket", {
    p_ticket_id: ticketId,
    p_note: note.trim() ? note.trim() : null,
  });
  if (error) return fail(error, "tickets");
  revalidatePath(PATHS.tickets);
  return { ok: true, data: undefined };
}

export async function declineCompanion(
  ticketId: string,
  note: string,
): Promise<AdminOpResult> {
  const supabase = await client(PATHS.tickets);
  const { error } = await supabase.rpc("decline_companion_ticket", {
    p_ticket_id: ticketId,
    p_note: note,
  });
  if (error) return fail(error, "tickets");
  revalidatePath(PATHS.tickets);
  return { ok: true, data: undefined };
}

// === Hotel und Shuttle ======================================================

export async function saveQuota(data: Record<string, unknown>): Promise<AdminOpResult> {
  const supabase = await client(PATHS.hospitality);
  const { error } = await supabase.rpc("upsert_hospitality_quota", { p_data: data });
  if (error) return fail(error, "hospitality");
  revalidatePath(PATHS.hospitality);
  return { ok: true, data: undefined };
}

export async function confirmBooking(
  bookingId: string,
  note: string,
): Promise<AdminOpResult> {
  const supabase = await client(PATHS.hospitality);
  const { error } = await supabase.rpc("confirm_hospitality", {
    p_booking_id: bookingId,
    p_note: note.trim() ? note.trim() : null,
  });
  if (error) return fail(error, "hospitality");
  revalidatePath(PATHS.hospitality);
  return { ok: true, data: undefined };
}

export async function declineBooking(
  bookingId: string,
  note: string,
): Promise<AdminOpResult> {
  const supabase = await client(PATHS.hospitality);
  const { error } = await supabase.rpc("decline_hospitality", {
    p_booking_id: bookingId,
    p_note: note,
  });
  if (error) return fail(error, "hospitality");
  revalidatePath(PATHS.hospitality);
  return { ok: true, data: undefined };
}

// === Fristen ================================================================

export async function saveDeadline(data: Record<string, unknown>): Promise<AdminOpResult> {
  const supabase = await client(PATHS.deadlines);
  const { error } = await supabase.rpc("upsert_deadline", { p_data: data });
  if (error) return fail(error, "fristen");
  revalidatePath(PATHS.deadlines);
  return { ok: true, data: undefined };
}

// === Technik-Check ==========================================================

export async function setTechCheck(
  assetId: string,
  status: string,
  note: string,
): Promise<AdminOpResult> {
  const supabase = await client(PATHS.tech);
  const { error } = await supabase.rpc("set_tech_check", {
    p_asset_id: assetId,
    p_status: status,
    p_note: note.trim() ? note.trim() : null,
  });
  if (error) return fail(error, "technik");
  revalidatePath(PATHS.tech);
  return { ok: true, data: undefined };
}
