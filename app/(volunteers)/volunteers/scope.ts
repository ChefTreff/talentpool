import "server-only";
import { cache } from "react";
import { requireUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { EventDay, VolunteerProfile } from "./types";

/**
 * Gemeinsamer Stand des Volunteer-Bereichs.
 *
 * Das Gate ist hier **nur „angemeldet"**, nicht `requireArea("volunteers")`:
 * bewerben darf sich jede Person mit Login, die Rolle `volunteer` entsteht
 * erst mit der Zusage — mit dem Bereichs-Gate käme niemand zur Bewerbung.
 * Der Bereichs-Umschalter bleibt rollenbasiert; wer noch keine Rolle hat,
 * kommt über den Link auf die Bewerbung.
 */
export const getVolunteerScope = cache(
  async (): Promise<{
    profile: VolunteerProfile | null;
    /** Wie viele Schichten diese Person leitet — steuert den Menüpunkt. */
    leadShifts: number;
    days: EventDay[];
    edition: { id: string; name: string | null; start_date: string | null; timezone: string | null } | null;
  }> => {
    await requireUser("/volunteers");
    const supabase = await createSupabaseServerClient();

    const { data: profileJson } = await supabase.rpc("my_volunteer_profile");
    const profile = (profileJson ?? null) as VolunteerProfile | null;

    // Leitet diese Person Schichten? Die RPC gibt nur die eigenen heraus,
    // die Zahl genügt für den Menüpunkt.
    const { data: leadRows } = await supabase.rpc("my_lead_shifts");
    const leadShifts = (leadRows ?? []).length;

    // Dieselbe Edition, die `volunteer_edition()` in SQL wählt: die nächste,
    // die nicht vorbei ist.
    const today = new Date().toISOString().slice(0, 10);
    const { data: editions } = await supabase
      .from("event")
      .select("id,name,start_date,timezone,end_date")
      .eq("is_edition", true)
      .or(`end_date.gte.${today},end_date.is.null`)
      .order("start_date", { ascending: true, nullsFirst: false })
      .limit(1);
    const edition = (editions ?? [])[0] ?? null;

    /**
     * Die Tage über `volunteer_days()` statt über die Tabelle: `event_day`
     * trägt zwar einen SELECT-Grant für `authenticated`, aber keine
     * RLS-Policy — direkt gelesen kommt nichts zurück. Die RPC liefert die
     * Tage der Edition **und** ihrer Events (`summit-27`, `hackathon-27`).
     */
    const { data: dayRows } = await supabase.rpc("volunteer_days");

    return { profile, leadShifts, days: (dayRows ?? []) as EventDay[], edition };
  },
);
