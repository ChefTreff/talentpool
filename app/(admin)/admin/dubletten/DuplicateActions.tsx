"use client";

import { useTransition } from "react";
import { setDuplicateStatus, type DupStatus } from "./actions";
import { Button } from "@/components/ui/Button";

export function DuplicateActions({
  id,
  status,
  labels,
}: {
  id: string;
  status: string;
  labels: { isDupe: string; notDupe: string; open: string };
}) {
  const [pending, start] = useTransition();

  const btn = (s: DupStatus, label: string) => (
    <Button
      key={s}
      size="sm"
      variant={status === s ? "primary" : "secondary"}
      disabled={pending}
      onClick={() => start(async () => void (await setDuplicateStatus(id, s)))}
    >
      {label}
    </Button>
  );

  return (
    <div className="flex flex-wrap gap-2">
      {btn("confirmed_dupe", labels.isDupe)}
      {btn("not_dupe", labels.notDupe)}
      {btn("open", labels.open)}
    </div>
  );
}
