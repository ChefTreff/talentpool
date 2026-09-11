"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Locale } from "@/lib/i18n/shared";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  acceptAttribute,
  checkFileRules,
  formatBytes,
  type FileRules,
} from "@/lib/partner/file-rules";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Input, Textarea } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Stepper } from "@/components/ui/Stepper";
import { useToast } from "@/components/ui/Toast";
import {
  registerPartnerAsset,
  saveOnboarding,
  submitDeliverable,
} from "../actions";
import { ContactList } from "../kontakte/ContactList";
import { BUCKET, safeFileName } from "../upload";
import {
  PASS_TYPES,
  type Deliverable,
  type PartnerContact,
  type PartnerOverview,
} from "../types";

type Strings = Record<string, string>;

type Draft = {
  legal_name: string;
  communication_name: string;
  address_street: string;
  address_zip: string;
  address_city: string;
  address_country: string;
  website: string;
  description_de: string;
  description_en: string;
  invoice_email: string;
  invoice_name: string;
  vat_id: string;
  po_number: string;
  pass_type_choice: string;
};

function draftFrom(o: PartnerOverview): Draft {
  return {
    legal_name: o.org.legal_name ?? "",
    communication_name: o.org.communication_name ?? "",
    address_street: o.org.address.street ?? "",
    address_zip: o.org.address.zip ?? "",
    address_city: o.org.address.city ?? "",
    address_country: o.org.address.country ?? "",
    website: o.org.website ?? "",
    description_de: o.edition.description_de ?? "",
    description_en: o.edition.description_en ?? "",
    invoice_email: o.edition.invoice_email ?? "",
    invoice_name: o.edition.invoice_name ?? "",
    vat_id: o.edition.vat_id ?? "",
    po_number: o.edition.po_number ?? "",
    pass_type_choice: o.edition.pass_type_choice ?? "",
  };
}

