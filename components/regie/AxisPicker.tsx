"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Select } from "@/components/ui/Select";

/**
 * Bühne und Tag als Auswahl in der Adresse — damit die Regie einen Link
 * verschicken kann („Main Stage, Freitag") statt zu erklären, wo zu klicken ist.
 */
export function AxisPicker({
  stages,
  days,
  stageId,
  dayId,
  locale,
  labels,
}: {
  stages: { id: string; name: string }[];
  days: { id: string; day_date: string; label_de: string | null; label_en: string | null }[];
  stageId: string;
  dayId: string;
  locale: string;
  labels: { stage: string; day: string };
}) {
  const router = useRouter();
  const params = useSearchParams();

  const go = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    next.set(key, value);
    router.push(`/produktion?${next.toString()}`);
  };

  return (
    <div className="mb-4 flex flex-wrap gap-3">
      <Select
        aria-label={labels.stage}
        className="w-56"
        value={stageId}
        options={stages.map((s) => ({ value: s.id, label: s.name }))}
        onChange={(e) => go("buehne", e.target.value)}
      />
      <Select
        aria-label={labels.day}
        className="w-48"
        value={dayId}
        options={days.map((d) => ({
          value: d.id,
          label: (locale === "en" ? d.label_en ?? d.label_de : d.label_de ?? d.label_en) ?? d.day_date,
        }))}
        onChange={(e) => go("tag", e.target.value)}
      />
    </div>
  );
}
