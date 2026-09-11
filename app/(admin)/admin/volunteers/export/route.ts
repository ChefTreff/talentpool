import { NextResponse } from "next/server";
import { requireArea } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ShiftRow, VolunteerDay, VolunteerRow } from "../types";

export const dynamic = "force-dynamic";

/**
 * Bewerbungen und Schichtplan als CSV — nur für das Volunteer-Team.
 *
 * Gate zweimal: `requireArea("admin")` hält Fremde von der Route fern,
 * `is_volunteer_team()` entscheidet über die Daten.
 *
 * Kein Geburtsdatum in der Datei: für die Planung genügt, dass die Prüfung
 * beim Bewerben stattgefunden hat (Datenminimierung, Arbeitsauftrag C).
 */
function csv(rows: (string | number | null)[][]): string {
  const cell = (v: string | number | null) => {
    const s = v == null ? "" : String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // Semikolon und BOM: so öffnet Excel die Datei ohne Import-Dialog richtig.
  return "﻿" + rows.map((r) => r.map(cell).join(";")).join("\r\n") + "\r\n";
}

export async function GET() {
  await requireArea("admin", "/admin/volunteers");
  const supabase = await createSupabaseServerClient();
  const { data: team } = await supabase.rpc("is_volunteer_team");
  if (!team) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const [{ data: volunteerRows }, { data: shiftRows }, { data: dayRows }] = await Promise.all([
    supabase.rpc("volunteer_admin_overview"),
    supabase.rpc("shift_plan"),
    supabase.rpc("volunteer_days"),
  ]);
  const volunteers = (volunteerRows ?? []) as VolunteerRow[];
  const shifts = (shiftRows ?? []) as ShiftRow[];
  const days = (dayRows ?? []) as VolunteerDay[];
  const dayLabel = (id: string | null) => {
    const d = days.find((x) => x.id === id);
    return d?.label_de ?? d?.day_date ?? "";
  };

  const lines: (string | number | null)[][] = [
    ["Bewerbungen"],
    ["Name", "E-Mail", "Status", "Shirt", "Bereiche", "Tage", "Verfügbarkeit", "Buddy", "Beworben", "Zugeteilt", "Bestätigt"],
    ...volunteers.map((v) => [
      v.display_name,
      v.email,
      v.status,
      v.shirt_size,
      (v.areas ?? []).join(", "),
      (v.day_prefs ?? []).map(dayLabel).join(", "),
      typeof v.availability?.note === "string" ? v.availability.note : "",
      v.buddy_note,
      v.applied_at.slice(0, 10),
      v.shifts_assigned,
      v.shifts_confirmed,
    ]),
    [],
    ["Schichtplan"],
    ["Tag", "Bereich", "Position", "Beginn", "Ende", "Ort", "Kapazität", "Überbuchung", "Belegt", "Warteliste", "Personen"],
    ...shifts.map((s) => [
      dayLabel(s.event_day_id),
      s.area,
      s.position,
      s.start_at,
      s.end_at,
      s.location,
      s.capacity,
      s.overbook,
      s.taken,
      s.waitlisted,
      s.people.map((p) => `${p.name ?? ""} (${p.status})`).join(", "),
    ]),
  ];

  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv(lines), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="volunteers-${stamp}.csv"`,
      "cache-control": "no-store",
    },
  });
}
