"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { ConfirmDialog } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { ladeTeamEin } from "./actions";

/**
 * Teammitglied anlegen und einladen (QS-056). Name, Arbeitsadresse, Rollen für
 * die Edition — ein Klick legt an, vergibt die Rollen und verschickt die Mail: neue
 * Personen bekommen den Anmelde-Link, Personen mit Konto (ADM-086) eine
 * Hinweismail „Du bist jetzt im Team". Admin ist hier keine Wahl: das bleibt eine bewusste Entscheidung unter
 * Verwaltung → Team. Vor dem Absenden eine Rückfrage, weil eine Mail rausgeht.
 */
export function TeamEinladung({
  editionen,
  rollen,
  t,
  common,
  rpcMessages,
}: {
  editionen: { id: string; name: string }[];
  rollen: { value: string; label: string }[];
  t: Record<string, string>;
  common: { cancel: string; required: string };
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [vorname, setVorname] = useState("");
  const [nachname, setNachname] = useState("");
  const [email, setEmail] = useState("");
  const [gewaehlt, setGewaehlt] = useState<string[]>([]);
  const [edition, setEdition] = useState(editionen[0]?.id ?? "");
  const [frage, setFrage] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const bereit = vorname.trim() && nachname.trim() && email.trim() && gewaehlt.length > 0 && edition;

  function absenden() {
    start(async () => {
      const r = await ladeTeamEin(vorname, nachname, email, gewaehlt, edition);
      setFrage(false);
      if (!r.ok) { setFehler(rpcMessages[r.key] ?? rpcMessages.unknown ?? r.key); return; }
      setFehler(null);
      const text = r.eingeladen ? t.teamInvited : r.mail === "queued" ? t.teamMailQueued : r.mail === "suppressed" ? t.teamMailSuppressed : t.teamRolesOnly;
      toast("success", text.replace("{email}", r.email));
      setVorname(""); setNachname(""); setEmail(""); setGewaehlt([]);
      router.refresh();
    });
  }

  if (editionen.length === 0) return null;

  return (
    <Card className="mb-6">
      <CardHeader ebene="h2" title={t.teamTitle} description={t.teamLead} />
      <p className="mb-4 rounded-ct-md border border-warning-soft bg-warning-soft p-3 ct-small text-warning-ink">{t.teamTestHint}</p>
      <div className="grid gap-4 md:grid-cols-3">
        <Field label={t.teamFirstName} htmlFor="tm-vor" required requiredLabel={common.required}>
          <Input id="tm-vor" value={vorname} onChange={(e) => setVorname(e.target.value)} />
        </Field>
        <Field label={t.teamLastName} htmlFor="tm-nach" required requiredLabel={common.required}>
          <Input id="tm-nach" value={nachname} onChange={(e) => setNachname(e.target.value)} />
        </Field>
        <Field label={t.teamEmail} htmlFor="tm-mail" required requiredLabel={common.required} hint={t.teamEmailHint}>
          <Input id="tm-mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
      </div>
      <fieldset className="mt-4">
        <legend className="ct-label text-ink">
          {t.teamRoles}
          <span aria-hidden className="ml-0.5 text-error-ink">*</span>
          <span className="ml-1 ct-help font-semibold">({common.required})</span>
        </legend>
        <div className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
          {rollen.map((r) => (
            <label key={r.value} className="flex min-h-11 items-center gap-2 ct-small">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={gewaehlt.includes(r.value)}
                onChange={(e) => setGewaehlt((g) => (e.target.checked ? [...g, r.value] : g.filter((x) => x !== r.value)))}
              />
              {r.label}
            </label>
          ))}
        </div>
      </fieldset>
      {editionen.length > 1 && (
        <Field label={t.teamEdition} htmlFor="tm-ed" className="mt-4 max-w-xs">
          <Select id="tm-ed" value={edition} options={editionen.map((e) => ({ value: e.id, label: e.name }))} onChange={(e) => setEdition(e.target.value)} />
        </Field>
      )}
      {fehler && <p className="ct-small mt-3 text-error-ink" role="alert">{fehler}</p>}
      <div className="mt-4">
        <Button disabled={!bereit || pending} loading={pending} onClick={() => setFrage(true)}>{t.teamSubmit}</Button>
      </div>
      {frage && (
        <ConfirmDialog
          title={t.teamConfirmTitle}
          body={t.teamConfirmBody.replace("{name}", `${vorname.trim()} ${nachname.trim()}`).replace("{email}", email.trim())}
          confirmLabel={t.teamSubmit}
          cancelLabel={common.cancel}
          pending={pending}
          onCancel={() => setFrage(false)}
          onConfirm={absenden}
        />
      )}
    </Card>
  );
}
