"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/Modal";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import type { SpeakerContact } from "@/app/(speaker)/speaker/types";

/** Was die Karte zum Schreiben braucht — je Portal die eigenen Aktionen. */
export type KontaktAktionen = {
  save: (data: Record<string, unknown>) => Promise<{ ok: boolean; key?: string }>;
  remove: (contactId: string) => Promise<{ ok: boolean; key?: string }>;
};

const ARTEN = ["agency", "office", "management", "assistant", "other"] as const;

const LEER = {
  id: "",
  kind: "agency",
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
  has_access: false,
};

/**
 * „Kontakt hinzufügen" — **ein** Abschnitt für Assistenz, Agentur und Office
 * (SPK-040, Migration 0148).
 *
 * Vorher standen hier zwei Karten für dieselbe Sache: „Agentur oder Office"
 * ohne Zugang und „Assistenz" mit Zugang. Konrad, 21.09.: „Auch eine Agentur
 * füllt solche Seiten aus und braucht dann einen Zugang." Also eine Liste, in
 * der die **Art** sagt, wer es ist, und ein Häkchen, ob die Person sich
 * anmelden darf — zwei Fragen an derselben Zeile statt zwei Abschnitten.
 *
 * **Die Einwilligung ist Pflicht.** Die Daten gehören einem Menschen, der hier
 * kein Konto hat und nicht gefragt wurde; ohne die Bestätigung der Speakerin
 * speichern wir sie nicht. Das Häkchen steht am Formular, nicht als Fußnote.
 *
 * **Die Assistenz sieht die Liste, ändert sie aber nicht.** Wer eingeladen
 * wird, entscheidet die Speakerin — sonst holte sich eine Assistenz
 * Gesellschaft mit Zugang dazu.
 *
 * Steht in `components/`, weil sie zweimal gebraucht wird: im Speaker-Portal
 * und im Admin („Admin-Vollständigkeit", 22.09.). Die Aktionen kommen von
 * aussen, damit jedes Portal seine eigene Rechteprüfung behält.
 */
