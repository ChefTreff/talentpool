"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { ConfirmDialog } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import { BUCKET, safeFileName } from "../session/types";
import { registerReceipt, saveBankDetails, saveClaim, submitClaim } from "./actions";
import {
  EDITABLE,
  MAX_AMOUNT_CENTS,
  MAX_POSITIONS,
  MAX_RECEIPT_BYTES,
  RECEIPT_MIME,
  fromCents,
  toCents,
  type ExpenseClaim,
  type ExpenseEligibility,
  type ExpensePosition,
} from "./types";

type Strings = Record<string, string>;

const STATUS_TONE: Record<string, BadgeTone> = {
  draft: "neutral",
  submitted: "accent",
  approved: "success",
  rejected: "error",
  paid: "success",
};

/** Eine Zeile im Formular — Betrag bleibt Text, bis gespeichert wird. */
type DraftPosition = {
  date: string;
  category: string;
  description: string;
  amount: string;
  receipt_asset_id: string | null;
  receipt_name: string | null;
};

const EMPTY_ROW: DraftPosition = {
  date: "",
  category: "",
  description: "",
  amount: "",
  receipt_asset_id: null,
  receipt_name: null,
};

export function ExpenseWizard({
  profileId,
  editionId,
  eligibility,
  claims,
  categories,
  dateLocale,
  t,
  common,
  rpcMessages,
}: {
  profileId: string;
  editionId: string;
  eligibility: ExpenseEligibility;
  claims: ExpenseClaim[];
  categories: Record<string, string>;
  dateLocale: string;
  t: Strings;
  common: { cancel: string; choose: string; none: string; required: string; save: string };
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState<number | null>(null);

  const open = claims.find((c) => EDITABLE.includes(c.status)) ?? null;

  const [rows, setRows] = useState<DraftPosition[]>(() =>
    (open?.positions ?? []).length > 0
      ? (open!.positions ?? []).map((p) => ({
          date: p.date ?? "",
          category: p.category ?? "",
          description: p.description ?? "",
          amount: fromCents(p.amount_cents, dateLocale),
          receipt_asset_id: p.receipt_asset_id ?? null,
          receipt_name: p.receipt_asset_id ? t.receiptThere : null,
        }))
      : [{ ...EMPTY_ROW }],
  );
  const [iban, setIban] = useState("");
  const [bic, setBic] = useState("");
  const [holder, setHolder] = useState("");
  const [askSubmit, setAskSubmit] = useState(false);

  const message = (key: string) => rpcMessages[key] ?? rpcMessages.unknown ?? key;
  const dateTime = new Intl.DateTimeFormat(dateLocale, { dateStyle: "medium" });
  const isAssistant = eligibility.is_assistant;

  const total = rows.reduce((sum, r) => sum + (toCents(r.amount) ?? 0), 0);
  const missingReceipt = rows.some((r) => !r.receipt_asset_id);
  const rowsComplete =
    rows.length > 0 &&
    rows.every((r) => r.date && r.category && (toCents(r.amount) ?? 0) > 0);

  function setRow(i: number, patch: Partial<DraftPosition>) {
    setRows((list) => list.map((r, x) => (x === i ? { ...r, ...patch } : r)));
  }

  function toPositions(): ExpensePosition[] {
    return rows.map((r) => ({
      date: r.date,
      category: r.category,
      description: r.description.trim() || undefined,
      amount_cents: toCents(r.amount) ?? 0,
      receipt_asset_id: r.receipt_asset_id ?? undefined,
    }));
  }

  /** Beleg direkt in den Bucket, dann anmelden — wie bei der Präsentation. */
  async function onReceipt(index: number, file: File) {
    if (file.size > MAX_RECEIPT_BYTES) {
      toast("error", t.receiptTooBig);
      return;
    }
    if (file.type && !RECEIPT_MIME.includes(file.type)) {
      toast("error", t.receiptWrongType);
      return;
    }
    setUploading(index);
    try {
      const supabase = createSupabaseBrowserClient();
      const path = `${editionId}/${profileId}/receipt/${crypto.randomUUID()}-${safeFileName(file.name)}`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
        contentType: file.type || undefined,
        upsert: false,
      });
      if (error) {
        toast("error", `${t.receiptFailed} (${error.message})`);
        return;
      }
      const res = await registerReceipt({
        profileId,
        storagePath: path,
        filename: file.name,
        mime: file.type || null,
        sizeBytes: file.size,
      });
      if (!res.ok) {
        toast("error", message(res.key));
        return;
      }
      setRow(index, { receipt_asset_id: res.data.id, receipt_name: file.name });
      toast("success", t.receiptDone);
    } finally {
      setUploading(null);
    }
  }

  function onSave() {
    startTransition(async () => {
      const res = await saveClaim(toPositions(), open?.id ?? null);
      if (!res.ok) {
        toast("error", message(res.key) + (res.detail ? ` (${res.detail})` : ""));
        return;
      }
      toast("success", t.claimSaved);
      router.refresh();
    });
  }

  function onBank() {
    if (!open) return;
    startTransition(async () => {
      const res = await saveBankDetails(open.id, iban, bic, holder);
      if (!res.ok) {
        toast("error", message(res.key) + (res.detail ? ` (${res.detail})` : ""));
        return;
      }
      // Nichts behalten: die IBAN soll nach dem Absenden nirgends mehr stehen.
      setIban("");
      setBic("");
      setHolder("");
      toast("success", t.bankSaved);
      router.refresh();
    });
  }

  function onSubmit() {
    if (!open) return;
    startTransition(async () => {
      setAskSubmit(false);
      const res = await submitClaim(open.id);
      if (!res.ok) {
        toast("error", message(res.key) + (res.detail ? ` (${res.detail})` : ""));
        return;
      }
      toast("success", `${t.claimSubmitted} (${res.data.invoiceNo})`);
      router.refresh();
    });
  }

  /**
   * Eingereicht heißt: nichts mehr zu tun. Ein leeres Formular an dieser
   * Stelle wäre eine Einladung, aus Versehen einen zweiten Antrag zu bauen.
   */
  const latest = claims[0] ?? null;
  const waiting = !open && latest && !EDITABLE.includes(latest.status) ? latest : null;
  // Der Antrag, der oben schon steht, gehört nicht noch einmal in den Verlauf.
  const history = claims.filter((c) => c !== open && c !== waiting);

  // Ohne Freigabe kein Assistent, nur die Erklärung.
  if (!eligibility.eligible) {
    return (
      <Card className="p-6">
        <h2 className="ct-h3 mb-2 text-ink">{t.expenseBlockedTitle}</h2>
        <p className="ct-help">
          {eligibility.reason === "not_covered" ? t.expenseNotCovered : t.expenseNotApproved}
        </p>
      </Card>
    );
  }

  if (waiting) {
    return (
      <div className="flex flex-col gap-6">
        <Card className="p-6">
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone={STATUS_TONE[waiting.status] ?? "neutral"}>
              {t[`status_${waiting.status}`] ?? waiting.status}
            </Badge>
            <span className="ct-label">
              {waiting.invoice_no ?? t.noInvoiceNo} · {waiting.amount_label}
            </span>
          </div>
          <p className="ct-help mt-3">
            {waiting.status === "submitted" ? t.waitingSubmitted : t.waitingDecided}
          </p>
          {waiting.review_note && (
            <p className="ct-help mt-1">
              {t.reviewNote}: {waiting.review_note}
            </p>
          )}
          <div className="mt-4">
            <Button
              variant="secondary"
              onClick={() =>
                window.open(
                  `/api/speaker/expense-invoice?claim=${waiting.id}`,
                  "_blank",
                  "noopener",
                )
              }
            >
              {t.invoicePdf}
            </Button>
          </div>
        </Card>
        <History claims={history} dateTime={dateTime} t={t} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {open?.status === "rejected" && (
        <Card className="p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="error">{t.status_rejected}</Badge>
            <span className="ct-help">{t.rejectedHint}</span>
          </div>
          {open.review_note && (
            <p className="ct-help mt-2">
              {t.reviewNote}: {open.review_note}
            </p>
          )}
        </Card>
      )}

      {/* 1 · Positionen */}
      <Card className="p-6">
        <h2 className="ct-h3 mb-1 text-ink">{t.stepPositions}</h2>
        <p className="ct-help mb-4">{t.positionsHint}</p>

        <ul className="flex flex-col gap-4">
          {rows.map((row, i) => (
            <li key={i} className="rounded-ct-md border p-4">
              <div className="grid gap-4 sm:grid-cols-4">
                <Field label={t.fieldDate} htmlFor={`date-${i}`}>
                  <Input
                    id={`date-${i}`}
                    type="date"
                    value={row.date}
                    onChange={(e) => setRow(i, { date: e.target.value })}
                  />
                </Field>
                <Field label={t.fieldCategory} htmlFor={`cat-${i}`}>
                  <Select
                    id={`cat-${i}`}
                    value={row.category}
                    placeholder={common.choose}
                    options={Object.entries(categories).map(([value, label]) => ({
                      value,
                      label,
                    }))}
                    onChange={(e) => setRow(i, { category: e.target.value })}
                  />
                </Field>
                <Field label={t.fieldAmount} htmlFor={`amount-${i}`} hint={t.fieldAmountHint}>
                  <Input
                    id={`amount-${i}`}
                    inputMode="decimal"
                    value={row.amount}
                    onChange={(e) => setRow(i, { amount: e.target.value })}
                  />
                </Field>
                <Field label={t.fieldDescription} htmlFor={`desc-${i}`}>
                  <Input
                    id={`desc-${i}`}
                    maxLength={200}
                    value={row.description}
                    onChange={(e) => setRow(i, { description: e.target.value })}
                  />
                </Field>
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  {row.receipt_asset_id ? (
                    <Badge tone="success">
                      {t.receiptAttached}
                      {row.receipt_name ? `: ${row.receipt_name}` : ""}
                    </Badge>
                  ) : (
                    <Badge tone="warning">{t.receiptMissing}</Badge>
                  )}
                  <label className="text-[13px]">
                    <input
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png,.webp"
                      disabled={uploading === i}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (file) onReceipt(i, file);
                      }}
                    />
                  </label>
                  {uploading === i && <span className="ct-help">{t.uploading}</span>}
                </div>
                {rows.length > 1 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setRows((l) => l.filter((_, x) => x !== i))}
                  >
                    {t.removeRow}
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <Button
            variant="secondary"
            size="sm"
            disabled={rows.length >= MAX_POSITIONS}
            onClick={() => setRows((l) => [...l, { ...EMPTY_ROW }])}
          >
            {t.addRow}
          </Button>
          <p className="ct-label">
            {t.total}: {fromCents(total, dateLocale)} EUR
          </p>
        </div>
        {total > MAX_AMOUNT_CENTS && <p className="ct-help mt-2">{t.amountHigh}</p>}

        <div className="mt-4">
          <Button onClick={onSave} loading={pending} disabled={!rowsComplete}>
            {t.saveDraft}
          </Button>
        </div>
      </Card>

      {/* 2 · Bankdaten — nur der Speaker, nie vorbefüllt */}
      <Card className="p-6">
        <h2 className="ct-h3 mb-1 text-ink">{t.stepBank}</h2>
        <p className="ct-help mb-4">{t.bankHint}</p>

        {/* Der Assistenz gibt `my_expense_claims()` keinen maskierten Wert —
            „Hinterlegt: —" sähe nach einer Lücke aus. Sie erfährt nur, dass
            etwas hinterlegt ist. */}
        {open?.has_bank &&
          (isAssistant ? (
            <p className="ct-help mb-4">{t.bankOnFile}</p>
          ) : (
            <p className="ct-help mb-4">
              {t.bankStored}: {open.bank_masked ?? "—"}
              {open.bank_holder ? ` · ${open.bank_holder}` : ""}
            </p>
          ))}

        {isAssistant ? (
          <p className="ct-help">{t.bankAssistant}</p>
        ) : !open ? (
          <p className="ct-help">{t.bankNeedsDraft}</p>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t.fieldHolder} htmlFor="holder">
                <Input
                  id="holder"
                  value={holder}
                  autoComplete="off"
                  onChange={(e) => setHolder(e.target.value)}
                />
              </Field>
              <Field label={t.fieldIban} htmlFor="iban" hint={t.fieldIbanHint}>
                <Input
                  id="iban"
                  value={iban}
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(e) => setIban(e.target.value)}
                />
              </Field>
              <Field label={t.fieldBic} htmlFor="bic">
                <Input
                  id="bic"
                  value={bic}
                  autoComplete="off"
                  onChange={(e) => setBic(e.target.value)}
                />
              </Field>
            </div>
            <div className="mt-4">
              <Button
                variant="secondary"
                onClick={onBank}
                loading={pending}
                disabled={iban.trim() === "" || holder.trim() === ""}
              >
                {open.has_bank ? t.bankReplace : common.save}
              </Button>
            </div>
          </>
        )}
      </Card>

      {/* 3 · Prüfen und freigeben */}
      <Card className="p-6">
        <h2 className="ct-h3 mb-1 text-ink">{t.stepSubmit}</h2>
        <p className="ct-help mb-4">{t.submitHint}</p>
        <ul className="ct-help mb-4 flex flex-col gap-1">
          <li>{rowsComplete ? `✓ ${t.checkPositions}` : `· ${t.checkPositions}`}</li>
          <li>{!missingReceipt ? `✓ ${t.checkReceipts}` : `· ${t.checkReceipts}`}</li>
          <li>{open?.has_bank ? `✓ ${t.checkBank}` : `· ${t.checkBank}`}</li>
        </ul>
        <div className="flex flex-wrap gap-2">
          {open && (
            <Button
              variant="secondary"
              onClick={() =>
                window.open(`/api/speaker/expense-invoice?claim=${open.id}`, "_blank", "noopener")
              }
            >
              {t.previewInvoice}
            </Button>
          )}
          {!isAssistant && (
            <Button
              disabled={
                pending || !open || !rowsComplete || missingReceipt || !open?.has_bank
              }
              onClick={() => setAskSubmit(true)}
            >
              {t.submitClaim}
            </Button>
          )}
        </div>
        {isAssistant && <p className="ct-help mt-3">{t.submitAssistant}</p>}
      </Card>

      <History claims={history} dateTime={dateTime} t={t} />

      {askSubmit && (
        <ConfirmDialog
          title={t.submitTitleDialog}
          body={t.submitBodyDialog}
          detail={
            <p className="ct-label">
              {t.total}: {fromCents(total, dateLocale)} EUR
            </p>
          }
          confirmLabel={t.submitClaim}
          cancelLabel={common.cancel}
          pending={pending}
          onCancel={() => setAskSubmit(false)}
          onConfirm={onSubmit}
        />
      )}
    </div>
  );
}

