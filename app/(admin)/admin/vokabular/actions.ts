"use server";

import { revalidatePath } from "next/cache";
import { requireArea } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toRpcFailure } from "@/lib/rpc-error";

const PFAD = "/admin/vokabular";

export type Ergebnis = { ok: true } | { ok: false; key: string; detail?: string };

async function ruf(name: string, args: Record<string, unknown>): Promise<Ergebnis> {
  await requireArea("admin", PFAD);
  // Der Nutzer-Client, nicht `service_role`: die RPCs prüfen `has_role('admin')`
  // selbst. Vor 0130 schrieb diese Seite mit dem Admin-Client an der Datenbank
  // vorbei — die Rechteprüfung lag allein in dieser Datei.
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc(name, args);
  if (error) {
    const f = toRpcFailure(error);
    return { ok: false, key: f.key, detail: f.detail };
  }
  revalidatePath(PFAD);
  return { ok: true };
}

/**
 * Anlegen und ändern — auch das Aktivkennzeichen.
 *
 * Es gibt bewusst **keine** eigene Umschaltfunktion mehr: `upsert_vocab_term`
 * verlangt beide Beschriftungen, weil ein Begriff ohne sie in einer Auswahl
 * nicht darstellbar ist. Der Schalter schickt deshalb die ganze Zeile, die er
 * ohnehin vor sich hat. Eine zweite RPC, die nur `active` setzt, wäre eine
 * zweite Stelle mit eigener Rechteprüfung für denselben Vorgang.
 */
export async function saveTerm(data: {
  vocabulary: string;
  key: string;
  label_de: string;
  label_en: string;
  sort_order: number;
  active: boolean;
  parent_vocabulary?: string | null;
  parent_key?: string | null;
}): Promise<Ergebnis> {
  return ruf("upsert_vocab_term", { p_data: data });
}

/**
 * Löschen. Geht nur, wenn niemand den Begriff benutzt — und nur, wenn die
 * Datenbank überhaupt weiss, wo er benutzt würde.
 */
export async function removeTerm(vocabulary: string, key: string): Promise<Ergebnis> {
  return ruf("delete_vocab_term", { p_vocabulary: vocabulary, p_key: key });
}
