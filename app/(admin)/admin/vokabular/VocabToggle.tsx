"use client";

import { useState, useTransition } from "react";
import { setVocabActive } from "./actions";
import { Badge } from "@/components/ui/Badge";

/** „aktiv" steuert, ob der Wert in den Formularen angeboten wird. */
export function VocabToggle({
  vocabulary,
  termKey,
  active,
  labels,
}: {
  vocabulary: string;
  termKey: string;
  active: boolean;
  labels: { on: string; off: string };
}) {
  const [on, setOn] = useState(active);
  const [pending, start] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      aria-pressed={on}
      onClick={() =>
        start(async () => {
          const r = await setVocabActive(vocabulary, termKey, !on);
          if (r?.ok) setOn(!on);
        })
      }
      className="rounded-ct-sm disabled:opacity-50"
    >
      <Badge tone={on ? "success" : "neutral"}>{on ? labels.on : labels.off}</Badge>
    </button>
  );
}
