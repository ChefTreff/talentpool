"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { ConfirmDialog } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { statusFrage } from "@/lib/award/regeln";
import { loescheBewerbung, setzeStatus, verknuepfeOrganisation } from "./actions";

const STATUS = ["submitted", "accepted", "finalist", "winner", "rejected"] as const;

/**
 * Status, Organisation und Löschen einer Award-Bewerbung (ADM-024).
 *
 * Jeder Wechsel, den die Öffentlichkeit sieht (in die Abstimmung, heraus, zwischen
 * Abstimmung/Finale/Gewinner), fragt vorher nach (QS-065): ein Fehlgriff am Handy
 * wirkte sonst sofort auf /award.
 */
export function AwardSteuerung({
  id,
  name,
  status,
  organisation,
  organisationen,
  t,
  common,
  rpcMessages,
}: {
  id: string;
  name: string;
  status: string;
  organisation: string | null;
  organisationen: { value: string; label: string }[];
  t: Record<string, string>;
  common: { cancel: string; saved: string; none: string };
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [frage, setFrage] = useState(false);
  const [neuerStatus, setNeuerStatus] = useState<string | null>(null);
  const statusArt = neuerStatus ? statusFrage(status, neuerStatus) : null;

  const fuehreAus = (aufruf: () => Promise<{ ok: true } | { ok: false; key: string }>, erfolg: string) =>
    start(async () => {
      const r = await aufruf();
      if (!r.ok) { toast("error", rpcMessages[r.key] ?? rpcMessages.unknown ?? r.key); return; }
      toast("success", erfolg);
      router.refresh();
    });

  return (
    <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-border pt-4">
      <label className="flex flex-col gap-1">
        <span className="ct-label">{t.statusLabel}</span>
        <Select
          className="w-48"
          disabled={pending}
          value={status}
          options={STATUS.map((s) => ({ value: s, label: t[`status_${s}`] ?? s }))}
          onChange={(e) => {
            const wert = e.target.value;
            if (statusFrage(status, wert)) setNeuerStatus(wert);
            else fuehreAus(() => setzeStatus(id, wert), common.saved);
          }}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="ct-label">{t.organisation}</span>
        <Select
          className="w-64"
          disabled={pending}
          value={organisation ?? ""}
          options={[{ value: "", label: common.none }, ...organisationen]}
          onChange={(e) => fuehreAus(() => verknuepfeOrganisation(id, e.target.value || null), common.saved)}
        />
      </label>
      <Button variant="ghost" size="sm" className="ml-auto" disabled={pending} onClick={() => setFrage(true)}>
        {t.delete}
      </Button>
      {neuerStatus && statusArt && (
        <ConfirmDialog
          title={t.statusConfirmTitle}
          body={t[`statusConfirm_${statusArt}`].replace("{name}", name).replace("{status}", t[`status_${neuerStatus}`] ?? neuerStatus)}
          confirmLabel={t.statusConfirm}
          cancelLabel={common.cancel}
          pending={pending}
          onCancel={() => setNeuerStatus(null)}
          onConfirm={() => {
            const wert = neuerStatus;
            setNeuerStatus(null);
            fuehreAus(() => setzeStatus(id, wert), common.saved);
          }}
        />
      )}
      {frage && (
        <ConfirmDialog
          title={t.deleteTitle}
          body={t.deleteBody.replace("{name}", name)}
          confirmLabel={t.delete}
          cancelLabel={common.cancel}
          pending={pending}
          onCancel={() => setFrage(false)}
          onConfirm={() => {
            setFrage(false);
            fuehreAus(() => loescheBewerbung(id), t.deleted);
          }}
        />
      )}
    </div>
  );
}
