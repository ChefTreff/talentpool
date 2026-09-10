"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { ConfirmDialog } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import {
  approveExpense,
  markExpensePaid,
  rejectExpense,
  revealBankDetails,
  storeInvoice,
} from "../actions";

type Strings = Record<string, string>;

export type QueuePosition = {
  date: string;
  category: string;
  description?: string | null;
  amount_cents: number;
};

export type QueueClaim = {
  id: string;
  profile_id: string;
  speaker_name: string | null;
  email: string | null;
  status: string;
  amount_cents: number;
  amount_label: string;
  positions: QueuePosition[] | null;
  bank_masked: string | null;
  bank_holder: string | null;
  invoice_no: string | null;
  invoice_asset_id: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  sevdesk_ref: string | null;
  sevdesk_sent_at: string | null;
  qonto_sent_at: string | null;
  paid_at: string | null;
  payment_ref: string | null;
};

const STATUS_TONE: Record<string, BadgeTone> = {
  draft: "neutral",
  submitted: "accent",
  approved: "success",
  rejected: "error",
  paid: "success",
};

export function ExpenseQueue({
  claims,
  categories,
  dateLocale,
  t,
  common,
  rpcMessages,
}: {
  claims: QueueClaim[];
  categories: Record<string, string>;
  dateLocale: string;
  t: Strings;
  common: { cancel: string; none: string; save: string };
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [bank, setBank] = useState<Record<string, string>>({});
  const [askReject, setAskReject] = useState<QueueClaim | null>(null);
  const [askApprove, setAskApprove] = useState<QueueClaim | null>(null);

  const message = (key: string) => rpcMessages[key] ?? rpcMessages.unknown ?? key;
  const dateTime = new Intl.DateTimeFormat(dateLocale, {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const bareDate = new Intl.DateTimeFormat(dateLocale, {
    dateStyle: "medium",
    timeZone: "UTC",
  });
  // Betraege formatiert die Seite selbst. `amount_label` aus der RPC richtet
  // sich nach der Profilsprache der Person, nicht nach der Sprache, die hier
  // gerade gewaehlt ist — im englischen Admin stuende sonst „151,90 €".
  const money = new Intl.NumberFormat(dateLocale, { style: "currency", currency: "EUR" });
  const note = (id: string) => notes[id] ?? "";

  /** Bankdaten kommen erst auf Klick — jeder Blick steht im Audit-Log. */
  function onReveal(claim: QueueClaim) {
    startTransition(async () => {
      const res = await revealBankDetails(claim.id);
      if (!res.ok) {
        toast("error", message(res.key));
        return;
      }
      setBank((b) => ({
        ...b,
        [claim.id]: [res.data.holder, res.data.iban, res.data.bic]
          .filter(Boolean)
          .join(" · ") || common.none,
      }));
    });
  }

  function onApprove(claim: QueueClaim) {
    startTransition(async () => {
      setAskApprove(null);
      const res = await approveExpense(claim.id, note(claim.id));
      if (!res.ok) {
        toast("error", message(res.key) + (res.detail ? ` (${res.detail})` : ""));
        return;
      }
      const { stored, integrations } = res.data;
      toast(
        "success",
        `${t.approved}${stored ? "" : ` · ${t.invoiceNotStored}`} · SevDesk: ${
          t[`integration_${integrations.sevdesk}`] ?? integrations.sevdesk
        } · Qonto: ${t[`integration_${integrations.qonto}`] ?? integrations.qonto}`,
      );
      router.refresh();
    });
  }

  function onReject(claim: QueueClaim) {
    startTransition(async () => {
      setAskReject(null);
      const res = await rejectExpense(claim.id, note(claim.id));
      if (!res.ok) {
        toast("error", message(res.key));
        return;
      }
      toast("success", t.rejected);
      router.refresh();
    });
  }

  function onPaid(claim: QueueClaim) {
    startTransition(async () => {
      const res = await markExpensePaid(claim.id, note(claim.id));
      if (!res.ok) {
        toast("error", message(res.key));
        return;
      }
      toast("success", t.markedPaid);
      router.refresh();
    });
  }

  function onRetryInvoice(claim: QueueClaim) {
    startTransition(async () => {
      const res = await storeInvoice(claim.id);
      toast(
        res.stored ? "success" : "error",
        res.stored ? t.invoiceStored : t.invoiceNotStored,
      );
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {claims.map((c) => (
        <Card key={c.id} className="p-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-[280px] flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="ct-h3 text-ink">{c.speaker_name || common.none}</span>
                <Badge tone={STATUS_TONE[c.status] ?? "neutral"}>
                  {t[`status_${c.status}`] ?? c.status}
                </Badge>
                <span className="ct-label">{money.format(c.amount_cents / 100)}</span>
                {c.invoice_no && <span className="ct-help">{c.invoice_no}</span>}
              </div>
              <p className="ct-help mt-1">
                {c.email}
                {c.submitted_at && ` · ${t.submittedOn} ${dateTime.format(new Date(c.submitted_at))}`}
                {c.paid_at && ` · ${t.paidOn} ${dateTime.format(new Date(c.paid_at))}`}
              </p>

              <details className="mt-2">
                <summary className="ct-help cursor-pointer font-semibold">
                  {t.positions} ({(c.positions ?? []).length})
                </summary>
                <ul className="ct-help mt-2 flex flex-col gap-1">
                  {(c.positions ?? []).map((p, i) => (
                    <li key={i}>
                      {bareDate.format(new Date(`${p.date}T00:00:00Z`))} ·{" "}
                      {categories[p.category] ?? p.category}
                      {p.description ? ` · ${p.description}` : ""} ·{" "}
                      {money.format(p.amount_cents / 100)}
                    </li>
                  ))}
                </ul>
              </details>

              <div className="ct-help mt-2 flex flex-wrap items-center gap-2">
                <span>
                  {t.bank}: {c.bank_masked ?? common.none}
                  {c.bank_holder ? ` · ${c.bank_holder}` : ""}
                </span>
                {bank[c.id] ? (
                  <span className="font-semibold text-ink">{bank[c.id]}</span>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() => onReveal(c)}
                  >
                    {t.revealBank}
                  </Button>
                )}
              </div>
              <p className="ct-help">{t.revealHint}</p>

              {c.review_note && (
                <p className="ct-help mt-2">
                  {t.reviewNote}: {c.review_note}
                </p>
              )}
              {(c.status === "approved" || c.status === "paid") && (
                <p className="ct-help mt-2">
                  {t.invoice}:{" "}
                  {c.invoice_asset_id ? t.invoiceStored : t.invoiceMissing}
                  {c.sevdesk_ref && ` · SevDesk ${c.sevdesk_ref}`}
                  {c.qonto_sent_at && ` · Qonto ${dateTime.format(new Date(c.qonto_sent_at))}`}
                </p>
              )}
            </div>

            <div className="flex w-full max-w-[320px] flex-col gap-2">
              <Field label={t.note} htmlFor={`note-${c.id}`} hint={t.noteHint}>
                <Input
                  id={`note-${c.id}`}
                  value={note(c.id)}
                  onChange={(e) => setNotes((n) => ({ ...n, [c.id]: e.target.value }))}
                />
              </Field>
              <div className="flex flex-wrap gap-2">
                {c.status === "submitted" && (
                  <>
                    <Button size="sm" disabled={pending} onClick={() => setAskApprove(c)}>
                      {t.approve}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={pending || note(c.id).trim() === ""}
                      onClick={() => setAskReject(c)}
                    >
                      {t.reject}
                    </Button>
                  </>
                )}
                {c.status === "approved" && (
                  <>
                    <Button size="sm" disabled={pending} onClick={() => onPaid(c)}>
                      {t.markPaid}
                    </Button>
                    {!c.invoice_asset_id && (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={pending}
                        onClick={() => onRetryInvoice(c)}
                      >
                        {t.retryInvoice}
                      </Button>
                    )}
                  </>
                )}
              </div>
              {c.status === "submitted" && note(c.id).trim() === "" && (
                <p className="ct-help">{t.rejectNeedsNote}</p>
              )}
            </div>
          </div>
        </Card>
      ))}

      {askApprove && (
        <ConfirmDialog
          title={t.approveTitle}
          body={t.approveBody}
          detail={
            <p className="ct-label">
              {askApprove.speaker_name} · {money.format(askApprove.amount_cents / 100)}
            </p>
          }
          confirmLabel={t.approve}
          cancelLabel={common.cancel}
          pending={pending}
          onCancel={() => setAskApprove(null)}
          onConfirm={() => onApprove(askApprove)}
        />
      )}
      {askReject && (
        <ConfirmDialog
          title={t.rejectTitle}
          body={t.rejectBody}
          detail={<p className="ct-label">{note(askReject.id)}</p>}
          confirmLabel={t.reject}
          cancelLabel={common.cancel}
          pending={pending}
          onCancel={() => setAskReject(null)}
          onConfirm={() => onReject(askReject)}
        />
      )}
    </div>
  );
}
