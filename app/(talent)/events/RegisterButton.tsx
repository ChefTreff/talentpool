"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { registerForEvent } from "./actions";

type Strings = Record<string, string>;

/**
 * Anmelden mit einem Klick — Name und E-Mail kommen aus dem Profil (D12).
 * Fehler stehen am Knopf, nicht nur im Toast: wer „Anmelden" drückt und
 * nichts passiert, soll lesen können, warum.
 */
export function RegisterButton({ lumaEventId, t }: { lumaEventId: string; t: Strings }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [fehler, setFehler] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-1">
      <Button
        size="sm"
        loading={pending}
        onClick={() =>
          start(async () => {
            setFehler(null);
            const res = await registerForEvent(lumaEventId);
            if (res.ok) {
              toast("success", res.status === "pending" ? t.registeredPending : t.registeredDone);
              router.refresh();
            } else {
              setFehler(t[`error_${res.key}`] ?? t.error_failed);
            }
          })
        }
      >
        {t.register}
      </Button>
      {fehler && (
        <p role="alert" className="ct-small text-error-ink">
          {fehler}
        </p>
      )}
    </div>
  );
}
