import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { boardEvents, type BoardEvent } from "@/components/programme/events";
import { baueZeilen, type AssetZeile, type BoardZeile, type PraesentationsZeile } from "@/components/speaker/praesentationen";

/**
 * Präsentationen je Slot (LEAD-023) für Lead-Portal und Admin.
 *
 * Alles mit der Sitzung, nichts mit `service_role`: `programme_board` ist
 * `security_invoker` und liefert `can_edit` je Slot, `speaker_profile` zeigt
 * nur betreute Profile (`sp_manage_sel`), `my_speaker_assets` nur deren
 * Dateien. Ein Stage Lead sieht damit genau seine Slots, das Team alle.
 */
export async function ladePraesentationen(
  supabase: SupabaseClient,
  input: { eventSlug?: string; editionIds?: string[]; locale: string },
): Promise<{ events: BoardEvent[]; currentEvent: BoardEvent | null; editionId: string | null; zeilen: PraesentationsZeile[] }> {
  // Dieselbe Auswahl wie Board und Tabelle: nur der Summit (LEAD-014).
  const events = await boardEvents(supabase, input.editionIds);
  const currentEvent = events.find((e) => e.slug === input.eventSlug) ?? events[0] ?? null;
  if (!currentEvent) return { events, currentEvent, editionId: null, zeilen: [] };

  const [{ data: ev }, { data: slotRows }, { data: assetRows }] = await Promise.all([
    supabase.from("event").select("edition_id").eq("id", currentEvent.id).maybeSingle(),
    supabase
      .from("programme_board")
      .select("slot_id, session_id, stage_id, stage_name, start_at, end_at, title_de, title_en, can_edit, speakers")
      .eq("event_id", currentEvent.id)
      .order("start_at"),
    supabase.rpc("my_speaker_assets", { p_profile_id: null }),
  ]);
  // Die Profile gehören zur Edition, nicht zum Summit — der Speicherpfad auch.
  const editionId = (ev?.edition_id as string | null | undefined) ?? currentEvent.id;
  const slots = (slotRows ?? []) as BoardZeile[];
  const personen = [...new Set(slots.flatMap((s) => (s.speakers ?? []).map((sp) => sp.person_id)))];
  const { data: profilRows } = personen.length
    ? await supabase.from("speaker_profile").select("id, person_id").eq("edition_id", editionId).in("person_id", personen)
    : { data: [] };

  return {
    events,
    currentEvent,
    editionId,
    zeilen: baueZeilen(
      slots,
      (profilRows ?? []) as { id: string; person_id: string }[],
      (assetRows ?? []) as AssetZeile[],
      input.locale,
    ),
  };
}

export type PraesentationsEingang = {
  profileId: string;
  sessionId: string;
  storagePath: string;
  filename: string;
  mime: string | null;
  sizeBytes: number | null;
};

/**
 * Die hochgeladene Präsentation eintragen — dieselbe RPC wie im Speaker-Portal
 * (SPK-028): sie prüft Recht (`can_manage_speaker`, Admin) und Pfad, zählt die
 * Version hoch und sagt, ob die Frist schon vorbei war.
 */
export async function registrierePraesentation(supabase: SupabaseClient, input: PraesentationsEingang) {
  const { data, error } = await supabase.rpc("register_speaker_asset", {
    p_profile_id: input.profileId,
    p_kind: "presentation",
    p_storage_path: input.storagePath,
    p_filename: input.filename,
    p_mime: input.mime,
    p_size_bytes: input.sizeBytes,
    p_session_id: input.sessionId,
  });
  const result = (data ?? {}) as { version?: number; late?: boolean };
  return { error, data: { version: result.version ?? 1, late: result.late === true } };
}
