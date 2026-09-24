"use client";

import { Field } from "@/components/ui/Field";
import { Input, Textarea } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";

type Strings = Record<string, string>;

/**
 * „Eure Daten“ — die Felder, die der Partner im Onboarding pflegt und das Team
 * im Admin sieht und korrigiert. **Eine** Quelle für beide (Regel vom 22.09.);
 * gespeichert wird über dieselbe RPC (`update_partner_onboarding`), nur Gate
 * und Neuladen sind je Bereich verschieden.
 */

/** Was die Felder aus `partner_overview` brauchen — Partner und Admin lesen dieselbe RPC. */
export type EureDatenQuelle = {
  org: {
    legal_name: string | null;
    communication_name: string | null;
    website: string | null;
    description_de: string | null;
    description_en: string | null;
    industry: string | null;
    customer_number: string | null;
    address: {
      street: string | null;
      zip: string | null;
      city: string | null;
      country: string | null;
      extra: string | null;
    };
  };
  edition: {
    invoice_email: string | null;
    invoice_name: string | null;
    vat_id: string | null;
    po_number: string | null;
  } | null;
};

export type EureDatenEntwurf = {
  legal_name: string;
  communication_name: string;
  address_street: string;
  address_extra: string;
  address_zip: string;
  address_city: string;
  address_country: string;
  website: string;
  industry: string;
  description_de: string;
  description_en: string;
  invoice_email: string;
  invoice_name: string;
  vat_id: string;
  po_number: string;
};

export function entwurfAus(q: EureDatenQuelle): EureDatenEntwurf {
  const firma = q.org.legal_name ?? "";
  const rechnungsname = q.edition?.invoice_name ?? "";
  return {
    legal_name: firma,
    communication_name: q.org.communication_name ?? "",
    address_street: q.org.address.street ?? "",
    address_extra: q.org.address.extra ?? "",
    address_zip: q.org.address.zip ?? "",
    address_city: q.org.address.city ?? "",
    address_country: q.org.address.country ?? "",
    website: q.org.website ?? "",
    industry: q.org.industry ?? "",
    description_de: q.org.description_de ?? "",
    description_en: q.org.description_en ?? "",
    invoice_email: q.edition?.invoice_email ?? "",
    // Steht dort der Firmenname selbst (der HubSpot-Ingest füllt ihn so vor), weicht nichts ab.
    invoice_name: rechnungsname.trim() === firma.trim() ? "" : rechnungsname,
    vat_id: q.edition?.vat_id ?? "",
    po_number: q.edition?.po_number ?? "",
  };
}

/**
 * Was gespeichert wird. Der Pass-Typ gehört **nicht** dazu: er hat hier kein
 * Feld, und ein mitgeschickter alter Wert überschriebe still, was das Team im
 * Admin gesetzt hat. Eine abweichende Firmierung, die dem Firmennamen gleicht,
 * ist keine — sie wird leer gespeichert.
 */
export function speicherDaten(d: EureDatenEntwurf): Record<string, string> {
  return {
    ...d,
    invoice_name: d.invoice_name.trim() === d.legal_name.trim() ? "" : d.invoice_name,
  };
}

type FelderProps = {
  draft: EureDatenEntwurf;
  set: (part: Partial<EureDatenEntwurf>) => void;
  t: Strings;
  /** Deaktiviert alle Eingaben (Rolle ohne Bearbeitungsrecht). */
  disabled?: boolean;
};

/** Kundennummer als feste Angabe (PART-059): der Partner sieht sie, ändern kann sie nur das Team. */
export function KundennummerInfo({ value, t }: { value: string | null; t: Strings }) {
  return (
    <div className="rounded-ct-md border border-border bg-surface-hover px-4 py-3 sm:col-span-2">
      <p className="ct-label text-ink">{t.customerNumberLabel}</p>
      <p className="ct-small mt-1 tabular-nums text-ink">{value || t.customerNumberNone}</p>
      <p className="ct-help mt-1">{t.customerNumberHint}</p>
    </div>
  );
}