/** Frühere Anträge — im Formular wie im Wartezustand dieselbe Liste. */
function History({
  claims,
  dateTime,
  t,
}: {
  claims: ExpenseClaim[];
  dateTime: Intl.DateTimeFormat;
  t: Strings;
}) {
  if (claims.length === 0) return null;
  return (
    <section aria-labelledby="h-history">
      <h2 id="h-history" className="ct-h3 mb-3 text-ink">
        {t.historyTitle}
      </h2>
      <ul className="flex flex-col gap-3">
        {claims.map((c) => (
          <Card as="li" key={c.id} className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="ct-label text-ink">
                  {c.invoice_no ?? t.noInvoiceNo} · {c.amount_label}
                </p>
                <p className="ct-help">
                  {c.submitted_at && `${t.submittedOn} ${dateTime.format(new Date(c.submitted_at))}`}
                  {c.paid_at && ` · ${t.paidOn} ${dateTime.format(new Date(c.paid_at))}`}
                </p>
                {c.review_note && (
                  <p className="ct-help mt-1">
                    {t.reviewNote}: {c.review_note}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={STATUS_TONE[c.status] ?? "neutral"}>
                  {t[`status_${c.status}`] ?? c.status}
                </Badge>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    window.open(`/api/speaker/expense-invoice?claim=${c.id}`, "_blank", "noopener")
                  }
                >
                  {t.invoicePdf}
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </ul>
    </section>
  );
}
