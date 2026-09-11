import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { PartnerOrg } from "./types";

/**
 * Welche Organisation gerade gezeigt wird.
 *
 * Layouts bekommen in Next keine `searchParams`, die Sidebar müsste die Wahl
 * sonst durch jeden Link schleifen. Deshalb ein Cookie — mit einer Regel: der
 * Wert ist Nutzereingabe. Gültig ist er nur, wenn er in `my_partner_orgs()`
 * steht; sonst gewinnt die erste eigene Org. Die RPCs prüfen die
 * Mitgliedschaft ohnehin selbst, aber die Oberfläche soll es gar nicht erst
 * mit einer fremden Org versuchen.
 */
export const ORG_COOKIE = "ct_partner_org";

export type PartnerScope = {
  orgs: PartnerOrg[];
  current: PartnerOrg | null;
};

export const getPartnerScope = cache(async (): Promise<PartnerScope> => {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("my_partner_orgs");
  const orgs = (data ?? []) as PartnerOrg[];
  if (orgs.length === 0) return { orgs, current: null };

  const wanted = (await cookies()).get(ORG_COOKIE)?.value;
  const current = orgs.find((o) => o.org_id === wanted) ?? orgs[0];
  return { orgs, current };
});
