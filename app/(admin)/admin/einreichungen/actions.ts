"use server";

import { requireAnyAdminSection } from "@/lib/auth";
import { mayEnterAdminSection } from "@/lib/admin-access";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toRpcFailure } from "@/lib/rpc-error";
import {
  FREIGABE_ABSCHNITT,
  FREIGABE_ABSCHNITTE,
  FREIGABE_PFAD,
  VERLAUF_SEITE,
  istFreigabeArt,
  istVerlaufCursor,
  parseVerlauf,
  type VerlaufCursor,
  type Verlaufszeile,
} from "@/lib/freigaben";

export type VerlaufErgebnis =
  | { ok: true; zeilen: Verlaufszeile[]; hatMehr: boolean }
  | { ok: false; key: string; detail?: string };

/**
 * Eine Seite von „Bereits freigegeben“ (ADM-081 Teil 2) — geladen erst, wenn jemand die Ansicht aufklappt.
 *
 * Dasselbe Tor wie die Seite: Abschnitt der **Art** (nicht nur irgendeiner der vier), und die Datenbank prüft in
 * `freigabe_verlauf` noch einmal mit dem Tor der Liste. Der Cursor ist ein Paar aus Zeitpunkt und Kennung der
 * letzten Zeile der Vorseite; was nicht danach aussieht, kommt nie bis zur Datenbank. Gefragt wird eine Zeile
 * mehr als angezeigt, daran erkennt die Oberfläche, ob es weitergeht — ohne eine leere Folgeseite.
 */
export async function ladeFreigabeVerlauf(art: string, cursor: unknown): Promise<VerlaufErgebnis> {
  const { roleNames } = await requireAnyAdminSection(FREIGABE_ABSCHNITTE, FREIGABE_PFAD);
  if (!istFreigabeArt(art)) return { ok: false, key: "invalid_argument" };
  let von: VerlaufCursor | null = null;
  if (cursor !== null && cursor !== undefined) {
    if (!istVerlaufCursor(cursor)) return { ok: false, key: "invalid_argument" };
    von = cursor;
  }
  if (!(await mayEnterAdminSection(FREIGABE_ABSCHNITT[art], roleNames))) return { ok: false, key: "not_allowed" };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("freigabe_verlauf", {
    p_art: art,
    p_limit: VERLAUF_SEITE + 1,
    p_before_at: von?.at ?? null,
    p_before_id: von?.id ?? null,
  });
  if (error) {
    const f = toRpcFailure(error);
    return { ok: false, key: f.key, detail: f.detail };
  }
  const zeilen = parseVerlauf(data);
  return { ok: true, zeilen: zeilen.slice(0, VERLAUF_SEITE), hatMehr: zeilen.length > VERLAUF_SEITE };
}
