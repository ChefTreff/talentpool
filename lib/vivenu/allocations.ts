import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createCoupon, getEvent, hasVivenuKey, putUnderShops, updateCoupon } from "@/lib/vivenu/client";
import { provisionAllocations as laufe, type PendingAllocation, type ProvisionSummary } from "@/lib/vivenu/kontingent-lauf";

export type { PendingAllocation, ProvisionSummary };

/**
 * Offene Kontingente in vivenu anlegen: je Event einmal lesen, je Partner einen Undershop (alle Pass-Typen der Org, Preis 0, Freischaltung per
 * Coupon), je Gruppe — Organisation, Edition, Rabattstufe — **einen** Coupon für alle Kategorien (PART-111). Ohne `VIVENU_API_KEY`: Trockenlauf,
 * alles bleibt `pending_vivenu`.
 *
 * Der Ablauf selbst steht in `kontingent-lauf.ts`, die Planung einer Gruppe in `kontingent-gruppe.ts`: beide ohne `server-only`, damit der Lauf
 * im Test mit hereingereichten vivenu-Aufrufen wirklich läuft. Hier werden nur die echten Aufrufe eingesetzt.
 */
export function provisionAllocations(admin: SupabaseClient, jobId: number | null, only?: string): Promise<ProvisionSummary> {
  return laufe({ hasVivenuKey, getEvent, putUnderShops, createCoupon, updateCoupon }, admin, jobId, only);
}
