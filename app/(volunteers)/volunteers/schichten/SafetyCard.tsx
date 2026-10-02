"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";
import { ackSafety } from "../actions";

type Strings = Record<string, string>;

/**
 * Sicherheitsunterweisung (VOL-002, K-44): Pflicht für alle Volunteers, einmal je Edition. Ohne
 * Bestätigung lässt die Datenbank keine Schicht bestätigen (`safety_ack_required`). Die
 * bestätigte Fassung wird mit dem Zeitpunkt gespeichert.
 */
export function SafetyCard({
  acknowledgedAt,
  version,
  dateLocale,
  t,
  rpcMessages,
}: {
  acknowledgedAt: string | null;
  version: string;
  dateLocale: string;
  t: Strings;
  rpcMessages: Strings;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();

  function confirm() {
    start(async () => {
      const res = await ackSafety(version);
      if (!res.ok) {
        toast("error", rpcMessages[res.key] ?? rpcMessages.unknown ?? res.key);
        return;
      }
      toast("success", t.safetyDone);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader title={t.safetyTitle} description={t.safetyLead} />
      <ul className="ct-small flex list-disc flex-col gap-1 pl-5">
        {[t.safetyPoint1, t.safetyPoint2, t.safetyPoint3, t.safetyPoint4].map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {acknowledgedAt ? (
          <Badge tone="success">
            {t.safetyAcknowledged.replace(
              "{date}",
              new Intl.DateTimeFormat(dateLocale, { dateStyle: "medium" }).format(new Date(acknowledgedAt)),
            )}
          </Badge>
        ) : (
          <>
            <Button disabled={pending} onClick={confirm}>
              {t.safetyConfirm}
            </Button>
            <span className="ct-help">{t.safetyRequired}</span>
          </>
        )}
      </div>
    </Card>
  );
}
