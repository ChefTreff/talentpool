"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { selectOrg } from "./actions";

/**
 * Wechsel zwischen mehreren Organisationen. Erscheint nur, wenn es etwas zu
 * wechseln gibt — bei einer Org steht schlicht ihr Name da.
 */
export function OrgSwitcher({
  orgs,
  currentId,
  label,
}: {
  orgs: { id: string; label: string }[];
  currentId: string;
  label: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const current = orgs.find((o) => o.id === currentId);

  if (orgs.length < 2) {
    return (
      <p className="px-2.5 text-[14px] font-semibold leading-5 text-on-navy">
        {current?.label ?? ""}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor="org-switch" className="ct-eyebrow px-2.5 text-on-navy-muted">
        {label}
      </label>
      <select
        id="org-switch"
        value={currentId}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value;
          startTransition(async () => {
            await selectOrg(next);
            router.refresh();
          });
        }}
        className="h-10 w-full rounded-ct-md border border-on-navy/30 bg-navy px-2.5 text-[14px] font-semibold text-on-navy"
      >
        {orgs.map((o) => (
          <option key={o.id} value={o.id} className="text-ink">
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
