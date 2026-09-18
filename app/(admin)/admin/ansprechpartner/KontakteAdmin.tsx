"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ContactCard } from "@/components/ui/ContactCard";
import { Drawer } from "@/components/ui/Drawer";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { EmptyState } from "@/components/ui/EmptyState";
import { removeContact, removeInfo, saveContact, saveInfo, uploadPhoto } from "./actions";
import { CONTACT_TYPES, type AdminInfo, type AdminKontakt } from "./types";

type Strings = Record<string, string>;
const leer = {
  id: "", type: "partner_lead", display_name: "", role_label_de: "", role_label_en: "",
  email: "", phone: "", photo_path: "", is_default: false, sort_order: 0,
  contract_consent_at: "",
};

/** Dienstlich ist, was auf der Hausdomain endet — alles andere braucht die Einwilligung. */
function istHausadresse(mail: string): boolean {
  return mail.trim().toLowerCase().endsWith("@chef-treff.de");
}

/**
 * Pflege der Ansprechpartner und Auskünfte.
 *
 * Zwei Dinge stehen bewusst **neben** dem Formular:
 *   * die Vorschau der Karte, so wie der Partner sie sieht — wer einen
 *     Kontakt pflegt, soll nicht raten müssen, wie das Ergebnis wirkt;
 *   * die Zahl der Zuordnungen. Einen Kontakt zu löschen, an dem 40 Partner
 *     hängen, ist etwas anderes als einen ungenutzten zu löschen, und das
 *     gehört vor den Klick, nicht danach.
 */
