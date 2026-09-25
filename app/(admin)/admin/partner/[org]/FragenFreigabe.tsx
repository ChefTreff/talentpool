"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { adminApproveSessionQuestions } from "../actions";

/** Beantragte eigene Fragen einer Session des Partners (PART-045). */
export type OffeneFragen = {
  sessionId: string;
  sessionTitle: string;
  fragen: { id: string; label_de: string; type: string | null; purpose: string | null }[];
};

/**
 * Freigabe der eigenen Bewerbungsfragen eines Partners (PART-045). Vorher
 * liest das Team den Zweck — keine Fragen nach Gesundheit, Religion oder
 * Herkunft ohne ausgewiesenen Zweck; eine Freitextfrage lässt sich nicht
 * automatisch als sensibel erkennen. `approve_session_questions` gibt alle
 * offenen Fragen der Session auf einmal frei.
 */
export function FragenFreigabe({
  offen,
  typLabels,
  t,
  rpcMessages,
}: {
  offen: OffeneFragen[];
  typLabels: Record<string, string>;
  t: Record<string, string>;
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [aktiv, setAktiv] = useState<string | null>(null);
  const [fehler, setFehler] = useState<Record<string, string>>({});

  function freigeben(sessionId: string) {
    setAktiv(sessionId);
    setFehler((f) => ({ ...f, [sessionId]: "" }));
    startTransition(async () => {
      const res = await adminApproveSessionQuestions(sessionId);
      setAktiv(null);
      if (!res.ok) {
        setFehler((f) => ({ ...f, [sessionId]: rpcMessages[res.key] ?? rpcMessages.unknown ?? res.key }));
        return;
      }
      toast("success", t.questionsApproved);
      router.refresh();
    });
  }

  return (
    <ul className="flex flex-col gap-4">
      {offen.map((x) => (
        <li key={x.sessionId} className="flex flex-col gap-2 border-t border-border pt-4 first:border-t-0 first:pt-0">
          <p className="ct-label text-ink">{x.sessionTitle}</p>
          <ul className="flex flex-col gap-2">
            {x.fragen.map((f) => (
              <li key={f.id} className="flex flex-col gap-0.5">
                <span className="ct-small text-ink">
                  {f.label_de}
                  {f.type && <span className="text-muted"> · {typLabels[f.type] ?? f.type}</span>}
                </span>
                {f.purpose && <span className="ct-help">{t.questionPurpose.replace("{zweck}", f.purpose)}</span>}
              </li>
            ))}
          </ul>
          {fehler[x.sessionId] && (
            <p role="alert" className="ct-small text-error-ink">
              {fehler[x.sessionId]}
            </p>
          )}
          <div>
            <Button size="sm" variant="secondary" loading={pending && aktiv === x.sessionId} onClick={() => freigeben(x.sessionId)}>
              {t.questionsApprove}
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}