export function UnternehmenFelder({ draft, set, t, disabled }: FelderProps) {
  return (
    <>
      <Field label={t.fieldLegalName} htmlFor="legal_name" required requiredLabel={t.requiredLabel}>
        <Input
          id="legal_name"
          value={draft.legal_name}
          disabled={disabled}
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
          disabled={disabled}
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
          disabled={disabled}
          onChange={(e) => set({ address_street: e.target.value })}
        />
      </Field>
      {/* PART-059: „das haben einige Unternehmen“ — Gebäude, Etage, c/o. Kommt
          auf die Rechnung unter die Straße. */}
      <Field
        label={t.fieldAddressExtra}
        htmlFor="address_extra"
        hint={t.fieldAddressExtraHint}
        className="sm:col-span-2"
      >
        <Input
          id="address_extra"
          value={draft.address_extra}
          disabled={disabled}
          onChange={(e) => set({ address_extra: e.target.value })}
        />
      </Field>
      <Field label={t.fieldZip} htmlFor="address_zip" required requiredLabel={t.requiredLabel}>
        <Input
          id="address_zip"
          value={draft.address_zip}
          disabled={disabled}
          onChange={(e) => set({ address_zip: e.target.value })}
        />
      </Field>
      <Field label={t.fieldCity} htmlFor="address_city" required requiredLabel={t.requiredLabel}>
        <Input
          id="address_city"
          value={draft.address_city}
          disabled={disabled}
          onChange={(e) => set({ address_city: e.target.value })}
        />
      </Field>
      <Field label={t.fieldCountry} htmlFor="address_country">
        <Input
          id="address_country"
          value={draft.address_country}
          disabled={disabled}
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
          disabled={disabled}
          onChange={(e) => set({ website: e.target.value })}
        />
      </Field>
    </>
  );
}

export function BeschreibungFelder({
  draft,
  set,
  t,
  disabled,
  industries,
  none,
}: FelderProps & { industries: Record<string, string>; none: string }) {
  return (
    <>
      <Field label={t.fieldDescriptionDe} htmlFor="description_de" required requiredLabel={t.requiredLabel}>
        <Textarea
          id="description_de"
          rows={5}
          value={draft.description_de}
          disabled={disabled}
          onChange={(e) => set({ description_de: e.target.value })}
        />
      </Field>
      <Field label={t.fieldDescriptionEn} htmlFor="description_en" hint={t.fieldDescriptionEnHint}>
        <Textarea
          id="description_en"
          rows={5}
          value={draft.description_en}
          disabled={disabled}
          onChange={(e) => set({ description_en: e.target.value })}
        />
      </Field>
      {/* Die Branche steht bei der Beschreibung, weil beides dasselbe tut:
          den Stand im Programm und in der Event-App auffindbar machen. */}
      <Field label={t.fieldIndustry} htmlFor="industry" hint={t.fieldIndustryHint}>
        <Select
          id="industry"
          value={draft.industry}
          placeholder={none}
          disabled={disabled}
          options={Object.entries(industries).map(([value, label]) => ({ value, label }))}
          onChange={(e) => set({ industry: e.target.value })}
        />
      </Field>
    </>
  );
}

export function RechnungFelder({ draft, set, t, disabled }: FelderProps) {
  const firma = draft.legal_name.trim();
  return (
    <>
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
          disabled={disabled}
          onChange={(e) => set({ invoice_email: e.target.value })}
        />
      </Field>
      {/* PART-061: ersetzt den Firmennamen auf der Rechnung; leer = Firmenname. */}
      <Field
        label={t.fieldInvoiceName}
        htmlFor="invoice_name"
        hint={firma ? t.fieldInvoiceNameHint.replace("{name}", firma) : t.fieldInvoiceNameHintNoName}
      >
        <Input
          id="invoice_name"
          value={draft.invoice_name}
          disabled={disabled}
          onChange={(e) => set({ invoice_name: e.target.value })}
        />
      </Field>
      <Field label={t.fieldVatId} htmlFor="vat_id">
        <Input
          id="vat_id"
          value={draft.vat_id}
          disabled={disabled}
          onChange={(e) => set({ vat_id: e.target.value })}
        />
      </Field>
      <Field label={t.fieldPoNumber} htmlFor="po_number" hint={t.fieldPoNumberHint}>
        <Input
          id="po_number"
          value={draft.po_number}
          disabled={disabled}
          onChange={(e) => set({ po_number: e.target.value })}
        />
      </Field>
    </>
  );
}
