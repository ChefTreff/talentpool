import { loadVocabMap, vgroup } from "@/lib/vocab";
import { volunteerAdminShell } from "../shell";
import { ShiftPlan } from "../ShiftPlan";
import type { ShiftRow, VolunteerDay, VolunteerRow } from "../types";

export const dynamic = "force-dynamic";

/** Schichtplan: anlegen, zuteilen, Warteliste. Zugeteilt wird hier, nicht gebucht. */
export default async function AdminShiftPlanPage() {
  const shell = await volunteerAdminShell("/admin/volunteers/schichten");
  if (!shell.ok) return shell.view;
  const { supabase, t, locale, frame } = shell;

  const [{ data: shiftRows }, { data: volunteerRows }, { data: dayRows }, { data: events }, vocab] =
    await Promise.all([
      supabase.rpc("shift_plan"),
      supabase.rpc("volunteer_admin_overview"),
      supabase.rpc("volunteer_days"),
      supabase.from("event").select("id,timezone"),
      loadVocabMap(supabase, locale),
    ]);

  const days = (dayRows ?? []) as VolunteerDay[];
  /**
   * Zeiten stehen in der Zone des Events, zu dem der Tag gehört — die Tage
   * hängen an `summit-27`/`hackathon-27`, nicht an der Edition selbst.
   */
  const zones = new Map(
    ((events ?? []) as { id: string; timezone: string | null }[]).map((e) => [e.id, e.timezone]),
  );
  const zone = (days[0] && zones.get(days[0].event_id)) || "Europe/Berlin";

  return frame(
    t.adminVolunteers.shiftsTitle,
    t.adminVolunteers.shiftsLead,
    <ShiftPlan
      shifts={(shiftRows ?? []) as ShiftRow[]}
      volunteers={(volunteerRows ?? []) as VolunteerRow[]}
      days={days}
      areas={vgroup(vocab, "volunteer_area")}
      timeZone={zone}
      locale={locale}
      dateLocale={t.meta.dateLocale}
      t={t.adminVolunteers}
      common={{ cancel: t.common.cancel, none: t.common.none, save: t.common.save }}
      rpcMessages={t.rpc}
    />,
  );
}
