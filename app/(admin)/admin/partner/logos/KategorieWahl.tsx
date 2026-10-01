"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import { setzeKategorie } from "./actions";

/**
 * Logokategorie je Partner (ADM-046). Die erste Option ist „automatisch": dann
 * gilt, was aus der Sponsoring-Stufe folgt, sonst „Official" — der Satz daneben
 * sagt, woher der Wert gerade kommt.
 */
export function KategorieWahl({
  orgEditionId,
  wert,
  quelle,
  optionen,
  t,
  rpcMessages,
}: {
  orgEditionId: string;
  wert: string;
  quelle: "manual" | "level" | "fallback";
  optionen: { value: string; label: string }[];
  t: { label: string; derived: string; auto: string; sourceLevel: string; sourceFallback: string; saved: string };
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const id = `logo-kat-${orgEditionId}`;

  return (
    <span className="flex flex-wrap items-center gap-2">
      <label htmlFor={id} className="sr-only">{t.label}</label>
      <Select
        id={id}
        className="w-48"
        disabled={pending}
        value={quelle === "manual" ? wert : ""}
        options={[{ value: "", label: quelle === "manual" ? t.auto : t.derived }, ...optionen]}
        onChange={(e) => {
          const neu = e.target.value || null;
          start(async () => {
            const r = await setzeKategorie(orgEditionId, neu);
            if (!r.ok) { toast("error", rpcMessages[r.key] ?? rpcMessages.unknown ?? r.key); return; }
            toast("success", t.saved);
            router.refresh();
          });
        }}
      />
      {quelle !== "manual" && (
        <span className="ct-help">{quelle === "level" ? t.sourceLevel : t.sourceFallback}</span>
      )}
    </span>
  );
}
