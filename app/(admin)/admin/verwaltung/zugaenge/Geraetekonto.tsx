"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import { legeGeraetAn } from "./actions";
import { useSchubfachSchliessen } from "./ZugaengeKopf";

type Strings = Record<string, string>;

/**
 * Kiosk-Gerätekonto anlegen (ADM-038, E8): ein Konto je Gerät am Einlass, nur
 * Check-in, nur für eine Edition, Anmeldung per Magic-Link an eine
 * Team-Adresse. Vorher entstand es von Hand in Supabase.
 *
 * **Steht im Schubfach „Gerät anlegen“** (ADM-109): ohne eigene Karte, eine Spalte, nach dem Erfolg schließt es das Schubfach.
 */
export function Geraetekonto({
  editionen,
  t,
  common,
  rpcMessages,
}: {
  editionen: { id: string; name: string }[];
  t: Strings;
  common: { save: string; required: string };
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const schliessen = useSchubfachSchliessen();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState({ label: "", email: "", edition: editionen[0]?.id ?? "" });
  const [fehler, setFehler] = useState<string | null>(null);

  if (editionen.length === 0) {
    return <p className="ct-help">{t.kioskNoEdition}</p>;
  }

  function anlegen() {
    startTransition(async () => {
      const res = await legeGeraetAn(form.label, form.email, form.edition);
      if (!res.ok) {
        setFehler((rpcMessages[res.key] ?? rpcMessages.unknown ?? res.key) + (res.detail ? ` (${res.detail})` : ""));
        return;
      }
      setFehler(null);
      setForm((f) => ({ ...f, label: "", email: "" }));
      toast("success", (res.eingeladen ? t.kioskCreatedInvited : t.kioskRenewed).replace("{email}", res.email));
      router.refresh();
      schliessen();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="ct-help">{t.kioskLead}</p>
      <Field label={t.kioskLabel} htmlFor="kiosk-label" required requiredLabel={common.required}>
        <Input id="kiosk-label" placeholder={t.kioskLabelPlaceholder} value={form.label}
          onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} />
      </Field>
      <Field label={t.kioskEmail} htmlFor="kiosk-email" required requiredLabel={common.required}>
        <Input id="kiosk-email" type="email" placeholder="checkin-1@chef-treff.de" value={form.email}
          onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
      </Field>
      <Field label={t.kioskEdition} htmlFor="kiosk-edition">
        <Select id="kiosk-edition" value={form.edition}
          options={editionen.map((e) => ({ value: e.id, label: e.name }))}
          onChange={(e) => setForm((f) => ({ ...f, edition: e.target.value }))} />
      </Field>
      {fehler && <p className="ct-small text-error-ink" role="alert">{fehler}</p>}
      <div>
        <Button disabled={pending || !form.label.trim() || !form.email.trim()} loading={pending} onClick={anlegen}>
          {t.kioskCreate}
        </Button>
      </div>
      <p className="ct-help">{t.kioskHint}</p>
    </div>
  );
}
