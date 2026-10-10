"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { copyTableQuestions } from "@/app/(partner)/partner/actions";
import { uebernahmeFehler } from "@/lib/partner/tischvorgabe";

/**
 * Zeilenaktion „Tischvorgabe übernehmen“ (PART-150): ein abweichendes Gespräch wieder auf die Fragen der Vorgabe bringen. Dieselbe Funktion wie der
 * Hauptknopf der Karte, mit genau einem Ziel. Ein Fehler steht unter der Zeile, nicht im Toast (er gehört neben den Knopf, der ihn ausgelöst hat).
 */
export function TischUebernehmen({
  carrierId,
  zielId,
  titel,
  titelJe,
  label,
  fertig,
  fehlerVorlage,
  rpcMessages,
}: {
  carrierId: string;
  zielId: string;
  titel: string;
  titelJe: Record<string, string>;
  label: string;
  fertig: string;
  fehlerVorlage: string;
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [fehler, setFehler] = useState<string | null>(null);

  function uebernehmen() {
    setFehler(null);
    startTransition(async () => {
      const res = await copyTableQuestions(carrierId, [zielId]);
      if (!res.ok) {
        setFehler(uebernahmeFehler(res, rpcMessages, titelJe, fehlerVorlage));
        return;
      }
      toast("success", fertig);
      router.refresh();
    });
  }

  return (
    <>
      <Button size="sm" variant="secondary" loading={pending} aria-label={`${label}: ${titel}`} onClick={uebernehmen}>
        {label}
      </Button>
      {fehler && (
        <p role="alert" className="ct-small basis-full text-error-ink">
          {fehler}
        </p>
      )}
    </>
  );
}
