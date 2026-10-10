"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { offeneFragenGruppieren, type OffenesGespraech } from "@/lib/partner/tischvorgabe";
import { adminApproveSessionQuestions } from "../actions";

/** Beantragte eigene Fragen einer Session des Partners (PART-045), mit dem Tisch des Gesprächs (PART-150). */
export type OffeneFragen = OffenesGespraech;

/**
 * Freigabe der eigenen Bewerbungsfragen eines Partners (PART-045). Vorher
 * liest das Team den Zweck — keine Fragen nach Gesundheit, Religion oder
 * Herkunft ohne ausgewiesenen Zweck; eine Freitextfrage lässt sich nicht
 * automatisch als sensibel erkennen. `approve_session_questions` gibt alle
 * offenen Fragen der Session auf einmal frei.
 *
 * **Nach Tisch gebündelt (PART-150):** Gespräche desselben Tisches mit denselben
 * offenen Fragen stehen als **eine** Gruppe da — der Partner übernimmt die Fragen
 * eines Tisches auf alle Gespräche, und das Team soll sie nicht zwanzigmal lesen.
 * „Für alle n Gespräche freigeben“ ruft `approve_session_questions` je Gespräch
 * (ein Audit je Gespräch wie bisher) und hält beim ersten Fehler an; was bis
 * dahin freigegeben war, bleibt es, und die Meldung sagt, wie viele.
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
  const gruppen = offeneFragenGruppieren(offen);

  function freigeben(schluessel: string, sessionIds: string[]) {
    setAktiv(schluessel);
    setFehler((f) => ({ ...f, [schluessel]: "" }));
    startTransition(async () => {
      let fertig = 0;
      for (const id of sessionIds) {
        const res = await adminApproveSessionQuestions(id);
        if (!res.ok) {
          const meldung = rpcMessages[res.key] ?? rpcMessages.unknown ?? res.key;
          setFehler((f) => ({
            ...f,
            [schluessel]:
              fertig > 0
                ? t.questionsApprovePartly.replace("{done}", String(fertig)).replace("{n}", String(sessionIds.length)).replace("{meldung}", meldung)
                : meldung,
          }));
          setAktiv(null);
          if (fertig > 0) router.refresh();
          return;
        }
        fertig += 1;
      }
      setAktiv(null);
      toast("success", sessionIds.length > 1 ? t.questionsApprovedAll.replace("{n}", String(sessionIds.length)) : t.questionsApproved);
      router.refresh();
    });
  }

  return (
    <ul className="flex flex-col gap-4">
      {gruppen.map((g) => (
        <li key={g.schluessel} className="flex flex-col gap-2 border-t border-border pt-4 first:border-t-0 first:pt-0">
          <p className="ct-label text-ink">
            {g.sessionIds.length > 1 ? t.questionsGroupTitle.replace("{tisch}", g.titel).replace("{n}", String(g.sessionIds.length)) : g.titel}
          </p>
          <ul className="flex flex-col gap-2">
            {g.fragen.map((f) => (
              <li key={f.id} className="flex flex-col gap-0.5">
                <span className="ct-small text-ink">
                  {f.label_de}
                  {f.type && <span className="text-muted"> · {typLabels[f.type] ?? f.type}</span>}
                </span>
                {f.purpose && <span className="ct-help">{t.questionPurpose.replace("{zweck}", f.purpose)}</span>}
              </li>
            ))}
          </ul>
          {fehler[g.schluessel] && (
            <p role="alert" className="ct-small text-error-ink">
              {fehler[g.schluessel]}
            </p>
          )}
          <div>
            <Button size="sm" variant="secondary" loading={pending && aktiv === g.schluessel} onClick={() => freigeben(g.schluessel, g.sessionIds)}>
              {g.sessionIds.length > 1 ? t.questionsApproveAll.replace("{n}", String(g.sessionIds.length)) : t.questionsApprove}
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}
