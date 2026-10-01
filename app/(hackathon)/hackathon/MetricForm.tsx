"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { saveMetric } from "./actions";

type Strings = Record<string, string>;

/**
 * Metrik-Wert eines Teams eintragen (HACK-009) — vom Team selbst oder von der
 * Jury der Challenge. Der Status zeigt, ob das Hack-Team den Wert schon
 * bestätigt hat; erst dann zählt er im Leaderboard.
 */
export function MetricForm({
  teamId,
  metricLabel,
  value,
  confirmed,
  t,
  rpcMessages,
}: {
  teamId: string;
  metricLabel: string;
  value: number | null;
  confirmed: boolean;
  t: Strings;
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [wert, setWert] = useState(value == null ? "" : String(value));
  const id = `metric-${teamId}`;
  const zahl = Number(wert.replace(",", "."));
  const gueltig = wert.trim() !== "" && Number.isFinite(zahl);

  return (
    <div className="flex flex-wrap items-end gap-3">
      <Field label={metricLabel} htmlFor={id}>
        <Input
          id={id}
          inputMode="decimal"
          className="w-40"
          value={wert}
          disabled={pending}
          onChange={(e) => setWert(e.target.value)}
        />
      </Field>
      <Button
        variant="secondary"
        disabled={pending || !gueltig}
        onClick={() =>
          startTransition(async () => {
            const res = await saveMetric({ teamId, value: zahl });
            if (!res.ok) {
              toast("error", rpcMessages[res.key] ?? rpcMessages.unknown ?? res.key);
              return;
            }
            toast("success", t.metricSaved);
            router.refresh();
          })
        }
      >
        {t.metricSave}
      </Button>
      {value != null && (
        <Badge tone={confirmed ? "success" : "warning"}>{confirmed ? t.metricConfirmed : t.metricPending}</Badge>
      )}
    </div>
  );
}
