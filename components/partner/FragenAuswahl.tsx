"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { useToast } from "@/components/ui/Toast";
import { setSessionQuestions } from "@/app/(partner)/partner/actions";

/**
 * Katalogfragen wählen (PART-045). Zur Wahl stehen nur Fragen, die das Team
 * für Partner freigegeben hat (`partner_selectable`); Fragen des Teams und
 * eigene Fragen bleiben beim Speichern stehen (`v6_masterclass_fragen`).
 */
export function FragenAuswahl({
  sessionId,
  waehlbar,
  gewaehlt,
  canEdit,
  t,
  rpcMessages,
}: {
  sessionId: string;
  waehlbar: { id: string; label: string }[];
  gewaehlt: string[];
  canEdit: boolean;
  t: Record<string, string>;
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [saving, startSaving] = useTransition();
  const [basis, setBasis] = useState<string[]>(gewaehlt);
  const [auswahl, setAuswahl] = useState<string[]>(gewaehlt);
  const [fehler, setFehler] = useState<string | null>(null);
  const geaendert = auswahl.length !== basis.length || auswahl.some((id) => !basis.includes(id));

  function umschalten(id: string) {
    setAuswahl((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]));
  }

  function speichern() {
    setFehler(null);
    startSaving(async () => {
      const res = await setSessionQuestions(sessionId, auswahl);
      if (!res.ok) {
        setFehler(rpcMessages[res.key] ?? rpcMessages.unknown ?? res.key);
        return;
      }
      setBasis(auswahl);
      toast("success", t.questionsSaved);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {waehlbar.map((q) => {
          const an = auswahl.includes(q.id);
          return (
            <label
              key={q.id}
              className={cn(
                "ct-small inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-ct-sm border px-3 py-2 text-ink",
                an ? "border-border-strong bg-canvas" : "border-border",
              )}
            >
              <input type="checkbox" className="size-4" checked={an} disabled={!canEdit} onChange={() => umschalten(q.id)} />
              {q.label}
            </label>
          );
        })}
      </div>
      {fehler && (
        <p role="alert" className="ct-small text-error-ink">
          {fehler}
        </p>
      )}
      {canEdit && (
        <div>
          <Button variant="secondary" loading={saving} disabled={!geaendert} onClick={speichern}>
            {t.questionsSave}
          </Button>
        </div>
      )}
    </div>
  );
}
