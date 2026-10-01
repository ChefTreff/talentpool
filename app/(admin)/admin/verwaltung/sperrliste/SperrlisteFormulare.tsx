"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import { pruefeAdresse, sperreAdresse } from "./actions";

type Strings = Record<string, string>;
const GRUENDE_VON_HAND = ["unsubscribed", "hard_bounce", "manual"] as const;

/**
 * Prüfen und von Hand sperren (ADM-035). Zwei Karten, weil es zwei Fragen
 * sind: „ist sie gesperrt?" darf niemandem schaden, „sperren" ändert, wer
 * Mails bekommt. Entfernen gibt es nicht — ein Eintrag aus einer Löschung käme
 * sonst über den nächsten Import zurück.
 */
export function SperrlisteFormulare({
  dateLocale,
  t,
  common,
  rpcMessages,
}: {
  dateLocale: string;
  t: Strings;
  common: { required: string };
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [pruefAdresse, setPruefAdresse] = useState("");
  const [ergebnis, setErgebnis] = useState<string | null>(null);
  const [pruefFehler, setPruefFehler] = useState<string | null>(null);
  const [sperrAdresse, setSperrAdresse] = useState("");
  const [grund, setGrund] = useState<string>("unsubscribed");
  const [sperrFehler, setSperrFehler] = useState<string | null>(null);
  const meldung = (key: string, detail?: string) =>
    (rpcMessages[key] ?? rpcMessages.unknown ?? key) + (detail ? ` (${detail})` : "");
  const datum = (iso: string) => new Date(iso).toLocaleDateString(dateLocale);

  function pruefen() {
    startTransition(async () => {
      const r = await pruefeAdresse(pruefAdresse);
      if (!r.ok) { setErgebnis(null); setPruefFehler(meldung(r.key, r.detail)); return; }
      setPruefFehler(null);
      setErgebnis(
        r.gesperrt
          ? t.checkBlocked.replace("{grund}", t[`reason_${r.grund}`] ?? r.grund ?? "—").replace("{datum}", r.seit ? datum(r.seit) : "—")
          : t.checkFree,
      );
    });
  }

  function sperren() {
    startTransition(async () => {
      const r = await sperreAdresse(sperrAdresse, grund);
      if (!r.ok) { setSperrFehler(meldung(r.key, r.detail)); return; }
      setSperrFehler(null);
      setSperrAdresse("");
      toast("success", r.neu ? t.addDone : t.addExisting);
      router.refresh();
    });
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader ebene="h2" title={t.checkTitle} description={t.checkLead} />
        <div className="flex flex-wrap items-end gap-3">
          <Field label={t.fieldEmail} htmlFor="sp-pruef" error={pruefFehler ?? undefined}>
            <Input id="sp-pruef" type="email" className="w-72" value={pruefAdresse} onChange={(e) => setPruefAdresse(e.target.value)} />
          </Field>
          <Button variant="secondary" disabled={pending || !pruefAdresse.trim()} onClick={pruefen}>{t.checkAction}</Button>
        </div>
        {ergebnis && <p className="ct-small mt-3" role="status">{ergebnis}</p>}
      </Card>
      <Card>
        <CardHeader ebene="h2" title={t.addTitle} description={t.addLead} />
        <div className="flex flex-col gap-3">
          <Field label={t.fieldEmail} htmlFor="sp-neu" required requiredLabel={common.required} error={sperrFehler ?? undefined}>
            <Input id="sp-neu" type="email" className="w-72" value={sperrAdresse} onChange={(e) => setSperrAdresse(e.target.value)} />
          </Field>
          <Field label={t.fieldReason} htmlFor="sp-grund">
            <Select id="sp-grund" className="w-72" value={grund}
              options={GRUENDE_VON_HAND.map((g) => ({ value: g, label: t[`reason_${g}`] ?? g }))}
              onChange={(e) => setGrund(e.target.value)} />
          </Field>
          <div>
            <Button variant="secondary" disabled={pending || !sperrAdresse.trim()} onClick={sperren}>{t.addAction}</Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
