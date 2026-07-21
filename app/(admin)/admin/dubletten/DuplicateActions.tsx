"use client";

import { useTransition } from "react";
import { setDuplicateStatus, type DupStatus } from "./actions";

export function DuplicateActions({ id, status }: { id: string; status: string }) {
  const [pending, start] = useTransition();

  const btn = (s: DupStatus, label: string) => (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(async () => void (await setDuplicateStatus(id, s)))}
      className={
        "rounded-full border px-3 py-1 text-xs disabled:opacity-50 " +
        (status === s
          ? "border-transparent bg-foreground text-background"
          : "border-black/15 hover:bg-black/[.04] dark:border-white/20 dark:hover:bg-white/[.06]")
      }
    >
      {label}
    </button>
  );

  return (
    <div className="flex gap-2">
      {btn("confirmed_dupe", "Dublette")}
      {btn("not_dupe", "keine")}
      {btn("open", "offen")}
    </div>
  );
}
