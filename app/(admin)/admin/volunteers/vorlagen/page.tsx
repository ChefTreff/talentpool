import { loadVocabMap, vgroup } from "@/lib/vocab";
import { volunteerAdminShell } from "../shell";
import { ShiftTemplates } from "../ShiftTemplates";
import type { ShiftTemplate, VolunteerDay } from "../types";

export const dynamic = "force-dynamic";

/** Schicht-Vorlagen: einmal anlegen, auf Tage anwenden (VOL-002/S3). */
export default async function AdminShiftTemplatesPage() {
  const shell = await volunteerAdminShell("/admin/volunteers/vorlagen");
  if (!shell.ok) return shell.view;
  const { supabase, t, locale, frame } = shell;

  const [{ data: templates }, { data: dayRows }, vocab] = await Promise.all([
    supabase.rpc("shift_templates"),
    supabase.rpc("volunteer_days"),
    loadVocabMap(supabase, locale),
  ]);

  return frame(
    t.adminVolunteers.tplPageTitle,
    t.adminVolunteers.tplPageLead,
    <ShiftTemplates
      templates={(templates ?? []) as ShiftTemplate[]}
      days={(dayRows ?? []) as VolunteerDay[]}
      areas={vgroup(vocab, "volunteer_area")}
      locale={locale}
      t={t.adminVolunteers}
      common={{ cancel: t.common.cancel, save: t.common.save }}
      rpcMessages={t.rpc}
    />,
  );
}
