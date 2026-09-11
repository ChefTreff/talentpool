"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Select } from "@/components/ui/Select";
import type { AdminEdition } from "./types";

/** Editionswahl über die Adresse — dann ist ein Link auf eine Edition teilbar. */
export function EditionPicker({
  editions,
  current,
  label,
}: {
  editions: AdminEdition[];
  current: string | null;
  label: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  return (
    <Select
      aria-label={label}
      className="w-72"
      value={current ?? ""}
      options={editions.map((e) => ({ value: e.id, label: e.name ?? e.slug ?? e.id }))}
      onChange={(event) => {
        const next = new URLSearchParams(params.toString());
        next.set("edition", event.target.value);
        router.push(`${pathname}?${next.toString()}`);
      }}
    />
  );
}
