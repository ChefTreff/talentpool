import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { buehnenReiter, type BuehnenReiter } from "@/components/partner/eure-buehne";
import { standFenster, type StandFenster } from "@/components/partner/standbuehne";

/** Zeile aus `my_partner_stages()`, dazu die Art der Bühne (`stage.kind`). */
export type PartnerStage = {
  stage_id: string;
  stage_name: string | null;
  stage_slug: string | null;
  event_id: string;
  event_slug: string | null;
  event_name: string | null;
  edition_id: string;
  org_id: string | null;
  org_name: string | null;
  /** `booth` (Standbühne), `branded` (gebrandete Bühne) oder eine andere Fläche (PART-138); `null`, wenn die Art nicht lesbar ist. */
  kind: string | null;
};

/**
 * Die Bühnen, die diese Person als Partner bearbeitet (Rolle `standbuehne_editor`). Die Art kommt aus `stage.kind` (0274, für Angemeldete lesbar):
 * `my_partner_stages()` liefert sie nicht und bleibt unverändert.
 */
export async function ladeEigeneBuehnen(): Promise<PartnerStage[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("my_partner_stages");
  const zeilen = (data ?? []) as Omit<PartnerStage, "kind">[];
  if (zeilen.length === 0) return [];
  const { data: arten } = await supabase
    .from("stage")
    .select("id, kind")
    .in("id", zeilen.map((z) => z.stage_id));
  const art = new Map(((arten ?? []) as { id: string; kind: string | null }[]).map((a) => [a.id, a.kind]));
  return zeilen.map((z) => ({ ...z, kind: art.get(z.stage_id) ?? null }));
}

/**
 * Die Bühnen der gewählten Organisation — mit ihr als Gastgeberin arbeiten Tabelle, Gäste und Speaker — und die Reiter, die sie daraus bekommt.
 * `alle` sind sämtliche Bühnen der Person (der Kalender zeigt sie zur Orientierung).
 */
export async function ladeBuehnen(orgId: string): Promise<{ alle: PartnerStage[]; eigene: PartnerStage[]; reiter: BuehnenReiter }> {
  const alle = await ladeEigeneBuehnen();
  const eigene = alle.filter((s) => s.org_id === orgId);
  return { alle, eigene, reiter: buehnenReiter(eigene.map((s) => s.kind)) };
}

/**
 * Zeitfenster je Bühne und Tag (PART-090), Schlüssel `stageId|dayId`: die
 * Öffnungszeiten der Bühne, je fehlender Grenze der Programmrahmen des Tages —
 * genau wie in `partner_booth_window`. `stage_day` und `event_day` sind für
 * Angemeldete lesbar (Policy `using (true)`, das Programm ist öffentlich).
 */
export async function ladeFenster(stageIds: string[], dayIds: string[]): Promise<Record<string, StandFenster>> {
  if (stageIds.length === 0 || dayIds.length === 0) return {};
  const supabase = await createSupabaseServerClient();
  const [{ data }, { data: tagZeilen }] = await Promise.all([
    supabase
      .from("stage_day")
      .select("stage_id, event_day_id, open_from, open_to")
      .in("stage_id", stageIds)
      .in("event_day_id", dayIds),
    supabase.from("event_day").select("id, programme_start, programme_end").in("id", dayIds),
  ]);
  const rahmen = new Map(
    ((data ?? []) as { stage_id: string; event_day_id: string; open_from: string | null; open_to: string | null }[]).map(
      (r) => [`${r.stage_id}|${r.event_day_id}`, r],
    ),
  );
  const tage = new Map(
    ((tagZeilen ?? []) as { id: string; programme_start: string | null; programme_end: string | null }[]).map((d) => [d.id, d]),
  );
  const fenster: Record<string, StandFenster> = {};
  for (const stageId of stageIds) {
    for (const dayId of dayIds) {
      const r = rahmen.get(`${stageId}|${dayId}`);
      const tag = tage.get(dayId);
      fenster[`${stageId}|${dayId}`] = standFenster(
        r?.open_from ?? null,
        r?.open_to ?? null,
        tag?.programme_start ?? null,
        tag?.programme_end ?? null,
      );
    }
  }
  return fenster;
}