export function OnboardingWizard({
  orgId,
  editionId,
  overview,
  logo,
  contacts,
  canManage,
  locale,
  dateLocale,
  t,
  contactStrings,
  common,
  rpcMessages,
}: {
  orgId: string;
  editionId: string;
  overview: PartnerOverview;
  logo: Deliverable | null;
  contacts: PartnerContact[];
  canManage: boolean;
  locale: Locale;
  dateLocale: string;
  t: Strings;
  contactStrings: Strings;
  common: { save: string; cancel: string; none: string; back: string; next: string };
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(() => draftFrom(overview));

  const message = (key: string) => rpcMessages[key] ?? rpcMessages.unknown ?? key;
  const dateTime = new Intl.DateTimeFormat(dateLocale, {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const set = (part: Partial<Draft>) => setDraft((d) => ({ ...d, ...part }));

  // Pass-Typ nur, wenn Ticket-Produkte gebucht sind (Arbeitsauftrag B2).
  const hasTickets = overview.products.some((p) => p.category === "tickets");
  const currentLogo = logo?.assets.find((a) => a.status !== "rejected") ?? logo?.assets[0] ?? null;
  const rules: FileRules = logo?.file_rules ?? null;

  const steps = useMemo(
    () => [
      { label: t.stepCompany },
      { label: t.stepDescription },
      { label: t.stepLogo },
      { label: t.stepInvoice },
      { label: t.stepContacts },
    ],
    [t],
  );

  const done = overview.edition.onboarding_status !== "invited";

  function onSave(next?: number) {
    startTransition(async () => {
      const res = await saveOnboarding(orgId, { ...draft });
      if (!res.ok) {
        toast("error", message(res.key) + (res.detail ? ` (${res.detail})` : ""));
        return;
      }
      toast("success", t.saved);
      if (next !== undefined) setStep(next);
      router.refresh();
    });
  }

  /**
   * Logo-Upload. Der doppelte Riegel steht nur hier: einmal im Browser aus
   * `file_rules`, damit niemand 20 MB hochlädt, um dann abgewiesen zu werden —
   * und einmal in `register_partner_asset`, worauf allein Verlass ist.
   */
  async function onLogo(file: File) {
    if (!logo) return;
    const bad = checkFileRules(file, rules);
    if (bad) {
      const allowed = (rules?.ext ?? []).map((e) => `.${e}`).join(", ");
      toast(
        "error",
        bad.reason === "size"
          ? t.logoTooBig.replace("{max}", bad.detail)
          : t.logoWrongType.replace("{allowed}", allowed).replace("{got}", bad.detail),
      );
      return;
    }
    setUploading(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const path = `${editionId}/${orgId}/logo_vector/${crypto.randomUUID()}-${safeFileName(file.name)}`;
      const up = await supabase.storage.from(BUCKET).upload(path, file, {
        contentType: file.type || undefined,
        upsert: false,
      });
      if (up.error) {
        toast("error", `${t.logoFailed} (${up.error.message})`);
        return;
      }
      const reg = await registerPartnerAsset({
        orgId,
        kind: "logo_vector",
        storagePath: path,
        filename: file.name,
        mime: file.type || null,
        sizeBytes: file.size,
        deliverableId: logo.id,
      });
      if (!reg.ok) {
        // Die Datei bleibt dann verwaist im Bucket. Sie hier zu löschen wäre
        // der zweite Fehlerfall — lieber melden und aufräumen lassen.
        toast("error", message(reg.key) + (reg.detail ? ` (${reg.detail})` : ""));
        return;
      }
      const sub = await submitDeliverable(logo.id, [reg.data.id]);
      if (!sub.ok) {
        toast("error", message(sub.key) + (sub.detail ? ` (${sub.detail})` : ""));
        return;
      }
      toast("success", t.logoDone.replace("{v}", String(reg.data.version)));
      router.refresh();
    } finally {
      setUploading(false);
    }
  }

  async function onDownloadLogo() {
    if (!currentLogo) return;
    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(currentLogo.storage_path, 60);
    if (error || !data?.signedUrl) {
      toast("error", t.downloadFailed);
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener");
  }

  return (
    <div className="max-w-[800px]">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Stepper steps={steps} current={step} srLabel={t.stepperLabel} />
        <Badge tone={done ? "success" : "warning"}>
          {t[`status_${overview.edition.onboarding_status}`] ??
            overview.edition.onboarding_status}
        </Badge>
      </div>

      {step === 0 && (
        <Card>
          <h2 className="ct-h3 mb-1 text-ink">{t.stepCompany}</h2>
          <p className="ct-help mb-4">{t.stepCompanyHint}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t.fieldLegalName} htmlFor="legal_name" required requiredLabel={t.requiredLabel}>
              <Input
                id="legal_name"
                value={draft.legal_name}
                onChange={(e) => set({ legal_name: e.target.value })}
              />
            </Field>
            <Field
              label={t.fieldCommunicationName}
              htmlFor="communication_name"
              hint={t.fieldCommunicationNameHint}
              required
              requiredLabel={t.requiredLabel}
            >
              <Input
                id="communication_name"
                value={draft.communication_name}
                onChange={(e) => set({ communication_name: e.target.value })}
              />
            </Field>
            <Field
              label={t.fieldStreet}
              htmlFor="address_street"
              required
              requiredLabel={t.requiredLabel}
              className="sm:col-span-2"
            >
              <Input
                id="address_street"
                value={draft.address_street}
                onChange={(e) => set({ address_street: e.target.value })}
              />
            </Field>
            <Field label={t.fieldZip} htmlFor="address_zip" required requiredLabel={t.requiredLabel}>
              <Input
                id="address_zip"
                value={draft.address_zip}
                onChange={(e) => set({ address_zip: e.target.value })}
              />
            </Field>
            <Field label={t.fieldCity} htmlFor="address_city" required requiredLabel={t.requiredLabel}>
              <Input
                id="address_city"
                value={draft.address_city}
                onChange={(e) => set({ address_city: e.target.value })}
              />
            </Field>
            <Field label={t.fieldCountry} htmlFor="address_country">
              <Input
                id="address_country"
                value={draft.address_country}
                onChange={(e) => set({ address_country: e.target.value })}
              />
            </Field>
            <Field label={t.fieldWebsite} htmlFor="website">
              <Input
                id="website"
                type="url"
                inputMode="url"
                placeholder="https://"
                value={draft.website}
                onChange={(e) => set({ website: e.target.value })}
              />
            </Field>
          </div>
          <div className="mt-6 flex gap-2">
            <Button disabled={pending} onClick={() => onSave(1)}>
              {common.next}
            </Button>
            <Button variant="ghost" disabled={pending} onClick={() => onSave()}>
              {common.save}
            </Button>
          </div>
        </Card>
      )}

      {step === 1 && (
        <Card>
          <h2 className="ct-h3 mb-1 text-ink">{t.stepDescription}</h2>
          <p className="ct-help mb-4">{t.stepDescriptionHint}</p>
          <div className="flex flex-col gap-4">
            <Field
              label={t.fieldDescriptionDe}
              htmlFor="description_de"
              required
              requiredLabel={t.requiredLabel}
            >
              <Textarea
                id="description_de"
                rows={5}
                value={draft.description_de}
                onChange={(e) => set({ description_de: e.target.value })}
              />
            </Field>
            <Field label={t.fieldDescriptionEn} htmlFor="description_en" hint={t.fieldDescriptionEnHint}>
              <Textarea
                id="description_en"
                rows={5}
                value={draft.description_en}
                onChange={(e) => set({ description_en: e.target.value })}
              />
            </Field>
          </div>
          <div className="mt-6 flex gap-2">
            <Button variant="secondary" disabled={pending} onClick={() => setStep(0)}>
              {common.back}
            </Button>
            <Button disabled={pending} onClick={() => onSave(2)}>
              {common.next}
            </Button>
          </div>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <h2 className="ct-h3 mb-1 text-ink">{t.stepLogo}</h2>
          <p className="ct-help mb-4">
            {(locale === "en" ? logo?.description_en : logo?.description_de) ?? t.stepLogoHint}
          </p>

          {!logo ? (
            <p className="ct-help">{t.logoMissingDeliverable}</p>
          ) : (
            <>
              {currentLogo ? (
                <div className="mb-4 rounded-ct-md border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <button type="button" onClick={onDownloadLogo} className="ct-link text-left">
                      {currentLogo.filename ?? currentLogo.storage_path.split("/").pop()}
                    </button>
                    <span className="ct-help">v{currentLogo.version}</span>
                    <Badge
                      tone={
                        logo.status === "accepted"
                          ? "success"
                          : logo.status === "rejected"
                            ? "error"
                            : "accent"
                      }
                    >
                      {t[`deliverable_${logo.status}`] ?? logo.status}
                    </Badge>
                  </div>
                  {logo.submitted_at && (
                    <p className="ct-help mt-1">
                      {t.submittedOn} {dateTime.format(new Date(logo.submitted_at))}
                    </p>
                  )}
                  {logo.review_note && (
                    <p className="ct-help mt-1 text-error-ink">
                      {t.reviewNote}: {logo.review_note}
                    </p>
                  )}
                </div>
              ) : (
                <p className="ct-help mb-4">{t.logoNone}</p>
              )}

              <Field
                label={currentLogo ? t.logoReplace : t.logoUpload}
                htmlFor="logo-file"
                hint={t.logoHint
                  .replace("{allowed}", (rules?.ext ?? []).map((e) => `.${e}`).join(", "))
                  .replace("{max}", formatBytes(rules?.max_bytes ?? 0))}
              >
                <input
                  id="logo-file"
                  type="file"
                  accept={acceptAttribute(rules)}
                  disabled={uploading || pending}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file) void onLogo(file);
                  }}
                  className="text-[14px]"
                />
              </Field>
              {uploading && <p className="ct-help mt-2">{t.logoUploading}</p>}
            </>
          )}

          <div className="mt-6 flex gap-2">
            <Button variant="secondary" disabled={pending} onClick={() => setStep(1)}>
              {common.back}
            </Button>
            <Button disabled={pending} onClick={() => setStep(3)}>
              {common.next}
            </Button>
          </div>
        </Card>
      )}

      {step === 3 && (
        <Card>
          <h2 className="ct-h3 mb-1 text-ink">{t.stepInvoice}</h2>
          <p className="ct-help mb-4">{t.stepInvoiceHint}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label={t.fieldInvoiceEmail}
              htmlFor="invoice_email"
              hint={t.fieldInvoiceEmailHint}
              required
              requiredLabel={t.requiredLabel}
            >
              <Input
                id="invoice_email"
                type="email"
                inputMode="email"
                value={draft.invoice_email}
                onChange={(e) => set({ invoice_email: e.target.value })}
              />
            </Field>
            <Field label={t.fieldInvoiceName} htmlFor="invoice_name">
              <Input
                id="invoice_name"
                value={draft.invoice_name}
                onChange={(e) => set({ invoice_name: e.target.value })}
              />
            </Field>
            <Field label={t.fieldVatId} htmlFor="vat_id">
              <Input
                id="vat_id"
                value={draft.vat_id}
                onChange={(e) => set({ vat_id: e.target.value })}
              />
            </Field>
            <Field label={t.fieldPoNumber} htmlFor="po_number" hint={t.fieldPoNumberHint}>
              <Input
                id="po_number"
                value={draft.po_number}
                onChange={(e) => set({ po_number: e.target.value })}
              />
            </Field>
            {hasTickets && (
              <Field
                label={t.fieldPassType}
                htmlFor="pass_type_choice"
                hint={t.fieldPassTypeHint}
                className="sm:col-span-2"
              >
                <Select
                  id="pass_type_choice"
                  value={draft.pass_type_choice}
                  placeholder={common.none}
                  options={PASS_TYPES.map((p) => ({
                    value: p,
                    label: t[`passType_${p}`] ?? p,
                  }))}
                  onChange={(e) => set({ pass_type_choice: e.target.value })}
                />
              </Field>
            )}
          </div>
          <div className="mt-6 flex gap-2">
            <Button variant="secondary" disabled={pending} onClick={() => setStep(2)}>
              {common.back}
            </Button>
            <Button disabled={pending} onClick={() => onSave(4)}>
              {common.next}
            </Button>
          </div>
        </Card>
      )}

      {step === 4 && (
        <Card>
          <h2 className="ct-h3 mb-1 text-ink">{t.stepContacts}</h2>
          <p className="ct-help mb-4">{t.stepContactsHint}</p>
          <ContactList
            orgId={orgId}
            contacts={contacts}
            canManage={canManage}
            dateLocale={dateLocale}
            t={contactStrings}
            common={common}
            rpcMessages={rpcMessages}
          />
          <div className="mt-6 flex gap-2">
            <Button variant="secondary" disabled={pending} onClick={() => setStep(3)}>
              {common.back}
            </Button>
          </div>
        </Card>
      )}

      {/* Was noch fehlt, damit der Stand auf „ausgefüllt" springt. */}
      {!done && <MissingHint draft={draft} hasLogo={Boolean(currentLogo)} t={t} />}
    </div>
  );
}

function MissingHint({
  draft,
  hasLogo,
  t,
}: {
  draft: Draft;
  hasLogo: boolean;
  t: Strings;
}) {
  const missing: string[] = [];
  if (!draft.legal_name.trim()) missing.push(t.fieldLegalName);
  if (!draft.communication_name.trim()) missing.push(t.fieldCommunicationName);
  if (!draft.address_street.trim()) missing.push(t.fieldStreet);
  if (!draft.address_zip.trim()) missing.push(t.fieldZip);
  if (!draft.address_city.trim()) missing.push(t.fieldCity);
  if (!draft.invoice_email.trim()) missing.push(t.fieldInvoiceEmail);
  if (!draft.description_de.trim()) missing.push(t.fieldDescriptionDe);
  if (!hasLogo) missing.push(t.stepLogo);
  if (missing.length === 0) return null;
  return (
    <p className="ct-help mt-4">
      {t.stillMissing}: {missing.join(" · ")}
    </p>
  );
}