export function KontakteAdmin({
  kontakte, infos, types, audiences, t, common, rpcMessages,
}: {
  kontakte: AdminKontakt[];
  infos: AdminInfo[];
  types: Record<string, string>;
  audiences: Record<string, string>;
  t: Strings;
  common: Strings;
  rpcMessages: Strings;
}) {
  const [offen, setOffen] = useState<typeof leer | null>(null);
  const [infoOffen, setInfoOffen] = useState<AdminInfo | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const melden = (key: string) => setFehler(rpcMessages[key] ?? rpcMessages.unknown ?? key);

  function speichern(daten: typeof leer) {
    setFehler(null);
    start(async () => {
      const res = await saveContact({
        ...(daten.id ? { id: daten.id } : {}),
        type: daten.type,
        display_name: daten.display_name,
        role_label_de: daten.role_label_de,
        role_label_en: daten.role_label_en,
        email: daten.email,
        phone: daten.phone,
        photo_path: daten.photo_path,
        is_default: daten.is_default,
        sort_order: Number(daten.sort_order) || 0,
        contract_consent_at: daten.contract_consent_at,
      });
      if (res.ok) setOffen(null);
      else melden(res.key);
    });
  }

  return (
    <div className="flex flex-col gap-8">
      {fehler && (
        <p role="alert" className="rounded-ct-md border border-error-soft bg-error-soft p-3 ct-small text-error-ink">
          {fehler}
        </p>
      )}

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="ct-h2">{t.contactsTitle}</h2>
          <Button size="sm" onClick={() => setOffen({ ...leer })}>{t.addContact}</Button>
        </div>

        {kontakte.length === 0 ? (
          <EmptyState title={t.emptyContacts} description={t.emptyContactsBody} />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {kontakte.map((k) => (
              <Card key={k.id}>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="accent">{types[k.type] ?? k.type}</Badge>
                  {k.is_default && <Badge>{t.isDefault}</Badge>}
                  <span className="ct-help">
                    {t.assigned.replace("{orgs}", String(k.orgs)).replace("{speakers}", String(k.speakers))}
                  </span>
                </div>
                <div className="mt-3">
                  <ContactCard
                    name={k.display_name}
                    role={k.role_label_de ?? null}
                    email={k.email}
                    phone={k.phone}
                    photoUrl={null}
                  />
                </div>
                <div className="mt-3 flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setOffen({ ...leer, ...k, role_label_de: k.role_label_de ?? "", role_label_en: k.role_label_en ?? "", photo_path: k.photo_path ?? "", contract_consent_at: k.contract_consent_at ?? "" })}>
                    {t.edit}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() => {
                      // Zuordnungen stehen daneben — löschen heisst hier, 40 Partner
                      // auf den Standard zurückfallen zu lassen.
                      // Bei einer fremden Adresse ist das Entfernen der Weg, eine
                      // zurückgezogene Einwilligung umzusetzen: das Datum lässt sich
                      // nicht leeren, ohne die Regel zu verletzen. Die Rückfrage nennt
                      // dann auch, wer danach auf dem Standardkontakt landet.
                      const widerruf = !istHausadresse(k.email);
                      const text = (widerruf ? t.confirmWithdraw : t.confirmDelete)
                        .replace("{name}", k.display_name)
                        .replace("{orgs}", String(k.orgs))
                        .replace("{speakers}", String(k.speakers));
                      if (!confirm(text)) return;
                      start(async () => {
                        const res = await removeContact(k.id, widerruf ? "consent_withdrawn" : undefined);
                        if (!res.ok) melden(res.key);
                      });
                    }}
                  >
                    {istHausadresse(k.email) ? (common.delete ?? t.delete) : t.withdraw}
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="ct-h2">{t.infosTitle}</h2>
          <Button size="sm" variant="secondary" onClick={() => setInfoOffen({ id: "", key: "", audience: ["partner"], label_de: "", label_en: "", value_de: "", value_en: "", sort_order: 0 })}>
            {t.addInfo}
          </Button>
        </div>
        {infos.length === 0 ? (
          <EmptyState title={t.emptyInfos} description={t.emptyInfosBody} />
        ) : (
          <Card>
            <ul className="flex flex-col divide-y">
              {infos.map((i) => (
                <li key={i.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2">
                  <span className="ct-label text-ink">{i.label_de ?? i.key}</span>
                  <span className="ct-small text-muted">{i.value_de}</span>
                  <span className="ml-auto flex items-center gap-2">
                    {i.audience.map((a) => <Badge key={a}>{audiences[a] ?? a}</Badge>)}
                    <Button size="sm" variant="ghost" onClick={() => setInfoOffen(i)}>{t.edit}</Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => start(async () => {
                        const res = await removeInfo(i.id);
                        if (!res.ok) melden(res.key);
                      })}
                    >
                      {common.delete ?? t.delete}
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>

      {offen && (
        <Drawer open onClose={() => setOffen(null)} title={offen.id ? t.editContact : t.addContact}>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => { e.preventDefault(); speichern(offen); }}
          >
            <Field label={t.fieldType} htmlFor="k-type">
              <Select
                id="k-type"
                value={offen.type}
                options={CONTACT_TYPES.map((v) => ({ value: v, label: types[v] ?? v }))}
                onChange={(e) => setOffen({ ...offen, type: e.target.value })}
              />
            </Field>
            <Field label={t.fieldName} htmlFor="k-name" required>
              <Input id="k-name" value={offen.display_name} required
                onChange={(e) => setOffen({ ...offen, display_name: e.target.value })} />
            </Field>
            <Field label={t.fieldRole} htmlFor="k-role" hint={t.fieldRoleHint}>
              <Input id="k-role" value={offen.role_label_de}
                onChange={(e) => setOffen({ ...offen, role_label_de: e.target.value })} />
            </Field>
            <Field label={t.fieldEmail} htmlFor="k-mail" hint={t.fieldEmailHint} required>
              <Input id="k-mail" type="email" value={offen.email} required
                onChange={(e) => setOffen({ ...offen, email: e.target.value })} />
            </Field>
            {/* Nur bei fremder Adresse: dort ist das Datum Pflicht, und der
                Hilfetext sagt, dass hier jemand etwas bestätigt und nicht nur
                ein Feld füllt. */}
            {offen.email.trim() !== "" && !istHausadresse(offen.email) && (
              <Field
                label={t.fieldConsent}
                htmlFor="k-consent"
                hint={t.fieldConsentHint}
                required
              >
                <Input
                  id="k-consent"
                  type="date"
                  required
                  value={offen.contract_consent_at}
                  onChange={(e) => setOffen({ ...offen, contract_consent_at: e.target.value })}
                />
              </Field>
            )}
            <Field label={t.fieldPhone} htmlFor="k-phone" hint={t.fieldPhoneHint} required>
              <Input id="k-phone" value={offen.phone} required
                onChange={(e) => setOffen({ ...offen, phone: e.target.value })} />
            </Field>
            <Field label={t.fieldPhoto} htmlFor="k-photo" hint={t.fieldPhotoHint}>
              <input
                id="k-photo"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="ct-small"
                onChange={(e) => {
                  const datei = e.target.files?.[0];
                  if (!datei) return;
                  const fd = new FormData();
                  fd.set("file", datei);
                  fd.set("contactId", offen.id || "neu");
                  start(async () => {
                    const res = await uploadPhoto(fd);
                    if (res.ok && res.path) setOffen((o) => (o ? { ...o, photo_path: res.path! } : o));
                    else if (!res.ok) melden(res.key);
                  });
                }}
              />
            </Field>
            <label className="flex items-center gap-2 ct-label">
              <input type="checkbox" checked={offen.is_default}
                onChange={(e) => setOffen({ ...offen, is_default: e.target.checked })} />
              {t.fieldDefault}
            </label>
            <p className="ct-help">{t.defaultHint}</p>
            <div className="flex gap-2">
              <Button type="submit" loading={pending}>{common.save}</Button>
              <Button type="button" variant="secondary" onClick={() => setOffen(null)}>{common.cancel}</Button>
            </div>
          </form>
        </Drawer>
      )}

      {infoOffen && (
        <Drawer open onClose={() => setInfoOffen(null)} title={infoOffen.id ? t.editInfo : t.addInfo}>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              setFehler(null);
              start(async () => {
                const res = await saveInfo({
                  key: infoOffen.key, audience: infoOffen.audience,
                  label_de: infoOffen.label_de, label_en: infoOffen.label_en,
                  value_de: infoOffen.value_de, value_en: infoOffen.value_en,
                  sort_order: Number(infoOffen.sort_order) || 0,
                });
                if (res.ok) setInfoOffen(null);
                else melden(res.key);
              });
            }}
          >
            <Field label={t.fieldKey} htmlFor="i-key" hint={t.fieldKeyHint} required>
              <Input id="i-key" value={infoOffen.key} required
                onChange={(e) => setInfoOffen({ ...infoOffen, key: e.target.value })} />
            </Field>
            <Field label={t.fieldLabelDe} htmlFor="i-label" required>
              <Input id="i-label" value={infoOffen.label_de ?? ""} required
                onChange={(e) => setInfoOffen({ ...infoOffen, label_de: e.target.value })} />
            </Field>
            <Field label={t.fieldValueDe} htmlFor="i-value">
              <Input id="i-value" value={infoOffen.value_de ?? ""}
                onChange={(e) => setInfoOffen({ ...infoOffen, value_de: e.target.value })} />
            </Field>
            <Field label={t.fieldLabelEn} htmlFor="i-label-en">
              <Input id="i-label-en" value={infoOffen.label_en ?? ""}
                onChange={(e) => setInfoOffen({ ...infoOffen, label_en: e.target.value })} />
            </Field>
            <Field label={t.fieldValueEn} htmlFor="i-value-en">
              <Input id="i-value-en" value={infoOffen.value_en ?? ""}
                onChange={(e) => setInfoOffen({ ...infoOffen, value_en: e.target.value })} />
            </Field>
            <Field label={t.fieldAudience} htmlFor="i-aud" hint={t.fieldAudienceHint}>
              <Input id="i-aud" value={infoOffen.audience.join(", ")}
                onChange={(e) => setInfoOffen({ ...infoOffen, audience: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} />
            </Field>
            <div className="flex gap-2">
              <Button type="submit" loading={pending}>{common.save}</Button>
              <Button type="button" variant="secondary" onClick={() => setInfoOffen(null)}>{common.cancel}</Button>
            </div>
          </form>
        </Drawer>
      )}
    </div>
  );
}
