"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";
import { saveConsents } from "./actions";

export type ConsentStrings = {
  title: string;
  lead: string;
  requiredTitle: string;
  given: string;
  missing: string;
  requiredHint: string;
  failed: string;
  hints: Record<string, string>;
};

type Editable = { key: string; label: string; hint?: string; granted: boolean };
type Required = { key: string; label: string; granted: boolean };

/**
 * „Daten und Einwilligungen" im Profil (TAL-013 A9, B2). Der Widerruf muss so
 * einfach sein wie die Zustimmung (DSGVO Art. 7 Abs. 3) — bis hierher ging
 * beides nur im Onboarding. Pflicht-Einwilligungen stehen nur zur Ansicht da:
 * sie zurückzunehmen heißt, das Profil zu löschen (Link am Fuß der Seite).
 */
export function ConsentForm({
  editable,
  required,
  t,
  common,
}: {
  editable: Editable[];
  required: Required[];
  t: ConsentStrings;
  common: { save: string; saving: string; saved: string };
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<Record<string, boolean>>(
    Object.fromEntries(editable.map((c) => [c.key, c.granted])),
  );
  const dirty = editable.some((c) => state[c.key] !== c.granted);

  function onSave() {
    startTransition(async () => {
      const res = await saveConsents(state);
      if (!res.ok) {
        toast("error", t.failed);
        return;
      }
      toast("success", common.saved);
      router.refresh();
    });
  }

  return (
    <Card id="einwilligungen">
      <h2 className="ct-h2 mb-1 text-ink">{t.title}</h2>
      <p className="ct-help mb-4">{t.lead}</p>

      <ul className="flex flex-col gap-3">
        {editable.map((c) => (
          <li key={c.key}>
            <label className="flex min-h-11 cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                className="mt-1 size-4 shrink-0"
                checked={state[c.key] ?? false}
                onChange={(e) => setState((s) => ({ ...s, [c.key]: e.target.checked }))}
              />
              <span>
                <span className="ct-label text-ink">{c.label}</span>
                {c.hint && <span className="ct-help block">{c.hint}</span>}
              </span>
            </label>
          </li>
        ))}
      </ul>

      <div className="mt-4">
        <Button variant="secondary" onClick={onSave} disabled={!dirty} loading={pending}>
          {pending ? common.saving : common.save}
        </Button>
      </div>

      <h3 className="ct-h3 mb-2 mt-6 text-ink">{t.requiredTitle}</h3>
      <ul className="flex flex-col gap-2">
        {required.map((c) => (
          <li key={c.key} className="flex flex-wrap items-center gap-2">
            <span className="ct-small text-ink">{c.label}</span>
            <Badge tone={c.granted ? "success" : "warning"}>{c.granted ? t.given : t.missing}</Badge>
          </li>
        ))}
      </ul>
      <p className="ct-help mt-2">{t.requiredHint}</p>
    </Card>
  );
}
