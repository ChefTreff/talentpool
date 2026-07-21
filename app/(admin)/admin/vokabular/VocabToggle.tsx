"use client";

import { useState, useTransition } from "react";
import { setVocabActive } from "./actions";

export function VocabToggle({
  vocabulary,
  termKey,
  active,
}: {
  vocabulary: string;
  termKey: string;
  active: boolean;
}) {
  const [on, setOn] = useState(active);
  const [pending, start] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await setVocabActive(vocabulary, termKey, !on);
          if (r?.ok) setOn(!on);
        })
      }
      className={
        "rounded-full px-3 py-1 text-xs font-medium disabled:opacity-50 " +
        (on
          ? "bg-green-600/15 text-green-700 dark:text-green-400"
          : "bg-zinc-500/15 text-zinc-500")
      }
    >
      {on ? "aktiv" : "inaktiv"}
    </button>
  );
}