export function KontakteCard({
  id,
  kontakte,
  readOnly,
  aktionen,
  profileId,
  t,
  common,
  message,
}: {
  id?: string;
  kontakte: SpeakerContact[];
  readOnly: boolean;
  aktionen: KontaktAktionen;
  /** Nur im Admin nötig: dort wird ein fremdes Profil gepflegt. */
  profileId?: string;
  t: Record<string, string>;
  common: { cancel: string; none: string; save: string };
  message: (key: string) => string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState({ ...LEER });
  const [consent, setConsent] = useState(false);
  const [offen, setOffen] = useState(false);
  const [loeschen, setLoeschen] = useState<SpeakerContact | null>(null);

  const gefuellt = [form.first_name, form.last_name, form.email, form.phone].some(
    (v) => v.trim() !== "",
  );

  function bearbeiten(k: SpeakerContact) {
    setForm({
      id: k.id,
      kind: k.kind,
      first_name: k.first_name ?? "",
      last_name: k.last_name ?? "",
      email: k.email ?? "",
      phone: k.phone ?? "",
      has_access: k.has_access,
    });
    // Beim Bearbeiten steht die Einwilligung schon; das Häkchen bildet sie ab
    // und nimmt sie nicht neu ab.
    setConsent(true);
    setOffen(true);
  }

  function speichern() {
    startTransition(async () => {
      const res = await aktionen.save({
        ...(form.id ? { id: form.id } : {}),
        ...(profileId ? { profile_id: profileId } : {}),
        kind: form.kind,
        first_name: form.first_name,
        last_name: form.last_name,
        email: form.email,
        phone: form.phone,
        has_access: form.has_access,
        consent_at: new Date().toISOString().slice(0, 10),
      });
      if (!res.ok) {
        toast("error", message(res.key ?? "unknown"));
        return;
      }
      toast("success", t.contactSaved);
      setForm({ ...LEER });
      setConsent(false);
      setOffen(false);
      router.refresh();
    });
  }

  return (
    <Card id={id} className="p-6">
      <h2 className="ct-h3 mb-1 text-ink">{t.sectionContacts}</h2>
      <p className="ct-help mb-4">{t.contactsLead}</p>

      {kontakte.length === 0 ? (
        <p className="ct-help">{t.contactsNone}</p>
      ) : (
        <ul className="flex flex-col rounded-ct-md border">
          {kontakte.map((k) => (
            <li
              key={k.id}
              className="flex flex-wrap items-center gap-3 border-b px-4 py-3 last:border-b-0"
            >
              <div className="min-w-0 flex-1">
                <p className="ct-label text-ink">
                  {[k.first_name, k.last_name].filter(Boolean).join(" ") ||
                    k.email ||
                    common.none}
                </p>
                <p className="ct-help">
                  {t[`kind_${k.kind}`] ?? k.kind}
                  {k.email ? ` · ${k.email}` : ""}
                  {k.phone ? ` · ${k.phone}` : ""}
                </p>
              </div>
              {k.has_access && (
                <Badge tone={k.signed_in ? "success" : "accent"}>
                  {k.signed_in ? t.accessActive : t.accessInvited}
                </Badge>
              )}
              {!readOnly && (
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" disabled={pending} onClick={() => bearbeiten(k)}>
                    {t.contactEdit}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={pending}
                    onClick={() => setLoeschen(k)}
                  >
                    {t.contactRemove}
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {readOnly ? (
        <p className="ct-help mt-4">{t.contactsOnlySpeaker}</p>
      ) : offen ? (
        <div className="mt-4 border-t pt-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t.contactKind} htmlFor="k_kind">
              <Select
                id="k_kind"
                value={form.kind}
                onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value }))}
                options={ARTEN.map((v) => ({ value: v, label: t[`kind_${v}`] ?? v }))}
              />
            </Field>
            <div />
            <Field label={t.contact_first_name} htmlFor="k_first">
              <Input
                id="k_first"
                value={form.first_name}
                onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))}
              />
            </Field>
            <Field label={t.contact_last_name} htmlFor="k_last">
              <Input
                id="k_last"
                value={form.last_name}
                onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))}
              />
            </Field>
            <Field
              label={t.contact_email}
              htmlFor="k_email"
              hint={form.has_access ? t.contactEmailRequired : undefined}
            >
              <Input
                id="k_email"
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </Field>
            <Field label={t.contact_phone} htmlFor="k_phone">
              <Input
                id="k_phone"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              />
            </Field>
          </div>

          <label className="mt-4 flex items-start gap-2 ct-small">
            <input
              type="checkbox"
              className="mt-1 size-4"
              checked={form.has_access}
              onChange={(e) => setForm((f) => ({ ...f, has_access: e.target.checked }))}
            />
            <span>
              {t.contactAccess}
              <span className="ct-help block">{t.contactAccessHint}</span>
            </span>
          </label>

          <label className="mt-3 flex items-start gap-2 ct-small">
            <input
              type="checkbox"
              className="mt-1 size-4"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            <span>
              {t.contactConsent}
              <span className="ct-help block">{t.contactConsentHint}</span>
            </span>
          </label>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              disabled={
                pending || !gefuellt || !consent || (form.has_access && !form.email.trim())
              }
              onClick={speichern}
            >
              {common.save}
            </Button>
            <Button
              variant="ghost"
              disabled={pending}
              onClick={() => {
                setForm({ ...LEER });
                setConsent(false);
                setOffen(false);
              }}
            >
              {common.cancel}
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-4">
          <Button variant="secondary" disabled={pending} onClick={() => setOffen(true)}>
            {t.contactAdd}
          </Button>
        </div>
      )}

      {loeschen && (
        <ConfirmDialog
          title={t.contactRemoveTitle}
          body={
            loeschen.has_access ? t.contactRemoveBodyAccess : t.contactRemoveBody
          }
          confirmLabel={t.contactRemove}
          cancelLabel={common.cancel}
          pending={pending}
          onCancel={() => setLoeschen(null)}
          onConfirm={() =>
            startTransition(async () => {
              const res = await aktionen.remove(loeschen.id);
              if (!res.ok) toast("error", message(res.key ?? "unknown"));
              else toast("success", t.contactRemoved);
              setLoeschen(null);
              router.refresh();
            })
          }
        />
      )}
    </Card>
  );
}
